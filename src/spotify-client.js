/**
 * =====================================================================
 * 🎵 Spotify Web API 核心控制客戶端 (Spotify Playback Controller)
 * =====================================================================
 * [技術] 整合 `spotify-auth` 服務，封裝防超時、防空 JSON (204 No Content) 的
 *        核心通訊模組。提供搜尋、加入隊列、播放控制與設備列表等標準 Web APIs。
 * [童趣] Spotify 魔法點歌棒：控制您的 Spotify 音響設備，調整合適的音量大小、
 *        把好聽的歌塞進排隊隊伍，或是快速跳到下一首，讓音樂派對熱熱鬧鬧玩不停！
 * =====================================================================
 */
import { fetch } from 'undici';
import { getSpotifyAccessToken } from './spotify-auth.js';
import fs from 'fs/promises';
import path from 'path';
import { getMusicBrainzArtistMBID, getMusicBrainzArtistAlbums } from './musicbrainz-client.js';

// [技術] 輔助函式：非同步睡眠延遲，防止頻率過快或遭遇 429 時進行等待
// [童趣] 伸個懶腰深呼吸：當我們走得太快或小精靈累了的時候，停下來休息一下下再出發！
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// [技術] 全域限速防禦（Global Bottleneck Throttle）：追蹤上一次 Spotify 請求時間，確保全域請求之間最少間隔 300ms
// [童趣] 排排隊紅綠燈：悄悄記住上一次敲門的時間，確保每次敲門之間至少間隔 300 毫秒，不要催促小精靈，讓大家都安安穩穩！
let lastSpotifyRequestTime = 0;
const MIN_SPOTIFY_INTERVAL_MS = 300;

async function enforceSpotifyRateLimit() {
  const now = Date.now();
  const elapsed = now - lastSpotifyRequestTime;
  if (elapsed < MIN_SPOTIFY_INTERVAL_MS) {
    const delay = MIN_SPOTIFY_INTERVAL_MS - elapsed;
    await sleep(delay);
  }
  lastSpotifyRequestTime = Date.now();
}

// [技術] 載入系統狀態儲存路徑
const SYSTEM_STATE_FILE = path.resolve('data/system-state.json');

