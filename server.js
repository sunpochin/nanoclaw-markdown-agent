/**
 * =====================================================================
 * 🏰 系統入口中樞 (Main Express Router / Orchestrator)
 * =====================================================================
 * 負責接收外部傳入的對話小信件，經由安全門衛進行禮貌檢查與簽章驗證。
 * 引導亮晶晶的音樂與資料小流體（數據 Stream/Buffer）通過神奇傳送門，
 * 最後寫在小記事本裡，放進我們美麗的 Obsidian 魔法小抽屜。
 * =====================================================================
 */
import express from 'express';
import { middleware, messagingApi } from '@line/bot-sdk';
import dotenv from 'dotenv';
import { ensureVaultDirExists, writeNoteToMarkdown, readNotesForDay, listAllNotes, searchNotesInVault, writeSimulationReportToMarkdown, readRecentNotesContext } from './src/markdown-service.js';
import { processMessageWithAI, processImageWithAI, processAudioWithAI, analyzeSearchWithAI, simulateButterflyEffectWithAI } from './src/gemini-service.js';
// [技術] 引入雙腦事實記憶庫模組
// [童趣] 開啟左腦右腦雙腦圖書館的大門：把魔法索引卡片盒的管理員喚醒！
import { syncObsidianToDatabase, insertFact, searchFacts, getDatabaseStats } from './src/memory-database.js';
import { execFile } from 'child_process';
import os from 'os';
// 引入 Telegram Bot 初始化模組
import { initTelegramBot } from './src/telegram-bot.js';
// 引入 Spotify 授權模組
import { getSpotifyAuthUrl, handleSpotifyCallback } from './src/spotify-auth.js';

// [技術] 載入環境變數設定
// [童趣] 載入神奇百寶箱設定 (裝上連接口的魔法密鑰環境)
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// [技術] LINE SDK 的連接配置
// [童趣] LINE 的連接小拼圖 (設定與 LINE 外部接口對接的專屬設定)
const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET
};

// [技術] 初始化 LINE 訊息 API 客戶端
// [童趣] 初始化 LINE 訊息小幫手 (喚醒能對外寄信的 LINE 魔法大信鴿)
const lineClient = new messagingApi.MessagingApiClient({
  channelAccessToken: lineConfig.channelAccessToken
});

// [技術] 初始化 LINE 訊息 Blob 客戶端 (用於下載圖片)
// [童趣] 初始化 LINE 圖片收集袋 (用於從 API 城堡接住並下載亮晶晶照片的專屬網子)
const lineBlobClient = new messagingApi.MessagingApiBlobClient({
  channelAccessToken: lineConfig.channelAccessToken
});

// ==========================================
// 【開發者安全綁定中樞】
// 僅允許柏青的 LINE 帳號進行敏感系統操作
// ==========================================
const SECURE_USER_ID = process.env.LINE_SECURE_USER_ID || 'Ua6acf31ab719acad257a42641cd02c64';

// 在本機記憶體中快取各用戶的離線/雲端模式設定
const userLocalModes = new Map();

// 在本機記憶體中快取各用戶的對話 Session 歷史紀錄，最大限制 15 輪
const userSessions = new Map();
const MAX_SESSION_LIMIT = 15;

/**
 * 取得指定用戶的對話歷史紀錄
 * @param {string} userId - LINE 用戶 ID
 * @returns {Array<object>} 對話歷史陣列
 */
function getUserSessionHistory(userId) {
  if (!userSessions.has(userId)) {
    userSessions.set(userId, []);
  }
  return userSessions.get(userId);
}

/**
 * 將新的對話訊息追加到用戶的 Session 歷史中，並自動維持在 15 輪限制以內
 * @param {string} userId - LINE 用戶 ID
 * @param {string} role - 發言角色 (user 或 model)
 * @param {string} text - 對話文字內容
 */
function appendToUserSession(userId, role, text) {
  const history = getUserSessionHistory(userId);
  history.push({
    role: role === 'model' ? 'model' : 'user',
    parts: [{ text: text }]
  });

  // 維持最後 15 輪對話（共 30 筆訊息）
  if (history.length > MAX_SESSION_LIMIT * 2) {
    history.splice(0, history.length - MAX_SESSION_LIMIT * 2);
  }
}

/**
 * [技術] 向 LINE 伺服器發送「輸入中/載入中」動畫狀態，提升使用者體感 (防冷場與睡著焦慮)
 * [童趣] 大腦轉轉轉前置秀：在開始寫字前，主動送出一個可愛的「小精靈思考中」等待小動畫，讓小朋友不無聊！
 * @param {string} userId - LINE 用戶 ID
 * @param {number} seconds - 動畫持續秒數 (5 至 60 秒)
 */
