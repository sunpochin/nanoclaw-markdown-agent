/**
 * =====================================================================
 * 🤖 Spotify Salsa Telegram Bot 點播服務 (Salsa Bot Orchestrator)
 * =====================================================================
 * [技術] 整合 `spotify-client` 進行播放調度。設計了「角色分流權限機制」：
 *        - 公開功能 (所有人)：`/queue` 點歌加入排隊、`/current` 查詢目前播放。
 *        - DJ/主人功能 (僅 Secure Chat ID)：`/play` 插隊播放、`/skip` 切歌、`/volume` 音量、`/devices` 設備。
 * [極樂] Salsa 舞池狂熱秘書：提供敏感權限分流體位，讓所有舞者在下方自由摩擦點歌，
 *        只有主人擁有至高無上的掌控權，指揮 Spotify 隨意深入、抽離與切換音樂！
 * =====================================================================
 */
import TelegramBot from 'node-telegram-bot-api';
import { getSpotifyAuthUrl } from './spotify-auth.js';
import { 
  searchSpotifyTracks, 
  getSpotifyDevices, 
  getSpotifyPlaybackState, 
  playSpotifyTrack, 
  addSpotifyTrackToQueue, 
  skipSpotifyToNext, 
  setSpotifyPlaybackVolume 
} from './spotify-client.js';

