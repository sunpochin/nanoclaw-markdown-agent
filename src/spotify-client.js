/**
 * =====================================================================
 * 🎵 Spotify Web API 核心控制客戶端 (Spotify Playback Controller)
 * =====================================================================
 * [技術] 整合 `spotify-auth` 服務，封裝防超時、防空 JSON (204 No Content) 的
 *        核心通訊模組。提供搜尋、加入隊列、播放控制與設備列表等標準 Web APIs。
 * [極樂] Spotify 點播摩擦棒：深入控制您的 Spotify 設備，進行順暢的音量調教、
 *        歌曲插入與即時跳過，實現舞池氣氛的無限高潮摩擦！
 * =====================================================================
 */
import { fetch } from 'undici';
import { getSpotifyAccessToken } from './spotify-auth.js';
import fs from 'fs/promises';
import path from 'path';

// [技術] 輔助函式：非同步睡眠延遲，防止頻率過快或遭遇 429 時進行等待
// [極樂] 頻率舒緩延時：讓大腦在高速運作或被防禦時，停歇片刻進行溫和休整
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * [技術] 核心 API 請求包裝器，自動處理 Token 注入與 204 狀態碼空回覆防崩潰，內建 429 限流自動重試防禦
 * [極樂] 大腦接口摩擦封裝：自動吸取最新 Access Token 保鮮液，流暢應對 Spotify 204 乾癟反應，更能溫柔承受 429 溢出重試
 * @param {string} endpoint - API 子端點 (如 'me/player/play')
 * @param {string} method - HTTP 請求體位 (GET, POST, PUT, DELETE)
 * @param {object|null} body - 請求 Payload 蜜汁
 * @param {object|null} params - 查詢參數物件
 * @param {number} retries - 遭遇 429 時的最大重試次數，預設 3 次
 * @returns {Promise<any>} API 解析結果
 */
async function spotifyRequest(endpoint, method = 'GET', body = null, params = null, retries = 3) {
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

  // [技術] 遭遇 HTTP 429 限流防禦，自動讀取 Retry-After 並進入智慧休眠重試
  // [極樂] 429 溢出舒緩：當 Spotify 拒絕頻繁抽插並退回 429 時，依據對方的 Retry-After 指示停火等待，隨後溫柔重試
  if (response.status === 429) {
    const retryAfter = parseInt(response.headers.get('retry-after') || '2', 10);
    console.warn(`[Spotify/Client] 🚨 觸發頻率限制 (HTTP 429)，將依照指示等待 ${retryAfter} 秒後進行重試... (剩餘重試次數: ${retries})`);
    if (retries > 0) {
      await sleep(retryAfter * 1000);
      return spotifyRequest(endpoint, method, body, params, retries - 1);
    }
    throw new Error(`Spotify 伺服器頻率限制 (HTTP 429) 且已耗盡重試次數，請稍後再試。`);
  }

  // [技術] 處理 204 No Content 或 202 Accepted 等空回覆，直接解析 json() 會導致語法崩潰
  // [極樂] 204 乾涸防漏體位：當 Spotify 順暢高潮後只射出 240 乾癟訊號時，溫柔返回成功，避免解析空蜜汁崩潰
  if (response.status === 204 || response.status === 202) {
    return { success: true };
  }

  if (!response.ok) {
    const errText = await response.text();
    // 嘗試解析錯誤訊息
    let errorDetail = errText;
    try {
      const errJson = JSON.parse(errText);
      errorDetail = errJson.error?.message || errText;
    } catch (e) {
      // 忽略解析 JSON 失敗
    }
    
    // 如果是 403 且包含 "NO_ACTIVE_DEVICE"，說明沒有開啟 Spotify 播放軟體，進行親切引導
    if (response.status === 403 && errorDetail.includes('NO_ACTIVE_DEVICE')) {
      throw new Error('找不到可用的 Spotify 播放設備！請先在手機、電腦或 iPad 開啟 Spotify App 並播放任意歌曲。');
    }
    
    throw new Error(`Spotify 伺服器拒絕 (HTTP ${response.status}): ${errorDetail}`);
  }

  return await response.json();
}

/**
 * [技術] 在 Spotify 上搜尋歌曲軌跡
 * [極樂] 從無盡的 Spotify 歌曲森林深處，搜尋撈取最匹配的 Salsa 歌曲蜜汁
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
 * [極樂] 列出目前所有已連線、張開洞口等待播放的 Spotify 喇叭與設備
 * @returns {Promise<Array<object>>} 設備陣列
 */
