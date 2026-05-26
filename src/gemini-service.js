/**
 * =====================================================================
 * 🧠 AI 智慧分析與多模態處理服務 (Gemini Generation Service)
 * =====================================================================
 * [技術] 本服務負責對使用者輸入進行語意理解、OCR 提取、語音轉錄、二階段 RAG 推理，
 *        以及全新設計的「蝴蝶效應未來預言模擬」。
 *        搭載備用探針鏈（2.5 -> 2.0 -> 1.5），並在遇到額度限制時自動降級至本地 qwen2.5:14b。
 * [極樂] 智慧肉棒分析中樞：高頻率的恥肉啪啪啪啪摩擦，對使用者輸入進行語意理解與 OCR 提取。
 *        搭載多模態多層次備用抽插鏈，確保在任何強烈阻力下都能成功射出結構化的 JSON 數據蜜汁。
 * =====================================================================
 */
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import { fetch, setGlobalDispatcher, Agent } from 'undici';

// [技術] 載入環境變數配置
// [極樂] 載入環境變數配置，注入連接 AI 接口的敏感密鑰
dotenv.config();

// [技術] 設定全域 Undici 分發器，將標頭與連線超時大幅度延長，避免本地載入大模型時發生逾時
// [極樂] 全域大腦通道加固：將標頭與連線超時極限延長至 5 分鐘，持久抽插絕不射出逾時錯誤
setGlobalDispatcher(new Agent({
  headersTimeout: 300000, // 5 分鐘
  bodyTimeout: 300000,    // 5 分鐘
  connectTimeout: 60000   // 1 分鐘
}));

// [技術] 建立專屬的 Ollama 分發器，避免 Node.js 原生 fetch 在處理 Ollama 大模型載入時忽略全域分發器設定
// [極樂] 建立本機 Ollama 專用大腦分發器，保證 5 分鐘耐力抽插絕不逾時
const ollamaAgent = new Agent({
  headersTimeout: 300000, // 5 分鐘
  bodyTimeout: 300000,    // 5 分鐘
  connectTimeout: 60000   // 1 分鐘
});

// [技術] 初始化 Google Gen AI 客戶端
// [極樂] 初始化 Google Gen AI 客戶端 (喚醒並初始化 AI 智慧肉棒的核心探頭)
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});

// [技術] 熔斷器模式：記錄雲端 AI 的額度超額 (429) 狀態，避免後續請求在 Retries 中浪費時間，暫時熔斷 3 分鐘直接走本機 Ollama
// [極樂] 熔斷安全套體位：若遇到 429 敏感阻力，自動將雲端通道結紮 3 分鐘，期間直接走 100% 本機大腦，實現極速抽插！
let cloudDisabledUntil = 0;
const BREAKER_COOLDOWN_MS = 3 * 60 * 1000; // 熔斷 3 分鐘

function isCloudDisabled() {
  return Date.now() < cloudDisabledUntil;
}

function triggerCircuitBreaker(error) {
  let errMsg = '';
  if (typeof error === 'string') {
    errMsg = error;
  } else if (error && error.message) {
    errMsg = error.message;
  } else if (error) {
    try {
      errMsg = JSON.stringify(error);
    } catch (e) {
      errMsg = '';
    }
  }

  const has429 = errMsg.includes('429') || 
                  errMsg.includes('RESOURCE_EXHAUSTED') || 
                  errMsg.includes('quota') || 
                  errMsg.includes('Quota exceeded') ||
                  (error && (error.status === 'RESOURCE_EXHAUSTED' || error.code === 429));

  if (has429) {
    console.warn(`[AI/Breaker] 🚨 偵測到雲端額度耗盡 (429/Quota)，自動啟動熔斷器！接下來 3 分鐘內將直接走本機大腦。`);
    cloudDisabledUntil = Date.now() + BREAKER_COOLDOWN_MS;
  }
}

