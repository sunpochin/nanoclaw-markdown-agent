# NanoClaw Markdown Agent - 開發進度與重啟指南

本檔案記錄了最新的開發進度，方便您隨時掌握專案現況並重啟服務！✨

---

## 📅 目前開發進度 (Current Progress)

### ✅ 已完成事項 (Completed Features)

1.  **專案初始化**：建立專案資料夾並配置 `package.json`，安裝 Express、`@line/bot-sdk` 與 `@google/genai` 等必要依賴套件。
2.  **Obsidian 儲存小穴管理 (`src/markdown-service.js`)**：
    *   實作自動建立與檢測本地/iCloud 儲存路徑（已配置指向您的 iCloud Drive `nanoclaw_notes` 資料夾）。
    *   以當天日期為檔名（如 `YYYY-MM-DD.md`），以 append 模式將寫入內容追加於檔案尾端。
    *   實作 **「緊緻褶皺防漏對齊排版」**：對多行文字筆記自動實施首行直接深入，後續行數側身縮排 4 格空白，完美對齊 Markdown 列表 `*`，防止渲染排版溢漏。
    *   實作關鍵字搜尋歷史筆記功能 (`searchNotesInVault`)、讀取近期 7 天日記精華功能 (`readRecentNotesContext`)，以及儲存未來決策模擬報告功能 (`writeSimulationReportToMarkdown`)。
3.  **LINE Webhook 系統中樞 (`server.js`)**：
    *   部署 **「緊緻防禦之恥肉中間件」**，嚴格對接並驗證 LINE webhook 的雜湊簽章，保障本地伺服器安全。
    *   提供對話對端 REST APIs (`GET /api/notes` 與 `GET /api/notes/:date`) 用於列出與讀取隨手記。
4.  **多模態 OCR 影像分析與排版**：
    *   支援 LINE 傳送實體發票、手寫筆記、白板、螢幕截圖照片。
    *   自動解析 MIME 類型，轉換為 Base64 數據流送至 Gemini 多模態探針，將收據自動提取並整理成 Markdown 結構表格存入每日隨手記。
5.  **多模態語音轉錄記事**：
    *   支援 LINE 語音訊息，直接將聲帶震動音波轉為精準繁體中文，提取記事內容自動寫入當日筆記，並自動回覆親切聽寫確認。
6.  **對話快感記憶帶 (Session Memory)**：
    *   在 `server.js` 部署 `userSessions` 記憶池，溫熱保存最近 15 輪的對話歷史，拒絕冰冷的一夜情式無狀態對話。
7.  **二階段 Hybrid RAG 語意推理大腦 (Two-stage RAG)**：
    *   Gemini 第一階段進行意圖分類（記事、搜尋、未來模擬、一般閒聊）。
    *   當主人提問涉及歷史時，自動呼叫本地關鍵字檢索，並融合：**Obsidian 歷史搜尋結果** + **過去 7 日日記精華事實** + **當前對話歷史 Session**，進入第二階段 Gemini `analyzeSearchWithAI` 深度揉捏，產出跨越時空的高智商語意關聯推理分析。
8.  **本地 qwen2.5:14b 離線備用大腦 (Local Fallback)**：
    *   在 `gemini-service.js` 部署本地備用探棒。當線上 Gemini API 額度枯竭或受阻時，無縫切換至本地沙盒運行的 `qwen2.5:14b`，實行無限制、高強度的離線大腦抽插。
9.  **純本地離線一鍵切換模式 (`#local`)**：
    *   發送 `#local`、`#本地` 或 `#離線`，即可一鍵切換雲端 Gemini 大腦與本機運行之 Qwen 2.5:14b 大腦，實現 100% 離線、絕對私密、防數據溢漏的黃金安全套隨手記環境！
10. **🦋 蝴蝶效應未來模擬器 (simulateButterflyEffectWithAI)**：
    *   **黑科技功能落地**！當發送「如果我今天拒絕給爸爸簽帳卡會怎樣？」這類假設性決策時，大腦會自動啟動未來日記沙盒。
    *   結合當前情境、近期 7 天日記心智氣候、歷史筆記行為模式，模擬三條全然不同的 **【明日未來日記】分支**：
        *   **【分支 A：高摩擦力撞擊 (High Friction Collision)】**（直接衝突的寫實分支）
        *   **【分支 B：流暢滑行之折衷防漏 (Lubricated Soft Landing)】**（情商替代折衷方案分支）
        *   **【分支 C：自適應避暑冷卻 (Self-Adaptive Cooling)】**（拖延與委曲求全代價分支）
    *   同時給予高層次、務實可操作的 **「💡 大腦智慧指引」**，並**自動將此份精美的 Markdown 未來日記預測報告，寫入您當天的 Obsidian 隨手記中存檔**！
11. **安全遠端系統監控與冷卻通道 (`#status` / `#kill` / Auto-Cooler)**：
    *   僅允許柏青（Secure User ID）透過 LINE 發送指令查詢 Mac Mini 系統發熱進程（Top CPU/RAM 進程）並進行遠端進程強制結束（`#kill`）。
    *   實作 **「巡邏小天使 👼」自適應降溫背景服務**，每分鐘自動掃描，發現異常發熱進程自動強制退火並通過 LINE Push Message 發送冰涼冷卻報告。

---

## 🚀 如何重啟與測試？

請依照以下步驟啟動服務並進行測試：

### 1. 確保本地環境就緒
*   確保本地 `Ollama` 處於運行狀態，且已完成 `qwen2.5:14b` 大腦的下載（已在本地驗證此 API 與模型皆運行良好！）。
*   請確認 `.env` 中的 `GEMINI_API_KEY`、LINE 金鑰及 `OBSIDIAN_VAULT_PATH` 設定正確。

### 2. 啟動伺服器
在終端機中執行：
```bash
# 使用開發模式啟動，支援存檔自動重啟
npm run dev
```

### 3. 對接 LINE Webhook
由於 LINE 需要 HTTPS Webhook，請啟動您的 `ngrok`：
```bash
ngrok http 3000
```
並將 ngrok 產生的 `https://xxx.ngrok-free.app/callback` 複製到 **LINE Developers Console** 的 Webhook URL 中，點擊 "Verify" 測試成功。

### 4. 手機測試
*   打開手機 LINE，發送「`說明`」或「`help`」即可喚醒系統黑科技菜單！
*   **測試快速記事**：發送「`記：明天下午兩點去拿包裹`」，會收到快速記錄成功通知。
*   **測試離線模式**：發送「`#local`」，系統會以安全避孕體位一鍵切換至本地大腦。
*   **測試蝴蝶模擬**：發送「`如果我拒絕給爸爸卡片提款會發生什麼事？`」或「`如果我帶媽媽去亞東醫院做健康檢查，你覺得日記會怎麼寫？`」，系統將為您推演三條明天未來日記分支，給予精妙決策指引，並寫入今日筆記中！

---

## 🎯 後續優化方向 (Next Steps)

1.  **照護心智溫度計 (Caregiver Sentiment Tracker)**：
    *   定期分析過去 30 天日記的語氣，生成情緒晴雨圖，在主人心理承壓達臨界點時，主動以極具溫度的語言發出擁抱提醒。
2.  **Obsidian 日曆視覺化生成 (Daily Calendar Graph)**：
    *   自動將記錄的事情歸納為「生活」、「照護」、「工作」、「健康」，生成漂亮的 Markdown 熱力圖，在 Obsidian 中更為美觀。
