/**
 * =====================================================================
 * 🧠💾 雙腦事實記憶庫 (Double-Brain Fact Memory Database)
 * =====================================================================
 * [技術] 本模組負責管理「Obsidian Vault（人類可讀）+ SQLite（機器高速索引）」雙腦架構。
 *        Obsidian Markdown 是唯一的事實來源 (Single Source of Truth)，
 *        SQLite 是純粹的高速搜尋引擎，兩者透過啟動時的同步協議保持一致。
 * [童趣] 歡迎來到魔法雙腦圖書館！左腦是給人類看的漂亮故事書架（Obsidian），
 *        右腦是給機器人用的超快魔法索引卡片盒（SQLite）。
 *        每次我們開啟圖書館，兩邊的書都會自動對齊，
 *        確保沒有任何故事書跑丟或跑錯地方！
 * =====================================================================
 */
import { DatabaseSync } from 'node:sqlite';
import fs from 'fs/promises';
import { mkdirSync } from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// [技術] 載入環境變數設定
// [童趣] 打開百寶箱，找出我們的魔法地圖（環境變數設定）
dotenv.config();

// [技術] SQLite 資料庫檔案存放路徑
// [童趣] 魔法卡片盒的家：索引卡片盒被妥善放在 data/ 小抽屜裡
const DB_PATH = path.resolve(process.cwd(), './data/facts.db');

// [技術] Obsidian Vault 根目錄，從環境變數讀取
// [童趣] 人類故事書架的位置：漂亮的 Obsidian 書架在哪裡呢？
const VAULT_DIR = path.resolve(process.cwd(), process.env.OBSIDIAN_VAULT_PATH || './nanoclaw_notes');

// [技術] 要掃描的 Vault 子目錄清單（事實區塊主要會存放在這些資料夾）
// [童趣] 掃描名單：我們要去哪幾個書架抽屜找事實糖果呢？
const SCAN_DIRS = ['entities', 'domains'];

// [技術] 使用模組層級的單例 DatabaseSync 實例，確保整個應用只有一個 DB 連線
// [童趣] 魔法卡片盒只開一個入口：全部的人都從同一扇門進去，不然卡片盒會打架
let db = null;

/**
 * [技術] 初始化 SQLite 資料庫連線、建立資料表與索引（若不存在則自動建立）
 * [童趣] 蓋好魔法卡片盒的抽屜格：第一次使用時，把所有需要的格子都準備好，以後放卡片就不用煩惱
 * @returns {DatabaseSync} 已初始化的 db 實例
 */
export function initDatabase() {
  if (db) return db; // 已初始化則直接回傳，避免重複開啟

  // [技術] 確保 data/ 目錄存在（DatabaseSync 不會自動建立目錄）
  // [童趣] 先確認抽屜所在的書桌有沒有存在，沒有就立刻打造一張！
  const dataDir = path.dirname(DB_PATH);
  mkdirSync(dataDir, { recursive: true });

  db = new DatabaseSync(DB_PATH);

  // [技術] 建立 facts 資料表（若不存在）
  // [童趣] 畫出卡片格線：幫魔法卡片定義好每一格要放什麼資訊
  db.exec(`
    CREATE TABLE IF NOT EXISTS facts (
      id TEXT PRIMARY KEY,
      entity_id TEXT NOT NULL,
      domain TEXT NOT NULL,
      date TEXT NOT NULL,
      claim TEXT NOT NULL,
      source TEXT NOT NULL,
      confidence TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'current',
      replaces TEXT,
      file_path TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_facts_entity ON facts (entity_id);
    CREATE INDEX IF NOT EXISTS idx_facts_domain ON facts (domain);
    CREATE INDEX IF NOT EXISTS idx_facts_status ON facts (status);
    CREATE INDEX IF NOT EXISTS idx_facts_entity_status ON facts (entity_id, status);
  `);

  console.log(`[MemoryDB] 🧠 雙腦卡片盒已初始化：${DB_PATH}`);
  return db;
}

/**
 * [技術] 產生不會碰撞的唯一 fact_id（timestamp + 隨機 5 碼英數字）
 * [童趣] 魔法編號機：每張卡片都有自己獨一無二的身份證號碼，絕對不會撞號！
 * @returns {string} 例如：fact_1748361741000_k9x3m
 */