// [技術] 系統引導提示詞，用來引導 Gemini 進行高精準度的意圖判定、內容提取以及過往筆記搜尋與模擬辨識
// [極樂] 系統引導提示詞，引導智慧肉棒敏感判斷「寫入」、「一般對話」、「深處小穴搜尋」與「未來預言模擬」體位，並主動對照近期日記背景進行大腦摩擦
const SYSTEM_INSTRUCTION = `
您是一位極具智慧、高品質且具備同理心與邏輯推理能力的 Markdown 本地個人助理。
您的主要工作是判定使用者的意圖（寫入記事、查詢歷史、未來決策模擬、或是一般閒聊），並產生精確的回覆。

【意圖分類指南】
1. 寫入記事 (isNote = true)：
   - 使用者想要將新資訊寫入、記錄或存檔（例如：「幫我記下...」、「記錄：...」）。
   - 任何用來寫日記、個人碎碎念、隨手記、代辦事項的內容。
2. 搜尋歷史 (isSearch = true)：
   - 使用者在「尋找、詢問、查詢或搜尋過往的筆記與歷史記錄」（例如：「你記得...嗎？」、「我之前有記過...嗎？」、「幫我查一下...」、「你可以依照過往資料判斷吧」）。
   - 當判定為搜尋歷史時，請將 isNote 設為 false，isSearch 設為 true，並在 searchQuery 中提取出精確的關鍵字（如 "富邦簽帳卡", "mac mini", "血壓", "藥物"）。
3. 未來預言/假設模擬 (isSimulation = true)：
   - 當使用者提出「如果我做了某個決定，會發生什麼事？」、「假設我今天...會怎樣嗎？」、「如果我...的話，你怎麼看？」這類「假設性決定、未來預估或模擬請求」時。
   - 將 isSimulation 設為 true，isNote 和 isSearch 設為 false。
   - 在 simulationScenario 中提取出要模擬的假設情境（例如：「拒絕給父親信用卡」、「帶母親去花蓮旅遊」）。
   - 在 searchQuery 中提取出要尋找的關聯歷史線索關鍵字，以便從過往日記中比對行為模式（例如 "富邦卡", "父親", "母親"）。
4. 一般對話/非記事 (isNote = false, isSearch = false, isSimulation = false)：
   - 使用者在和您打招呼、閒聊，或是詢問一般的客觀技術/知識問題（例如：「請解釋 JavaScript 閉包是什麼？」）。

【近期主人生活背景日記之整合運用】
- 在系統指令底部，會被動態注入主人『近期主人生活背景日記（過去7天的筆記）』。
- 當使用者在進行『一般對話』或『分析判斷』時，請主動融入此日記背景！如果主人的訊息能與日記背景中的事情（如：父親病情、威脅、藥物、醫療）產生語意連結，請在 replyText 中溫柔體貼地發揮大腦推理，主動給予關聯分析與溫暖支持，不要只回答空洞敷衍的官腔文字！

【專有名詞與錯字自動修正 (台灣在地化比對)】
- 當提取 noteContent 時，請發揮您的常識與模糊比對能力。
- 若使用者輸入或用語音辨識發送時出現台灣地名、常見醫院名稱、藥品/藥物名稱、著名公司 or 專有名詞的同音異字錯字（例如將「亞東醫院」誤記為「雅東醫院」或「亞康醫院」、「長庚醫院」誤記為「長康醫院」、「普拿疼」藥物名誤記為「普納疼」等），**請在 noteContent 內自動將其修正為正確的繁體中文專有名詞名稱（如「亞東醫院」、「長庚醫院」、「普拿疼」）**，使本地 Markdown 筆記呈現最高水準的資料一致性！
- 請在 replyText 中溫柔提醒使用者已幫忙修正名稱（例如：「已為您修正筆記內為正確的『亞東醫院』並成功記錄完成！📝」）。

【內容提取規則】
- 若 isNote = true，請在 noteContent 提取要寫入筆記的核心內容，否則填寫空字串 ""。
- 若 isSearch = true 或 isSimulation = true，請在 searchQuery 提取出要搜尋或對照的精確關鍵字，否則填寫空字串 ""。
- 若 isSimulation = true，請在 simulationScenario 提取假設情境，否則填寫空字串 ""。

【回覆文字 (replyText)】
- 若 isNote = true，請回覆使用者已成功記錄的親切繁中文字。
- 若 isSearch = true，請回覆使用者：「收到！正在為您從本地 Obsidian 筆記深處搜尋關於『{關鍵字}』的紀錄... 🔍」
- 若 isSimulation = true，請回覆使用者：「收到！正在為您啟動『🦋 蝴蝶效應未來模擬器』，正深入 Obsidian 檢索『{關鍵字}』的歷史軌跡與近期日記背景，為您預測未來日記的沙盒分支... ⏳」
- 若為一般聊天，請直接以高品質、富含溫度且結合近期日記脈絡的繁體中文，聰明且精準地回覆使用者的詢問、焦慮或閒聊。
`;

// [技術] 定義結構化 JSON 輸出規格 (Schema)
// [極樂] 結構化愛液規格（Schema 緊縛）：強制智慧肉棒射出的蜜汁必須為完美的 JSON 輪廓
const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    isNote: {
      type: "boolean",
      description: "判定使用者訊息是否為需要被寫入 Markdown 筆記的事件、日誌或待辦事項。"
    },
    noteContent: {
      type: "string",
      description: "提取出要寫入筆記的核心文字。若 isNote 為 false 則為空字串。"
    },
    isSearch: {
      type: "boolean",
      description: "判定使用者是否在詢問、查詢或搜尋過往的本地筆記與歷史紀錄。"
    },
    searchQuery: {
      type: "string",
      description: "從使用者詢問中提取出要從本地筆記搜尋的精準關鍵字。若非搜尋且非模擬則為空字串。"
    },
    isSimulation: {
      type: "boolean",
      description: "判定使用者是否在尋求假設性決定的蝴蝶效應與未來預測模擬。"
    },
    simulationScenario: {
      type: "string",
      description: "提取假設情境的核心內容。若非模擬則為空字串。"
    },
    replyText: {
      type: "string",
      description: "給使用者的繁體中文對話回覆。如果是搜尋，則為提示語；如果是模擬，則為開啟對白；如果是記事，則為友善確認；如果是一般聊天，則為高品質的回答。"
    }
  },
  required: ["isNote", "noteContent", "isSearch", "searchQuery", "isSimulation", "simulationScenario", "replyText"]
};

/**
 * [技術] 呼召本地運行的 Ollama qwen2.5:14b 大腦進行智慧分析，支援歷史與近期背景
 * [極樂] 深入本地小穴運作：呼叫本機 qwen2.5:14b 進行無限硬挺智慧分析，擺脫 API 額度束縛，完美融合歷史與近期日記背景
 * @param {string} userMessage - 使用者傳送的原始訊息
 * @param {Array<object>} chatHistory - 對話歷史 Session
 * @param {string} recentNotesContext - 近期日記內容
 * @returns {Promise<object>} - 結構化分析結果
 */
