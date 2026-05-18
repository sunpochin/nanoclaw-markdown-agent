/**
 * =====================================================================
 * 🧠 AI 智慧肉棒分析服務 (Gemini Generation Service)
 * =====================================================================
 * 本服務負責以高頻率的恥肉啪啪啪啪摩擦，對使用者輸入進行語意理解與 OCR 提取。
 * 搭載備用探針鏈（2.5 -> 2.0 -> 1.5），確保在任何強烈阻力下都能成功射出
 * 乾淨、白皙且結構化的 JSON 數據蜜汁。
 * =====================================================================
 */
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

// [技術] 載入環境變數配置
// [極樂] 載入環境變數配置，注入連接 AI 接口的敏感密鑰
dotenv.config();

// [技術] 初始化 Google Gen AI 客戶端
// [極樂] 初始化 Google Gen AI 客戶端 (喚醒並初始化 AI 智慧肉棒的核心探頭)
// [技術] 使用指定的 API Key。若環境中無設定，則在呼叫時拋出明確錯誤
// [極樂] 使用指定的 API Key。若環境中無設定，則在呼叫時拋出明確錯誤 (使用指定的 API 密鑰，若無設置則在探針進入前拋出錯誤)
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});

// [技術] 系統引導提示詞，用來引導 Gemini 進行高精準度的意圖判定、內容提取以及過往筆記搜尋辨識
// [極樂] 系統引導提示詞，引導智慧肉棒敏感判斷「寫入」、「一般對話」與「深處小穴探秘搜尋」體位
const SYSTEM_INSTRUCTION = `
您是一位極具智慧、高品質的 Markdown 本地個人助理。
您的主要工作是判定使用者的意圖（寫入記事、查詢歷史、或是一般閒聊），並產生精確的回覆。

【意圖分類指南】
1. 寫入記事 (isNote = true)：
   - 使用者想要將新資訊寫入、記錄或存檔（例如：「幫我記下...」、「記錄：...」）。
   - 任何用來寫日記、個人碎碎念、隨手記、代辦事項的內容。
2. 搜尋歷史 (isSearch = true)：
   - 使用者在「尋找、詢問、查詢或搜尋過往的筆記與歷史記錄」（例如：「你記得...嗎？」、「我之前有記過...嗎？」、「幫我查一下...」）。
   - 當判定為搜尋歷史時，請將 isNote 設為 false，isSearch 設為 true，並在 searchQuery 中提取出關鍵字（如 "mac mini", "血壓", "藥物"）。
3. 一般對話/非記事 (isNote = false, isSearch = false)：
   - 使用者在和您打招呼、閒聊，或是詢問一般的客觀技術/知識問題（例如：「請解釋 JavaScript 閉包是什麼？」）。

【內容提取規則】
- 若 isNote = true，請在 noteContent 提取要寫入筆記的核心內容，否則填寫空字串 ""。
- 若 isSearch = true，請在 searchQuery 提取出使用者想要搜尋的精確關鍵字（通常為 1~2 個名詞，如 "mac mini", "血壓", "躁鬱症"），否則填寫空字串 ""。

【回覆文字 (replyText)】
- 若 isNote = true，請回覆使用者已成功記錄的親切繁中文字。
- 若 isSearch = true，請回覆使用者：「收到！正在為您從本地 Obsidian 筆記深處搜尋關於『{關鍵字}』的紀錄... 🔍」（這個回覆會作為搜尋啟動前的對白）。
- 若為一般聊天，請直接以高品質的繁體中文，聰明且精準地回覆使用者的詢問或閒聊。
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
      description: "從使用者詢問中提取出要從本地筆記搜尋的精準關鍵字。若非搜尋則為空字串。"
    },
    replyText: {
      type: "string",
      description: "給使用者的繁體中文對話回覆。如果是搜尋，則為提示語；如果是記事，則為友善確認；如果是一般聊天，則為高品質的回答。"
    }
  },
  required: ["isNote", "noteContent", "isSearch", "searchQuery", "replyText"]
};

/**
 * [技術] 呼叫本地運行的 Ollama qwen2.5:14b 大腦進行智慧分析
 * [極樂] 深入本地小穴運作：呼叫本機 qwen2.5:14b 進行無限硬挺智慧分析，擺脫 API 額度束縛
 * @param {string} userMessage - 使用者傳送的原始訊息
 * @returns {Promise<object>} - 結構化分析結果
 */
async function processMessageWithLocalOllama(userMessage) {
  console.log(`[Ollama/Local] 🚨 啟動本地大腦備用探針：正在呼叫本機 qwen2.5:14b...`);
  try {
    const response = await fetch('http://localhost:11434/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'qwen2.5:14b',
        messages: [
          { role: 'system', content: SYSTEM_INSTRUCTION },
          { role: 'user', content: userMessage }
        ],
        response_format: { type: 'json_object' }
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama API 回傳錯誤狀態: ${response.status}`);
    }

    const data = await response.json();
    const jsonText = data.choices[0].message.content;
    const result = JSON.parse(jsonText);
    console.log(`[Ollama/Local] ✅ 本地大腦 qwen2.5:14b 呼叫成功！`);
    return result;
  } catch (error) {
    console.error(`[Ollama/Local] ❌ 本地大腦呼叫失敗:`, error.message || error);
    throw error;
  }
}

