# 🧠 雙腦事實記憶庫 (Dual-Brain Fact Memory): RAG 與資料庫的童話故事與面試指南

這份文件是用來幫助你徹底搞懂這次實作的「Obsidian + SQLite 記憶庫」架構。
我們分為兩部分：
1. **🍄 童話故事篇**：用小朋友都能聽懂的超簡單比喻，讓你在腦中建立直覺。
2. **💼 面試通關篇**：把童話轉換成專業的「高階技術術語」，提供面試可以直接說出口的漂亮台詞。

---

## 🍄 第一部分：童話故事篇（小朋友聽得懂的記憶庫）

想像你是個**忘性很大的國王**（這代表 **LLM 大腦**，他雖然很聰明懂很多道理，但記不住你昨天跟他說你媽媽不吃辣這件小事）。

為了不漏氣，國王請了兩個小幫手和一本魔法筆記本：

### 1. 📖 Obsidian 魔法筆記本 (Single Source of Truth)
這是國王的漂亮大筆記本。
* **特色**：用漂亮的文字寫成，人類看得懂（Markdown 格式），而且可以分成很多頁，比如「媽媽的秘密.md」、「台北的探險.md」。
* **缺點**：如果這本書變得像字典一樣厚，國王每次要查「媽媽討厭吃什麼」的時候，得一頁一頁翻，翻到手酸，速度超慢！

### 2. 🗃️ SQLite 隱形小卡盒 (Performance & Fast Search)
這是一個放在口袋裡的超快速索引卡片盒。
* **特色**：裡面只用最簡單的格式卡片（表格 Table）寫著：「媽媽的討厭食物：辣 ➡️ 請看第 12 頁」。它不是給人類讀的故事書，它是給電腦讀的。
* **優點**：超級快！你問它「媽媽」，它 0.0001 秒就能從幾萬張卡片中，瞬間抽出寫著媽媽的那張。

### 3. 🔍 RAG（Retrieval-Augmented Generation）開卷考試法
這是一個動作，叫做「**检索增強生成**」。
* 平常國王考試是**閉卷考試**（光憑腦袋裡的記憶回答）。
* **RAG 就是開卷考試**：當有人問國王：「我媽媽吃辣嗎？」
  1. 國王自己不知道，但他不瞎猜。
  2. 國王派小幫手（**Retrieval 檢索**）去「SQLite 小卡盒」和「Obsidian 筆記本」裡找答案。
  3. 小幫手快速抱著「媽媽不吃辣」的紙條回來交給國王。
  4. 國王看著紙條，用他聰明的腦袋重新組裝成一句好聽的話（**Generation 生成**）回答：「你媽媽不吃辣喔，下次記得點清淡點！」

### 4. 👑 國王小裁判與黃金眼睛 (Strict Memory Filters)
國王的小跟班太熱心了，以前只要聽到任何雞毛蒜皮的「事實」，就想把它寫進大筆記本裡（比如：「今天下雨了」、「今天我很生氣」），結果大筆記本很快就塞滿了廢話。
*   **黃金眼睛升級**：國王為小跟班換上一雙黃金眼睛，並給他下了極度嚴格的命令：「現在起，除非這件事關係到**國王本人（健康醫療、工作事業、感情狀況、重大資訊）**，或者是**王室家族成員（家庭健康與重大狀況）**，否則一律不准蓋章存檔（`isFact = false`）！」
*   **效果**：魔法筆記本從此乾乾淨淨，只裝載最重要的核心黃金記憶！

### 5. 🔒 魔法排隊登記簿 (File Locking Mutex)
以前小跟班們寫筆記是非同步（多個分身同時跑），如果有多個小跟班同時想在同一本書（如「媽媽的秘密.md」）寫下事實，或者同時塗改，大家搶來搶去，筆記本的書頁就會被撕破、字體會交錯重疊（檔案損毀/寫入衝突）。
*   **排隊魔法陣**：我們引進了一個排隊登記簿。每當有小跟班要對某一本書寫字或修改，必須先去登記簿登記並拿一個號碼牌。
*   **效果**：前一個人寫完、把書闔上叫號，下一個人才准提筆。大家乖乖排隊，同一本書在同一個時間只有一個人能動，故事書再也不會壞掉囉！

---

## 💼 第二部分：面試通關篇（面試官聽得懂的架構）

當面試官問你：**「請介紹你實作的這套記憶庫系統（RAG）架構？」**
你千萬不要講童話故事！你要用以下這段話直接震撼他：

> 「我實作了一套**『雙腦混合儲存架構 (Dual-Brain Hybrid Storage Architecture)』**的 RAG（檢索增強生成）系統。
> 
> 它的核心設計思想是 **Single Source of Truth (單一真實來源)** 與 **Read-Write Separation (讀寫分離/效能優化)** 的結合。」

### 💡 核心三層架構解密

```mermaid
graph TD
    User([使用者輸入]) --> Server[Node.js Express Server]
    Server --> LLM{Gemini LLM<br/>大腦判斷}
    
    LLM -- 判斷為重要事實 /isFact --> Write[兩階段寫入 2-Phase Commit]
    Write -->|第一步: 人類可讀| Obsidian[(Obsidian Vault<br/>Markdown 檔案)]
    Obsidian -->|第二步: 效能檢索| SQLite[(node:sqlite<br/>記憶體/本機資料庫)]
    
    LLM -- 需要查詢歷史記憶 --> Search[高效檢索]
    Search -->|快速查找| SQLite
    SQLite -->|取得 Context| LLM
    LLM --> Answer[生成回覆給使用者]
```