export function generateFactId() {
  const randomPart = Math.random().toString(36).slice(2, 7);
  return `fact_${Date.now()}_${randomPart}`;
}

/**
 * [技術] 使用 Regex 從 Markdown 文字中解析出所有 fact 原子區塊，並進行 Schema 防護驗證
 * [童趣] 魔法放大鏡掃描：用特殊放大鏡掃描故事書，把所有被 <!-- fact_start --> 包住的小糖果卡片找出來
 *        找到之後還要一一驗證它們有沒有長對，長歪的就溫柔丟掉並發出警告！
 * @param {string} filePath - 來源 Markdown 檔案的相對路徑（用於 SQLite 定位）
 * @param {string} content - Markdown 檔案的文字內容
 * @returns {Array<object>} 解析成功且通過驗證的 fact 物件陣列
 */
export function parseFacts(filePath, content) {
  const results = [];

  // [技術] 主要 Regex：抓出所有 fact_start ... fact_end 區塊
  // [童趣] 魔法掃描光束：找出所有被糖果紙包起來的事實小糖果
  const factRegex = /<!-- fact_start id="([^"]+)" -->([\s\S]*?)<!-- fact_end -->/g;
  let match;

  while ((match = factRegex.exec(content)) !== null) {
    const factId = match[1];
    const blockContent = match[2];

    // [技術] 防護規則一：巢狀 HTML 偵測（區塊內不應有另一個 fact_start）
    // [童趣] 禁止糖果裡面又藏糖果：如果包裝紙裡面還有包裝紙，說明格式壞掉了，果斷丟掉！
    if (blockContent.includes('<!-- fact_start')) {
      console.warn(`[MemoryDB] ⚠️ [${filePath}] fact_id="${factId}" 發現巢狀 fact_start，格式損毀，跳過此區塊`);
      continue;
    }

    // [技術] 解析區塊中的每個欄位（Markdown 列表格式）
    // [童趣] 讀取卡片上的資訊：把糖果紙上的每一行說明文字讀出來
    const parsed = parseFactFields(blockContent);
    parsed.id = factId;
    parsed.file_path = filePath;

    // [技術] 防護規則二：必要欄位驗證
    // [童趣] 證件審查關卡：缺了身份證上的任何一格就不讓通過，補填後才能放行
    const requiredFields = ['entity_id', 'domain', 'date', 'claim', 'source', 'confidence'];
    const missingFields = requiredFields.filter(f => !parsed[f] || parsed[f].trim() === '');
    if (missingFields.length > 0) {
      console.warn(`[MemoryDB] ⚠️ [${filePath}] fact_id="${factId}" 缺少必要欄位：${missingFields.join(', ')}，跳過`);
      continue;
    }

    // [技術] 防護規則三：claim 長度上限（超過 2000 字元視為 Regex 誤匹配）
    // [童趣] 卡片不能寫太長：如果卡片上的故事超過 2000 字，一定是放大鏡拍到了錯誤的東西，丟掉！
    if (parsed.claim.length > 2000) {
      console.warn(`[MemoryDB] ⚠️ [${filePath}] fact_id="${factId}" claim 超過 2000 字元（${parsed.claim.length} 字），視為誤匹配，跳過`);
      continue;
    }

    results.push(parsed);
  }

  return results;
}

/**
 * [技術] 解析 fact 區塊內的 Markdown 列表欄位，轉為 key-value 物件
 * [童趣] 翻譯卡片文字：把「* **日期**: 2026-05-27」這樣的文字翻譯成 { date: '2026-05-27' }
 * @param {string} blockContent - fact_start 與 fact_end 之間的文字
 * @returns {object} 欄位對應物件
 */