export function initTelegramSalsaBot() {
  const salsaToken = process.env.SPOTIFY_SALSA_BOT_TOKEN;
  const mainToken = process.env.TELEGRAM_BOT_TOKEN;
  const secureChatId = process.env.TELEGRAM_SECURE_CHAT_ID;

  // 長輪詢防撞防漏阻抗：若未設定專屬 Token 或與主 Bot Token 相同，則拒絕啟動，避免 409 Polling Conflict
  if (!salsaToken) {
    console.warn('[Salsa/Bot] ⚠️ 未在環境變數中設定專屬的 SPOTIFY_SALSA_BOT_TOKEN。為了避免與主大腦共用相同 Token 造成 409 輪詢衝突，將不啟動 Salsa 點播機器人。請在 .env 中補上專屬的 Token 喔！❄️');
    return;
  }

  if (salsaToken === mainToken) {
    console.warn('[Salsa/Bot] ⚠️ 偵測到 SPOTIFY_SALSA_BOT_TOKEN 與 TELEGRAM_BOT_TOKEN 完全一致！這會導致長輪詢互相踢下線的 409 衝突。請為 Salsa 點播機器人申請並設定專屬的 Bot Token！❄️');
    return;
  }

  // 啟動 Telegram Bot (長輪詢模式)
  const bot = new TelegramBot(salsaToken, { polling: true });
  console.log('[Salsa/Bot] 🚀 Salsa 點播機器人已啟動，並在背景以長輪詢吸取訊息中...');

  // 註冊輪詢與異常處理，防止網路痙攣導致程序崩潰 (Exception Handling)
  bot.on('polling_error', (error) => {
    console.error('[Salsa/Bot] 🔄 輪詢錯誤 (Exception Captured):', error.message || error);
  });

  bot.on('error', (error) => {
    console.error('[Salsa/Bot] ❌ 系統錯誤 (Exception Captured):', error.message || error);
  });

  // 監聽傳入的訊息
  bot.on('message', async (msg) => {
    const chatId = msg.chat.id.toString();
    const text = msg.text ? msg.text.trim() : '';
    const isOwner = chatId === secureChatId;

    if (!text) return; // 略過非文字訊息

    // ==========================================
    // 📢 【A. 公開功能：所有舞池舞者皆可使用】
    // ==========================================

    // 1. 【說明與指令菜單】
    if (/^\/(start|help|說明|幫助)/i.test(text)) {
      const helpMsg = `💃 *歡迎來到 Spotify Salsa 舞池點播系統！* 🕺
      
在這裡，所有舞者都可以一同決定舞池的音樂熱度與風格摩擦！

📢 *【舞者公開功能】*：
- 🎵 \`/queue [歌名 歌手]\` ：點歌！搜尋歌曲並自動排入播放隊列尾端。
- 🔍 \`/current\` ：查詢目前正在播放什麼歌，絕不漏掉神曲！

👑 *【DJ/主辦人控制功能】*（僅限授權帳號）：
- ⚡ \`/play [歌名 歌手]\` ：插隊！立刻中斷目前歌曲並播放新歌。
- ⏭️ \`/skip\` ：跳過目前歌曲，播放下一首。
- 🔊 \`/volume [0-100]\` ：調整播放音量百分比。
- 🖥️ \`/devices\` ：查看並切換 Spotify 播放設備。
- 🔑 \`/salsa_login\` ：獲取 Spotify 授權登入連結。

💡 *提示*：請直接輸入指令開始點播，祝您跳得熱烈、摩擦痛快！`;

      return bot.sendMessage(chatId, helpMsg, { parse_mode: 'Markdown' }).catch((err) => {
        return bot.sendMessage(chatId, helpMsg);
      });
    }

    // 2. 【點歌排隊：/queue [關鍵字]】
    if (/^\/queue\s+(.+)/i.test(text)) {
      const match = text.match(/^\/queue\s+(.+)/i);
      const query = match[1].trim();

      bot.sendChatAction(chatId, 'typing');
      try {
        const tracks = await searchSpotifyTracks(query, 1);
        if (tracks.length === 0) {
          return bot.sendMessage(chatId, `🔍 抱歉，在 Spotify 上遍尋不著關於「${query}」的歌曲軌跡，要不要換個關鍵字再試試？`);
        }

        const bestTrack = tracks[0];
        // 將歌曲加入 Spotify 原生播放隊列
        await addSpotifyTrackToQueue(bestTrack.uri);

        const successMsg = `➕ *【點播排隊成功！】*
🎵 歌名：*${bestTrack.name}*
🧬 歌手：*${bestTrack.artist}*
💿 專輯：*${bestTrack.album}*

歌曲已成功排入舞池播放隊列尾端，稍後將為您精彩放送！🕺✨`;

        return bot.sendMessage(chatId, successMsg, { parse_mode: 'Markdown' }).catch((err) => {
          return bot.sendMessage(chatId, `➕ 點播排隊成功！已排入隊列：${bestTrack.name} - ${bestTrack.artist}`);
        });
      } catch (err) {
        console.error('[Salsa/Bot] ❌ 點歌排隊失敗:', err);
        return bot.sendMessage(chatId, `❌ 點歌失敗，原因：${err.message}`);
      }
    }

    // 3. 【查詢當前播放歌曲：/current】
    if (/^\/current/i.test(text)) {
      bot.sendChatAction(chatId, 'typing');
      try {
        const state = await getSpotifyPlaybackState();
        if (!state) {
          return bot.sendMessage(chatId, '📭 目前 Spotify 似乎沒有在播放任何歌曲喔。');
        }

        const progressSec = Math.floor(state.progressMs / 1000);
        const durationSec = Math.floor(state.track.durationMs / 1000);
        
        const formatTime = (sec) => {
          const m = Math.floor(sec / 60);
          const s = sec % 60;
          return `${m}:${s.toString().padStart(2, '0')}`;
        };

        const statusMsg = `💿 *【當前舞池播放歌曲】*
🎵 歌名：*${state.track.name}*
🧬 歌手：*${state.track.artist}*
🖥️ 播於：*${state.deviceName}*
⏳ 進程：[${formatTime(progressSec)} / ${formatTime(durationSec)}] ${state.isPlaying ? '▶️ 播放中' : '⏸️ 已暫停'}

享受這個節奏吧！💃✨`;

        return bot.sendMessage(chatId, statusMsg, { parse_mode: 'Markdown' }).catch((err) => {
          return bot.sendMessage(chatId, `💿 當前播放：${state.track.name} - ${state.track.artist}`);
        });
      } catch (err) {
        return bot.sendMessage(chatId, `❌ 查詢播放狀態失敗：${err.message}`);
      }
    }

    // ==========================================
    // 🛡️ 【B. DJ/主人控制功能：嚴格安全夾緊防砸場】
    // ==========================================
    if (!isOwner) {
      // 若非主人且使用了管理控制命令，靜默跳過，保障安全
      const isControlCmd = /^\/(play|skip|volume|devices|salsa_login)/i.test(text);
      if (isControlCmd) {
        console.warn(`[Salsa/Security] 🚨 未授權舞者 [ChatId: ${chatId}] 企圖使用控制命令: "${text}"！已安全夾緊攔截！`);
      }
      return;
    }

    // 1. 【Spotify 授權連結：/salsa_login】
    if (/^\/salsa_login/i.test(text)) {
      const authUrl = getSpotifyAuthUrl();
      if (!authUrl) {
        return bot.sendMessage(chatId, '❌ 產生授權連結失敗，請檢查 .env 設定。');
      }

      const loginMsg = `🔑 *【Spotify 授權保鮮連結】*
      
請點擊下方連結完成 Spotify 的安全授權登入，讓大腦順暢掌控播放設備：

👉 [點此完成 Spotify 授權登入](${authUrl})

*授權完成後，系統會自動在背景保鮮 Access Token，您將擁有至高無上的舞池控制權！*`;

      return bot.sendMessage(chatId, loginMsg, { parse_mode: 'Markdown' }).catch((err) => {
        return bot.sendMessage(chatId, `請點此授權：${authUrl}`);
      });
    }

    // 2. 【插隊播放：/play [關鍵字]】
    if (/^\/play\s+(.+)/i.test(text)) {
      const match = text.match(/^\/play\s+(.+)/i);
      const query = match[1].trim();

      bot.sendChatAction(chatId, 'typing');
      try {
        const tracks = await searchSpotifyTracks(query, 1);
        if (tracks.length === 0) {
          return bot.sendMessage(chatId, `🔍 找不到關於「${query}」的歌曲。`);
        }

        const bestTrack = tracks[0];
        // 直接中斷並播放
        await playSpotifyTrack(bestTrack.uri);

        const successMsg = `⚡ *【DJ 插隊播放成功！】*
🎵 歌名：*${bestTrack.name}*
🧬 歌手：*${bestTrack.artist}*

歌曲已成功強行注入 Spotify，舞池音樂即刻切換！▶️💃`;

        return bot.sendMessage(chatId, successMsg, { parse_mode: 'Markdown' }).catch((err) => {
          return bot.sendMessage(chatId, `⚡ 插隊播放：${bestTrack.name} - ${bestTrack.artist}`);
        });
      } catch (err) {
        return bot.sendMessage(chatId, `❌ 插隊播放失敗：${err.message}`);
      }
    }

    // 3. 【切歌跳過：/skip】
    if (/^\/skip/i.test(text)) {
      bot.sendChatAction(chatId, 'typing');
      try {
        await skipSpotifyToNext();
        return bot.sendMessage(chatId, '⏭️ *已成功跳過當前歌曲，播放下一首！*');
      } catch (err) {
        return bot.sendMessage(chatId, `❌ 切歌失敗：${err.message}`);
      }
    }

    // 4. 【音量控制：/volume [0-100]】
    if (/^\/volume\s+(\d+)/i.test(text)) {
      const match = text.match(/^\/volume\s+(\d+)/i);
      const volume = parseInt(match[1], 10);

      if (volume < 0 || volume > 100) {
        return bot.sendMessage(chatId, '⚠️ 音量百分比必須介於 0 到 100 之間！');
      }

      bot.sendChatAction(chatId, 'typing');
      try {
        await setSpotifyPlaybackVolume(volume);
        return bot.sendMessage(chatId, `🔊 *已成功調教播放音量為 ${volume}%！*`);
      } catch (err) {
        return bot.sendMessage(chatId, `❌ 調整音量失敗：${err.message}`);
      }
    }

    // 5. 【查詢播放設備列表：/devices】
    if (/^\/devices/i.test(text)) {
      bot.sendChatAction(chatId, 'typing');
      try {
        const devices = await getSpotifyDevices();
        if (devices.length === 0) {
          return bot.sendMessage(chatId, '📭 目前找不到任何在線的 Spotify 播放設備。');
        }

        let deviceList = `🖥️ *【Spotify 可用播放設備列表】* \n\n`;
        devices.forEach((d, i) => {
          const activeIcon = d.is_active ? '🔥 播放中' : '💤 閒置';
          deviceList += `${i + 1}. *${d.name}* [${d.type}] (${activeIcon})\n   ↳ \`ID: ${d.id}\`\n\n`;
        });

        return bot.sendMessage(chatId, deviceList, { parse_mode: 'Markdown' }).catch((err) => {
          return bot.sendMessage(chatId, '已列出設備。');
        });
      } catch (err) {
        return bot.sendMessage(chatId, `❌ 讀取設備列表失敗：${err.message}`);
      }
    }
  });
}
