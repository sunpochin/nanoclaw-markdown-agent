import express from 'express';
import { middleware, messagingApi } from '@line/bot-sdk';
import dotenv from 'dotenv';
import { ensureVaultDirExists, writeNoteToMarkdown, readNotesForDay, listAllNotes } from './src/markdown-service.js';
import { processMessageWithAI } from './src/gemini-service.js';

// 載入環境變數設定
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// LINE SDK 的連接配置
const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET
};

// 初始化 LINE 訊息 API 客戶端
const lineClient = new messagingApi.MessagingApiClient({
  channelAccessToken: lineConfig.channelAccessToken
});

// 確保啟動時，本地的 Obsidian Vault 儲存目錄已存在
await ensureVaultDirExists();

// ==========================================
// 1. LINE Webhook 接收端點 (/callback)
// ==========================================
// 注意：必須將 LINE middleware 置於 express.json() 之前！
// 因為 LINE SDK 需要原始未被 JSON 解析的 Request Body (Raw Body) 來進行雜湊簽章 (Signature) 驗證。
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
// 解析一般 JSON 格式的 Request Body
app.use(express.json());

/**
 * 查詢目前所有已產生的 Markdown 筆記清單
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
 * 讀取指定日期的 Markdown 筆記內容
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
// 3. Webhook 核心事件處理器
// ==========================================
/**
 * 處理單一 LINE 事件的非同步核心函式
 * @param {object} event - LINE 傳入的事件物件
 */
async function handleLineEvent(event) {
  // 僅處理「文字訊息」事件，其餘事件(如加入好友、貼圖等)安全跳過
  if (event.type !== 'message' || event.message.type !== 'text') {
    return Promise.resolve(null);
  }

  const userMessage = event.message.text.trim();
  const replyToken = event.replyToken;

  console.log(`\n[LINE/Webhook] 收到來自使用者 [${event.source.userId}] 的訊息: "${userMessage}"`);

  // 【第一通道：直覺快速通道】前綴匹配
  // 檢查是否以「記：」、「記錄：」、「memo:」等關鍵前綴開頭，若是則直接寫入，不經 AI 判斷以追求極速與 100% 準確率
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

  // 【第二通道：AI 智慧通道】
  // 對於口語化對話，將訊息送入 Gemini 2.5 進行語意理解與意圖分類
  try {
    const aiResult = await processMessageWithAI(userMessage);
    console.log(`[LINE/Webhook] 🧠 智慧通道分析結果:`, aiResult);

    // 如果 Gemini 智慧分類判定為記事，且具有提取內容
    if (aiResult.isNote && aiResult.noteContent) {
      console.log(`[LINE/Webhook] ➡️ 智慧通道：將提取內容寫入 Markdown 筆記 "${aiResult.noteContent}"`);
      await writeNoteToMarkdown(aiResult.noteContent);
    }

    // 將 Gemini 產生的回覆訊息發送回給 LINE 使用者
    return lineClient.replyMessage({
      replyToken,
      messages: [{
        type: 'text',
        text: aiResult.replyText
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
// 4. 啟動伺服器
// ==========================================
app.listen(PORT, () => {
  console.log('\n=============================================');
  console.log(`[LINE/Webhook] 🚀 伺服器成功啟動於連接埠: ${PORT}`);
  console.log(`[LINE/Webhook] 本地 Webhook 端點: http://localhost:${PORT}/callback`);
  console.log(`[LINE/Webhook] 請確認已安裝並使用 ngrok 穿透進行 LINE 平台對接`);
  console.log('=============================================\n');
});