function parseFactFields(blockContent) {
  // [技術] 中文欄位名稱到英文屬性的對應表
  // [童趣] 翻譯小字典：把中文欄位名稱翻譯成程式看得懂的英文屬性名稱
  const fieldMap = {
    '日期': 'date',
    '對象': 'entity_id',
    '領域': 'domain',
    '事實': 'claim',
    '來源': 'source',
    '可信': 'confidence',
    '狀態': 'status',
    '取代': 'replaces',
  };

  const result = {};
  const lines = blockContent.split('\n');

  for (const line of lines) {
    // [技術] 匹配「* **欄位名**: 值」格式
    // [童趣] 找到每一條說明：解讀「* **日期**: 2026-05-27」這樣的小標籤
    const m = line.match(/^\s*\*\s+\*\*([^*]+)\*\*:\s*(.+)$/);
    if (m) {
      const chineseKey = m[1].trim();
      const value = m[2].trim();
      const engKey = fieldMap[chineseKey];
      if (engKey) {
        result[engKey] = value;
      }
    }
  }

  // [技術] 確保 status 有預設值
  // [童趣] status 忘記寫的話，預設是 current（目前有效）
  if (!result.status) result.status = 'current';

  return result;
}

/**
 * [技術] 遞迴掃描目錄下所有 .md 檔案，回傳完整路徑陣列
 * [童趣] 魔法書架清點員：走進每個書架抽屜，把所有 .md 故事書的位置記下來
 * @param {string} dir - 要掃描的目錄路徑
 * @returns {Promise<string[]>} 所有 .md 檔案的完整路徑
 */
async function scanMarkdownFiles(dir) {
  const files = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // [技術] 遞迴掃描子目錄
        // [童趣] 走進更深的書架抽屜繼續找
        const subFiles = await scanMarkdownFiles(fullPath);
        files.push(...subFiles);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        files.push(fullPath);
      }
    }
  } catch (err) {
    // [技術] 目錄不存在時靜默跳過（例如 entities/ 尚未建立）
    // [童趣] 還沒造好的書架抽屜就跳過，不用擔心
    if (err.code !== 'ENOENT') {
      console.warn(`[MemoryDB] ⚠️ 掃描目錄失敗：${dir} — ${err.message}`);
    }
  }
  return files;
}

/**
 * [技術] 雙腦雙向同步協議：啟動時執行
 *   1. 掃描 Obsidian Vault → 解析所有 fact 區塊 → 新增/更新 SQLite
 *   2. 檢查 SQLite 內的孤兒記錄（在 Markdown 中已消失）→ 自動 DELETE
 * [童趣] 每日書架對齊儀式：開館的時候，小館員會把兩邊書架的卡片全部對比一遍，
 *        多的卡片自動補進去，消失的卡片自動從索引盒裡移除，
 *        確保每一張卡片都能在兩邊找到對應的位置！
 * @returns {Promise<{added: number, updated: number, deleted: number}>} 同步統計結果
 */
