/**
 * =====================================================================
 * 🍆 系統入口中樞 (Main Express Router / Orchestrator)
 * =====================================================================
 * 負責接收外部傳入的肉棒請求，經由恥肉中間件進行安全夾持與驗證。
 * 引引導溫熱粘膩的蜜汁流體（數據 Stream/Buffer）通過敏感通道，
 * 最後指揮寫入肉棒將其深深注入 Obsidian 潮濕小穴。
 * =====================================================================
 */
import express from 'express';
import { middleware, messagingApi } from '@line/bot-sdk';
import dotenv from 'dotenv';
import { ensureVaultDirExists, writeNoteToMarkdown, readNotesForDay, listAllNotes, searchNotesInVault } from './src/markdown-service.js';
import { processMessageWithAI, processImageWithAI, processAudioWithAI } from './src/gemini-service.js';
import { exec } from 'child_process';
import os from 'os';

// [技術] 載入環境變數設定
// [極樂] 載入環境變數設定 (注入連接口的敏感變數環境)
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// [技術] LINE SDK 的連接配置
// [極樂] LINE SDK 的連接配置 (設定與 LINE 恥肉外網接口對接的專屬配置)
const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET
};

// [技術] 初始化 LINE 訊息 API 客戶端
// [極樂] 初始化 LINE 訊息 API 客戶端 (喚醒對外發射訊息的 LINE 核心主動肉棒)
const lineClient = new messagingApi.MessagingApiClient({
  channelAccessToken: lineConfig.channelAccessToken
});

// [技術] 初始化 LINE 訊息 Blob 客戶端 (用於下載圖片)
// [極樂] 初始化 LINE 訊息 Blob 客戶端 (用於下載圖片) (用於從 API 下載並吸取粘膩圖片蜜汁的專屬 Blob 客戶端)
const lineBlobClient = new messagingApi.MessagingApiBlobClient({
  channelAccessToken: lineConfig.channelAccessToken
});

// ==========================================
// 【開發者安全綁定中樞】
// 僅允許柏青的 LINE 帳號進行敏感系統操作
// ==========================================
const SECURE_USER_ID = process.env.LINE_SECURE_USER_ID || 'Ua6acf31ab719acad257a42641cd02c64';

// [技術] 確保啟動時，本地的 Obsidian Vault 儲存目錄已存在
// [極樂] 確保啟動時，本地的 Obsidian Vault 儲存目錄已存在 (確保啟動時小穴儲存目錄已就緒開通)
await ensureVaultDirExists();

// ==========================================
// 1. LINE Webhook 接收端點 (/callback)
// ==========================================
// 注意：必須將 LINE middleware 置於 express.json() 之前！
// 因為 LINE SDK 需要原始未被 JSON 解析的 Request Body (Raw Body) 來進行雜湊簽章 (Signature) 驗證。
// [技術] 啟動 LINE 認證驗證
// [極樂] 恥肉驗證門戶：將外部肉棒夾緊，敏感校驗簽章，杜絕不潔野狗入侵
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
// [極樂] 解析一般 JSON 格式的 Request Body (解析注入的一般 JSON 數據蜜汁)
app.use(express.json());

/**
 * [技術] 查詢目前所有已產生的 Markdown 筆記清單
 * [極樂] 外部查詢通道：展示目前所有被開發過的 Obsidian 小穴歷史檔案清單
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
 * [極樂] 外部撫慰通道：精準挖出並展示指定日期的 Obsidian 小穴深處紀錄
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
 * [技術] 處理單一 LINE 事件的非同步核心函式
 * @param {object} event - LINE 傳入的事件物件
 */