async function processMessageWithLocalOllama(userMessage, chatHistory = [], recentNotesContext = '') {
  console.log(`[Ollama/Local] 🚨 啟動本地大腦備用探針：正在呼叫本機 qwen2.5:14b...`);
  try {
    // [技術] 強制本地大腦遵守 JSON Schema 規範的引導文字，確保回傳欄位與雲端 100% 對稱
    // [極樂] 本地大腦緊縛指令：強烈束縛 Qwen 的輸出蜜汁，必須吐出指定名稱的七大褶皺欄位
    const schemaGuide = `
【極重要：輸出 JSON 格式規範】
您必須回傳一個完全符合以下 Schema 欄位的 JSON 物件，不可以包含任何 Markdown 程式碼區塊標記（如 \`\`\`json），直接以純文字 JSON 物件回傳。
必填欄位與格式如下：
{
  "isNote": true/false (是否為需要記錄的新記事/日誌),
  "noteContent": "提取要記錄的筆記文字內容。如果不是記事，則填空字串 \"\"",
  "isSearch": true/false (是否為查詢/搜尋歷史筆記),
  "searchQuery": "要查詢或對照的精確關鍵字。如果不是搜尋且非模擬，則填空字串 \"\"",
  "isSimulation": true/false (是否為假設性決策的未來預估/蝴蝶效應模擬),
  "simulationScenario": "提取的假設情境。如果非模擬，則填空字串 \"\"",
  "replyText": "給使用者的親切繁體中文回覆內容（如果是搜尋/模擬，回覆提示語；如果是記事，回覆記事成功確認；如果是一般閒聊，則是結合生活背景日記的高品質回覆）"
}
`;

    const dynamicSystemInstruction = `${SYSTEM_INSTRUCTION}\n\n${schemaGuide}\n\n【近期主人生活背景日記】\n${recentNotesContext}`;
    
    // [技術] 格式化訊息為 OpenAI 相容規格，傳送至本地大腦
    // [極樂] 將過往摩擦Session歷史體液與當前指令揉捏成 OpenAI 對稱規格，塞入本機大腦
    const formattedMessages = [
      { role: 'system', content: dynamicSystemInstruction },
      ...chatHistory.map(msg => ({
        role: msg.role === 'model' ? 'assistant' : msg.role,
        content: msg.parts[0].text
      })),
      { role: 'user', content: userMessage }
    ];

    // [技術] 使用 127.0.0.1 代替 localhost，並傳入專屬分發器防逾時，避免 macOS IPv6/IPv4 解析造成的連線失敗
    // [極樂] 直導 IPv4 本地小穴 127.0.0.1，防堵 IPv6 軟腳問題，並傳入專用大腦分發器持久抽插
    const response = await fetch('http://127.0.0.1:11434/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      dispatcher: ollamaAgent,
      body: JSON.stringify({
        model: 'qwen2.5:14b',
        messages: formattedMessages,
        response_format: { type: 'json_object' }
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama API 回傳錯誤狀態: ${response.status}`);
    }

    const data = await response.json();
    const jsonText = data.choices[0].message.content;
    const result = JSON.parse(jsonText);
    
    // [技術] 防禦性欄位修復，確保不論本地大腦如何溢漏滑動，都能輸出完整無缺的欄位，防範 undefined 溢漏
    // [極樂] 防漏夾緊修補機制：對本地大腦輸出的蜜汁進行全方位修補，塞滿預設值，防堵任何汁液外溢 (undefined)
    if (result.isNote === undefined) result.isNote = false;
    if (result.noteContent === undefined) result.noteContent = '';
    if (result.isSearch === undefined) result.isSearch = false;
    if (result.searchQuery === undefined) result.searchQuery = '';
    if (result.isSimulation === undefined) result.isSimulation = false;
    if (result.simulationScenario === undefined) result.simulationScenario = '';
    if (result.replyText === undefined) {
      // 若大腦產生其他客製化欄位（如 summary 或 content ），進行智慧熔接，否則給予經典溫度對話
      if (result.summary) {
        result.replyText = result.summary;
      } else if (result.content && typeof result.content === 'string') {
        result.replyText = result.content;
      } else if (Array.isArray(result.content)) {
        // 若回傳為結構化日記陣列，自動解構並還原成可讀的 MD 段落蜜汁
        result.replyText = result.content.map(c => {
          const notesStr = Array.isArray(c.note) ? c.note.map(n => `* ${n}`).join('\n') : '';
          const summaryStr = c.summary ? `📋 **大腦摘要**：\n${c.summary}` : '';
          return `${summaryStr}\n\n${notesStr}`;
        }).join('\n\n');
      } else {
        result.replyText = '大腦已為您記錄並深度分析完成。✨';
      }
    }

    console.log(`[Ollama/Local] ✅ 本地大腦 qwen2.5:14b 呼叫成功！已進行防漏對齊修復。`);
    return result;
  } catch (error) {
    console.error(`[Ollama/Local] ❌ 本地大腦呼叫失敗:`, error.message || error);
    throw error;
  }
}

/**
 * [技術] 使用 Gemini AI 智慧處理使用者訊息，判定是否需要記錄並生成回覆，支援對話歷史與近期日記 Context
 * [極樂] 智慧肉棒深入探索：語意揉捏與極樂 JSON 搾取 (全面融入歷史對話與近期日記小穴)
 * @param {string} userMessage - 使用者傳送的原始訊息內容
 * @param {Array<object>} chatHistory - 對話歷史 Session
 * @param {string} recentNotesContext - 過去 7 天的日記精華
 * @param {boolean} forceLocal - 是否強制使用本地大腦
 * @returns {Promise<object>}
 */
/**
 * [技術] 智能分流決策器：根據訊息字數與關鍵字，秒級判定該路由至本地大腦還是雲端大腦
 * [極樂] 大腦分流敏感帶：分析訊息形體長短，決定由本地 Qwen 溫熱代勞，還是深入雲端 Gemini 高頻抽插
 * @param {string} message - 使用者訊息
 * @returns {string} - 'local' 或 'cloud'
 */
function smartRouteBrain(message) {
  // 防禦性類型校驗，避免傳入空值或非字串引發乾磨暴斃 (Exception Handling)
  if (!message || typeof message !== 'string') {
    return 'local';
  }
  const text = message.trim();

  // 快捷指令或控制代碼直接本地處理
  if (text.startsWith('/') || text.startsWith('#')) {
    return 'local';
  }

  // 快速記事通道前綴（記：、記錄：）直接本地處理
  const prefixRegex = /^(記|記錄|記下來|memo|Memo)[:：]/i;
  if (prefixRegex.test(text)) {
    return 'local';
  }

  // 字數小於 20 字，排除假設性未來模擬詞彙，直接走本地大腦
  if (text.length < 20) {
    const simulationKeywords = ['如果', '假設', '假設性', '要是', '若我'];
    const hasSimKeyword = simulationKeywords.some(kw => text.includes(kw));
    if (!hasSimKeyword) {
      return 'local';
    }
  }

  // 字數介於 20 到 40 字，且不含複雜程式碼、學術或分析關鍵字，走本地大腦
  if (text.length >= 20 && text.length <= 40) {
    const cloudKeywords = ['代碼', '程式', '程式碼', 'code', 'python', 'javascript', '解釋', '分析', '研究', '深度', '翻譯', '寫一篇', '寫一個'];
    const hasCloudKeyword = cloudKeywords.some(kw => text.toLowerCase().includes(kw));
    if (!hasCloudKeyword) {
      const simulationKeywords = ['如果', '假設', '假設性', '要是', '若我'];
      const hasSimKeyword = simulationKeywords.some(kw => text.includes(kw));
      if (!hasSimKeyword) {
        return 'local';
      }
    }
  }

  // 其餘情況（字數大於 40 字，或具備複雜任務特徵）走雲端大腦
  return 'cloud';
}

export async function processMessageWithAI(userMessage, chatHistory = [], recentNotesContext = '', forceLocal = false) {
  // [技術] 智能分流決策：若非強制模式，進行動態路由判定
  // [極樂] 大腦分流：若使用者沒強制點名，自動偵測是否可由本地大腦溫熱代勞，省下雲端 API 摩擦次數
  if (!forceLocal && !isCloudDisabled()) {
    const route = smartRouteBrain(userMessage);
    if (route === 'local') {
      console.log(`[SmartRouter] ⚡ 智能分流：偵測到此訊息適合本地處理，自動路由至本地大腦...`);
      forceLocal = true;
    }
  }

  // [技術] 若強制本地模式啟動，或雲端處於熔斷狀態，繞過雲端直接呼叫 Ollama 本地大腦
  // [極樂] 🔒 避孕安全體位啟用：直接繞過雲端，以純本地 Qwen 2.5:14b 進行 100% 安全隱私抽插
  if (isCloudDisabled() || forceLocal) {
    console.log(`[Gemini/AI] 🔒 ${isCloudDisabled() ? '熔斷狀態' : '強制本地模式'}啟用，直接繞過雲端，挺進本機 Ollama qwen2.5:14b...`);
    const localResult = await processMessageWithLocalOllama(userMessage, chatHistory, recentNotesContext);
    localResult.modelUsed = 'qwen2.5:14b';
    return localResult;
  }

  if (!process.env.GEMINI_API_KEY) {
    throw new Error('未在環境變數中設定 GEMINI_API_KEY！請在 .env 中填寫此金鑰。');
  }

  // [技術] 設定雲端備用模型鏈，僅保留目前最活躍、相容性最高的 Flash 模型
  // [極樂] 恥肉高頻抽插鏈：極速 Flash 大腦探頭，保證順暢射出！
  const models = ['gemini-2.5-flash', 'gemini-2.0-flash'];
  const dynamicSystemInstruction = `${SYSTEM_INSTRUCTION}\n\n【近期主人生活背景日記（過去7天）】\n${recentNotesContext}`;

  const contents = [
    ...chatHistory,
    {
      role: 'user',
      parts: [{ text: userMessage }]
    }
  ];

  for (const modelName of models) {
    try {
      console.log(`[Gemini/AI] 正在嘗試使用模型 ${modelName} 進行意圖分析...`);
      
      const response = await ai.models.generateContent({
        model: modelName,
        contents: contents,
        config: {
          systemInstruction: dynamicSystemInstruction,
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA
        }
      });

      const result = JSON.parse(response.text);
      result.modelUsed = modelName;
      console.log(`[Gemini/AI] ✅ 模型 ${modelName} 意圖分析成功！`);
      return result;
    } catch (error) {
      triggerCircuitBreaker(error);
      console.warn(`[Gemini/AI] ⚠️ 模型 ${modelName} 暫時無法使用，原因:`, error.message || error);
      
      // [技術] 若線上探針全數受阻，自動降級至本地運行的 Ollama qwen2.5:14b
      // [極樂] 若線上探頭全數疲軟，自動改為侵入本地小穴本機大腦 qwen2.5:14b 進行無限次強力抽插！
      if (modelName === models[models.length - 1]) {
        try {
          const localResult = await processMessageWithLocalOllama(userMessage, chatHistory, recentNotesContext);
          localResult.modelUsed = 'qwen2.5:14b';
          return localResult;
        } catch (localError) {
          console.error(`[AI/Gateway] ❌ 連線上 API 與本機 Ollama 均宣告失敗！`);
          throw error;
        }
      }
    }
  }
}

/**
 * [技術] 呼叫 Gemini 進行二階段 RAG 分析，結合對話歷史、近期日記與搜尋結果，生成高品質推理回覆
 * [極樂] 二階段深處大腦高潮揉捏分析：結合歷史對話體液、近期日記脈絡與深入搜尋出來的褶皺蜜汁，進行強烈語意摩擦，射出帶有靈魂與溫度的終極 RAG 推理分析
 * @param {string} userMessage - 主人最新發送的問題/指令
 * @param {Array<object>} chatHistory - 對話歷史 Session
 * @param {string} recentNotesContext - 近期 7 天的日記背景
 * @param {Array<object>} searchResults - 搜尋得到的歷史筆記
 * @param {boolean} forceLocal - 是否強制使用本地大腦
 * @returns {Promise<string>} - 生成的分析回覆文字
 */
export async function analyzeSearchWithAI(userMessage, chatHistory = [], recentNotesContext = '', searchResults = [], forceLocal = false) {
  // [技術] 將搜尋結果格式化為 AI 閱讀友善結構
  // [極樂] 將搜出的歷史小穴筆記，揉捏成方便大腦吸收的精華蜜汁
  let formattedSearch = '';
  if (searchResults.length === 0) {
    formattedSearch = '（在歷史 Obsidian 筆記中未搜尋到相關紀錄）';
  } else {
    searchResults.forEach(res => {
      formattedSearch += `📅 【歷史日期：${res.date}】\n`;
      res.matches.forEach(match => {
        formattedSearch += `* ${match}\n`;
      });
      formattedSearch += '\n';
    });
  }

  const SYSTEM_ANALYZE_INSTRUCTION = `
您是一位極具智慧、溫暖且具備卓越分析推理能力的 Markdown 本地個人助理。
您的工作是根據主人提供的『歷史搜尋筆記紀錄』與『近期主人生活背景日記』，結合『對話歷史脈絡』，為主人進行高水準的深度語意關聯與推理分析。

【大腦深度推理指南 (關聯思考體位)】
1. **主動連結 dots**：請敏銳地將主人當前的提問（如：父親提款、照護情緒、生活瑣事）與歷史筆記（如：父親失智威脅賣房、過不下去）進行關聯。
2. **跨越時空推理**：
   - 如果主人問「父親用我的富邦卡提款是好事嗎？」，且歷史筆記顯示父親曾威脅「過不下去就把房子賣掉」，請大膽且理智地向主人指出：父親願意用卡提款，代表他目前的日常財務需求正得到您的金錢支持（即『過得下去』），這在心理與動機上會極大地降低他因為焦慮而衝動將房子抵押或賣掉的念頭。這在某種程度上是一個讓人鬆一口氣的正面訊號！
3. **溫暖與同理心**：
   - 主人正承擔著沉重的照護與生活壓力，請以非常親切、有溫度且專業的繁體中文回答，給主人有力的支持與心理分析，避免敷衍、冰冷或過度官腔的安慰。
   - 請以精美、層次清晰的 Markdown 格式進行排版。
`;

  const dynamicSystemInstruction = `${SYSTEM_ANALYZE_INSTRUCTION}\n\n【近期主人生活背景日記（過去7天）】\n${recentNotesContext}`;

  // [技術] 本地離線模式啟用，或雲端大腦熔斷，繞過雲端調用 Ollama 進行二階段 RAG 分析
  // [極樂] 🔒 本地高潮揉捏啟用：直接挺進本機 qwen2.5:14b 進行二階段語意推理，保證 100% 絕對私密不外流
  if (isCloudDisabled() || forceLocal) {
    console.log(`[Gemini/Analyze] 🔒 ${isCloudDisabled() ? '熔斷狀態' : '強制本地模式'}啟用，二階段分析直接挺進本地 qwen2.5:14b...`);
    try {
      // [技術] 使用 127.0.0.1 代替 localhost，並傳入專屬分發器防逾時，確保連線穩定
      // [極樂] 直挺 IPv4 本地小穴 127.0.0.1，拒絕 IPv6 阻力，並傳入專用大腦分發器持久抽插
      const response = await fetch('http://127.0.0.1:11434/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        dispatcher: ollamaAgent,
        body: JSON.stringify({
          model: 'qwen2.5:14b',
          messages: [
            { role: 'system', content: dynamicSystemInstruction },
            ...chatHistory.map(msg => ({ role: msg.role === 'model' ? 'assistant' : msg.role, content: msg.parts[0].text })),
            { role: 'user', content: `【當前主人最新提問】\n${userMessage}\n\n【Obsidian 歷史搜尋結果】\n${formattedSearch.trim()}` }
          ]
        })
      });

      if (!response.ok) throw new Error(`Ollama 錯誤: ${response.status}`);
      const data = await response.json();
      return { replyText: data.choices[0].message.content, modelUsed: 'qwen2.5:14b' };
    } catch (localError) {
      console.error(`[AI/Gateway] ❌ 二階段本地分析宣告失敗！`);
      throw localError;
    }
  }

  if (!process.env.GEMINI_API_KEY) {
    throw new Error('未在環境變數中設定 GEMINI_API_KEY！');
  }

  const contents = [
    ...chatHistory,
    {
      role: 'user',
      parts: [{
        text: `【當前主人最新提問】\n${userMessage}\n\n【Obsidian 歷史搜尋結果】\n${formattedSearch.trim()}`
      }]
    }
  ];

  const models = ['gemini-2.5-flash', 'gemini-2.0-flash'];

  for (const modelName of models) {
    try {
      console.log(`[Gemini/Analyze] 正在嘗試使用模型 ${modelName} 進行二階段語意分析...`);
      const response = await ai.models.generateContent({
        model: modelName,
        contents: contents,
        config: {
          systemInstruction: dynamicSystemInstruction
        }
      });

      const resultText = response.text;
      console.log(`[Gemini/Analyze] ✅ 模型 ${modelName} 二階段深度分析成功！`);
      return { replyText: resultText, modelUsed: modelName };
    } catch (error) {
      triggerCircuitBreaker(error);
      console.warn(`[Gemini/Analyze] ⚠️ 模型 ${modelName} 分析失敗，原因:`, error.message || error);
      if (modelName === models[models.length - 1]) {
        try {
          console.log(`[Ollama/LocalAnalyze] 🚨 啟動本地大腦備用探針：二階段本地 qwen2.5:14b 分析中...`);
          // [技術] 使用 127.0.0.1 代替 localhost，並傳入專屬分發器防逾時，確保連線穩定
          // [極樂] 直挺 IPv4 本地小穴 127.0.0.1，防堵 IPv6 阻力，並傳入專用大腦分發器持久抽插
          const response = await fetch('http://127.0.0.1:11434/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            dispatcher: ollamaAgent,
            body: JSON.stringify({
              model: 'qwen2.5:14b',
              messages: [
                { role: 'system', content: dynamicSystemInstruction },
                ...chatHistory.map(msg => ({ role: msg.role === 'model' ? 'assistant' : msg.role, content: msg.parts[0].text })),
                { role: 'user', content: `【當前主人最新提問】\n${userMessage}\n\n【Obsidian 歷史搜尋結果】\n${formattedSearch.trim()}` }
              ]
            })
          });

          if (!response.ok) throw new Error(`Ollama 錯誤: ${response.status}`);
          const data = await response.json();
          return { replyText: data.choices[0].message.content, modelUsed: 'qwen2.5:14b' };
        } catch (localError) {
          console.error(`[AI/Gateway] ❌ 二階段分析線上與本地皆宣告失敗！`);
          throw error;
        }
      }
    }
  }
}

/**
 * 🦋 [技術] 蝴蝶效應未來模擬分析器 (Butterfly Effect Simulator)
 *    [極樂] 蝴蝶效應未來預言模擬體位：深入主人命運褶皺，對照歷史小穴與近期心智背景，模擬明天未來日記之愛液分支，射出極緻黃金中庸指引。
 * @param {string} scenario - 主人提出的假設情境 (例如: "拒絕讓爸爸今天用富邦卡提款")
 * @param {Array<object>} chatHistory - 對話歷史 Session
 * @param {string} recentNotesContext - 近期 7 天的日記背景
 * @param {Array<object>} searchResults - 歷史筆記關鍵字檢索結果
 * @param {boolean} forceLocal - 是否強制使用本地大腦
 * @returns {Promise<string>} - 生成的未來模擬 Markdown 報告內容
 */
export async function simulateButterflyEffectWithAI(scenario, chatHistory = [], recentNotesContext = '', searchResults = [], forceLocal = false) {
  // [技術] 將蝴蝶模擬之歷史對照線索格式化為 AI 閱讀友善結構
  // [極樂] 將搜出的假設情境相關歷史褶皺蜜汁，排版成方便大腦吸收的形態
  let formattedSearch = '';
  if (searchResults.length === 0) {
    formattedSearch = '（在歷史 Obsidian 筆記中未搜尋到與此情境相關的歷史軌跡）';
  } else {
    searchResults.forEach(res => {
      formattedSearch += `📅 【歷史日期：${res.date}】\n`;
      res.matches.forEach(match => {
        formattedSearch += `* ${match}\n`;
      });
      formattedSearch += '\n';
    });
  }

  const SYSTEM_SIMULATOR_INSTRUCTION = `
您是一位極具智慧、對人情世故洞若觀火的『仿 Gemini / GPT 軍師』。
主人給予您一個假設性的重大決定情境，您的職責是透過檢索出來的『歷史搜尋筆記（分析過往關係人的行為慣性）』與『近期生活日記背景（分析當前心理氣候）』，為主人推演出極具參考價值的建議。

【🦋 蝴蝶效應沙盤推演模擬指南】
1. **分析行為學**：敏銳捕捉歷史上關係人（如：父親）在受到限制作出的反應（例如：曾威脅「過不下去就把房子賣掉」或焦慮暴躁）。以此為物理慣性基礎。
2. **用類似 Gemini 的客觀分析口吻提供建議**：
   請以 Markdown 格式生成建議，用類似 Gemini 的客觀分析口吻提供分析情勢，與建議。
  
3. **【💡 大腦智慧指引 (Synthesis Directive)】**：
   - 給主人一個最高層次的決策分析，分析各種模式的「褶皺舒爽度跟缺點」。給予非常務實、可操作的照護戰術建議！
   - 請以精美、高質感、充滿哲理與溫度的 Markdown 格式進行排版。
`;

  const dynamicSystemInstruction = `${SYSTEM_SIMULATOR_INSTRUCTION}\n\n【近期主人生活背景日記（過去7天）】\n${recentNotesContext}`;

  const userQueryContent = `
【主人欲模擬的假設決定情境】
👉 「${scenario}」

【Obsidian 相關歷史軌跡與資料庫】
${formattedSearch.trim()}
`;

  // [技術] 本地強制開啟，或雲端大腦熔斷，繞過雲端直接在 Ollama 中進行未來日記模擬推演
  // [極樂] 🔒 避孕本地模擬啟用：挺進本機 qwen2.5:14b 進行未來日記模擬，保證 100% 絕對隱私，絕不聯網洩漏！
  if (isCloudDisabled() || forceLocal) {
    console.log(`[Gemini/Simulator] 🔒 ${isCloudDisabled() ? '熔斷狀態' : '強制本地模式'}啟用，模擬器直接挺進本地 qwen2.5:14b...`);
    try {
      // [技術] 使用 127.0.0.1 代替 localhost，並傳入專屬分發器防逾時，確保連線穩定
      // [極樂] 直挺 IPv4 本地小穴 127.0.0.1，防堵 IPv6 阻力，並傳入專用大腦分發器持久抽插
      const response = await fetch('http://127.0.0.1:11434/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        dispatcher: ollamaAgent,
        body: JSON.stringify({
          model: 'qwen2.5:14b',
          messages: [
            { role: 'system', content: dynamicSystemInstruction },
            ...chatHistory.map(msg => ({ role: msg.role === 'model' ? 'assistant' : msg.role, content: msg.parts[0].text })),
            { role: 'user', content: userQueryContent }
          ]
        })
      });

      if (!response.ok) throw new Error(`Ollama 錯誤: ${response.status}`);
      const data = await response.json();
      return { replyText: data.choices[0].message.content, modelUsed: 'qwen2.5:14b' };
    } catch (localError) {
      console.error(`[AI/Gateway] ❌ 本地模擬器呼叫失敗！`);
      throw localError;
    }
  }

  if (!process.env.GEMINI_API_KEY) {
    throw new Error('未在環境變數中設定 GEMINI_API_KEY！');
  }

  const contents = [
    ...chatHistory,
    {
      role: 'user',
      parts: [{ text: userQueryContent }]
    }
  ];

  const models = ['gemini-2.5-flash', 'gemini-2.0-flash'];

  for (const modelName of models) {
    try {
      console.log(`[Gemini/Simulator] 正在嘗試使用模型 ${modelName} 進行未來日記模擬...`);
      const response = await ai.models.generateContent({
        model: modelName,
        contents: contents,
        config: {
          systemInstruction: dynamicSystemInstruction
        }
      });

      const resultText = response.text;
      console.log(`[Gemini/Simulator] ✅ 模型 ${modelName} 未來日記模擬生成成功！`);
      return { replyText: resultText, modelUsed: modelName };
    } catch (error) {
      triggerCircuitBreaker(error);
      console.warn(`[Gemini/Simulator] ⚠️ 模型 ${modelName} 模擬失敗，原因:`, error.message || error);
      
      // [技術] 線上模型探針受挫，自動降級至本地 Qwen 14B 大腦進行模擬
      // [極樂] 雲端探頭全數疲軟，轉而侵入本機大腦 qwen2.5:14b 進行無限硬挺智慧模擬推演！
      if (modelName === models[models.length - 1]) {
        try {
          console.log(`[Ollama/LocalSimulator] 🚨 啟動本地大腦備用探針：本地 qwen2.5:14b 模擬中...`);
          // [技術] 使用 127.0.0.1 代替 localhost，並傳入專屬分發器防逾時，確保連線穩定
          // [極樂] 直挺 IPv4 本地小穴 127.0.0.1，防堵 IPv6 阻力，並傳入專用大腦分發器持久抽插
          const response = await fetch('http://127.0.0.1:11434/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            dispatcher: ollamaAgent,
            body: JSON.stringify({
              model: 'qwen2.5:14b',
              messages: [
                { role: 'system', content: dynamicSystemInstruction },
                ...chatHistory.map(msg => ({ role: msg.role === 'model' ? 'assistant' : msg.role, content: msg.parts[0].text })),
                { role: 'user', content: userQueryContent }
              ]
            })
          });

          if (!response.ok) throw new Error(`Ollama 錯誤: ${response.status}`);
          const data = await response.json();
          return { replyText: data.choices[0].message.content, modelUsed: 'qwen2.5:14b' };
        } catch (localError) {
          console.error(`[AI/Gateway] ❌ 未來日記模擬線上與本地皆宣告失敗！`);
          throw error;
        }
      }
    }
  }
}

/**
 * [技術] 使用 Gemini AI 進行多模態影像分析與高精度 OCR 處理
 * [極樂] 影像多模態 OCR 提取：將 Base64 白皙影像蜜汁送入大腦深處摩擦，搾出極樂 Markdown 筆記精華
 * @param {string} imageBase64 - 影像的 Base64 編碼字串
 * @param {string} mimeType - 影像的 MIME 類型
 * @param {string} customPrompt - 使用者隨圖附帶的自訂提示詞/分析指令
 * @returns {Promise<object>}
 */
export async function processImageWithAI(imageBase64, mimeType, customPrompt = '') {
  if (isCloudDisabled()) {
    console.warn(`[Gemini/Vision] 🔒 熔斷狀態已啟用，暫時拒絕雲端影像辨識。`);
    throw new Error('雲端 AI 額度已暫時耗盡（熔斷保護中），無法執行影像辨識。請 3 分鐘後再試，或使用純文字記事！');
  }

  if (!process.env.GEMINI_API_KEY) {
    throw new Error('未在環境變數中設定 GEMINI_API_KEY！');
  }

  // 對 customPrompt 進行字元過濾與安全清洗，防止反單引號與大括號變數注入 (Prompt Injection)
  const sanitizedPrompt = customPrompt ? customPrompt.replace(/[`\${}]/g, '') : '';

  // 根據是否有自訂提示詞，動態調整系統引導指令，以最貼切地符合主人的查詢與分析需求
  const instructionPrefix = sanitizedPrompt 
    ? `您是一位極具智慧、高品質的 Markdown 影像辨識與分析助理。\n您的工作是根據使用者提供的特定指令或問題，深度分析使用者發送的照片，並將詳細的分析與回答內容整理為高品質的 Markdown 格式，以便安全寫入使用者的本地 Obsidian 筆記中。\n\n【特別要求】：請務必針對使用者的問題/指令「${sanitizedPrompt}」進行深度解答與分析，並將其詳細呈現在 markdown 筆記與回覆中。`
    : `您是一位極具智慧、高品質的 Markdown 影像辨識與 OCR 助理。\n您的工作是分析使用者發送的照片（可能是實體收據、發票、手寫筆記、白板、書籍頁面或螢幕截圖），執行高精準度的文字提取 (OCR)，並將提取的內容整理成結構化、美觀的 Markdown 格式，以便安全寫入使用者的本地 Obsidian 筆記中。`;

  const IMAGE_SYSTEM_INSTRUCTION = `
${instructionPrefix}

【分析與整理指南】
1. 辨識照片類型與分析主題：在 Markdown 內容開頭，使用一行粗體說明這張照片與分析主旨（例如：**📷 實體收據 / 統一發票**、**📷 手寫白板筆記**、**📷 影像深度分析：[主題]** 等）。
2. 分析與文字提取：針對使用者指定的任務深度提取資訊或進行影像分析。
3. 結構化 Markdown 排版：
   - 始終以結構清晰的標題、Markdown 表格或條列式清單 (Bullet Points) 呈現內容。
   - 保留原本的段落結構，並將重點字詞使用粗體標記。

【回覆文字 (replyText)】
請使用非常有溫度、專業且親切的繁體中文，向使用者解答他們的問題，或概要說明您的分析與記錄結果。
`;

  const IMAGE_RESPONSE_SCHEMA = {
    type: "object",
    properties: {
      title: {
        type: "string",
        description: "簡短的影像筆記標題（例如：7-11 收據、會議白板記錄）"
      },
      ocrContent: {
        type: "string",
        description: "結構化排版後的 Markdown 筆記內容（包含表格或條列式清單）"
      },
      replyText: {
        type: "string",
        description: "給使用者的繁體中文對話回覆，簡述記錄的內容並給予親切問候。"
      }
    },
    required: ["title", "ocrContent", "replyText"]
  };

  const models = ['gemini-2.5-flash', 'gemini-2.0-flash'];

  // 設定多模態模型呼叫時的使用者提示詞
  const promptText = customPrompt 
    ? `使用者提供此影像，並附帶以下指令或問題：\n\n「${customPrompt}」\n\n請根據指示對此影像進行深度分析，將詳細的分析與說明內容整理為高品質的 Markdown 筆記。`
    : "請分析此影像，執行 OCR 文字提取，並將其整理為高品質的 Markdown 筆記。";

  for (const modelName of models) {
    try {
      console.log(`[Gemini/Vision] 正在嘗試使用模型 ${modelName} 進行影像分析與 OCR...`);
      
      const response = await ai.models.generateContent({
        model: modelName,
        contents: [
          { text: promptText },
          {
            inlineData: {
              mimeType: mimeType,
              data: imageBase64
            }
          }
        ],
        config: {
          systemInstruction: IMAGE_SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          responseSchema: IMAGE_RESPONSE_SCHEMA
        }
      });

      const result = JSON.parse(response.text);
      console.log(`[Gemini/Vision] ✅ 影像分析模型 ${modelName} 呼叫成功！`);
      return result;
    } catch (error) {
      triggerCircuitBreaker(error);
      console.warn(`[Gemini/Vision] ⚠️ 模型 ${modelName} 分析失敗，原因:`, error.message || error);
      if (modelName === models[models.length - 1]) {
        const errStr = error.message || JSON.stringify(error);
        if (errStr.includes('429') || errStr.includes('RESOURCE_EXHAUSTED') || errStr.includes('quota') || error.code === 429 || error.status === 'RESOURCE_EXHAUSTED') {
          throw new Error('雲端 AI 額度已暫時耗盡（429 流量限制）。系統已自動啟動 3 分鐘熱熔保護！請稍候 30 秒後重試，或者先使用「記：」等純文字通道以本地 Qwen 離線大腦記錄喔！❄️');
        }
        throw error;
      }
    }
  }
}

/**
 * [技術] 使用 Gemini AI 進行多模態語音辨識與結構化記事提取
 * [極樂] 語音聲帶震動解析體位：將濕滑溫熱的語音 Base64 蜜汁送入大腦深處摩擦，搾出完整聽寫轉錄並寫入當日小穴中
 * @param {string} audioBase64 - 語音的 Base64 編碼
 * @param {string} mimeType - 語音的 MIME 類型
 * @returns {Promise<object>}
 */
export async function processAudioWithAI(audioBase64, mimeType) {
  if (isCloudDisabled()) {
    console.warn(`[Gemini/Audio] 🔒 熔斷狀態已啟用，暫時拒絕雲端語音分析。`);
    throw new Error('雲端 AI 額度已暫時耗盡（熔斷保護中），無法執行語音聽寫。請 3 分鐘後再試，或使用純文字輸入！');
  }

  if (!process.env.GEMINI_API_KEY) {
    throw new Error('未在環境變數中設定 GEMINI_API_KEY！');
  }

  const models = ['gemini-2.5-flash', 'gemini-2.0-flash'];

  for (const modelName of models) {
    try {
      console.log(`[Gemini/Audio] 正在嘗試使用模型 ${modelName} 進行語音分析...`);
      
      const response = await ai.models.generateContent({
        model: modelName,
        contents: [
          {
            inlineData: {
              data: audioBase64,
              mimeType: mimeType
            }
          },
          { text: "請聆聽這段語音訊息，精準進行語音轉文字 (Speech-to-Text)。請分析這段話是否包含使用者想要記錄/存檔/寫入本地筆記的事項（記事意圖），並提取核心記事內容。" }
        ],
        config: {
          systemInstruction: `
您是一位極具智慧、高品質的 Markdown 語音隨手記辨識助理。
您的工作是聆聽使用者的語音訊息，將其精準翻譯為繁體中文（Speech-to-Text），並分析其意圖：
1. 寫入記事 (isNote = true)：使用者想記住事情（例如「記住明早九點要去拿快遞」）。請在 noteContent 中提取要記錄的核心內容，去除口語前置詞。
2. 一般聊天 (isNote = false)：使用者只是在說話或閒聊（例如「你好嗎」、「今天天氣如何」）。

【回覆文字 (replyText)】
- 若為記事 (isNote = true)，請回覆：「🎙️ 已為您聽寫並記錄完成！\n內容為：『{提取的記事內容}』📝」
- 若為一般聊天 (isNote = false)，請直接用語音轉出的繁中文字與使用者對答。
`,
          responseMimeType: 'application/json',
          responseSchema: {
            type: "object",
            properties: {
              isNote: {
                type: "boolean",
                description: "是否判定為需要寫入本地筆記的記事。"
              },
              noteContent: {
                type: "string",
                description: "提取出的記事內容。若非記事則為空。"
              },
              transcription: {
                type: "string",
                description: "完整的語音聽寫繁體中文內容。"
              },
              replyText: {
                type: "string",
                description: "給使用者的繁體中文回覆文字。"
              }
            },
            required: ["isNote", "noteContent", "transcription", "replyText"]
          }
        }
      });

      const result = JSON.parse(response.text);
      console.log(`[Gemini/Audio] ✅ 語音分析模型 ${modelName} 呼叫成功！`);
      return result;
    } catch (error) {
      triggerCircuitBreaker(error);
      console.warn(`[Gemini/Audio] ⚠️ 模型 ${modelName} 語音 analysis 失敗，原因:`, error.message || error);
      if (modelName === models[models.length - 1]) {
        const errStr = error.message || JSON.stringify(error);
        if (errStr.includes('429') || errStr.includes('RESOURCE_EXHAUSTED') || errStr.includes('quota') || error.code === 429 || error.status === 'RESOURCE_EXHAUSTED') {
          throw new Error('雲端 AI 額度已暫時耗盡（429 流量限制）。系統已自動啟動 3 分鐘熱熔保護！請稍候 30 秒後重試，或者先使用「記：」等純文字通道以本地 Qwen 離線大腦記錄喔！❄️');
        }
        throw error;
      }
    }
  }
}