export async function syncObsidianToDatabase() {
  const database = initDatabase();
  console.log('[MemoryDB] 🔄 開始執行雙腦同步協議...');

  // [技術] 收集本次掃描到的所有 fact_id（用於後面找孤兒）
  // [童趣] 準備一個出席名單：掃描過程中把每張卡片的 ID 都記下來
  const scannedFactIds = new Set();
  let added = 0;
  let updated = 0;

  // [技術] 掃描根目錄下的每日日記 .md 以及指定子目錄
  // [童趣] 制定掃描路線：先去每日日記書架，再去 entities/ 和 domains/ 書架
  const allFiles = [];

  // 根目錄日記（例如 nanoclaw_notes/2026-05-27.md）
  try {
    const rootEntries = await fs.readdir(VAULT_DIR, { withFileTypes: true });
    for (const entry of rootEntries) {
      if (entry.isFile() && entry.name.endsWith('.md')) {
        allFiles.push(path.join(VAULT_DIR, entry.name));
      }
    }
  } catch (err) {
    if (err.code !== 'ENOENT') console.warn(`[MemoryDB] ⚠️ 掃描 Vault 根目錄失敗：${err.message}`);
  }

  // 指定子目錄
  for (const subDir of SCAN_DIRS) {
    const subPath = path.join(VAULT_DIR, subDir);
    const subFiles = await scanMarkdownFiles(subPath);
    allFiles.push(...subFiles);
  }

  console.log(`[MemoryDB] 📂 共發現 ${allFiles.length} 個 .md 檔案待掃描`);

  // [技術] 逐一讀取並解析每個 Markdown 檔案中的 fact 區塊
  // [童趣] 一本一本翻開故事書：仔細查看每本書裡有沒有藏著事實小糖果卡片
  for (const filePath of allFiles) {
    const relPath = path.relative(VAULT_DIR, filePath);
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const facts = parseFacts(relPath, content);

      for (const fact of facts) {
        scannedFactIds.add(fact.id);

        // [技術] 檢查此 fact_id 是否已在 SQLite 中
        // [童趣] 查查看卡片盒裡有沒有這張卡
        const existing = database.prepare('SELECT id, claim, status FROM facts WHERE id = ?').get(fact.id);

        if (!existing) {
          // [技術] 新增：Obsidian 裡有但 SQLite 裡沒有
          // [童趣] 發現新卡片！趕快把它複製一份放進索引卡片盒
          const now = Date.now();
          database.prepare(`
            INSERT INTO facts (id, entity_id, domain, date, claim, source, confidence, status, replaces, file_path, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            fact.id,
            fact.entity_id,
            fact.domain,
            fact.date,
            fact.claim,
            fact.source || 'user_report',
            fact.confidence || 'medium',
            fact.status,
            fact.replaces || null,
            fact.file_path,
            now,
            now
          );
          added++;
        } else if (existing.claim !== fact.claim || existing.status !== fact.status) {
          // [技術] 更新：Obsidian 裡的內容與 SQLite 不同（使用者手動編輯了 Obsidian）
          // [童趣] 故事書被改過了！把索引卡片上的舊字擦掉，換上新內容
          database.prepare(`
            UPDATE facts SET claim = ?, status = ?, updated_at = ? WHERE id = ?
          `).run(fact.claim, fact.status, Date.now(), fact.id);
          updated++;
        }
      }
    } catch (err) {
      console.warn(`[MemoryDB] ⚠️ 讀取/解析 ${relPath} 失敗：${err.message}`);
    }
  }

  // [技術] 清除孤兒記錄：SQLite 中存在但 Obsidian 已刪除的 fact
  // [童趣] 清除迷路的卡片：如果索引盒裡有張卡片，但故事書裡再也找不到它對應的糖果包裝，
  //        就把這張孤兒卡片從索引盒裡移除，保持兩邊一致乾淨！
  const allDbFacts = database.prepare('SELECT id FROM facts').all();
  let deleted = 0;

  for (const row of allDbFacts) {
    if (!scannedFactIds.has(row.id)) {
      database.prepare('DELETE FROM facts WHERE id = ?').run(row.id);
      deleted++;
      console.log(`[MemoryDB] 🗑️ 刪除孤兒 fact：${row.id}（Obsidian 中已不存在）`);
    }
  }

  console.log(`[MemoryDB] ✅ 雙腦同步完成！新增 ${added} 筆、更新 ${updated} 筆、刪除孤兒 ${deleted} 筆`);
  return { added, updated, deleted };
}

/**
 * [技術] 將一筆事實寫入指定的 Obsidian Entity Markdown 檔案（兩段提交第一步）
 *        並在 Obsidian 寫入成功後，才同步寫入 SQLite（兩段提交第二步）
 * [童趣] 先把新卡片資訊寫進故事書，確認寫好了，再把索引卡片放進卡片盒。
 *        這樣就算中途斷電，下次重啟同步時也能自動補回來，絕對不會遺失！
 * @param {object} factData - 事實資料物件（含 entity_id, domain, date, claim, source, confidence, replaces?）
 * @returns {Promise<{factId: string, filePath: string}>}
 */
export async function insertFact(factData) {
  const database = initDatabase();

  // [技術] 產生唯一 fact_id
  // [童趣] 先為這張新卡片取一個獨一無二的名字
  const factId = generateFactId();
  const now = new Date();
  const dateStr = factData.date || now.toISOString().slice(0, 10);

  // [技術] 決定寫入哪個 Markdown 檔案
  // [童趣] 決定把新卡片資訊寫進哪本故事書：有對應對象的寫進對象書，沒有的就寫在今天的日記
  const filePath = resolveEntityFilePath(factData.entity_id, dateStr);
  const absFilePath = path.join(VAULT_DIR, filePath);

  // [技術] 組合 Markdown fact 區塊文字
  // [童趣] 把卡片資訊打扮成漂亮的 Markdown 格式，準備寫進故事書
  const factBlock = formatFactBlock(factId, factData, dateStr);

  // === 兩段提交第一步：先寫 Obsidian ===
  // [童趣] 第一步：先在故事書上寫下新資訊，確認寫好了才繼續
  await fs.mkdir(path.dirname(absFilePath), { recursive: true });
  await fs.appendFile(absFilePath, factBlock, 'utf8');
  console.log(`[MemoryDB] 📝 事實已寫入 Obsidian：${filePath}`);

  // === 兩段提交第二步：Obsidian 成功後才寫 SQLite ===
  // [童趣] 第二步：故事書寫好了，現在把索引卡片也補進卡片盒裡
  const nowMs = Date.now();
  database.prepare(`
    INSERT INTO facts (id, entity_id, domain, date, claim, source, confidence, status, replaces, file_path, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    factId,
    factData.entity_id,
    factData.domain || 'general',
    dateStr,
    factData.claim,
    factData.source || 'user_report',
    factData.confidence || 'medium',
    'current',
    factData.replaces ? JSON.stringify(factData.replaces) : null,
    filePath,
    nowMs,
    nowMs
  );

  // [技術] 若有 replaces 欄位，自動將被取代的舊事實標記為 outdated
  // [童趣] 如果這張新卡片說「我要取代舊卡片 XXX」，就把舊卡片蓋上「已過期」印章
  if (factData.replaces && Array.isArray(factData.replaces) && factData.replaces.length > 0) {
    await markFactsOutdated(factData.replaces);
  }

  console.log(`[MemoryDB] ✅ 事實已同步至 SQLite：${factId}`);
  return { factId, filePath };
}

/**
 * [技術] 根據 entity_id 決定寫入哪個 Markdown 檔案路徑（相對路徑）
 * [童趣] 找書的地址：根據事實的對象，判斷要把資訊寫進哪本故事書
 * @param {string} entityId - 事實對象 ID（如 person_mother, global）
 * @param {string} dateStr - 當前日期字串 YYYY-MM-DD
 * @returns {string} 相對於 VAULT_DIR 的檔案路徑
 */
function resolveEntityFilePath(entityId, dateStr) {
  if (!entityId || entityId === 'global') {
    // [童趣] 沒有特定對象的事實，放進今天的日記頁
    return `${dateStr}.md`;
  }

  // [技術] person_XXX → entities/XXX.md；其他前綴 → domains/XXX.md
  // [童趣] 有名字的對象：person_mother → 放進 entities/mother.md
  const parts = entityId.split('_');
  const prefix = parts[0];
  const name = parts.slice(1).join('_');

  if (prefix === 'person' && name) {
    return `entities/${name}.md`;
  } else if (name) {
    return `domains/${entityId}.md`;
  }

  // [童趣] 實在找不到合適書架，就放今天的日記
  return `${dateStr}.md`;
}

/**
 * [技術] 將 factData 格式化為標準 Markdown fact 區塊字串
 * [童趣] 打扮新卡片：把所有資訊穿上漂亮的 Markdown 制服，看起來整整齊齊
 * @param {string} factId - 唯一 fact_id
 * @param {object} factData - 事實資料物件
 * @param {string} dateStr - 日期字串
 * @returns {string} 格式化好的 Markdown 區塊
 */
function formatFactBlock(factId, factData, dateStr) {
  const lines = [
    ``,
    `<!-- fact_start id="${factId}" -->`,
    `* **日期**: ${dateStr}`,
    `* **對象**: ${factData.entity_id || 'global'}`,
    `* **領域**: ${factData.domain || 'general'}`,
    `* **事實**: ${factData.claim}`,
    `* **來源**: ${factData.source || 'user_report'}`,
    `* **可信**: ${factData.confidence || 'medium'}`,
    `* **狀態**: current`,
  ];

  if (factData.replaces && factData.replaces.length > 0) {
    lines.push(`* **取代**: ${factData.replaces.join(', ')}`);
  }

  lines.push(`<!-- fact_end -->`);
  lines.push(``);

  return lines.join('\n');
}

/**
 * [技術] 高速 SQLite 事實查詢，支援關鍵字 LIKE 模糊比對 + entity_id 與 status 篩選
 * [童趣] 魔法索引卡搜尋：在超快的卡片盒裡，用關鍵字找出所有匹配的事實卡片
 * @param {string} query - 要搜尋的關鍵字
 * @param {string|null} entityId - 篩選特定對象（null 則搜全部）
 * @param {string} status - 篩選狀態（'current'、'outdated'、或 'all'）
 * @returns {Array<object>} 符合條件的事實陣列
 */
export function searchFacts(query, entityId = null, status = 'current') {
  const database = initDatabase();

  // [技術] 動態組合 SQL 查詢條件
  // [童趣] 組合搜尋咒語：根據要找什麼，動態拼出最精準的魔法搜尋語句
  const conditions = [];
  const params = [];

  if (query && query.trim()) {
    conditions.push('claim LIKE ?');
    params.push(`%${query.trim()}%`);
  }

  if (entityId) {
    conditions.push('entity_id = ?');
    params.push(entityId);
  }

  if (status !== 'all') {
    conditions.push('status = ?');
    params.push(status);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const sql = `SELECT * FROM facts ${whereClause} ORDER BY date DESC LIMIT 50`;

  return database.prepare(sql).all(...params);
}

/**
 * [技術] 將指定的 fact_id 陣列標記為 outdated（在 SQLite 與 Obsidian Markdown 中同步更新）
 * [童趣] 蓋上「已過期」印章：找到被取代的舊卡片，在索引盒和故事書兩邊都蓋上紅色過期印章！
 * @param {string[]} factIds - 要標記為 outdated 的 fact_id 陣列
 */
export async function markFactsOutdated(factIds) {
  const database = initDatabase();

  for (const factId of factIds) {
    // [技術] 先從 SQLite 找出此 fact 的 file_path
    // [童趣] 先查卡片盒，找出這張舊卡片在哪本故事書裡
    const row = database.prepare('SELECT file_path, status FROM facts WHERE id = ?').get(factId);

    if (!row) {
      console.warn(`[MemoryDB] ⚠️ 找不到 fact_id="${factId}"，無法標記為 outdated`);
      continue;
    }

    if (row.status === 'outdated') {
      // [童趣] 已經蓋過印章了，不用重複蓋
      continue;
    }

    // [技術] 更新 Obsidian Markdown 中該 fact 區塊的狀態欄位
    // [童趣] 在故事書上把「狀態: current」改成「狀態: outdated」
    const absFilePath = path.join(VAULT_DIR, row.file_path);
    try {
      let fileContent = await fs.readFile(absFilePath, 'utf8');

      // [技術] 只在該 fact 區塊內替換 status，使用非貪婪匹配精準定位
      // [童趣] 精準改字：只改這張卡片的狀態，不要把其他卡片的狀態也改掉了
      const blockRegex = new RegExp(
        `(<!-- fact_start id="${factId}" -->)[\\s\\S]*?(<!-- fact_end -->)`,
        'g'
      );
      fileContent = fileContent.replace(blockRegex, (match) => {
        return match.replace(/(\* \*\*狀態\*\*: )current/, '$1outdated');
      });

      await fs.writeFile(absFilePath, fileContent, 'utf8');
    } catch (err) {
      console.warn(`[MemoryDB] ⚠️ 無法更新 Obsidian 中的 status：${row.file_path} — ${err.message}`);
    }

    // [技術] 更新 SQLite 中的 status
    // [童趣] 同步在索引卡片盒裡也蓋上過期印章
    database.prepare('UPDATE facts SET status = ?, updated_at = ? WHERE id = ?').run('outdated', Date.now(), factId);
    console.log(`[MemoryDB] 🔄 fact_id="${factId}" 已標記為 outdated`);
  }
}

/**
 * [技術] 取得所有事實的統計資訊（用於診斷與 debug）
 * [童趣] 卡片盒健康報告：數一數我們卡片盒裡有多少張卡片，current 和 outdated 各有幾張
 * @returns {object} 統計資料
 */
export function getDatabaseStats() {
  const database = initDatabase();
  const total = database.prepare('SELECT COUNT(*) as count FROM facts').get().count;
  const current = database.prepare("SELECT COUNT(*) as count FROM facts WHERE status = 'current'").get().count;
  const outdated = database.prepare("SELECT COUNT(*) as count FROM facts WHERE status = 'outdated'").get().count;
  const byEntity = database.prepare("SELECT entity_id, COUNT(*) as count FROM facts GROUP BY entity_id ORDER BY count DESC").all();

  return { total, current, outdated, byEntity };
}