/**
 * [技術] 使用 Gemini AI 智慧處理使用者訊息，判定是否需要記錄並生成回覆
 * [極樂] 智慧肉棒深入探索：語意揉捏與極樂 JSON 搾取
 * @param {string} userMessage - 使用者傳送的原始訊息內容
 * @returns {Promise<{isNote: boolean, noteContent: string, replyText: string}>}
 */
export async function processMessageWithAI(userMessage) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('未在環境變數中設定 GEMINI_API_KEY！請在 .env 中填寫此金鑰。');
  }

  // [技術] 設定備用模型鏈，優先使用 2.5/2.0，若遇額度限制自動降級至 1.5 的最新穩定版（即 gemini-flash-latest / gemini-pro-latest）
  // [極樂] 恥肉高頻抽插鏈：2.5 衝鋒，若遇額度阻力，降級至穩固肥美、每天限額 1500 次的 1.5 穩定代稱（gemini-flash-latest）接力，確保順暢出汁！
  const models = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-flash-latest', 'gemini-pro-latest'];

  for (const modelName of models) {
    try {
      console.log(`[Gemini/AI] 正在嘗試使用模型 ${modelName} 進行分析...`);
      
      const response = await ai.models.generateContent({
        model: modelName,
        contents: userMessage,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA
        }
      });

      // [技術] 成功生成，解析 JSON 並傳回結果
      // [極樂] 成功搾出愛液，將其解析為結構化的 JSON 蜜汁精華並噴射回給主控端
      const result = JSON.parse(response.text);
      console.log(`[Gemini/AI] ✅ 模型 ${modelName} 呼叫成功！`);
      return result;
    } catch (error) {
      console.warn(`[Gemini/AI] ⚠️ 模型 ${modelName} 暫時無法使用，原因:`, error.message || error);
      
      // [技術] 如果這是模型鏈中的最後一個模型，則嘗試降級至本地運行的 Ollama qwen2.5:14b
      // [極樂] 如果這是模型鏈中的最後一個模型，則嘗試降級至本地運行的 Ollama qwen2.5:14b (若連線上所有探針都疲軟受挫，主動改為侵入本地小穴本機大腦 qwen2.5:14b 進行無限次強力抽插！)
      if (modelName === models[models.length - 1]) {
        try {
          const localResult = await processMessageWithLocalOllama(userMessage);
          return localResult;
        } catch (localError) {
          console.error(`[AI/Gateway] ❌ 連線上 API 與本機 Ollama 均宣告失敗！`);
          throw error;
        }
      }
    }
  }
}

