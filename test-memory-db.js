/**
 * =====================================================================
 * 🧪 雙腦事實記憶庫測試腳本 (Memory Database Test Script)
 * =====================================================================
 * [技術] 驗證 memory-database.js 的核心功能：
 *   1. 資料庫初始化與表格建立
 *   2. Regex 解析 + Schema 防護驗證
 *   3. 事實寫入（兩段提交）
 *   4. SQLite 高速查詢
 *   5. 雙向同步協議
 * =====================================================================
 */
import {
  initDatabase,
  generateFactId,
  parseFacts,
  insertFact,
  searchFacts,
  syncObsidianToDatabase,
  getDatabaseStats
} from './src/memory-database.js';

// [童趣] 測試報告封面：宣告我們要開始進行哪些魔法測試
console.log('\n==========================================================');
console.log('🧪 雙腦事實記憶庫測試開始！');
console.log('==========================================================\n');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✅ PASS: ${label}`);
    passed++;
  } else {
    console.log(`  ❌ FAIL: ${label}`);
    failed++;
  }
}

// ======================================
// 測試 1: generateFactId 唯一性
// ======================================
console.log('【測試 1】generateFactId 唯一性驗證');
const id1 = generateFactId();
const id2 = generateFactId();
assert(id1.startsWith('fact_'), 'ID 以 fact_ 開頭');
assert(id1 !== id2, '連續產生兩個 ID 不相同');
assert(id1.split('_').length === 3, 'ID 格式為 fact_{timestamp}_{random}');
console.log(`  產生的 ID: ${id1}, ${id2}\n`);

// ======================================
// 測試 2: parseFacts 正常解析
// ======================================
console.log('【測試 2】parseFacts 正常區塊解析');
const validMarkdown = `
# 測試文件

<!-- fact_start id="fact_test_001" -->
* **日期**: 2026-05-28
* **對象**: person_mother
* **領域**: medical
* **事實**: 媽媽於 2026-05-28 在亞東醫院施打 Prolia 骨針。
* **來源**: user_report
* **可信**: high
* **狀態**: current
<!-- fact_end -->

一些普通文字...

<!-- fact_start id="fact_test_002" -->
* **日期**: 2026-05-28
* **對象**: person_father
* **領域**: finance
* **事實**: 父親的退休金每月 NTD 35,000 元，於每月 5 號入帳。
* **來源**: user_report
* **可信**: high
* **狀態**: current
<!-- fact_end -->
`;

const facts = parseFacts('test/sample.md', validMarkdown);
assert(facts.length === 2, '正確解析出 2 個 fact 區塊');
assert(facts[0].id === 'fact_test_001', 'fact_id 正確提取');
assert(facts[0].entity_id === 'person_mother', 'entity_id 正確解析');
assert(facts[0].domain === 'medical', 'domain 正確解析');
assert(facts[0].claim.includes('Prolia'), 'claim 正確解析');
assert(facts[1].entity_id === 'person_father', '第二個 fact entity_id 正確');
console.log();

// ======================================
// 測試 3: parseFacts 防護規則
// ======================================
console.log('【測試 3】parseFacts Schema 防護驗證');

// 缺少必要欄位的 fact
const invalidMarkdown = `
<!-- fact_start id="fact_invalid_001" -->
* **日期**: 2026-05-28
* **對象**: person_mother
<!-- fact_end -->