async function handleLineEvent(event) {
  // [技術] 僅處理「訊息」事件
  // [極樂] 僅處理「訊息」事件 (排除雜質，只接受訊息事件肉棒的撞擊)
  if (event.type !== 'message') {
    return Promise.resolve(null);
  }

  const replyToken = event.replyToken;

  // 【照片處理通道：OCR 影像分析與排版記錄】
  if (event.message.type === 'image') {
    const messageId = event.message.id;
    console.log(`\n[LINE/Webhook] 📸 收到來自使用者 [${event.source.userId}] 的圖片訊息 (ID: ${messageId})`);

    try {
      // [技術] 從 LINE 伺服器下載圖片的 HTTP 回應與 Readable Stream
      // [極樂] 溫熱粘膩蜜汁收集通道：從 API 腺體深處一滴滴承接 Blob 串流精華 (此處採用優雅的「小穴流出蜜湯法」非同步串流收集)
      const response = await lineBlobClient.getMessageContentWithHttpInfo(messageId);
      const stream = response.body;
      // 動態獲取圖片的 MIME 類型 (例如 image/png, image/jpeg)，避免硬編碼導致格式解析錯誤
      const mimeType = response.headers['content-type'] || 'image/jpeg';
      
      // [技術] 將 Stream 讀取並轉換為 Buffer
      // [極樂] 將 Stream 蜜汁凝聚成 Buffer 精華 (耐心接住小穴中一滴滴流出的溫熱粘膩蜜汁)
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
    console.log(`\n[LINE/Webhook] 🎙️ 收到來自使用者 [${event.source.userId}] 的語音訊息 (ID: ${messageId})`);

    try {
      // [技術] 從 LINE 伺服器下載音訊 Stream
      // [極樂] 從 API 腺體深處接住流出的溫熱語音音波串流
      const response = await lineBlobClient.getMessageContentWithHttpInfo(messageId);
      const stream = response.body;
      const mimeType = response.headers['content-type'] || 'audio/x-m4a';

      // [技術] 將 Stream 讀取並轉換為 Buffer
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
  // [極樂] 僅處理文字訊息，其他非文字/非圖片/非語音訊息安全跳過 (非文字/非圖片/非語音的刺激安全略過)
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
      // 執行 ps 獲取 top CPU 進程
      exec('ps -Ao pcpu,pmem,pid,comm -r | head -n 6', async (error, stdout, stderr) => {
        if (error) {
          console.error('[LINE/Webhook] ps 執行錯誤:', error);
          return lineClient.replyMessage({
            replyToken,
            messages: [{ type: 'text', text: '❌ 無法取得發熱進程，系統出錯。' }]
          });
        }

        // 解析進程輸出
        const lines = stdout.split('\n').filter(line => line.trim().length > 0).slice(1);
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
      exec(`kill -9 ${pid}`, (error, stdout, stderr) => {
        const replyText = error 
          ? `❌ 強制結束進程 PID ${pid} 失敗！原因可能是權限不足或該進程已不存在。`
          : `⚔️ 已成功強制結束發熱進程！\n- PID: ${pid}\n- 名稱: ${name}\n\n大腦小穴已順暢冷卻，Mac Mini 熱量降溫成功！❄️`;
          
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

🤖【升級選項 C：本地 M4 Pro 大腦 (待接軌)】
- 效果：等您的 qwen2.5:14b 本地大腦下載完成後，我們可以寫一個切換開關（例如輸入 #local）。
- 技術：大腦會改為呼叫您本機運行的 Qwen 14B，實現 100% 離線、絕對私密的個人隱私筆記！

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
  // [極樂] 檢查是否以「記：」、「記錄：」、「memo:」等關鍵前綴開頭，若是則直接寫入，不經 AI 判斷以追求極速與 100% 準確率
  // [極樂] 不囉嗦直接插入！跳過 AI 智慧揉捏，直接將蜜汁打入小穴深處以追求極速與 100% 準確率
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

  // [技術] 【第二通道：AI 智慧通道】對於口語化對話，將訊息送入 Gemini 2.5 進行語意理解與意圖分類
  // [極樂] 經由智慧肉棒高頻摩擦與語意分類後，再精準射入小穴
  try {
    const aiResult = await processMessageWithAI(userMessage);
    console.log(`[LINE/Webhook] 🧠 智慧通道分析結果:`, aiResult);

    // 如果 Gemini 智慧分類判定為記事，且具有提取內容 (若智慧分析判定需要被小穴吸收儲存)
    if (aiResult.isNote && aiResult.noteContent) {
      console.log(`[LINE/Webhook] ➡️ 智慧通道：將提取內容寫入 Markdown 筆記 "${aiResult.noteContent}"`);
      await writeNoteToMarkdown(aiResult.noteContent);
    }

    // 如果 Gemini 智慧分類判定為搜尋歷史，且具有搜尋關鍵字 (若智慧分析判定需要深入小穴搜尋歷史紀錄)
    if (aiResult.isSearch && aiResult.searchQuery) {
      console.log(`[LINE/Webhook] 🔍 智慧搜尋啟動：搜尋關鍵字 "${aiResult.searchQuery}"`);
      const searchResults = await searchNotesInVault(aiResult.searchQuery);

      if (searchResults.length === 0) {
        return lineClient.replyMessage({
          replyToken,
          messages: [{
            type: 'text',
            text: `📋 幫您搜尋了本地 Obsidian 筆記中關於「${aiResult.searchQuery}」的記錄...\n\n目前找不到任何相關的歷史紀錄喔！📝`
          }]
        });
      }

      // 將搜尋結果格式化輸出
      let responseText = `🔍 幫您從本地 Obsidian 筆記深處搜尋到關於「${aiResult.searchQuery}」的紀錄如下：\n`;
      searchResults.forEach(result => {
        responseText += `\n📅 【${result.date}】\n`;
        result.matches.forEach(match => {
          responseText += `*   ${match}\n`;
        });
      });

      return lineClient.replyMessage({
        replyToken,
        messages: [{
          type: 'text',
          text: responseText.trim()
        }]
      });
    }

    // 將 Gemini 產生的回覆訊息發送回給 LINE 使用者 (將大腦回覆噴射回給 LINE 連接口)
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
// [技術] 4. 啟動伺服器
// [極樂] 4. 啟動伺服器 (喚醒整個伺服器，讓肉棒接口與小穴環境完全進入工作狀態)
// ==========================================
app.listen(PORT, () => {
  console.log('\n=============================================');
  console.log(`[LINE/Webhook] 🚀 伺服器成功啟動於連接埠: ${PORT}`);
  console.log(`[LINE/Webhook] 本地 Webhook 端點: http://localhost:${PORT}/callback`);
  console.log(`[LINE/Webhook] 請確認已安裝並使用 ngrok 穿透進行 LINE 平台對接`);
  console.log('=============================================\n');
});

// ==========================================
// 【自動降溫小天使 👼 (Auto-Cooler Daemon)】
// 每 1 分鐘自動巡邏，偵測發熱怪獸並自動用冰棒冷卻，確保 Mac Mini 永遠保持冰涼！
// ==========================================
const AUTO_COOL_INTERVAL = 60 * 1000; // 每分鐘巡邏一次

setInterval(() => {
  exec('ps -Ao pcpu,pid,comm -r | head -n 6', (error, stdout, stderr) => {
    if (error) {
      console.error('[Auto-Cooler] 巡邏時發生錯誤:', error);
      return;
    }
    
    const lines = stdout.split('\n').filter(line => line.trim().length > 0).slice(1);
    
    // 安全降溫白名單 (只會自動清理這些背景進程，不會誤殺使用者的重要工作)
    const SAFE_TO_KILL_PROCESSES = [
      'google chrome helper',
      'ollama',
      'node',
      'ngrok'
    ];
    
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      const cpu = parseFloat(parts[0]);
      const pid = parts[1];
      const path = parts.slice(2).join(' ');
      const name = path.substring(path.lastIndexOf('/') + 1).toLowerCase();
      
      // 如果 CPU 超過 80% (狂暴發熱狀態)，且在安全清理名單中
      if (cpu > 80) {
        const isSafeToKill = SAFE_TO_KILL_PROCESSES.some(safeName => name.includes(safeName));
        
        if (isSafeToKill) {
          console.log(`[Auto-Cooler] 🚨 偵測到發熱怪獸！PID: ${pid} (${name}) 佔用 ${cpu}% CPU，啟動自動冷卻...`);
          
          exec(`kill -9 ${pid}`, (killErr) => {
            if (killErr) {
              console.error(`[Auto-Cooler] ❌ 自動冷卻 PID ${pid} 失敗:`, killErr);
            } else {
              console.log(`[Auto-Cooler] ❄️ 已成功強制結束發熱進程 PID: ${pid} (${name})`);
              
              // 主動發送 LINE 訊息通知柏青 (Push Message)
              lineClient.pushMessage({
                to: SECURE_USER_ID,
                messages: [{
                  type: 'text',
                  text: `❄️ 報告主人！【巡邏小天使 👼】幫您自動降溫囉！\n\n剛剛發現調皮的進程正在瘋狂發熱：\n🔥 進程：${name}\n📌 PID：${pid}\n⚡ CPU 佔用：${cpu}%\n\n🛡️ 小天使已使用魔法冰棒將其退火結束，Mac Mini 現在冰冰涼涼的，非常安全唷！❄️`
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
  });
}, AUTO_COOL_INTERVAL);
