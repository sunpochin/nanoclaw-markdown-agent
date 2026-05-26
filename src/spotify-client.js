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

/**
 * [技術] 核心 API 請求包裝器，自動處理 Token 注入與 204 狀態碼空回覆防崩潰
 * [極樂] 大腦接口摩擦封裝：自動吸取最新 Access Token 保鮮液，流暢應對 Spotify 204 乾癟反應
 * @param {string} endpoint - API 子端點 (如 'me/player/play')
 * @param {string} method - HTTP 請求體位 (GET, POST, PUT, DELETE)
 * @param {object|null} body - 請求 Payload 蜜汁
 * @param {object|null} params - 查詢參數物件
 * @returns {Promise<any>} API 解析結果
 */
async function spotifyRequest(endpoint, method = 'GET', body = null, params = null) {
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