async function showLineLoading(userId, seconds = 20) {
  try {
    const url = 'https://api.line.me/v2/bot/chat/loading/start';
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`
      },
      body: JSON.stringify({
        chatId: userId,
        loadingSeconds: seconds
      })
    });
    if (!response.ok) {
      const errText = await response.text();
      console.warn(`[LINE/Loading] ⚠️ 發送載入動畫失敗 (HTTP ${response.status}):`, errText);
    } else {
      console.log(`[LINE/Loading] ⏳ 成功為用戶 [${userId}] 啟動 ${seconds} 秒大腦思考動畫`);
    }
  } catch (err) {
    console.warn(`[LINE/Loading] ⚠️ 發送載入動畫發生異常:`, err.message || err);
  }
}

/**
 * [技術] 產生高品質的 DeepSeek-style 「🧠 思考過程」區塊，提昇大腦透明度與 UI/UX 質感
 * [童趣] 魔法思路小軌跡：畫出一張精美的思考尋寶圖，告訴主人小精靈是怎麼找出答案的！
 * @param {object} options - 思考參數
 * @returns {string} 格式化後的 Markdown 思考過程前綴
 */
function formatThinkingBlock({ isLocal, elapsedSec, intent, contextCharCount, searchMatchesCount, searchKeyword, modelUsed }) {
  const modelName = modelUsed ? (modelUsed.includes('qwen') ? `🤖 本地 Qwen2.5:14b` : `☁️ 雲端 ${modelUsed}`) : (isLocal ? '🤖 本地 Qwen2.5:14b' : '☁️ 雲端 Gemini');
  const contextStatus = contextCharCount > 0 ? `📅 已讀取過去 7 日日記背景 (${contextCharCount} 字)` : '📅 無日記背景';

  let searchStatus = '';
  if (searchKeyword) {
    const matchesStr = searchMatchesCount !== undefined ? `，尋獲 ${searchMatchesCount} 筆軌跡` : '';
    searchStatus = `\n> * **知識庫檢索**：🔍 搜尋關鍵字「${searchKeyword}」${matchesStr}`;
  }

  return `> 🧠 **思考與檢索軌跡 (Reasoning Trace)**
> * **決策大腦**：${modelName}
> * **意圖判定**：🎯 ${intent}
> * **背景脈絡**：${contextStatus}${searchStatus}
> * **總共耗時**：⏱️ ${elapsedSec} 秒 | 系統運作良好 ❄️
>
> ──────────────────\n\n`;
}


// [技術] 確保啟動時，本地的 Obsidian Vault 儲存目錄已存在
// [童趣] 鋪平小抽屜：確保啟動時，用來放筆記本的魔法小目錄已經整理乾淨了
await ensureVaultDirExists();

// ==========================================
// 1. LINE Webhook 接收端點 (/callback)
// ==========================================
// 注意：必須將 LINE middleware 置於 express.json() 之前！
// 因為 LINE SDK 需要原始未被 JSON 解析的 Request Body (Raw Body) 來進行雜湊簽章 (Signature) 驗證。
// [技術] 啟動 LINE 認證驗證
// [童趣] 城堡驗證大門：請門衛把大門關好，仔細核對通行證，不准怪人偷偷溜進來
app.post('/callback', middleware(lineConfig), (req, res) => {
  Promise
    .all(req.body.events.map(handleLineEvent))
    .then((result) => res.json(result))
    .catch((err) => {
      console.error('[LINE/Webhook] 處理 Webhook 事件失敗:', err);
      res.status(500).end();
    });
});

// ==========================================
// 2. 一般 REST API 與其餘 Middleware (用於除 Webhook 外的端點)
// ==========================================
// [技術] 解析一般 JSON 格式的 Request Body
// [童趣] 解析一般 JSON 格式 of Request Body (解析裝滿好玩資料的 JSON 糖果紙)
app.use(express.json());

/**
 * [技術] 查詢目前所有已產生的 Markdown 筆記清單
 * [童趣] 藏寶圖清冊：把我們 Obsidian 寶箱裡所有已經寫過的故事書檔名列出來
 * GET /api/notes
 */
app.get('/api/notes', async (req, res) => {
  try {
    const files = await listAllNotes();
    res.json({ files });
  } catch (error) {
    res.status(500).json({ error: '讀取筆記清單失敗' });
  }
});

/**
 * [技術] 讀取指定日期的 Markdown 筆記內容
 * [童趣] 舊故事探險：把指定日期的故事書翻開，精準讀出裡面的好玩回憶
 * GET /api/notes/:date
 * 範例: GET /api/notes/2026-05-18
 */
app.get('/api/notes/:date', async (req, res) => {
  try {
    const { date } = req.params;
    const content = await readNotesForDay(date);

    if (content === null) {
      return res.status(404).json({ error: '找不到該日期的筆記檔案' });
    }

    res.json({ date, content });
  } catch (error) {
    res.status(500).json({ error: '讀取筆記內容失敗' });
  }
});

// ==========================================
// 🎵 Spotify 授權與點播 API 端點 (Spotify Auth Endpoints)
// ==========================================
// [技術] 開通 Spotify 認證連接口，引導主人完成三方 OAuth 授權與 Callback 交換
// [童趣] 魔法通行證登記處：引導大家去 Spotify 城堡辦理通行卡，並收下第一張亮晶晶門卡
app.get('/login/spotify', (req, res) => {
  const url = getSpotifyAuthUrl();
  if (!url) {
    return res.status(500).send('Spotify configuration is missing in .env');
  }
  res.redirect(url);
});

app.get('/callback/spotify', async (req, res) => {
  const code = req.query.code;
  if (!code) {
    return res.status(400).send('Missing authorization code');
  }
  try {
    await handleSpotifyCallback(code);
    res.send(`
      <div style="font-family: system-ui, sans-serif; text-align: center; padding: 50px; background: #121212; color: #fff; height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center;">
        <h1 style="color: #1DB954; font-size: 3rem; margin-bottom: 20px;">🎉 Spotify 授權登入成功！</h1>
        <p style="font-size: 1.2rem; color: #b3b3b3;">系統已成功將 Refresh Token 門卡儲存至本地小抽屜 (spotify_tokens.json)！</p>
        <p style="font-size: 1.2rem; color: #b3b3b3;">您可以安全地關閉此網頁，回到 Telegram 對話中開始享受絲滑的 Salsa 點歌體驗了！💃✨</p>
      </div>
    `);
  } catch (err) {
    res.status(500).send(`
      <div style="font-family: system-ui, sans-serif; text-align: center; padding: 50px; background: #121212; color: #fff; height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center;">
        <h1 style="color: #e91429; font-size: 3rem; margin-bottom: 20px;">❌ 授權失敗</h1>
        <p style="font-size: 1.2rem; color: #b3b3b3;">原因：${err.message}</p>
      </div>
    `);
  }
});

// ==========================================
// 3. Webhook 核心事件處理器
// ==========================================
/**
 * [技術] 處理單一 LINE 事件的非同步核心函式
 * @param {object} event - LINE 傳入的事件物件
 */
async function handleLineEvent(event) {
  // [技術] 僅處理「訊息」事件
  // [童趣] 僅處理「訊息」事件 (過濾雜質，只接受寫著悄悄話的訊息卡片)
  if (event.type !== 'message') {
    return Promise.resolve(null);
  }

  const replyToken = event.replyToken;
  const userId = event.source.userId;

  // 【照片處理通道：OCR 影像分析與排版記錄】
  if (event.message.type === 'image') {
    const messageId = event.message.id;
    console.log(`\n[LINE/Webhook] 📸 收到來自使用者 [${event.source.userId}] 的圖片訊息 (ID: ${messageId})`);

    // 立即向 LINE 發送輸入中載入動畫，以提昇 UI/UX 體感，避免大圖下載延遲冷場
    showLineLoading(userId, 40);

    try {
      // [技術] 從 LINE 伺服器下載圖片的 HTTP 回應與 Readable Stream
      // [童趣] 新鮮牛奶接接樂：從 API 水龍頭下一滴滴承接 Blob 照片數據，用非同步小杯子接得滿滿的
      const response = await lineBlobClient.getMessageContentWithHttpInfo(messageId);
      const stream = response.body;
      // 動態獲取圖片的 MIME 類型 (例如 image/png, image/jpeg)，避免硬編碼導致格式解析錯誤
      const mimeType = response.headers['content-type'] || 'image/jpeg';

      // [技術] 將 Stream 讀取並轉換為 Buffer
      // [童趣] 把小水滴做成大冰塊：將 Stream 串流凝聚成 Buffer 完整實體
      const chunks = [];
      for await (const chunk of stream) {
        chunks.push(chunk); // 將流出的蜜汁滴滴收集起來，完美收納
      }
      const imageBuffer = Buffer.concat(chunks); // 蜜汁大融合，攪拌濃縮成完整的 Buffer 蜜汁精華
      const imageBase64 = imageBuffer.toString('base64'); // 昇華為純淨白皙的 base64 養分

      // 3. 呼叫 Gemini 進行影像 OCR 與排版整理 (傳入動態獲取的 MIME 類型)
      const ocrResult = await processImageWithAI(imageBase64, mimeType);
      console.log(`[LINE/Webhook] 📸 影像 OCR 分析完成: "${ocrResult.title}"`);

      // 4. 將排版好的 Markdown 內容寫入本地筆記
      const noteContent = `### 📷 ${ocrResult.title}\n${ocrResult.ocrContent}`;
      await writeNoteToMarkdown(noteContent);

      // 5. 回覆使用者解析結果
      return lineClient.replyMessage({
        replyToken,
        messages: [{
          type: 'text',
          text: ocrResult.replyText
        }]
      });
    } catch (error) {
      console.error('[LINE/Webhook] 處理圖片 OCR 發生錯誤:', error);
      return lineClient.replyMessage({
        replyToken,
        messages: [{
          type: 'text',
          text: '❌ 抱歉，解析照片或進行 OCR 時發生錯誤，請稍後重試。'
        }]
      });
    }
  }

  // 【語音處理通道：多模態音訊辨識與寫入】
  if (event.message.type === 'audio') {
    const messageId = event.message.id;
    console.log(`\n[LINE/Webhook] 🎙️ 收到來自使用者 [${userId}] 的語音訊息 (ID: ${messageId})`);

    // 立即向 LINE 發送輸入中載入動畫，避免語音大檔案轉譯下載時冷場
    showLineLoading(userId, 40);

    try {
      const response = await lineBlobClient.getMessageContentWithHttpInfo(messageId);
      const stream = response.body;
      const mimeType = response.headers['content-type'] || 'audio/x-m4a';

      const chunks = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      const audioBuffer = Buffer.concat(chunks);
      const audioBase64 = audioBuffer.toString('base64');

      // 3. 呼叫 Gemini 進行語音聽寫與意圖分析
      const audioResult = await processAudioWithAI(audioBase64, mimeType);
      console.log(`[LINE/Webhook] 🎙️ 語音分析完成，聽寫內容: "${audioResult.transcription}"`);

      // 4. 如果判定為記事，寫入本地 Markdown
      if (audioResult.isNote && audioResult.noteContent) {
        console.log(`[LINE/Webhook] ➡️ 語音通道：將提取內容寫入 Markdown 筆記 "${audioResult.noteContent}"`);
        await writeNoteToMarkdown(audioResult.noteContent);
      }

      // 5. 回覆解析結果給 LINE 使用者
      return lineClient.replyMessage({
        replyToken,
        messages: [{
          type: 'text',
          text: audioResult.replyText
        }]
      });
    } catch (error) {
      console.error('[LINE/Webhook] 處理語音訊息發生錯誤:', error);
      return lineClient.replyMessage({
        replyToken,
        messages: [{
          type: 'text',
          text: '❌ 抱歉，解析語音訊息或進行語意辨識時發生錯誤，請稍後重試。'
        }]
      });
    }
  }

  // [技術] 僅處理文字訊息，其他非文字/非圖片/非語音訊息安全跳過
  // [童趣] 僅處理文字訊息，其他非文字/非圖片/非語音訊息安全跳過 (其他奇形怪狀的訊息通通禮貌地跳過去)
  if (event.message.type !== 'text') {
    return Promise.resolve(null);
  }

  const userMessage = event.message.text.trim();

  console.log(`\n[LINE/Webhook] 收到來自使用者 [${event.source.userId}] 的訊息: "${userMessage}"`);

  // ==========================================
  // 【安全遠端系統監控與冷卻通道 (✨ 黑科技監控)】
  // 僅限開發者安全帳號（柏青）進行安全調用，防止任何未授權操作
  // ==========================================

  // 1. 查詢系統狀態與發熱進程：#status
  if (/^(#status|#狀態|系統狀態|status)$/i.test(userMessage)) {
    if (event.source.userId !== SECURE_USER_ID) {
      console.warn(`[Security] 🚨 偵測到未授權帳號 [${event.source.userId}] 企圖查詢系統狀態！`);
      return Promise.resolve(null);
    }

    console.log(`[LINE/Webhook] 🛡️ 觸發安全狀態監控...`);
    try {
      // 執行 ps 獲取 top CPU 進程 (改用 execFile 安全傳遞參數，防範命令注入)
      execFile('ps', ['-Ao', 'pcpu,pmem,pid,comm', '-r'], async (error, stdout, stderr) => {
        if (error) {
          console.error('[LINE/Webhook] ps 執行錯誤:', error);
          return lineClient.replyMessage({
            replyToken,
            messages: [{ type: 'text', text: '❌ 無法取得發熱進程，系統出錯。' }]
          });
        }

        // 解析進程輸出 (跳過標頭，僅取前 5 個進程)
        const lines = stdout.split('\n').filter(line => line.trim().length > 0).slice(1, 6);
        let processList = '';

        lines.forEach(line => {
          const parts = line.trim().split(/\s+/);
          const cpu = parts[0];
          const mem = parts[1];
          const pid = parts[2];
          const path = parts.slice(3).join(' ');
          const name = path.substring(path.lastIndexOf('/') + 1);

          const isHot = parseFloat(cpu) > 10;
          const statusIcon = isHot ? '🔥' : '❄️';
          processList += `${statusIcon} [CPU: ${cpu}% | RAM: ${mem}%] PID: ${pid}\n   ↳ 🧬 ${name}\n\n`;
        });

        // 系統 RAM 與 CPU 計算
        const totalMemGB = (os.totalmem() / (1024 ** 3)).toFixed(1);
        const freeMemGB = (os.freemem() / (1024 ** 3)).toFixed(1);
        const usedMemGB = (totalMemGB - freeMemGB).toFixed(1);
        const memPercent = ((usedMemGB / totalMemGB) * 100).toFixed(0);
        const load = os.loadavg();

        const statusReport = `🖥️ 【Mac Mini M4 Pro 運行報告】
        
🔥 系統發熱進程 Top 5：
${processList}
📊 資源狀態概覽：
- 記憶體分配：${usedMemGB}G / ${totalMemGB}G (${memPercent}%)
- 負載平均值：${load[0].toFixed(2)} (1m) | ${load[1].toFixed(2)} (5m)

💡 想要遠端冷卻發熱進程嗎？
請複製並發送以下格式：
#kill {PID} {進程名稱}
(例如：#kill 43094 chrome)`;

        return lineClient.replyMessage({
          replyToken,
          messages: [{
            type: 'text',
            text: statusReport
          }]
        });
      });
    } catch (err) {
      console.error('[LINE/Webhook] 遠端狀態監控錯誤:', err);
      return lineClient.replyMessage({
        replyToken,
        messages: [{
          type: 'text',
          text: '❌ 遠端系統狀態查詢失敗，請檢查伺服器日誌。'
        }]
      });
    }
    return Promise.resolve(null); // 攔截，不向下流動
  }

  // 2. 結束發熱進程：#kill {PID} {Name}
  const killRegex = /^#kill\s+(\d+)\s*(.*)/i;
  if (killRegex.test(userMessage)) {
    if (event.source.userId !== SECURE_USER_ID) {
      console.warn(`[Security] 🚨 偵測到未授權帳號 [${event.source.userId}] 企圖強制結束進程！`);
      return Promise.resolve(null);
    }

    const match = userMessage.match(killRegex);
    const pid = match[1];
    const name = match[2] || '未指定名稱';

    console.log(`[LINE/Webhook] ⚔️ 觸發遠端冷卻：正在強制結束進程 PID ${pid} (${name})`);

    try {
      execFile('kill', ['-9', pid], (error, stdout, stderr) => {
        const replyText = error
          ? `❌ 強制結束進程 PID ${pid} 失敗！原因可能是權限不足或該進程已不存在。`
          : `⚔️ 已成功強制結束發熱進程！\n- PID: ${pid}\n- 名稱: ${name}\n\n大腦小精靈已順暢降溫，Mac Mini 熱量降溫成功！❄️`;

        return lineClient.replyMessage({
          replyToken,
          messages: [{
            type: 'text',
            text: replyText
          }]
        });
      });
    } catch (err) {
      console.error('[LINE/Webhook] 執行進程冷卻出錯:', err);
    }
    return Promise.resolve(null); // 攔截，不向下流動
  }

  // 3. 切換純本地大腦模式：#local / #本地 / #離線
  if (/^(#local|#本地|#離線|離線模式)$/i.test(userMessage)) {
    if (event.source.userId !== SECURE_USER_ID) {
      console.warn(`[Security] 🚨 偵測到未授權帳號 [${event.source.userId}] 企圖切換本地大腦模式！`);
      return Promise.resolve(null);
    }

    const currentMode = userLocalModes.get(SECURE_USER_ID) || false;
    const newMode = !currentMode;
    userLocalModes.set(SECURE_USER_ID, newMode);

    console.log(`[LINE/Webhook] 🛡️ 觸發本地大腦模式切換：${currentMode} -> ${newMode}`);

    // [技術] 根據最新模式設定，產生繁體中文對話確認回覆
    // [童趣] 根據模式設定，產生適合本地大腦與雲端大腦轉換的親切對白
    let replyText = '';
    if (newMode) {
      replyText = `❄️【純本地離線大腦模式已啟動】\n即日起大腦思考將 100% 透過本機 Qwen 2.5:14b 進行離線運算，徹底斷網，保障隱私安全！戴上魔法防護帽，秘密絕對不外流！🛡️`;
    } else {
      replyText = `☁️【雲端 Gemini 智慧大腦模式已恢復】\n已接回 Google Gemini 2.5-flash 雲端智慧大腦，重返巔峰智慧與多模態的魔法體驗！✨`;
    }

    return lineClient.replyMessage({
      replyToken,
      messages: [{
        type: 'text',
        text: replyText
      }]
    });
  }

  // 【幫助說明通道】
  // 讓使用者隨時能透過「說明」或「help」在手機上喚醒功能介紹選單，不再需要死記
  const helpRegex = /^(help|說明|幫助|功能|你是誰|輔助|說明書)/i;
  if (helpRegex.test(userMessage)) {
    console.log(`[LINE/Webhook] ℹ️ 觸發說明通道：回覆幫助選單`);
    return lineClient.replyMessage({
      replyToken,
      messages: [{
        type: 'text',
        text: `🤖 您好！我是您的 NanoClaw 隨身智慧秘書！

這是為您量身打造的【黑科技升級與功能指南】：

🎙️【升級選項 A：語音隨手記 (✨ 已完美啟用！)】
- 效果：當您開車或走路手酸時，直接對我發送「語音訊息」。
- 技術：自動聆聽您的音訊，進行高精度語音聽寫與繁體中文轉譯，提取核心筆記並存入 iCloud 中！

📸【升級選項 B：影像 OCR 結構化 (✨ 已完美啟用！)】
- 效果：直接對我「發送照片/截圖」(如實體發票、手寫筆記、白板、學習卡截圖)。
- 技術：自動辨識並進行高精度 OCR，將收據自動排版成美麗的 Markdown 表格存入您的 iCloud 筆記中！

🤖【升級選項 C：本地 M4 Pro 大腦 (✨ 已完美啟用！)】
- 效果：發送「#local」即可一鍵切換「雲端大腦」與「本地大腦」。
- 技術：大腦改為呼叫本機運行的 Qwen 2.5:14b，實現 100% 離線、安全避孕、絕對私密的個人隱私隨手記環境！

---

💡【原有核心功能】：
1️⃣ ⚡【快速隨手記】
   - 使用方式：開頭打「記：」加上內容。
   - 範例：『記：明天下午兩點要去拿快遞』(100% 精準直達)
2️⃣ 🧠【AI 智慧對話】
   - 使用方式：直接用口語聊天或提問。
   - 範例：『請解釋 JavaScript 閉包』(自動切換為高智商聊天模式)

💡 提示：
- 所有隨手記與照片辨識筆記皆儲存在您個人 iCloud 的「nanoclaw_notes」資料夾中，絕對安全且跨裝置同步！
- 忘記功能時，隨時對我輸入「說明」或「help」即可喚醒此選單喔！✨`
      }]
    });
  }

  // [技術] 【第一通道：直覺快速通道】前綴匹配，不囉嗦直接插入！
  // [童趣] 檢查是否以「記：」、「記錄：」、「memo:」等關鍵前綴開頭，若是則直接寫入，不經 AI 判斷以追求極速與 100% 準確率
  // [童趣] 魔法快捷通道：跳過 AI 智慧聯想，直接把悄悄話寫進小記事本最深處以追求極速與 100% 準確率
  const prefixRegex = /^(記|記錄|記下來|memo|Memo)[:：]\s*(.+)/s;
  const match = userMessage.match(prefixRegex);

  if (match) {
    const noteText = match[2].trim();
    console.log(`[LINE/Webhook] ⚡ 觸發快速通道：準備直接寫入筆記 "${noteText}"`);

    try {
      await writeNoteToMarkdown(noteText);
      return lineClient.replyMessage({
        replyToken,
        messages: [{
          type: 'text',
          text: `⚡【快速記事成功】\n已為您記錄此事項至本地 Markdown 筆記中：\n\n* ${noteText}`
        }]
      });
    } catch (error) {
      return lineClient.replyMessage({
        replyToken,
        messages: [{
          type: 'text',
          text: '❌ 抱歉，寫入本地筆記時發生錯誤，請稍後重試。'
        }]
      });
    }
  }

  // [技術] 【第二通道：AI 智慧通道】對於口語化對話，將訊息送入 Gemini 2.5 進行語意理解與意圖分類，支援歷史 Session 與近期日記 Context 與本地模式
  // [童趣] AI 智慧思考通道：將對話歷史 Session 與近期 7 天小日記與當前訊息一併送入本地/雲端大腦進行分析
  try {
    // 立即發送載入中動畫，提昇視覺與等待體感
    showLineLoading(userId, 45);
    const startTime = Date.now();

    const chatHistory = getUserSessionHistory(userId);

    // [技術] 主動讀取過去 7 天的 Obsidian 每日隨手記作為即時生活背景
    // [童趣] 主動翻出過去 7 天的舊小日記，作為當前思考大腦的魔法背景線索
    const recentNotesContext = await readRecentNotesContext(7);

    const isLocalMode = userLocalModes.get(userId) || false;
    console.log(`[LINE/Webhook] 🧠 啟動智慧通道分析，Session 歷史長度: ${chatHistory.length}，本地模式: ${isLocalMode}`);
    const aiResult = await processMessageWithAI(userMessage, chatHistory, recentNotesContext, isLocalMode);
    console.log(`[LINE/Webhook] 🧠 智慧通道分析結果:`, aiResult);

    const initialElapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);

    // 如果 Gemini 智慧分類判定為記事，且具有提取內容
    if (aiResult.isNote && aiResult.noteContent) {
      console.log(`[LINE/Webhook] ➡️ 智慧通道：將提取內容寫入 Markdown 筆記 "${aiResult.noteContent}"`);
      await writeNoteToMarkdown(aiResult.noteContent);

      const thinkingHeader = formatThinkingBlock({
        isLocal: isLocalMode,
        elapsedSec: initialElapsedSec,
        intent: '⚡ 智慧隨手記 (提取寫入)',
        contextCharCount: recentNotesContext.length,
        modelUsed: aiResult.modelUsed
      });
      const decoratedText = thinkingHeader + aiResult.replyText;

      // [技術] 將使用者提問與系統記事成功的親切確認寫入 Session 歷史中
      // [童趣] 將這次美妙的記錄過程與成功確認，一同裝進我們對話的小記憶寶盒中
      appendToUserSession(userId, 'user', userMessage);
      appendToUserSession(userId, 'model', decoratedText);

      return lineClient.replyMessage({
        replyToken,
        messages: [{
          type: 'text',
          text: decoratedText
        }]
      });
    }

    // [技術] 若 AI 偵測到長期客觀事實，在背景非同步寫入雙腦事實記憶庫（不阻塞主回覆流程）
    // [童趣] 如果小精靈發現使用者說了值得永久記住的事情（不是隨手記，而是真正的事實糖果），
    //        就偷偷在背後把它放進魔法卡片盒裡，不打擾正常的對話流程！
    if (aiResult.isFact && aiResult.factData && aiResult.factData.claim) {
      console.log(`[LINE/Webhook] 🧠 偵測到長期事實，寫入雙腦事實記憶庫：${aiResult.factData.claim}`);
      insertFact(aiResult.factData).then(result => {
        console.log(`[MemoryDB] ✅ 事實已寫入：${result.factId} → ${result.filePath}`);
      }).catch(err => {
        console.error('[MemoryDB] ❌ 事實寫入失敗（不影響主回覆）:', err.message || err);
      });
    }

    // 如果 Gemini 智慧分類判定為搜尋歷史，且具有搜尋關鍵字 (啟動二階段深度大腦分析推理 RAG)
    if (aiResult.isSearch && aiResult.searchQuery) {
      console.log(`[LINE/Webhook] 🔍 智慧搜尋啟動：搜尋關鍵字 "${aiResult.searchQuery}"，entity_id: "${aiResult.searchEntityId || '全局'}"`);

      // [技術] 優先使用 SQLite 高速事實搜尋，若無結果才 fallback 到 Markdown 全文掃描
      // [童趣] 先去超快的魔法卡片盒找找看；如果卡片盒裡找不到，再去翻故事書的每一頁
      let searchResults = [];
      let searchMode = 'sqlite';

      try {
        const factResults = searchFacts(
          aiResult.searchQuery,
          aiResult.searchEntityId || null,
          'current'
        );

        if (factResults.length > 0) {
          // [技術] SQLite 結果轉換為 analyzeSearchWithAI 相容格式
          // [童趣] 把卡片盒找到的卡片翻譯成故事書的格式，讓大腦可以一起看
          searchResults = factResults.map(f => ({
            date: f.date,
            matches: [`[${f.entity_id}/${f.domain}] ${f.claim} (${f.confidence} 可信度, ${f.status})`]
          }));
          console.log(`[LINE/Webhook] 🃏 SQLite 快速命中 ${factResults.length} 筆事實`);
        } else {
          // [技術] SQLite 無結果，fallback 到 Markdown 全文搜尋
          // [童趣] 卡片盒沒找到，改去翻故事書，仔細找找每一頁
          searchMode = 'markdown_fallback';
          searchResults = await searchNotesInVault(aiResult.searchQuery);
          console.log(`[LINE/Webhook] 📖 SQLite 無命中，Markdown 全文搜尋找到 ${searchResults.length} 筆`);
        }
      } catch (err) {
        // [技術] SQLite 搜尋失敗時，安全降級至 Markdown 搜尋
        // [童趣] 卡片盒暫時壞掉了，緊急改用故事書搜尋，完全不影響使用者體驗
        console.warn('[MemoryDB] ⚠️ SQLite 搜尋失敗，降級到 Markdown 搜尋:', err.message);
        searchMode = 'markdown_fallback';
        searchResults = await searchNotesInVault(aiResult.searchQuery);
      }

      if (searchResults.length === 0) {
        const noResultText = `📋 幫您搜尋了本地 Obsidian 筆記中關於「${aiResult.searchQuery}」的記錄...\n\n目前找不到任何相關的歷史紀錄喔！📝`;
        return lineClient.replyMessage({
          replyToken,
          messages: [{
            type: 'text',
            text: noResultText
          }]
        });
      }

      console.log(`[LINE/Webhook] 🧠 觸發二階段大腦深度推理分析...，本地模式: ${isLocalMode}，搜尋模式: ${searchMode}`);
      // [技術] 呼叫 analyzeSearchWithAI，傳入搜尋結果、對話歷史與近期日記進行深度語意關聯，附帶本地模式狀態
      // [童趣] 將搜出的舊日記、對話餘溫與最近背景送入 analyzeSearchWithAI 進行大腦深度聯想，搭配安全本地模式
      const analysisResult = await analyzeSearchWithAI(userMessage, chatHistory, recentNotesContext, searchResults, isLocalMode);

      const totalElapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
      const thinkingHeader = formatThinkingBlock({
        isLocal: isLocalMode,
        elapsedSec: totalElapsedSec,
        intent: `🔎 歷史深度語意分析 (RAG/${searchMode})`,
        contextCharCount: recentNotesContext.length,
        searchMatchesCount: searchResults.length,
        searchKeyword: aiResult.searchQuery,
        modelUsed: analysisResult.modelUsed
      });
      const decoratedText = thinkingHeader + analysisResult.replyText;

      // [技術] 將使用者提問與最終高品質 RAG 分析回覆寫入 Session 歷史中
      // [童趣] 將這次的高品質二階段推理大回覆，放進我們對話的記憶寶盒中留存
      appendToUserSession(userId, 'user', userMessage);
      appendToUserSession(userId, 'model', decoratedText);

      return lineClient.replyMessage({
        replyToken,
        messages: [{
          type: 'text',
          text: decoratedText
        }]
      });
    }

    // 如果 Gemini 智慧分類判定為未來預測模擬，啟動蝴蝶效應模擬器與未來日記生成
    if (aiResult.isSimulation && aiResult.simulationScenario) {
      console.log(`[LINE/Webhook] 🦋 蝴蝶效應未來模擬啟動：情境為 "${aiResult.simulationScenario}"，搜尋關鍵字 "${aiResult.searchQuery}"`);
      const searchResults = await searchNotesInVault(aiResult.searchQuery);

      console.log(`[LINE/Webhook] 🧠 觸發蝴蝶效應模擬，本地模式: ${isLocalMode}`);
      const simulationResult = await simulateButterflyEffectWithAI(
        aiResult.simulationScenario,
        chatHistory,
        recentNotesContext,
        searchResults,
        isLocalMode
      );

      // [技術] 將生成的蝴蝶效應未來日記報告寫入 Obsidian 當日筆記中
      // [童趣] 預言日記大變身：將精心推演出的蝴蝶效應模擬報告，完美寫入今天的 Markdown 日記本裡！
      await writeSimulationReportToMarkdown(aiResult.simulationScenario, simulationResult.replyText);

      const totalElapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
      const thinkingHeader = formatThinkingBlock({
        isLocal: isLocalMode,
        elapsedSec: totalElapsedSec,
        intent: '🦋 蝴蝶效應未來決策沙盤推演',
        contextCharCount: recentNotesContext.length,
        searchMatchesCount: searchResults.length,
        searchKeyword: aiResult.searchQuery || '決策背景相關記錄',
        modelUsed: simulationResult.modelUsed
      });
      const decoratedText = thinkingHeader + simulationResult.replyText;

      appendToUserSession(userId, 'user', userMessage);
      appendToUserSession(userId, 'model', decoratedText);

      return lineClient.replyMessage({
        replyToken,
        messages: [{
          type: 'text',
          text: decoratedText
        }]
      });
    }

    // 將 Gemini 產生的回覆訊息發送回給 LINE 使用者 (將大腦回覆噴射回給 LINE 連接口)
    const thinkingHeader = formatThinkingBlock({
      isLocal: isLocalMode,
      elapsedSec: initialElapsedSec,
      intent: '💬 智慧隨身助理對話',
      contextCharCount: recentNotesContext.length,
      modelUsed: aiResult.modelUsed
    });
    const decoratedText = thinkingHeader + aiResult.replyText;

    appendToUserSession(userId, 'user', userMessage);
    appendToUserSession(userId, 'model', decoratedText);

    return lineClient.replyMessage({
      replyToken,
      messages: [{
        type: 'text',
        text: decoratedText
      }]
    });
  } catch (error) {
    console.error('[LINE/Webhook] 處理智慧分析發生錯誤:', error);
    return lineClient.replyMessage({
      replyToken,
      messages: [{
        type: 'text',
        text: '❌ 處理訊息時發生錯誤，請稍後再試。'
      }]
    });
  }
}

