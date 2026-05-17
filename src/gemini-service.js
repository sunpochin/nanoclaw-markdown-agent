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

  try {
    // 呼叫 Gemini 2.5 Flash 進行結構化 JSON 生成
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: userMessage,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA
      }
    });

    // 解析結構化的 JSON 回傳結果
    const result = JSON.parse(response.text);
    return result;
  } catch (error) {
    console.error('[Gemini/AI] 呼叫 Gemini API 發生錯誤:', error);
    // 當發生異常或金鑰失效時，提供安全降級回覆，不讓伺服器崩潰
    return {
      isNote: false,
      noteContent: '',
      replyText: '抱歉，我的 AI 腦袋暫時有點連線問題，但您可以檢查 .env 中的 GEMINI_API_KEY 是否填寫正確！'
    };
  }
}