// 讀取全域系統狀態 (防刷時間戳與 429 歷史)
export async function readSystemState() {
  try {
    const data = await fs.readFile(SYSTEM_STATE_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    return {
      lastScanCommandTime: 0,
      spotify429ErrorHistory: [],
      spotifyDisabledUntil: 0
    };
  }
}

// 寫入全域系統狀態
export async function writeSystemState(state) {
  try {
    await fs.mkdir(path.dirname(SYSTEM_STATE_FILE), { recursive: true });
    await fs.writeFile(SYSTEM_STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (err) {
    console.warn(`[SystemState] ⚠️ 無法寫入狀態檔:`, err.message || err);
  }
}

// 檢查 Spotify API 是否正處於自動降級冷卻保護期
export async function isSpotifyCooldownActive() {
  const state = await readSystemState();
  if (state.spotifyDisabledUntil && Date.now() < state.spotifyDisabledUntil) {
    const remainingMs = state.spotifyDisabledUntil - Date.now();
    const remainingHrs = (remainingMs / (1000 * 60 * 60)).toFixed(1);
    console.warn(`[Spotify/Cooldown] 🔒 Spotify API 正處於降級冷卻中，剩餘 ${remainingHrs} 小時，自動降級。`);
    return true;
  }
  return false;
}

// 記錄 429 限流錯誤，並在 24 小時內大於等於 2 次時啟動 24 小時強制冷卻
export async function recordSpotify429() {
  const state = await readSystemState();
  const now = Date.now();
  
  // 僅保留過去 24 小時內的時間戳記
  const oneDayAgo = now - 24 * 60 * 60 * 1000;
  state.spotify429ErrorHistory = (state.spotify429ErrorHistory || [])
    .filter(ts => ts > oneDayAgo);
  
  state.spotify429ErrorHistory.push(now);
  
  if (state.spotify429ErrorHistory.length >= 2) {
    state.spotifyDisabledUntil = now + 24 * 60 * 60 * 1000;
    console.error(`[Spotify/Cooldown] 🚨 24 小時內觸發 429 限流達到臨界點 (2 次)！啟動 24 小時降級冷卻，強制完全禁用 Spotify。`);
  }
  
  await writeSystemState(state);
}

// [技術] 互斥鎖佇列，強制所有請求排隊並串行執行，徹底消除異步併發導致的防禦失效
let spotifyLock = Promise.resolve();

/**
 * [技術] 核心 API 請求佇列包裝器，負責處理降級冷卻與 Mutex 排隊鎖定
 * @param {string} endpoint - API 子端點
 * @param {string} method - HTTP 方法
 * @param {object|null} body - 請求 Payload
 * @param {object|null} params - 查詢參數物件
 * @param {number} retries - 遭遇 429 時的最大重試次數
 * @returns {Promise<any>}
 */
async function spotifyRequest(endpoint, method = 'GET', body = null, params = null, retries = 3) {
  // 檢查是否處於自動降級冷卻保護中
  if (await isSpotifyCooldownActive()) {
    throw new Error('Spotify API 處於自動降級冷卻保護中，已強制切換至 MusicBrainz 管道。');
  }

  const currentLock = spotifyLock;
  let release;
  spotifyLock = new Promise(resolve => { release = resolve; });

  await currentLock;
  try {
    // 執行全域瓶頸限速
    await enforceSpotifyRateLimit();
    return await spotifyRequestDirect(endpoint, method, body, params, retries);
  } finally {
    release();
  }
}

/**
 * [技術] 實際發送 API 請求的直呼器，自動處理 Token 注入與 429 緩衝，內建降級冷卻記錄
 */
async function spotifyRequestDirect(endpoint, method = 'GET', body = null, params = null, retries = 3) {
  const token = await getSpotifyAccessToken();
  if (!token) {
    throw new Error('未取得有效的 Spotify 授權！請先登入 http://localhost:3001/login/spotify 進行認證。');
  }

  let url = `https://api.spotify.com/v1/${endpoint}`;
  if (params) {
    const urlParams = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) => {
      if (val !== null && val !== undefined) {
        urlParams.append(key, val);
      }
    });
    url += `?${urlParams.toString()}`;
  }

  const options = {
    method: method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);

  // [技術] 遭遇 HTTP 429 限流防禦，自動讀取 Retry-After 並進入智慧休眠重試 (若限制時間過長則拋出錯誤以觸發降級)
  // [童趣] 小休止符號：當 Spotify 城堡的小精靈打瞌睡並退回 429 提示時，照著門口掛的 Retry-After 告示牌安靜等待，如果等太久就換一條路走（降級）！
  if (response.status === 429) {
    // 記錄限速觸發歷史
    await recordSpotify429();

    const retryAfterHeader = response.headers.get('retry-after');
    let retryAfter = parseInt(retryAfterHeader, 10);
    if (isNaN(retryAfter)) {
      // [技術] 若為 HTTP 日期格式，解析日期並計算與當前時間差的秒數，若依然失敗則預設安全時間 2 秒
      // [童趣] 時鐘滴答探測：把奇形怪狀的日期字串換算成秒數，如果對方的規則太複雜就算不出來，就乖乖預設等待 2 秒鐘
      retryAfter = retryAfterHeader ? Math.max(1, Math.ceil((new Date(retryAfterHeader).getTime() - Date.now()) / 1000)) : 2;
      if (isNaN(retryAfter) || retryAfter < 0) {
        retryAfter = 2;
      }
    }

    if (retryAfter > 10) {
      console.warn(`[Spotify/Client] 🚨 觸發重度頻率限制 (HTTP 429)，等待時間為 ${retryAfter} 秒！為免系統阻塞，將不休眠直接拋出錯誤以觸發降級管線...`);
      throw new Error(`Spotify 伺服器重度頻率限制 (HTTP 429): Retry-After ${retryAfter}s`);
    }
    
    console.warn(`[Spotify/Client] 🚨 觸發微量頻率限制 (HTTP 429)，將依照指示等待 ${retryAfter} 秒後進行重試... (剩餘重試次數: ${retries})`);
    if (retries > 0) {
      await sleep(retryAfter * 1000);
      return spotifyRequestDirect(endpoint, method, body, params, retries - 1);
    }
    throw new Error(`Spotify 伺服器頻率限制 (HTTP 429) 且已耗盡重試次數，請稍後再試。`);
  }

  // [技術] 先讀取為純文字，再防禦性解析 JSON，防範 200 OK 空內容或非 JSON 回傳導致的語法崩潰
  // [童趣] 看看籃子裡有沒有糖果：先把禮物拿出來當作純文字看看，確定籃子裡不是空空的，才高高興興地用 JSON 拆開它，絕不胡亂拆空箱子！
  const text = await response.text();

  if (!response.ok) {
    // 嘗試解析錯誤訊息
    let errorDetail = text;
    try {
      const errJson = JSON.parse(text);
      errorDetail = errJson.error?.message || text;
    } catch (e) {
      // 忽略解析 JSON 失敗
    }
    
    // 如果是 403 且包含 "NO_ACTIVE_DEVICE"，說明沒有開啟 Spotify 播放軟體，進行親切引導
    if (response.status === 403 && errorDetail.includes('NO_ACTIVE_DEVICE')) {
      throw new Error('找不到可用的 Spotify 播放設備！請先在手機、電腦或 iPad 開啟 Spotify App 並播放任意歌曲。');
    }
    
    throw new Error(`Spotify 伺服器拒絕 (HTTP ${response.status}): ${errorDetail}`);
  }

  // 處理 204 No Content, 202 Accepted 或 200 空回覆
  if (response.status === 204 || response.status === 202 || !text.trim()) {
    return { success: true };
  }

  return JSON.parse(text);
}

/**
 * [技術] 在 Spotify 上搜尋歌曲軌跡
 * [童趣] 音樂大森林尋寶：在無窮無盡的 Spotify 歌曲森林深處，幫我們找出最合適、最好聽的 Salsa 魔法小音符
 * @param {string} query - 搜尋關鍵字 (如: "La Malanga Bobby Valentin")
 * @param {number} limit - 搜尋結果上限
 * @returns {Promise<Array<object>>} 搜尋結果歌曲陣列
 */
export async function searchSpotifyTracks(query, limit = 5) {
  console.log(`[Spotify/Client] 🔍 正在搜尋歌曲：「${query}」...`);
  const data = await spotifyRequest('search', 'GET', null, {
    q: query,
    type: 'track',
    limit: limit
  });

  if (!data.tracks || !data.tracks.items) {
    return [];
  }

  // 格式化為結構化前端/機器人方便呈現的輕量格式
  return data.tracks.items.map(item => ({
    id: item.id,
    name: item.name,
    artist: item.artists.map(a => a.name).join(', '),
    album: item.album.name,
    uri: item.uri,
    duration_ms: item.duration_ms,
    image: item.album.images?.[0]?.url || ''
  }));
}

/**
 * [技術] 獲取當前用戶的所有可用播放設備列表
 * [童趣] 玩具樂器大報數：把所有已經連上線、張大耳朵準備播歌的 Spotify 喇叭和音響設備通通列出來！
 * @returns {Promise<Array<object>>} 設備陣列
 */
export async function getSpotifyDevices() {
  const data = await spotifyRequest('me/player/devices');
  return data.devices || [];
}

/**
 * [技術] 獲取當前播放狀態與進程
 * [童趣] 聽歌計時小手錶：看看現在音樂播到哪裡了，用小手錶計算一下什麼時候該切換到下一首好聽的歌
 * @returns {Promise<object|null>} 播放狀態物件
 */
export async function getSpotifyPlaybackState() {
  try {
    const data = await spotifyRequest('me/player');
    // 如果目前沒有任何播放狀態，返回 null
    if (!data || !data.item) return null;
    
    return {
      isPlaying: data.is_playing,
      progressMs: data.progress_ms,
      deviceName: data.device?.name || '未知設備',
      track: {
        id: data.item.id,
        name: data.item.name,
        artist: data.item.artists.map(a => a.name).join(', '),
        uri: data.item.uri,
        durationMs: data.item.duration_ms
      }
    };
  } catch (err) {
    // 靜默處理無設備等一般錯誤
    return null;
  }
}

/**
 * [技術] 直接播放指定的 Spotify 歌曲 (會中斷目前播放)
 * [童趣] 插隊特權卡！立刻用我們指定的最愛歌曲插隊，中斷目前的音樂並馬上播給我們聽！
 * @param {string} trackUri - Spotify 歌曲 URI (如: 'spotify:track:xxxx')
 * @param {string|null} deviceId - 專屬設備 ID
 */
export async function playSpotifyTrack(trackUri, deviceId = null) {
  console.log(`[Spotify/Client] ▶️ 正在點播播放歌曲 URI: ${trackUri}`);
  return await spotifyRequest('me/player/play', 'PUT', {
    uris: [trackUri]
  }, deviceId ? { device_id: deviceId } : null);
}

/**
 * [技術] 將歌曲加入 Spotify 原生播放隊列
 * [童趣] 乖乖排隊買糖果：把想聽的歌排在 Spotify 隊伍的最後面，一首接著一首慢慢輪流播放
 * @param {string} trackUri - Spotify 歌曲 URI
 * @param {string|null} deviceId - 專屬設備 ID
 */
export async function addSpotifyTrackToQueue(trackUri, deviceId = null) {
  console.log(`[Spotify/Client] ➕ 正在將歌曲加入播放隊列 URI: ${trackUri}`);
  return await spotifyRequest('me/player/queue', 'POST', null, {
    uri: trackUri,
    device_id: deviceId
  });
}

/**
 * [技術] 跳過當前歌曲，播放下一首
 * [童趣] 魔法切歌拍拍手：不聽這首了！立刻換掉，命令 Spotify 音響設備播放下一首好聽的新歌
 * @param {string|null} deviceId - 專屬設備 ID
 */
export async function skipSpotifyToNext(deviceId = null) {
  console.log('[Spotify/Client] ⏭️ 正在跳過當前歌曲，播放下一首...');
  return await spotifyRequest('me/player/next', 'POST', null, deviceId ? { device_id: deviceId } : null);
}

/**
 * [技術] 調整設備播放音量
 * [童趣] 旋鈕轉轉轉：調整喇叭的聲音百分比 (0 到 100)，掌控我們音樂城堡的小熱情！
 * @param {number} volumePercent - 音量百分比 (0-100)
 * @param {string|null} deviceId - 專屬設備 ID
 */
export async function setSpotifyPlaybackVolume(volumePercent, deviceId = null) {
  console.log(`[Spotify/Client] 🔊 正在調整音量為 ${volumePercent}%...`);
  return await spotifyRequest('me/player/volume', 'PUT', null, {
    volume_percent: volumePercent,
    device_id: deviceId
  });
}

// 輔助函式：原 sleep 已移至最上方

/**
 * [技術] 分頁獲取用戶關注的藝人清單 (Cursor-based Pagination)
 * [童趣] 尋找好朋友名單：一頁一頁地把我們關注的歌手大名放進小名冊裡，直到每一個人都被點名點完！
 * @returns {Promise<Array<object>>} 藝人清單陣列
 */
export async function getSpotifyFollowedArtists() {
  let artists = [];
  let after = null;
  let hasMore = true;

  console.log('[Spotify/Client] 🔍 正在獲取您關注的藝人清單...');

  while (hasMore) {
    const params = {
      type: 'artist',
      limit: 50
    };
    if (after) {
      params.after = after;
    }

    const data = await spotifyRequest('me/following', 'GET', null, params);
    const items = data.artists?.items || [];
    artists = artists.concat(items);

    if (items.length > 0 && data.artists?.next) {
      after = items[items.length - 1].id;
    } else {
      hasMore = false;
    }
  }

  console.log(`[Spotify/Client] ✅ 成功獲取 ${artists.length} 位關注的藝人！`);
  return artists.map(item => ({
    id: item.id,
    name: item.name,
    genres: item.genres || [],
    uri: item.uri,
    url: item.external_urls?.spotify || ''
  }));
}

/**
 * [技術] 獲取單個藝人的發行專輯與單曲清單 (分頁自動爬取直到超出天數範圍)
 * [童趣] 到歌手家尋寶：走進這位歌手的亮晶晶寶箱，把最新生出來的專輯和單曲都帶回家
 * @param {string} artistId - 藝人 Spotify ID
 * @param {number} days - 往前追溯的天數範圍，預設 30 天
 * @returns {Promise<Array<object>>} 專輯清單陣列
 */
export async function getSpotifyArtistAlbums(artistId, days = 30) {
  let albums = [];
  let limit = 10; // Spotify 最新限制 artists/{id}/albums 上限為 10
  let offset = 0;
  let hasMore = true;
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  while (hasMore) {
    const data = await spotifyRequest(`artists/${artistId}/albums`, 'GET', null, {
      include_groups: 'album,single',
      limit: limit,
      offset: offset
    });

    const items = data.items || [];
    if (items.length === 0) {
      break;
    }

    albums = albums.concat(items);

    // 檢查這一頁最舊的專輯是否還在指定天數內，如果是，則繼續抓取下一頁
    const oldestItem = items[items.length - 1];
    let oldestDate;
    if (oldestItem.release_date_precision === 'day') {
      oldestDate = new Date(oldestItem.release_date);
    } else if (oldestItem.release_date_precision === 'month') {
      oldestDate = new Date(`${oldestItem.release_date}-01`);
    } else {
      oldestDate = new Date(`${oldestItem.release_date}-01-01`);
    }

    if (oldestDate >= cutoffDate && data.next && items.length === limit) {
      offset += limit;
    } else {
      hasMore = false;
    }
  }

  return albums.map(item => ({
    id: item.id,
    name: item.name,
    release_date: item.release_date,
    release_date_precision: item.release_date_precision,
    total_tracks: item.total_tracks,
    type: item.album_type,
    uri: item.uri,
    url: item.external_urls?.spotify || '',
    image: item.images?.[0]?.url || ''
  }));
}

/**
 * [技術] 狀態化分批掃描所有關注藝人在最近一個月內發行的新專輯與單曲 (支援雙源降級防禦與 429 緩衝)
 * [童趣] 輪流去探險：在我們所有喜歡的歌手中，挑出最久沒有去拜訪的人進行大探索。
 *        如果 Spotify 城堡的小精靈打瞌睡（429 限速），我們就自動改去 MusicBrainz 音樂圖書館探險，保證好聽的新歌源源不絕！
 * @param {number} days - 掃描的天數範圍，預設 30 天
 * @param {number|null} batchSize - 本次分批掃描的藝人數量上限，預設 15 位。設為 null 則掃描全部。
 * @returns {Promise<Array<object>>} 近期新發行去重後的清單
 */
export async function scanRecentNewReleases(days = 30, batchSize = 15) {
  // 載入狀態檔以進行狀態化排序與 MBID 快取對齊
  const stateFilePath = path.resolve('data/scanner-state.json');
  let scannerState = {};
  
  try {
    const stateData = await fs.readFile(stateFilePath, 'utf8');
    scannerState = JSON.parse(stateData);
  } catch (err) {
    // 狀態檔不存在或毀損，則初始化空狀態
  }

  let followedArtists = [];
  let isSpotifyBlocked = false;

  console.log('[Spotify/Scanner] 🔍 正在獲取您關注的藝人清單...');
  try {
    followedArtists = await getSpotifyFollowedArtists();
  } catch (err) {
    // 判定是否為 429 限制，若被限制，開啟降級防禦
    if (err.message.includes('429') || err.message.includes('Too many requests') || err.message.includes('頻率')) {
      console.warn(`[Spotify/Scanner] 🚨 Spotify 獲取關注藝人時遭遇 429 鎖定！降級使用本地快取的藝人清單...`);
      isSpotifyBlocked = true;
    } else {
      throw err;
    }
  }

  // 若 Spotify 遭到限流鎖定，從本地狀態快取中重建藝人名冊 (Data-Centric Resilience)
  if (isSpotifyBlocked || followedArtists.length === 0) {
    followedArtists = Object.entries(scannerState).map(([id, val]) => ({
      id: id,
      name: val.name,
      genres: [],
      uri: `spotify:artist:${id}`,
      url: `https://open.spotify.com/artist/${id}`
    }));

    if (followedArtists.length === 0) {
      throw new Error('Spotify 遭到 429 限制，且本地狀態庫沒有任何歷史藝人紀錄！無法啟動降級探索。');
    }
    console.log(`[Spotify/Scanner] 💾 成功自本地狀態庫載入 ${followedArtists.length} 位歷史藝人進行降級掃描。`);
  }

  // 將藝人依照最後掃描時間排序，最久沒掃或未曾掃過的排最前面 (防範日期解析為 NaN 導致排序不穩定)
  let sortedArtists = [...followedArtists].sort((a, b) => {
    const dateA = scannerState[a.id]?.last_scanned_at ? new Date(scannerState[a.id].last_scanned_at) : null;
    const dateB = scannerState[b.id]?.last_scanned_at ? new Date(scannerState[b.id].last_scanned_at) : null;
    const timeA = dateA && !isNaN(dateA.getTime()) ? dateA.getTime() : 0;
    const timeB = dateB && !isNaN(dateB.getTime()) ? dateB.getTime() : 0;
    return timeA - timeB;
  });

  // 決定本次要掃描的藝人批次
  const targetArtists = (batchSize && batchSize > 0) ? sortedArtists.slice(0, batchSize) : sortedArtists;
  const remainingCount = followedArtists.length - targetArtists.length;

  console.log(`[Spotify/Scanner] 📦 本次分批掃描藝人數量: ${targetArtists.length} 位。`);
  if (batchSize && batchSize > 0) {
    console.log(`[Spotify/Scanner] 🕒 剩餘未掃描或較早掃描藝人: ${remainingCount} 位，將於後續批次逐步推進。`);
  }

  const newReleases = [];
  const seenAlbumIds = new Set();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  console.log(`[Spotify/Scanner] 🚀 開始掃描近 ${days} 天內的新發行專輯與單曲...`);

  for (const artist of targetArtists) {
    let albums = [];
    let useMusicBrainzForThisArtist = isSpotifyBlocked;

    try {
      if (!useMusicBrainzForThisArtist) {
        console.log(`[Spotify/Scanner] 📡 正在透過 Spotify 掃描藝人: ${artist.name}...`);
        // [技術] 溫和防禦延遲：每次呼叫 Spotify 前隨機等待 300ms ~ 500ms，以防高頻抓取觸發 429
        // [童趣] 輕輕敲敲門：每次向 Spotify 發問前，都溫柔地等 300~500 毫秒，不要把小精靈吵醒，防範它對我們發出警告！
        const politenessMs = Math.floor(Math.random() * 200) + 300;
        await sleep(politenessMs);

        albums = await getSpotifyArtistAlbums(artist.id, days);
      }
    } catch (err) {
      if (err.message.includes('429') || err.message.includes('Too many requests') || err.message.includes('頻率')) {
        console.warn(`[Spotify/Scanner] 🚨 藝人 ${artist.name} 觸發 Spotify 429 限流！自動降級切換至 MusicBrainz 進行掃描...`);
        useMusicBrainzForThisArtist = true;
      } else {
        console.warn(`[Spotify/Scanner] ⚠️ 獲取藝人 ${artist.name} 專輯時出錯:`, err.message || err);
      }
    }

    // 降級使用 MusicBrainz 進行探索
    if (useMusicBrainzForThisArtist) {
      try {
        console.log(`[Spotify/Scanner] 🎼 正在透過 MusicBrainz 探索藝人: ${artist.name}...`);
        
        // 獲取 MBID (優先讀取本地快取，避免重複搜尋)
        let mbid = scannerState[artist.id]?.musicbrainz_mbid;
        if (!mbid) {
          mbid = await getMusicBrainzArtistMBID(artist.name);
          if (mbid) {
            if (!scannerState[artist.id]) {
              scannerState[artist.id] = { name: artist.name };
            }
            scannerState[artist.id].musicbrainz_mbid = mbid;
          }
        }

        if (mbid) {
          albums = await getMusicBrainzArtistAlbums(mbid, days);
        } else {
          console.warn(`[Spotify/Scanner] ⚠️ 無法為藝人 ${artist.name} 找到對應的 MBID，跳過此藝人。`);
        }
      } catch (mbErr) {
        console.error(`[Spotify/Scanner] ❌ 透過 MusicBrainz 探索藝人 ${artist.name} 失敗:`, mbErr.message || mbErr);
      }
    }

    // 處理獲取到的新發行 (完美相容 Candidate Schema)
    for (const album of albums) {
      if (seenAlbumIds.has(album.id)) continue;

      let releaseDate;
      if (album.release_date_precision === 'day') {
        releaseDate = new Date(album.release_date);
      } else if (album.release_date_precision === 'month') {
        releaseDate = new Date(`${album.release_date}-01`);
      } else {
        releaseDate = new Date(`${album.release_date}-01-01`);
      }

      if (releaseDate >= cutoffDate) {
        seenAlbumIds.add(album.id);
        newReleases.push({
          ...album,
          primary_artist: artist.name,
          artist_genres: artist.genres
        });
      }
    }

    // 更新藝人的最後掃描時間狀態，保留 MBID 等快取
    if (!scannerState[artist.id]) {
      scannerState[artist.id] = { name: artist.name };
    }
    scannerState[artist.id].last_scanned_at = new Date().toISOString();

    // 每次探索完一個藝人後，休息 300ms 緩衝
    await sleep(300);
  }

  // 確保 data 目錄存在並保存最新狀態庫
  try {
    await fs.mkdir(path.dirname(stateFilePath), { recursive: true });
    await fs.writeFile(stateFilePath, JSON.stringify(scannerState, null, 2), 'utf8');
    console.log(`[Spotify/Scanner] 💾 成功更新並保存掃描狀態至 ${stateFilePath}`);
  } catch (err) {
    console.warn(`[Spotify/Scanner] ⚠️ 保存狀態檔時發生錯誤:`, err.message || err);
  }

  console.log(`[Spotify/Scanner] 🎉 本批次掃描完成！尋獲 ${newReleases.length} 個近 ${days} 天內的新發行！`);
  return newReleases;
}