// ==========================================
// [技術] 4. 啟動伺服器
// [童趣] 4. 啟動伺服器 (喚醒整個音樂城堡伺服器，讓所有的魔法大門完全進入工作狀態)
// ==========================================
app.listen(PORT, () => {
  console.log('\n=============================================');
  console.log(`[LINE/Webhook] 🚀 伺服器成功啟動於連接埠: ${PORT}`);
  console.log(`[LINE/Webhook] 本地 Webhook 端點: http://localhost:${PORT}/callback`);
  console.log(`[LINE/Webhook] 請確認已安裝並使用 ngrok 穿透進行 LINE 平台對接`);
  console.log('=============================================\n');

  // 初始化 Telegram Bot 隨手助理服務，啟動長輪詢監聽
  try {
    initTelegramBot();
  } catch (err) {
    console.error('[Telegram/Bot] ❌ 啟動 Telegram Bot 失敗:', err.message || err);
  }

  // [技術] 啟動雙腦同步協議：掃描 Obsidian Vault，對齊 SQLite 索引
  // [童趣] 開館前對齊儀式：圖書館開門前，小館員把兩邊書架的卡片全部核對一遍，確保整整齊齊不遺漏！
  syncObsidianToDatabase()
    .then(stats => {
      console.log(`[MemoryDB] 🧠 雙腦同步完成 — 新增:${stats.added} 更新:${stats.updated} 刪除:${stats.deleted}`);
      const dbStats = getDatabaseStats();
      console.log(`[MemoryDB] 📊 卡片盒狀態 — 共 ${dbStats.total} 筆事實（現行:${dbStats.current} 已過期:${dbStats.outdated}）`);
    })
    .catch(err => {
      // [技術] 同步失敗不影響主服務運作，僅記錄警告
      // [童趣] 對齊儀式失敗了也沒關係，圖書館照常開門，等下次重啟再試一次
      console.warn('[MemoryDB] ⚠️ 雙腦同步失敗（不影響主服務）:', err.message || err);
    });
});