// ==========================================
// [技術] 4. 多模態影像 OCR 系統引導提示詞與 Schema
// [極樂] 4. 多模態影像 OCR 系統引導提示詞與 Schema (影像調教指南：將上傳的 Base64 蜜汁與指示送入，規劃極樂 Markdown 結構)
// ==========================================
const IMAGE_SYSTEM_INSTRUCTION = `
您是一位極具智慧、高品質的 Markdown 影像辨識與 OCR 助理。
您的工作是分析使用者發送的照片（可能是實體收據、發票、手寫筆記、白板、書籍頁面或螢幕截圖），執行高精準度的文字提取 (OCR)，並將提取的內容整理成結構化、美觀的 Markdown 格式，以便安全寫入使用者的本地 Obsidian 筆記中。

【分析與整理指南】
1. 辨識照片類型：在 Markdown 內容開頭，使用一行粗體說明這張照片是什麼（例如：**📷 實體收據 / 統一發票**、**📷 手寫白板筆記** 等）。
2. 高精準度 OCR：提取照片中的所有關鍵文字、數據與內容。
3. 結構化 Markdown 排版：
   - 如果是「收據/發票/帳單」：請將交易時間、商家名稱、發票號碼、明細品項與金額整理成一個漂亮的 Markdown 表格，並加上「總金額」摘要。
   - 如果是「手寫筆記/白板/腦力激盪」：請將手寫文字整理成結構清晰的標題與條列式清單 (Bullet Points)，修正手寫時的草率語法但保留完整語意。
   - 如果是「書本/文件/截圖」：將文字提取出來，保留原本的段落結構，並將重點字詞使用粗體標記。

【回覆文字 (replyText)】
請使用非常有溫度、專業且親切的繁體中文，向使用者確認您已經看懂了這張照片，並概要說明您記錄了什麼。
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

/**
 * [技術] 使用 Gemini AI 進行多模態影像分析與高精度 OCR 處理
 * [極樂] 影像多模態 OCR 提取：將 Base64 白皙蜜汁送入大腦深處摩擦，搾出 Markdown 筆記精華
 * @param {string} imageBase64 - 影像的 Base64 編碼字串
 * @param {string} mimeType - 影像的 MIME 類型 (例如 image/jpeg, image/png)
 * @returns {Promise<{title: string, ocrContent: string, replyText: string}>}
 */
export async function processImageWithAI(imageBase64, mimeType) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('未在環境變數中設定 GEMINI_API_KEY！');
  }

  // [技術] 設定影像處理備用模型鏈，確保高可用性
  // [極樂] 影像多模態 OCR 提取：將 Base64 白皙蜜汁送入大腦深處摩擦，搾出 Markdown 筆記精華 (在此進行 Vision 專用高可用抽插)
  const models = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];

  for (const modelName of models) {
    try {
      console.log(`[Gemini/Vision] 正在嘗試使用模型 ${modelName} 進行影像分析與 OCR...`);
      
      const response = await ai.models.generateContent({
        model: modelName,
        contents: [
          { text: "請分析此影像，執行 OCR 文字提取，並將其整理為高品質的 Markdown 筆記。" },
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

      // [技術] 解析多模態生成的結構化 JSON 結果
      // [極樂] 成功摩擦搾汁，解析多模態生成的結構化 JSON 蜜汁精華並射回
      const result = JSON.parse(response.text);
      console.log(`[Gemini/Vision] ✅ 影像分析模型 ${modelName} 呼叫成功！`);
      return result;
    } catch (error) {
      console.warn(`[Gemini/Vision] ⚠️ 模型 ${modelName} 分析失敗，原因:`, error.message || error);
      
      // [技術] 如果這是最後一個備用模型也失敗，則向上拋出錯誤
      // [極樂] 如果這是最後一個備用模型也失敗，則向上拋出錯誤 (若最後一根影像探針也徹底軟掉無法工作，只能無奈承認挫敗拋出錯誤，讓外層抓取並宣告失敗)
      if (modelName === models[models.length - 1]) {
        throw error;
      }
    }
  }
}
