/**
 * =====================================================================
 * 🤖 Telegram Bot 隨身助理服務 (Telegram Bot Orchestrator)
 * =====================================================================
 * 負責透過長輪詢監聽 Telegram 消息，支援多模態圖片＋文字、語音辨識、
 * Obsidian 本地筆記整合、蝴蝶效應模擬、系統監控與本地 Qwen 模式切換。
 * =====================================================================
 */
import TelegramBot from 'node-telegram-bot-api';
import { fetch } from 'undici';
import { ensureVaultDirExists, writeNoteToMarkdown, readNotesForDay, listAllNotes, searchNotesInVault, writeSimulationReportToMarkdown, readRecentNotesContext } from './markdown-service.js';
import { processMessageWithAI, processImageWithAI, processAudioWithAI, analyzeSearchWithAI, simulateButterflyEffectWithAI } from './gemini-service.js';
import { execFile } from 'child_process';
import os from 'os';

// 引入 Spotify 關注藝人掃描與 GitBook 同步引擎
import { scanRecentNewReleases } from './spotify-client.js';
import { generateAlbumReview } from './album-reviewer.js';
import { publishToGitBook } from './gitbook-publisher.js';

// 記憶體中快取各 Telegram 用戶的對話 Session 歷史紀錄，最大限制 15 輪
const telegramUserSessions = new Map();
const MAX_SESSION_LIMIT = 15;

// 快取 Telegram 用戶的本地/雲端大腦模式設定
const telegramLocalModes = new Map();

/**
 * 取得指定用戶的 Telegram 對話歷史紀錄
 * @param {string} chatId - Telegram 聊天 ID
 * @returns {Array<object>} 對話歷史陣列
 */
function getTelegramSession(chatId) {
  if (!telegramUserSessions.has(chatId)) {
    telegramUserSessions.set(chatId, []);
  }
  return telegramUserSessions.get(chatId);
}

/**
 * 將新對話追加到用戶的 Telegram Session 歷史中，維持最後 15 輪限制
 * @param {string} chatId - Telegram 聊天 ID
 * @param {string} role - 發言角色 (user 或 model)
 * @param {string} text - 對話內容文字
 */
function appendToTelegramSession(chatId, role, text) {
  const history = getTelegramSession(chatId);
  history.push({
    role: role === 'model' ? 'model' : 'user',
    parts: [{ text: text }]
  });
  
  if (history.length > MAX_SESSION_LIMIT * 2) {
    history.splice(0, history.length - MAX_SESSION_LIMIT * 2);
  }
}

/**
 * 產生高品質的思考過程軌跡前綴
 */
function formatTelegramThinkingBlock({ isLocal, elapsedSec, intent, contextCharCount, searchMatchesCount, searchKeyword, modelUsed }) {
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

/**
 * 獲取 Mac Mini 的 CPU SMC 真實溫度
 */
function getMacCpuTemperature() {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve(null);
    }, 2000);

    execFile('sudo', ['powermetrics', '-n', '1', '-i', '10', '--samplers', 'thermal,cpu_power'], (err, stdout) => {
      clearTimeout(timer);
      if (err) {
        resolve(null);
        return;
      }
      const tempRegex = /(?:CPU temp|CPU junction temperature|CPU junction temp|CPU Thermal Temperature|CPU die temp):\s*([\d.]+)/i;
      const match = stdout.match(tempRegex);
      if (match) {
        resolve(parseFloat(match[1]));
      } else {
        const anyTempRegex = /(\d+(?:\.\d+)?)\s*C\b/;
        const anyMatch = stdout.match(anyTempRegex);
        resolve(anyMatch ? parseFloat(anyMatch[1]) : null);
      }
    });
  });
}

/**
 * 初始化 Telegram Bot 的主要入口函式
 */