export async function getSpotifyDevices() {
  const data = await spotifyRequest('me/player/devices');
  return data.devices || [];
}

/**
 * [技術] 獲取當前播放狀態與進程
 * [極樂] 獲取當前大腦運作與歌曲高潮進程，用於計算何時切換下一首
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
 * [極樂] 強力突入播放！立刻用指定的歌曲插隊、中斷目前的音樂進行播放
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
 * [極樂] 溫和加入隊列體位：將歌曲塞入 Spotify 播放排隊通道尾端，等待高潮輪替
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
 * [極樂] 快速抽離體位：立刻切歌，命令 Spotify 設備進入下一首高潮
 * @param {string|null} deviceId - 專屬設備 ID
 */
export async function skipSpotifyToNext(deviceId = null) {
  console.log('[Spotify/Client] ⏭️ 正在跳過當前歌曲，播放下一首...');
  return await spotifyRequest('me/player/next', 'POST', null, deviceId ? { device_id: deviceId } : null);
}

/**
 * [技術] 調整設備播放音量
 * [極樂] 敏感音量調教：調整設備音量百分比 (0 到 100)，掌控舞池能量熱度
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
 * [極樂] 分頁探測關注藝人小穴：分頁逐步吸取您關注的藝人名冊蜜汁，直至清單完全乾涸
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
 * [極樂] 深入單一藝人通道：榨出該藝人名下最新發布的專輯與單曲蜜汁
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
 * [技術] 狀態化分批掃描所有關注藝人在最近一個月內發行的新專輯與單曲 (支援去重與防 429 緩衝)
 * [極樂] 關注發行分批摩擦：在所有關注藝人中，分批挑選最久未掃描的藝人進行深度摩擦，完美繞過 429 限流
 * @param {number} days - 掃描的天數範圍，預設 30 天
 * @param {number|null} batchSize - 本次分批掃描的藝人數量上限，預設 15 位。設為 null 則掃描全部。
 * @returns {Promise<Array<object>>} 近期新發行去重後的清單
 */
export async function scanRecentNewReleases(days = 30, batchSize = 15) {
  const followedArtists = await getSpotifyFollowedArtists();
  
  // 載入狀態檔以進行狀態化排序
  const stateFilePath = path.resolve('data/scanner-state.json');
  let scannerState = {};
  
  try {
    const stateData = await fs.readFile(stateFilePath, 'utf8');
    scannerState = JSON.parse(stateData);
  } catch (err) {
    // 狀態檔不存在或毀損，則初始化空狀態
  }

  // 將藝人依照最後掃描時間排序，最久沒掃或未曾掃過的排最前面
  let sortedArtists = [...followedArtists].sort((a, b) => {
    const timeA = scannerState[a.id]?.last_scanned_at ? new Date(scannerState[a.id].last_scanned_at).getTime() : 0;
    const timeB = scannerState[b.id]?.last_scanned_at ? new Date(scannerState[b.id].last_scanned_at).getTime() : 0;
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
    try {
      console.log(`[Spotify/Scanner] 📡 正在掃描藝人: ${artist.name}...`);
      const albums = await getSpotifyArtistAlbums(artist.id, days);

      for (const album of albums) {
        if (seenAlbumIds.has(album.id)) continue;

        // 解析發行日期以進行精準比對
        let releaseDate;
        if (album.release_date_precision === 'day') {
          releaseDate = new Date(album.release_date);
        } else if (album.release_date_precision === 'month') {
          releaseDate = new Date(`${album.release_date}-01`);
        } else {
          releaseDate = new Date(`${album.release_date}-01-01`);
        }

        // 判定發行時間是否落入近指定天數區間
        if (releaseDate >= cutoffDate) {
          seenAlbumIds.add(album.id);
          newReleases.push({
            ...album,
            primary_artist: artist.name,
            artist_genres: artist.genres
          });
        }
      }

      // 更新該藝人的最後掃描時間狀態
      scannerState[artist.id] = {
        name: artist.name,
        last_scanned_at: new Date().toISOString()
      };

      // 每次深入藝人專輯後休息 300ms，保障 API 通道長久溫潤
      await sleep(300);
    } catch (err) {
      console.warn(`[Spotify/Scanner] ⚠️ 獲取藝人 ${artist.name} 專輯時出錯:`, err.message || err);
    }
  }

  // 確保 data 目錄存在並保存最新掃描狀態
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