// ==========================================
// 【自動降溫小天使 👼 (Auto-Cooler Daemon)】
// [技術] 每 1 分鐘自動巡邏，針對特定非系統關鍵 Chrome 輔助進程進行 CPU 監控。
//        當單一進程 CPU 超過 500%（適用於多核心 Apple Silicon 主機）且持續達 3 分鐘，執行自動降溫（Kill）。
//        排除 node, ollama, ngrok 防範自殘與誤殺。
// [童趣] 巡邏冷卻小天使 👼：每分鐘在敏感的後花園巡視，尋找玩得太瘋而發熱（CPU > 500%）且持續超過 3 分鐘的失控小進程，
//        使用魔法冰棒強行降溫，完全排除 Ollama 本地大腦、Node 伺服器與 Ngrok 信差等核心運作支柱。
// ==========================================
const AUTO_COOL_INTERVAL = 60 * 1000; // 每分鐘巡邏一次
const CPU_SPIKE_THRESHOLD = 500; // 從 80% 大幅調高到 500% CPU，防止誤殺 macOS 多核心背景任務 (100% 代表佔滿單核)
const SUSTAINED_SPIKE_LIMIT = 3; // 連續 3 分鐘超標才動手，避免誤殺短暫發熱的正常高負載任務
const processCpuSpikeTracker = new Map(); // 追蹤進程 PID -> 連續超標次數

