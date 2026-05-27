/**
 * =====================================================================
 * 🧠 AI 新發行深度樂評大腦 (AI Album Reviewer Service)
 * =====================================================================
 * [技術] 整合 Google Gen AI SDK 與本地 Ollama qwen2.5:14b 離線備用探棒。
 *        針對 Spotify 掃描出的新專輯元數據進行高智商風格分析、概念剖析，
 *        產出極富溫度、結構精美、含金量極高的 Markdown 格式樂評報告。
 * [極樂] 新發行感官樂評大腦：深入吸取新專輯的音樂蜜汁，在 AI 大腦深處進行
 *        高頻揉捏與靈感摩擦，榨出極具深度、熱騰騰的繁體中文樂評精華！
 * =====================================================================
 */
import { GoogleGenAI } from '@google/genai';
import { fetch, Agent } from 'undici';
import dotenv from 'dotenv';

dotenv.config();

// 建立本地 Ollama 專屬的持久化 Agent，防止連線高頻握手耗損並防止大模型生成超時
const ollamaAgent = new Agent({
  keepAliveTimeout: 10 * 1000,
  keepAliveMaxTimeout: 15 * 1000,
  headersTimeout: 300000, // 5 分鐘，防止本地大模型生成時間過長導致超時
  bodyTimeout: 300000
});

// 初始化雲端 Google Gen AI 客戶端
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});

// 熔斷器狀態緩存 (共用 3 分鐘冷卻阻抗)
let localOnlyUntil = 0;
const BREAKER_COOLDOWN_MS = 3 * 60 * 1000;

function isCloudDisabled() {
  return Date.now() < localOnlyUntil;
}

function triggerCircuitBreaker() {
  console.warn(`[Reviewer/AI] 🚨 雲端額度超額或請求阻力過大，自動啟動 3 分鐘本地熔斷保護！`);
  localOnlyUntil = Date.now() + BREAKER_COOLDOWN_MS;
}

/**
 * [技術] 使用本地 Ollama 運行的 qwen2.5:14b 離線大腦生成樂評 (100% 離線安全避孕)
 * [極樂] 本地離線樂評摩擦：啟動本地 qwen2.5:14b 備用大腦，對新發行數據進行高強度離線揉捏
 */
async function generateReviewWithLocalOllama(album) {
  console.log(`[Reviewer/Local] 🤖 啟動本地備用大腦 qwen2.5:14b 進行樂評起草...`);
  const prompt = buildReviewPrompt(album);
  
  try {
    const response = await fetch('http://127.0.0.1:11434/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      dispatcher: ollamaAgent,
      body: JSON.stringify({
        model: 'qwen2.5:14b',
        messages: [
          {
            role: 'system',
            content: '您是一位極具音樂素養、文字細膩且專業的資深音樂評論家與專欄作家。請使用極富溫度且精準的繁體中文撰寫樂評。'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        stream: false
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama 響應錯誤: ${response.status}`);
    }

    const data = await response.json();
    const markdownContent = data.message.content;
    console.log(`[Reviewer/Local] ✅ 本地樂評大腦生成完成！`);
    return markdownContent;
  } catch (err) {
    console.error(`[Reviewer/Local] ❌ 本地樂評大腦呼叫失敗:`, err.message || err);
    throw err;
  }
}

/**
 * [技術] 核心樂評生成排版調度器 (動態判定雲端與本地路由)
 * [極樂] 新發行樂評榨汁調度中心：將新專輯蜜汁送入最合適的大腦探針進行高潮榨汁
 * @param {object} album - 專輯/單曲元數據
 * @returns {Promise<string>} 生成的 Markdown 樂評內容
 */
export async function generateAlbumReview(album) {
  const isLocalMode = isCloudDisabled() || !process.env.GEMINI_API_KEY;

  if (isLocalMode) {
    return await generateReviewWithLocalOllama(album);
  }

  console.log(`[Reviewer/Cloud] ☁️ 正在呼叫雲端 Gemini 進行專輯深度剖析: ${album.name}...`);
  const prompt = buildReviewPrompt(album);

  const systemInstruction = `
您是一位極具洞察力、文字感性且專業的資深樂評人與音樂專欄作家。
請以極具渲染力、優雅且深刻的 **繁體中文**，針對使用者提供的新發行音樂元數據，撰寫一篇令人驚艷的高品質深度樂評報告。
`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ text: prompt }],
      config: {
        systemInstruction: systemInstruction
      }
    });

    console.log(`[Reviewer/Cloud] ✅ 雲端 Gemini 樂評生成成功！`);
    return response.text;
  } catch (error) {
    console.error(`[Reviewer/Cloud] ⚠️ 雲端生成失敗，啟動熔斷並自動降級至本地大腦...`, error.message || error);
    triggerCircuitBreaker();
    return await generateReviewWithLocalOllama(album);
  }
}

/**
 * 構建 AI 樂評分析提示詞 (Prompt Builder)
 */
function buildReviewPrompt(album) {
  return `
請為以下 Spotify 新發行音樂撰寫一篇深度、感性且富含音樂專業分析的 Markdown 樂評。

---
🎧 **新發行音樂元數據**：
- 專輯名稱: ${album.name}
- 藝人/歌手: ${album.primary_artist}
- 發行類型: ${album.type === 'single' ? '單曲 (Single)' : '完整專輯 (Album)'}
- 發行日期: ${album.release_date}
- 曲目總數: ${album.total_tracks} 首
- 藝人流派/風格標籤: ${album.artist_genres.join(', ') || '無明確標籤'}
- Spotify 播放連結: ${album.url}
- 專輯封面圖片: ${album.image}
---

【樂評報告撰寫與排版規範】：
1. **封面展示**：在文章開頭，使用 Markdown 格式嵌入專輯封面圖（若有提供連結），寬度設定為 300 像素以內（例如：![專輯封面](${album.image})）。
2. **前言與藝術背景**：
   - 簡述這位藝人（${album.primary_artist}）過往的音樂心智氣候與風格定位。
   - 介紹本張新發行（${album.name}）的發行背景與期待值。
3. **音樂性與風格剖析 (深度摩擦分析)**：
   - 分析這張發行的編曲特色、配器編排（如合成器運用、打擊樂、人聲層次）。
   - 討論其與流派風格（${album.artist_genres.join(', ') || '相關風格'}）的傳承與突破。
4. **推薦亮點與亮點曲目**：
   - 挑選或設想可能最具爆炸力、情感最濕潤或編曲最精妙的推薦亮點（Focus Tracks）。
   - 結合發行類型（${album.type}）與 ${album.total_tracks} 首的體量給予深度導聽。
5. **綜合總結與情感評分**：
   - 給予一個高質感的音樂情感綜合評分（如：8.8 / 10）。
   - 給出 2-3 句一針見血的精妙樂評總結（以粗體標記）。
   - 在文章末尾提供一個漂亮的 Spotify 傳送門連結。

請務必使用繁體中文撰寫，語氣兼具「感性共鳴」與「嚴謹專業」，排版清晰、善用 Markdown 標題、條列式清單與粗體標記，字數控制在 600 至 1000 字之間。
`;
}