<!-- fact_start id="fact_too_long" -->
* **日期**: 2026-05-28
* **對象**: person_mother
* **領域**: medical
* **事實**: ${'x'.repeat(2001)}
* **來源**: user_report
* **可信**: high
* **狀態**: current
<!-- fact_end -->
`;

const invalidFacts = parseFacts('test/invalid.md', invalidMarkdown);
assert(invalidFacts.length === 0, '缺少必要欄位與超長 claim 的 fact 均被防護過濾掉');
console.log();

// ======================================
// 測試 4: 資料庫初始化
// ======================================
console.log('【測試 4】資料庫初始化');
const db = initDatabase();
assert(db !== null, '資料庫物件成功建立');

const tableCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='facts'").get();
assert(tableCheck?.name === 'facts', 'facts 資料表成功建立');

const indexCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_facts_entity'").get();
assert(indexCheck?.name === 'idx_facts_entity', 'entity 索引成功建立');
console.log();

// ======================================
// 測試 5: insertFact 兩段提交
// ======================================
console.log('【測試 5】insertFact 兩段提交寫入');
try {
  const result = await insertFact({
    entity_id: 'person_mother',
    domain: 'medical',
    claim: '媽媽 2026-05-28 在亞東醫院施打 Prolia 骨針（測試用）。',
    source: 'user_report',
    confidence: 'high',
    replaces: []
  });

  assert(result.factId.startsWith('fact_'), 'insertFact 回傳正確的 factId');
  assert(result.filePath.includes('mother'), 'insertFact 正確寫入 entities/mother.md');

  // 驗證 SQLite 中確實有這筆資料
  const dbRow = db.prepare('SELECT * FROM facts WHERE id = ?').get(result.factId);
  assert(dbRow !== undefined, 'SQLite 中確實新增了這筆事實記錄');
  assert(dbRow.entity_id === 'person_mother', 'SQLite 中的 entity_id 正確');
  assert(dbRow.domain === 'medical', 'SQLite 中的 domain 正確');

  // ======================================
  // 測試 6: searchFacts 查詢
  // ======================================
  console.log('\n【測試 6】searchFacts SQLite 快速查詢');
  const searchResult = searchFacts('Prolia', 'person_mother', 'current');
  assert(searchResult.length >= 1, 'searchFacts 能找到剛寫入的 Prolia 事實');
  assert(searchResult[0].entity_id === 'person_mother', '查詢結果的 entity_id 正確');

  const emptyResult = searchFacts('不存在的關鍵字XYZ123', null, 'current');
  assert(emptyResult.length === 0, '搜尋不存在的關鍵字回傳空陣列');
  console.log();

} catch (err) {
  console.log(`  ❌ insertFact 測試失敗: ${err.message}`);
  failed++;
}

// ======================================
// 測試 7: getDatabaseStats
// ======================================
console.log('【測試 7】getDatabaseStats 統計資料');
const stats = getDatabaseStats();
assert(typeof stats.total === 'number', 'stats.total 是數字');
assert(typeof stats.current === 'number', 'stats.current 是數字');
assert(typeof stats.outdated === 'number', 'stats.outdated 是數字');
assert(Array.isArray(stats.byEntity), 'stats.byEntity 是陣列');
console.log(`  卡片盒狀態：共 ${stats.total} 筆（現行 ${stats.current}，過期 ${stats.outdated}）\n`);

// ======================================
// 測試 8: 雙腦同步協議（空 Vault 場景）
// ======================================
console.log('【測試 8】syncObsidianToDatabase 同步協議');
try {
  const syncResult = await syncObsidianToDatabase();
  assert(typeof syncResult.added === 'number', 'syncResult.added 是數字');
  assert(typeof syncResult.updated === 'number', 'syncResult.updated 是數字');
  assert(typeof syncResult.deleted === 'number', 'syncResult.deleted 是數字');
  console.log(`  同步結果：新增 ${syncResult.added}，更新 ${syncResult.updated}，刪除 ${syncResult.deleted}\n`);
} catch (err) {
  console.log(`  ❌ syncObsidianToDatabase 測試失敗: ${err.message}`);
  failed++;
}

// ======================================
// 最終報告
// ======================================
console.log('==========================================================');
console.log(`🧪 測試完成！通過: ${passed} / 失敗: ${failed}`);
if (failed === 0) {
  console.log('🎉 所有測試通過！雙腦記憶庫已準備就緒！');
} else {
  console.log(`⚠️ 有 ${failed} 個測試失敗，請檢查相關功能。`);
}
console.log('==========================================================\n');