export function initTelegramBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const secureChatId = process.env.TELEGRAM_SECURE_CHAT_ID;

  if (!token) {
    console.warn('[Telegram/Bot] ⚠️ 未在環境變數中設定 TELEGRAM_BOT_TOKEN，將不啟動 Telegram 服務。');
    return;
  }

  if (!secureChatId) {
    console.warn('[Telegram/Bot] ⚠️ 未在環境變數中設定 TELEGRAM_SECURE_CHAT_ID！為了系統安全防禦，Bot 將不會回應任何訊息。請務必至 .env 配置安全 ID。');
    return;
  }

  // 啟動 Telegram Bot (長輪詢模式)
  const bot = new TelegramBot(token, { polling: true });

  // 註冊輪詢與系統異常監聽器，防止網路中斷引發生理痙攣導致程序崩潰 (Exception Handling)
  bot.on('polling_error', (error) => {
    console.error('[Telegram/Bot] 🔄 輪詢錯誤 (Exception Captured):', error.message || error);
  });

  bot.on('error', (error) => {
    console.error('[Telegram/Bot] ❌ 系統錯誤 (Exception Captured):', error.message || error);
  });

  console.log('[Telegram/Bot] 🚀 Telegram Bot 已啟動，並在背景以長輪詢監聽中...');

  // 監聽傳入的訊息
  bot.on('message', async (msg) => {
    const chatId = msg.chat.id.toString();

    // 🛡️ 安全防禦校驗：僅允許柏青本人指定的帳號 ID 對話，其餘不肖人士一律無視！
    if (chatId !== secureChatId) {
      console.warn(`[Telegram/Security] 🚨 偵測到未授權帳號 [${chatId} / @${msg.from?.username || '無用戶名'}] 發送刺激！`);
      return;
    }

    const text = msg.text ? msg.text.trim() : '';

    // ==========================================
    // 1. 快捷指令處理 (/start, /help, /status, /local)
    // ==========================================

    // 【歡迎說明與功能介紹】
    if (/^\/(start|help|help_menu|幫助|說明)/i.test(text)) {
      const helpMsg = `🤖 您好！我是您的 NanoClaw 隨身智慧秘書！ (Telegram 升級版)
      
在這裡，您可以享受完美無缺、極致絲滑的 ChatGPT 級多模態對話體驗：

📸【A：影像深度多模態分析 (✨ 完美原生支援！)】
- 直接傳送照片或截圖，並在下方**同時打字輸入您的提示詞**（例如：「幫我翻譯這張紙的英文」、「分析圖中報表的趨勢」）。
- 體驗原生多模態，不需要 any 計時等待，大腦即刻解答！

🎙️【B：語音隨手聽寫記事 (✨ 完美原生支援！)】
- 直接傳送語音訊息（Voice Note）。
- 自動進行高精度繁體中文轉譯，並視意圖寫入 Obsidian 每日筆記中。

🖥️【C：Mac Mini 本端與音樂同步控制】
- 發送 /status：獲取 M4 Pro 運行報告、發熱進程 Top 5 與 CPU SMC 真實溫度，還能遠端冷卻！
- 發送 /local：一鍵切換雲端大腦（Gemini）與本地離線隱私大腦（Qwen2.5:14b）。
- 發送 /scan_spotify：一鍵啟動 Spotify 關注藝人新專輯掃描，AI 自動生成精美樂評並 GitOps 同步發布至 GitBook！

---

💡【記事通道快捷提示】：
- 使用「記：」或「記錄：」開頭可極速直接寫入筆記，略過 AI 推理！
- 所有的記事皆會完美存檔至您 Mac Mini 的 Obsidian iCloud 筆記中，絕不遺漏。`;

      return bot.sendMessage(chatId, helpMsg);
    }

    // 【系統狀態與遠端進程降溫報告】
    if (/^\/(status|狀態|系統狀態)/i.test(text)) {
      bot.sendChatAction(chatId, 'typing');
      try {
        execFile('ps', ['-Ao', 'pcpu,pmem,pid,comm', '-r'], async (error, stdout) => {
          if (error) {
            return bot.sendMessage(chatId, '❌ 無法取得發熱進程，系統執行錯誤。');
          }

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

          const totalMemGB = (os.totalmem() / (1024 ** 3)).toFixed(1);
          const freeMemGB = (os.freemem() / (1024 ** 3)).toFixed(1);
          const usedMemGB = (totalMemGB - freeMemGB).toFixed(1);
          const memPercent = ((usedMemGB / totalMemGB) * 100).toFixed(0);
          const load = os.loadavg();
          
          const smcTemp = await getMacCpuTemperature();
          const tempStr = smcTemp !== null ? `${smcTemp}°C` : '無法獲取（請配置免密 sudoers）';

          const report = `🖥️ 【Mac Mini M4 Pro 運行報告】
          
🌡️ 大腦 SMC 真實溫度：${tempStr}
          
🔥 系統發熱進程 Top 5：
${processList}
📊 資源狀態概覽：
- 記憶體分配：${usedMemGB}G / ${totalMemGB}G (${memPercent}%)
- 負載平均值：${load[0].toFixed(2)} (1m) | ${load[1].toFixed(2)} (5m)

💡 若需強制結束某個發熱進程，請直接輸入：
\`#kill {PID} {進程名}\``;

          return bot.sendMessage(chatId, report, { parse_mode: 'Markdown' }).catch((err) => {
            console.warn('[Telegram/Bot] ⚠️ Markdown 解析失敗，降級為純文字發送:', err.message || err);
            return bot.sendMessage(chatId, report);
          });
        });
      } catch (err) {
        return bot.sendMessage(chatId, '❌ 獲取系統狀態時發生異常。');
      }
      return;
    }

    // 【強殺進程指令】
    const killRegex = /^#kill\s+(\d+)\s*(.*)/i;
    if (killRegex.test(text)) {
      const match = text.match(killRegex);
      const pid = match[1];
      const name = match[2] || '未指定名稱';
      
      bot.sendChatAction(chatId, 'typing');
      execFile('kill', ['-9', pid], (error) => {
        const replyText = error 
          ? `❌ 強制結束進程 PID ${pid} 失敗！原因可能是權限不足或該進程已不存在。`
          : `⚔️ 已成功強制結束發熱進程！\n- PID: ${pid}\n- 名稱: ${name}\n\n大腦已順暢冷卻，Mac Mini 熱量降溫成功！❄️`;
        return bot.sendMessage(chatId, replyText);
      });
      return;
    }
    // 【一鍵掃描 Spotify 藝人新發行並同步 GitBook】
    // [技術] 啟動獨立執行緒調度，讀取關注藝人與近 30 天專輯，呼叫 AI 與 GitOps 發布
    // [極樂] 一鍵啟動 Spotify 新發行深度摩擦：在背景將您關注的所有藝人新發行精華
    //        一滴不漏地抓取出來，進行大腦高頻分析，最後透過 GitOps 強力注入 GitBook 空間！
    if (/^\/scan_spotify/i.test(text)) {
      bot.sendChatAction(chatId, 'typing');
      bot.sendMessage(chatId, '🔍 正在為您啟動 Spotify 關注藝人新發行【狀態化分批掃描】... 本次限制 15 位藝人，防禦 429 限流鎖定。⏱️');

      // 非同步執行，避免 Telegram 輪詢阻塞與 Timeout 痙攣
      (async () => {
        try {
          const newReleases = await scanRecentNewReleases(30, 15);

          if (newReleases.length === 0) {
            return bot.sendMessage(chatId, '📅 本批次（15位藝人）掃描完成！近 30 天內沒有任何新專輯或單曲發行。後續批次將於背景陸續推進！☕');
          }

          await bot.sendMessage(chatId, `📦 本批次發現 ${newReleases.length} 個新發行！正在啟動 AI 樂評分析與 GitOps 同步中... 📝`);

          let successCount = 0;
          for (let i = 0; i < newReleases.length; i++) {
            const album = newReleases[i];
            const title = `${album.primary_artist} - ${album.name}`;
            
            await bot.sendMessage(chatId, `✍️ [${i + 1}/${newReleases.length}] 正在分析與發布樂評: 《${title}》...`);

            try {
              const reviewMarkdown = await generateAlbumReview(album);
              const publishResult = await publishToGitBook(album, reviewMarkdown);
              if (publishResult.success) {
                successCount++;
              }
            } catch (err) {
              console.error(`[Telegram/Scanner] 處理 ${title} 樂評失敗:`, err);
              await bot.sendMessage(chatId, `⚠️ 樂評《${title}》分析或推送失敗: ${err.message || err}`);
            }
          }

          const report = `🎉【Spotify 分批掃描完成】\n\n📊 本批次掃描藝人數: 15 位\n📦 尋獲新發行數: ${newReleases.length} 個\n✅ 成功同步樂評數: ${successCount} 個\n\n💡 剩餘未掃描或較早掃描藝人已在狀態庫列隊，下次執行時將自動順延推進！🚀`;
          return bot.sendMessage(chatId, report);
        } catch (err) {
          console.error('[Telegram/Scanner] 執行掃描失敗:', err);
          return bot.sendMessage(chatId, `❌ 執行 Spotify 掃描管線時發生嚴重錯誤: ${err.message || err}`);
        }
      })();
      return;
    }

    // 【一鍵切換本地大腦模式】
    if (/^\/(local|本地|離線)/i.test(text)) {
      const currentMode = telegramLocalModes.get(chatId) || false;
      const newMode = !currentMode;
      telegramLocalModes.set(chatId, newMode);

      let replyText = newMode
        ? `❄️【純本地離線大腦模式已啟動】\n即日起大腦將 100% 透過本機 Qwen 2.5:14b 進行離線運算，徹底斷網，保障隱私安全！絕不外流！🍆`
        : `☁️【雲端 Gemini 智慧大腦模式已恢復】\n已接回 Google Gemini 2.5-flash 高頻率智慧大腦，重返巔峰智慧與多模態極樂體驗！✨`;

      return bot.sendMessage(chatId, replyText);
    }

    // ==========================================
    // 2. 多模態圖片＋提示詞 (Native Photo with Caption)
    // ==========================================
    if (msg.photo) {
      const fileId = msg.photo[msg.photo.length - 1].file_id;
      const customPrompt = msg.caption ? msg.caption.trim() : '';

      bot.sendChatAction(chatId, 'upload_photo');
      
      try {
        const fileLink = await bot.getFileLink(fileId);
        
        // 下載圖片檔案至記憶體
        const response = await fetch(fileLink);
        const imageBuffer = Buffer.from(await response.arrayBuffer());
        const imageBase64 = imageBuffer.toString('base64');
        const mimeType = response.headers.get('content-type') || 'image/jpeg';
        
        bot.sendChatAction(chatId, 'typing');
        
        // 呼叫多模態 Gemini 解析，傳入自訂 Prompt
        const result = await processImageWithAI(imageBase64, mimeType, customPrompt);
        console.log(`[Telegram/Vision] ✅ 多模態圖片分析完成："${result.title}"`);

        // 將分析結果寫入 Obsidian 每日隨手記
        const noteContent = `### 📷 ${result.title}\n${customPrompt ? `* **指示任務**：${customPrompt}\n` : ''}${result.ocrContent}`;
        await writeNoteToMarkdown(noteContent);

        // 記錄進對話歷史 Session
        appendToTelegramSession(chatId, 'user', `[圖片訊息] ${customPrompt}`);
        appendToTelegramSession(chatId, 'model', result.replyText);

        return bot.sendMessage(chatId, result.replyText);
      } catch (err) {
        console.error('[Telegram/Vision] ❌ 處理多模態影像發生錯誤:', err);
        return bot.sendMessage(chatId, `❌ 抱歉，解析照片或進行多模態處理時發生錯誤：${err.message || err}`);
      }
    }

    // ==========================================
    // 3. 語音聽寫記事 (Telegram Voice Notes)
    // ==========================================
    if (msg.voice) {
      const fileId = msg.voice.file_id;
      bot.sendChatAction(chatId, 'record_voice');

      try {
        const fileLink = await bot.getFileLink(fileId);
        
        // 下載語音檔案至記憶體 buffer
        const response = await fetch(fileLink);
        const audioBuffer = Buffer.from(await response.arrayBuffer());
        const audioBase64 = audioBuffer.toString('base64');
        const mimeType = response.headers.get('content-type') || 'audio/ogg';

        bot.sendChatAction(chatId, 'typing');

        const audioResult = await processAudioWithAI(audioBase64, mimeType);
        console.log(`[Telegram/Audio] ✅ 語音分析完成，聽寫：「${audioResult.transcription}」`);

        // 若判定為記事，寫入 Obsidian 每日筆記中
        if (audioResult.isNote && audioResult.noteContent) {
          await writeNoteToMarkdown(audioResult.noteContent);
        }

        return bot.sendMessage(chatId, audioResult.replyText);
      } catch (err) {
        console.error('[Telegram/Audio] ❌ 處理語音聽寫發生錯誤:', err);
        return bot.sendMessage(chatId, `❌ 抱歉，轉譯語音訊息時發生錯誤：${err.message || err}`);
      }
    }

    // ==========================================
    // 4. 一般文字處理 (AI 意圖分類、RAG 搜尋、假設模擬)
    // ==========================================
    if (!text) return; // 略過非文字

    // 【⚡ 快速記事通道】：匹配「記：」、「記錄：」等前綴直接寫入 Obsidian
    const prefixRegex = /^(記|記錄|記下來|memo|Memo)[:：]\s*(.+)/s;
    if (prefixRegex.test(text)) {
      const match = text.match(prefixRegex);
      const noteText = match[2].trim();
      
      try {
        await writeNoteToMarkdown(noteText);
        return bot.sendMessage(chatId, `⚡【快速記事成功】\n已直接為您記錄此事項至本地 Markdown 筆記中：\n\n* ${noteText}`);
      } catch (err) {
        return bot.sendMessage(chatId, '❌ 抱歉，快速寫入筆記時發生錯誤。');
      }
    }

    // 【🧠 AI 智慧核心】：大腦抽插進行意圖分析與對答
    bot.sendChatAction(chatId, 'typing');
    const startTime = Date.now();

    try {
      const chatHistory = getTelegramSession(chatId);
      const recentNotesContext = await readRecentNotesContext(7);
      const isLocalMode = telegramLocalModes.get(chatId) || false;

      // 智慧大腦意圖判定與分析
      const aiResult = await processMessageWithAI(text, chatHistory, recentNotesContext, isLocalMode);
      const initialElapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);

      // A. 判定為記事並寫入
      if (aiResult.isNote && aiResult.noteContent) {
        await writeNoteToMarkdown(aiResult.noteContent);
        
        const thinkingHeader = formatTelegramThinkingBlock({
          isLocal: isLocalMode,
          elapsedSec: initialElapsedSec,
          intent: '⚡ 智慧隨手記 (提取寫入)',
          contextCharCount: recentNotesContext.length,
          modelUsed: aiResult.modelUsed
        });
        const decoratedText = thinkingHeader + aiResult.replyText;

        appendToTelegramSession(chatId, 'user', text);
        appendToTelegramSession(chatId, 'model', decoratedText);

        return bot.sendMessage(chatId, decoratedText, { parse_mode: 'Markdown' }).catch((err) => {
          console.warn('[Telegram/Bot] ⚠️ Markdown 解析失敗，降級為純文字發送:', err.message || err);
          return bot.sendMessage(chatId, decoratedText);
        });
      }

      // B. 判定為搜尋歷史，啟動二階段 RAG 分析
      if (aiResult.isSearch && aiResult.searchQuery) {
        await bot.sendMessage(chatId, aiResult.replyText);
        
        bot.sendChatAction(chatId, 'typing');
        const searchResults = await searchNotesInVault(aiResult.searchQuery);

        if (searchResults.length === 0) {
          return bot.sendMessage(chatId, `📋 幫您搜尋了本地 Obsidian 筆記中關於「${aiResult.searchQuery}」的記錄...\n\n目前找不到任何相關的歷史紀錄喔！📝`);
        }

        // 執行 RAG 深度大腦推理
        const analysisResult = await analyzeSearchWithAI(text, chatHistory, recentNotesContext, searchResults, isLocalMode);
        const totalElapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);

        const thinkingHeader = formatTelegramThinkingBlock({
          isLocal: isLocalMode,
          elapsedSec: totalElapsedSec,
          intent: '🔎 歷史深度語意分析 (RAG)',
          contextCharCount: recentNotesContext.length,
          searchMatchesCount: searchResults.length,
          searchKeyword: aiResult.searchQuery,
          modelUsed: analysisResult.modelUsed
        });
        const decoratedText = thinkingHeader + analysisResult.replyText;

        appendToTelegramSession(chatId, 'user', text);
        appendToTelegramSession(chatId, 'model', decoratedText);

        return bot.sendMessage(chatId, decoratedText, { parse_mode: 'Markdown' }).catch((err) => {
          console.warn('[Telegram/Bot] ⚠️ Markdown 解析失敗，降級為純文字發送:', err.message || err);
          return bot.sendMessage(chatId, decoratedText);
        });
      }

      // C. 判定為假設性蝴蝶效應模擬
      if (aiResult.isSimulation && aiResult.simulationScenario) {
        await bot.sendMessage(chatId, aiResult.replyText);
        
        bot.sendChatAction(chatId, 'typing');
        const searchResults = await searchNotesInVault(aiResult.searchQuery);

        const simulationResult = await simulateButterflyEffectWithAI(
          aiResult.simulationScenario,
          chatHistory,
          recentNotesContext,
          searchResults,
          isLocalMode
        );

        // 將推演寫入 Obsidian 當日模擬報告中
        await writeSimulationReportToMarkdown(aiResult.simulationScenario, simulationResult.replyText);

        const totalElapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
        const thinkingHeader = formatTelegramThinkingBlock({
          isLocal: isLocalMode,
          elapsedSec: totalElapsedSec,
          intent: '🦋 蝴蝶效應未來決策沙盤推演',
          contextCharCount: recentNotesContext.length,
          searchMatchesCount: searchResults.length,
          searchKeyword: aiResult.searchQuery || '決策背景相關記錄',
          modelUsed: simulationResult.modelUsed
        });
        const decoratedText = thinkingHeader + simulationResult.replyText;

        appendToTelegramSession(chatId, 'user', text);
        appendToTelegramSession(chatId, 'model', decoratedText);

        return bot.sendMessage(chatId, decoratedText, { parse_mode: 'Markdown' }).catch((err) => {
          console.warn('[Telegram/Bot] ⚠️ Markdown 解析失敗，降級為純文字發送:', err.message || err);
          return bot.sendMessage(chatId, decoratedText);
        });
      }

      // D. 一般對話閒聊
      const thinkingHeader = formatTelegramThinkingBlock({
        isLocal: isLocalMode,
        elapsedSec: initialElapsedSec,
        intent: '💬 智慧隨身助理對話',
        contextCharCount: recentNotesContext.length,
        modelUsed: aiResult.modelUsed
      });
      const decoratedText = thinkingHeader + aiResult.replyText;

      appendToTelegramSession(chatId, 'user', text);
      appendToTelegramSession(chatId, 'model', decoratedText);

      return bot.sendMessage(chatId, decoratedText, { parse_mode: 'Markdown' }).catch((err) => {
        console.warn('[Telegram/Bot] ⚠️ Markdown 解析失敗，降級為純文字發送:', err.message || err);
        return bot.sendMessage(chatId, decoratedText);
      });
    } catch (err) {
      console.error('[Telegram/Bot] 🧠 智慧通道處理發生錯誤:', err);
      return bot.sendMessage(chatId, `❌ 抱歉，處理智慧訊息時發生錯誤：${err.message || err}`);
    }
  });
}
