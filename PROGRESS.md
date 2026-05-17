# NanoClaw Markdown Agent - 開發進度與重啟指南

本檔案記錄了截至 2026 年 5 月 18 日凌晨的開發進度，方便您睡醒後隨時重啟專案並繼續開發。祝您好眠！💤

---

## 📅 目前開發進度 (Current Progress)

### ✅ 已完成事項
1.  **專案初始化**：建立專案資料夾 `nanoclaw-markdown-agent` 並設定 `package.json`，安裝 Express 等必要套件。
2.  **核心讀寫邏輯 (`src/fs-utils.js`)**：
    *   自動建立 `./nanoclaw_notes` 資料夾。
    *   以當天日期為檔名（如 `YYYY-MM-DD.md`），將寫入內容附加於檔案尾端。
    *   支援在內容上方自動加上時間戳記（`[HH:mm:ss]`）與 Markdown 分隔線（`---`）。
    *   實作查詢所有筆記清單與讀取指定日期筆記的 API。
3.  **HTTP API 伺服器 (`server.js`)**：
    *   提供 `POST /api/notes`（寫入筆記）。
    *   提供 `GET /api/notes`（列出所有筆記檔案）。
    *   提供 `GET /api/notes/:date`（取得特定日期筆記內容）。
4.  **WhatsApp 介面整合 (`src/whatsapp-client.js`)**：
    *   整合 `@whiskeysockets/baileys`。
    *   實作終端機 (Terminal) QR Code 掃碼登入功能。
    *   實作自動儲存登入憑證功能（登入一次後，重啟不需重新掃碼）。
    *   監聽收到的 WhatsApp 訊息，自動套上 `**[WhatsApp 來源]**` 前綴寫入當日 Markdown 筆記中，並自動回覆確認訊息。

---

## 🚀 睡醒後如何重啟與測試？

請依照以下步驟啟動服務並進行測試：

### 1. 啟動伺服器 (會自動啟動 WhatsApp 連線並印出 QR Code)
打開終端機，執行以下指令：
```bash
cd /Users/pac/codes/house-keeper-workspace/nanoclaw-markdown-agent
PORT=3001 npm start
```

### 2. 手機掃碼連結
*   當終端機顯示 **QR Code** 時，拿出手機打開 **WhatsApp**。
*   前往 **設定 (Settings) > 連結裝置 (Linked Devices) > 連結裝置**。
*   掃描電腦終端機上的 QR Code 完成登入。

### 3. 測試隨手記功能
*   在手機上發送任何文字訊息給您連結的這個 WhatsApp 帳號（例如：「測試睡醒後的隨手記」）。
*   您會收到機器人回傳：`✅ 已將您的訊息記錄至本地筆記。`
*   檢查本地筆記：您可以在專案內的 `nanoclaw_notes/` 目錄下看到新建立或更新的 Markdown 檔案。

---

## 🎯 後續升級計畫 (Next Steps)
睡醒後，我們可以繼續進行以下功能：
1.  **Phase 1.5：語音轉錄 (Whisper)**：讓您發送語音訊息給 WhatsApp 機器人時，自動呼叫 Whisper 轉成文字存入筆記。
2.  **Phase 2：本地大腦與語意搜尋 (Ollama & Embedding)**：串接 Ollama，讓機器人可以從您的舊筆記中搜尋關聯事實來回答您的問題。
3.  **Obsidian 設定**：把整個 `nanoclaw_notes` 資料夾丟進您的 Obsidian Vault，建立個人圖譜知識庫。
