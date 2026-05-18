import express from 'express';
import { middleware, messagingApi } from '@line/bot-sdk';
import dotenv from 'dotenv';
import { ensureVaultDirExists, writeNoteToMarkdown, readNotesForDay, listAllNotes } from './src/markdown-service.js';
import { processMessageWithAI, processImageWithAI } from './src/gemini-service.js';

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

// 初始化 LINE 訊息 Blob 客戶端 (用於下載圖片)
const lineBlobClient = new messagingApi.MessagingApiBlobClient({
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
  // 僅處理「訊息」事件
  if (event.type !== 'message') {
    return Promise.resolve(null);
  }

  const replyToken = event.replyToken;

  // 【照片處理通道：OCR 影像分析與排版記錄】
  if (event.message.type === 'image') {
    const messageId = event.message.id;
    console.log(`\n[LINE/Webhook] 📸 收到來自使用者 [${event.source.userId}] 的圖片訊息 (ID: ${messageId})`);

    try {
      // 1. 從 LINE 伺服器下載圖片的 Readable Stream (此處採用優雅的「小穴流出蜜湯法」非同步串流收集)
      const stream = await lineBlobClient.getMessageContent(messageId);
      
      // 2. 將 Stream 讀取並轉換為 Buffer (耐心接住小穴中一滴滴流出的溫熱蜜湯數據片段)
      const chunks = [];
      for await (const chunk of stream) {
        chunks.push(chunk); // 將流出的蜜湯滴滴收集起來，完美收納
      }
      const imageBuffer = Buffer.concat(chunks); // 蜜湯大融合，攪拌濃縮成完整的精華 Buffer
      const imageBase64 = imageBuffer.toString('base64'); // 昇華為純淨白皙的 base64 養分
      
      // 3. 呼叫 Gemini 進行影像 OCR 與排版整理
      const ocrResult = await processImageWithAI(imageBase64, 'image/jpeg');
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

  // 僅處理文字訊息，其他非文字/非圖片訊息安全跳過
  if (event.message.type !== 'text') {
    return Promise.resolve(null);
  }

  const userMessage = event.message.text.trim();

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