1. **儲存層 (Storage Layer - Obsidian Vault)**
   * **定位**：採用本地 Markdown 檔案（Obsidian）作為**單一真實來源 (Single Source of Truth)**。
   * **優勢**：資料完全本地化（Local-first）、隱私安全、版本控制友好，且人類可以直接用編輯器閱讀與修改，實現高透明度的「人機協同」。

2. **索引與快取層 (Index Layer - Node.js Native SQLite)**
   * **定位**：使用 Node v23 的原生 `node:sqlite`（DatabaseSync）建立輕量級的高效能索引。
   * **優勢**：解決了直接遍歷大型 Obsidian Markdown 資料夾產生的 I/O 效能瓶頸（File System Bottleneck）。SQLite 的結構化查詢（SQL Search）提供毫秒級的實體（Entity）與事實（Fact）检索。

3. **協調層 (Orchestration Layer - LLM/Gemini)**
   * **定位**：透過 Structured Output（結構化輸出 JSON Schema），由 Gemini 判斷當前對話是否包含「需要被記憶的長期事實（isFact）」。
   * **流向**：如果是事實，透過**兩階段寫入（Obsidian 先寫，成功後同步寫入 SQLite）**確保一致性。

---

## 🙋 面試亮點問題與完美回答 (Q&A)

### Q1：為什麼不直接把所有筆記丟給 LLM 讀就好了？
* ❌ **不專業回答**：因為檔案太大會爆炸。
*  **面試官最愛回答**：
  > 「這涉及到 **Context Window (上下文窗口)** 的成本與效能考量。
  > 如果每次對話都將整個 Obsidian Vault 的內容塞入 Prompt，不僅會產生高昂的 **API Token 費用**，也會因為 **Needle in a Haystack (大海撈針效能衰退)** 問題，導致 LLM 無法精準找到需要的資訊。
  > 透過 RAG 架構，我們只精準檢索相關實體（Entity）的 Fact，將 Context 降到最小，達到成本與精準度的最佳平衡。」

### Q2：為什麼同時需要 Obsidian 又需要 SQLite？這不是重複了嗎？
* ❌ **不專業回答**：因為怕壞掉，存兩份比較安全。
*  **面試官最愛回答**：
  > 「這是一個**『冷熱資料分離』與『讀寫分離』**的經典實作。
  > **Obsidian (冷資料/備份層)**：負責長期儲存、人類可讀性、跨平台編輯（用手機或電腦 Obsidian 隨時打開看）。
  > **SQLite (熱資料/快取層)**：負責極致的讀取效能。如果每次查詢都要進行 File System 的 Regex 全文掃描，當筆記多達幾千篇時系統就會卡死。我們透過 SQLite 把檔案 metadata 與事實結構化，實現 $O(1)$ 或 $O(\log N)$ 的檢索速度。」

### Q3：如果 Obsidian 檔案在外部被使用者手動修改了，SQLite 怎麼同步？
*  **面試官最愛回答**：
  > 「我們在系統啟動時實作了**『啟動雙向校對機制 (Startup Sync / Reconcile Process)』**。
  > 系統啟動時會主動掃描 Obsidian Vault 中的 Markdown 檔案，解析其中的 YAML Frontmatter 與自訂的 Fact 區塊，重建 SQLite 索引。這確保了即使使用者手動在外部修改了 Obsidian 檔案，資料庫依然能保持最終一致性 (Eventual Consistency)。」

### Q4：由於 insertFact 是背景非同步執行的，如果多個並行任務同時寫入同一個實體檔案（例如 entities/mother.md），你如何防範競態條件 (Race Condition) 與檔案損毀？
*  **面試官最愛回答**：
  > 「這涉及到**『檔案寫入原子性 (Write Atomicity) 與非同步排隊鎖 (Async Mutex)』**的設計。
  > 我實作了一個全域非同步檔案鎖定器（`src/file-lock.js`），基於 `Map` 快取每個檔案絕對路徑的 Promise 鏈，以純 Node.js（不依賴任何外部 npm 套件）達成單執行緒環境下的非同步排隊機制（FIFO queue）。
  > 當多個 `insertFact` 或 `markFactsOutdated` 並行對同一個 Markdown 檔案操作時，它們會在該路徑的 Promise 鏈上排隊，前一個非同步 file I/O（`readFile`、`appendFile` 或 `writeFile`）執行完成並調用 `release()` 後，下一個任務才會被觸發。我們在關鍵的 file write 段落使用 `try...finally` 機制確保鎖必定釋放，從根本上杜絕了並行寫入交錯 (Interleaved Writes) 或 read-modify-write 的資料覆蓋衝突。」

### Q5：LLM 記憶提取太寬泛，導致許多日常廢話或情緒垃圾被存進 SQLite 與 Markdown，增加了 RAG 的雜訊，你如何解決這個問題？
*  **面試官最愛回答**：
  > 「我採用了**『嚴格的 LLM 作為裁判 (LLM as a Judge)』**的語意門檻控制。
  > 在 Gemini 的 `SYSTEM_INSTRUCTION` 中引入了極其嚴格的『黃金五大維度判定法（本人健康、本人工作、本人感情、本人重大資訊，以及家庭成員健康重大狀況）』。我們在 Prompt 中明確要求對一般閒聊、日常流水帳與情緒發洩進行『硬性裁定拒絕』。
  > 唯有完美契合這五大重大長期價值的事實，才會被標記為 `isFact = true`。透過在上游收窄提取閘門，從源頭保證了事實庫的純淨度與 RAG 檢索的高雜訊比 (Noise-to-Signal Ratio)。」

---
*祝你面試順利！帶著這份心法，你已經比 90% 只會套用現成 LlamaIndex 的人更懂底層架構了！*
