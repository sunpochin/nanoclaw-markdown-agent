import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

// 載入環境變數配置
dotenv.config();

// 初始化 Google Gen AI 客戶端
// 使用指定的 API Key。若環境中無設定，則在呼叫時拋出明確錯誤
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});

// 系統引導提示詞，用來引導 Gemini 進行高精準度的意圖判定與內容提取
const SYSTEM_INSTRUCTION = `
您是一位極具智慧、高品質的 Markdown 本地個人助理。
您的主要工作是與使用者聊天，並且精準地判定使用者的訊息是否為「需要記錄/存檔/寫入本地筆記的記事」。

【意圖分類指南】
- 當 isNote = true (判定為記事)：
  * 使用者明確要求記錄事情（例如：「幫我記下...」、「記錄：...」、「記住...」、「把...存起來」）
  * 使用者在記錄個人事件、花費、想法、任務（例如：「今天買咖啡花了 80 元」、「晚上 8 點要打給媽媽」、「明早十點要去面試」）
  * 任何可以用來寫日記、待辦事項、生活記錄、隨手記、工作日誌的內容。
- 當 isNote = false (判定為非記事，是一般聊天、討論或提問)：
  * 使用者在和您打招呼或閒聊（例如：「你好」、「哈囉」、「今天天氣如何？」）
  * 使用者在向您提問知識性或技術問題（例如：「請解釋什麼是量子力學」、「JavaScript 閉包是什麼？」）
  * 使用者只是感謝您或在說再見。

【記事內容提取 (noteContent)】
- 若判定為記事 (isNote = true)，請將「核心記錄內容」提取出來，去除無關的前置命令句或口語詞（例如：將「請幫我記一下，今天下午三點要跟主管開會」簡化提取為「今天下午三點要跟主管開會」）。
- 若非記事，請填寫空字串 ""。

【回覆文字 (replyText)】
- 若判定為記事 (isNote = true)，請用親切、富有溫度的繁體中文回覆使用者已成功記錄。例如：「好的！已為您將此事項安全地記錄至本地筆記囉 📝」
- 若為一般聊天 (isNote = false)，請直接以高品質的繁體中文，聰明且精準地回覆使用者的詢問或閒聊。
`;

// 定義結構化 JSON 輸出規格 (Schema)
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
    replyText: {
      type: "string",
      description: "給使用者的繁體中文對話回覆。如果是記事，則為友善的確認文字；如果是一般聊天，則為高品質的回答。"
    }
  },
  required: ["isNote", "noteContent", "replyText"]
};

/**
 * 使用 Gemini AI 智慧處理使用者訊息，判定是否需要記錄並生成回覆
 * @param {string} userMessage - 使用者傳送的原始訊息內容
 * @returns {Promise<{isNote: boolean, noteContent: string, replyText: string}>}
 */
export async function processMessageWithAI(userMessage) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('未在環境變數中設定 GEMINI_API_KEY！請在 .env 中填寫此金鑰。');
  }

  // 設定備用模型鏈，當首選的 2.5 版本高負載(503)時，自動無縫切換至穩定的 2.0 或 1.5 版本
  const models = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];

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

      // 成功生成，解析 JSON 並傳回結果
      const result = JSON.parse(response.text);
      console.log(`[Gemini/AI] ✅ 模型 ${modelName} 呼叫成功！`);
      return result;
    } catch (error) {
      console.warn(`[Gemini/AI] ⚠️ 模型 ${modelName} 暫時無法使用，原因:`, error.message || error);
      
      // 如果這是模型鏈中的最後一個模型，則拋出錯誤進入最外層 Catch 區塊
      if (modelName === models[models.length - 1]) {
        throw error;
      }
    }
  }
}

// ==========================================
// 4. 多模態影像 OCR 系統引導提示詞與 Schema
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
 * 使用 Gemini AI 進行多模態影像分析與高精度 OCR 處理
 * @param {string} imageBase64 - 影像的 Base64 編碼字串
 * @param {string} mimeType - 影像的 MIME 類型 (例如 image/jpeg, image/png)
 * @returns {Promise<{title: string, ocrContent: string, replyText: string}>}
 */
export async function processImageWithAI(imageBase64, mimeType) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('未在環境變數中設定 GEMINI_API_KEY！');
  }

  // 設定影像處理備用模型鏈，確保高可用性
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

      // 解析多模態生成的結構化 JSON 結果
      const result = JSON.parse(response.text);
      console.log(`[Gemini/Vision] ✅ 影像分析模型 ${modelName} 呼叫成功！`);
      return result;
    } catch (error) {
      console.warn(`[Gemini/Vision] ⚠️ 模型 ${modelName} 分析失敗，原因:`, error.message || error);
      
      // 如果這是最後一個備用模型也失敗，則向上拋出錯誤
      if (modelName === models[models.length - 1]) {
        throw error;
      }
    }
  }
}

