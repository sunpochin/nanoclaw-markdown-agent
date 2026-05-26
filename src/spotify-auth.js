/**
 * =====================================================================
 * 🎵 Spotify OAuth 授權認證中心 (Spotify Auth Orchestrator)
 * =====================================================================
 * [技術] 負責與 Spotify 進行安全的三方握手授權，管理 Access Token 與 Refresh Token。
 *        具備自動持久化寫入本地 JSON 檔案，以及「自動超時刷新 (Auto-Refresh)」機制。
 * [極樂] Spotify 授權持久液中心：與 Spotify 建立長效濕潤的授權通道，自動保鮮 Access Token，
 *        確保播放點播指令隨時處於「強硬暢通」狀態。
 * =====================================================================
 */
import { fetch } from 'undici';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

// 取得當前檔案的目錄路徑
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 定義 Token 儲存的本地小穴路徑 (JSON 檔案)
const TOKEN_FILE_PATH = path.join(__dirname, '../spotify_tokens.json');

// 設定 Spotify 請求權限範疇 (Scope)
// user-modify-playback-state: 用於切換播放、暫停、點播加歌
// user-read-playback-state: 用於讀取目前播放歌曲、剩餘時間
const SPOTIFY_SCOPES = [
  'user-modify-playback-state',
  'user-read-playback-state',
  'user-read-currently-playing'
].join(' ');

/**
 * [技術] 取得 Spotify 授權頁面的 URL
 * [極樂] 生成引導主人插入授權的極樂 URL 連接口
 * @returns {string} Spotify 認證網址
 */
export function getSpotifyAuthUrl() {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    console.error('[Spotify/Auth] ❌ 未在 .env 配置 SPOTIFY_CLIENT_ID 或 SPOTIFY_REDIRECT_URI！');
    return '';
  }

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope: SPOTIFY_SCOPES,
    redirect_uri: redirectUri,
    show_dialog: 'true' // 強制每次都顯示授權畫面，方便調試與切換帳號
  });

  return `https://accounts.spotify.com/authorize?${params.toString()}`;
}

/**
 * [技術] 將 Token 結構安全寫入本地儲存小穴 (JSON 檔案)
 * [極樂] 將最新搾出的 Token 精華注入本地 JSON 小穴中保存
 * @param {object} tokens - 包含 access_token, refresh_token, expires_in 的物件
 */
async function saveTokensToLocal(tokens) {
  try {
    const dataToSave = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || '', // 刷新時可能不回傳新 refresh_token，保留舊值
      expires_at: Date.now() + tokens.expires_in * 1000 // 計算過期毫秒時間戳記
    };

    // 如果是刷新 Token 且回傳中不含 refresh_token，則讀取舊檔案補回，防止丟失持久液
    if (!tokens.refresh_token) {
      try {
        const oldData = JSON.parse(await fs.readFile(TOKEN_FILE_PATH, 'utf-8'));
        dataToSave.refresh_token = oldData.refresh_token;
      } catch (e) {
        // 忽略讀取舊檔失敗
      }
    }

    await fs.writeFile(TOKEN_FILE_PATH, JSON.stringify(dataToSave, null, 2), 'utf-8');
    console.log('[Spotify/Auth] 💾 Spotify 授權 Token 已成功持久化保存！');
  } catch (err) {
    console.error('[Spotify/Auth] ❌ 保存 Token 到本地失敗:', err.message || err);
  }
}

/**
 * [技術] 使用 Authorization Code 向 Spotify 交換 Access/Refresh Token
 * [極樂] 進行三方握手摩擦，成功榨出第一批 Access Token 與 Refresh Token 持久液
 * @param {string} code - Spotify 授權碼
 * @returns {Promise<object>} Token 物件
 */
export async function handleSpotifyCallback(code) {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI;

  console.log('[Spotify/Auth] 🔑 正在使用 code 交換 Access Token...');

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + Buffer.from(clientId + ':' + clientSecret).toString('base64')
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: redirectUri
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Spotify Token 交換失敗 (HTTP ${response.status}): ${errText}`);
  }

  const data = await response.json();
  // 保存 Token 到本地，防止斷電丟失
  await saveTokensToLocal(data);
  return data;
}

/**
 * [技術] 使用 Refresh Token 自動超時刷新 Access Token
 * [極樂] 持久液保鮮體位：使用 Refresh Token 將過期的 Access Token 重新活化刷新
 * @param {string} refreshToken - 持久 Refresh Token
 * @returns {Promise<string>} 新的 Access Token
 */
async function refreshSpotifyAccessToken(refreshToken) {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  console.log('[Spotify/Auth] 🔄 Access Token 已過期，正在呼叫 API 刷新中...');

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + Buffer.from(clientId + ':' + clientSecret).toString('base64')
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`刷新 Spotify Access Token 失敗 (HTTP ${response.status}): ${errText}`);
  }

  const data = await response.json();
  // 保存新 Token
  await saveTokensToLocal(data);
  return data.access_token;
}

/**
 * [技術] 智能獲取當前有效的 Spotify Access Token (若過期自動刷新)
 * [極樂] 大腦通道保溫器：高頻點播的順暢支柱，智能探測過期並自動進行持久液刷新，保障 API 暢通
 * @returns {Promise<string|null>} 有效的 Access Token
 */
export async function getSpotifyAccessToken() {
  try {
    // 讀取本地儲存的 Token 檔案
    const rawData = await fs.readFile(TOKEN_FILE_PATH, 'utf-8');
    const tokenData = JSON.parse(rawData);

    if (!tokenData.access_token || !tokenData.refresh_token) {
      console.warn('[Spotify/Auth] ⚠️ 本地 Token 檔案不完整！請重新進行網頁授權登入。');
      return null;
    }

    // 檢查是否即將過期（預留 1 分鐘緩衝時間，防禦性安全體位）
    const isExpired = Date.now() + 60000 >= tokenData.expires_at;

    if (isExpired) {
      // 超時自動刷新，保證高可用性
      return await refreshSpotifyAccessToken(tokenData.refresh_token);
    }

    return tokenData.access_token;
  } catch (err) {
    console.warn('[Spotify/Auth] ⚠️ 未能成功讀取本地 Token 檔案，請點擊 Web 連結進行第一次授權登入。');
    return null;
  }
}