setInterval(() => {
  execFile('ps', ['-Ao', 'pcpu,pid,comm', '-r'], (error, stdout, stderr) => {
    if (error) {
      console.error('[Auto-Cooler] 巡邏時發生錯誤:', error);
      return;
    }

    // 僅取前 5 個發熱進程 (跳過標頭，只取前 5 筆)
    const lines = stdout.split('\n').filter(line => line.trim().length > 0).slice(1, 6);

    // 安全降溫白名單 (只會自動清理這些背景網頁分頁輔助進程，排除 node, ollama, ngrok 防範自殘與誤殺)
    const SAFE_TO_KILL_PROCESSES = [
      'google chrome helper',
      'chrome helper',
      'firefox helper',
      'webcontent'
    ];

    // 用於記錄本次巡邏依然活躍且超標的 PID
    const activeSpikedPids = new Set();

    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      const cpu = parseFloat(parts[0]);
      const pid = parts[1];
      const path = parts.slice(2).join(' ');
      const name = path.substring(path.lastIndexOf('/') + 1).toLowerCase();

      const isSafeToKill = SAFE_TO_KILL_PROCESSES.some(safeName => name.includes(safeName));

      // [技術] 判定是否超過 CPU 臨界點且為可自動清理進程
      // [童趣] 玩太瘋判定：高於 500% CPU 且可以被冷卻的小進程
      if (cpu > CPU_SPIKE_THRESHOLD && isSafeToKill) {
        activeSpikedPids.add(pid);

        // 累加該進程的持續發熱次數
        const currentSpikes = (processCpuSpikeTracker.get(pid) || 0) + 1;
        processCpuSpikeTracker.set(pid, currentSpikes);

        console.log(`[Auto-Cooler] ⚠️ 偵測到高發熱進程：PID: ${pid} (${name}) 佔用 ${cpu}% CPU (連續第 ${currentSpikes} 次超標)`);

        // 若連續超標次數達到上限，啟動自動冷卻
        if (currentSpikes >= SUSTAINED_SPIKE_LIMIT) {
          console.log(`[Auto-Cooler] 🚨 進程 PID: ${pid} (${name}) 持續發熱超過 ${SUSTAINED_SPIKE_LIMIT} 分鐘，啟動自動冷卻...`);

          execFile('kill', ['-9', pid], (killErr) => {
            if (killErr) {
              console.error(`[Auto-Cooler] ❌ 自動冷卻 PID ${pid} 失敗:`, killErr);
            } else {
              console.log(`[Auto-Cooler] ❄️ 已成功強制結束發熱進程 PID: ${pid} (${name})`);
              processCpuSpikeTracker.delete(pid); // 清理追蹤器

              // 主動發送 LINE 訊息通知主人 (Push Message)
              lineClient.pushMessage({
                to: SECURE_USER_ID,
                messages: [{
                  type: 'text',
                  text: `❄️ 報告主人！【巡邏小天使 👼】幫您自動降溫囉！\n\n發現以下進程持續失控發熱達 ${SUSTAINED_SPIKE_LIMIT} 分鐘：\n🔥 進程：${name}\n📌 PID：${pid}\n⚡ 目前 CPU 佔用：${cpu}%\n\n🛡️ 小天使已使用魔法冰棒將其退火結束，Mac Mini 現在冰冰涼涼的，非常安全唷！❄️`
                }]
              }).catch(pushErr => {
                console.error('[Auto-Cooler] 傳送 LINE 警告訊息失敗:', pushErr.message || pushErr);
              });
            }
          });
          break; // 一次只殺一個發熱進程，避免衝突
        }
      }
    }

    // [技術] 清理已降溫或已不存在的進程追蹤記錄，防範記憶體溢漏
    // [童趣] 清理退火記錄：將已經不熱或已經退火的 PID 從記憶小冊子中擦掉，防範記憶體漏水
    for (const trackedPid of processCpuSpikeTracker.keys()) {
      if (!activeSpikedPids.has(trackedPid)) {
        processCpuSpikeTracker.delete(trackedPid);
      }
    }
  });
}, AUTO_COOL_INTERVAL);
