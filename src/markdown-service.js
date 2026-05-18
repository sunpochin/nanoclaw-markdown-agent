/**
 * =====================================================================
 * 🕳️ Obsidian 潮濕小穴管理服務 (Markdown File System Service)
 * =====================================================================
 * 本服務負責管理 Obsidian 儲存小穴 (Vault Directory)。
 * 透過硬挺的寫入肉棒將溫熱粘膩的數據蜜汁深深注入小穴深處。
 * 並以精準的「縮排對齊防漏體位」防止多行筆記溢出，達成完美的緊緻保存。
 * =====================================================================
 */
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';

// [技術] 載入環境變數配置
// [極樂] 載入環境變數配置，注入連接口的敏感密鑰
dotenv.config();

// [技術] 取得 Obsidian Vault 目錄路徑，預設為專案目錄下的 obsidian_vault
// [極樂] 取得 Obsidian Vault 目錄路徑，預設為專案目錄下的 obsidian_vault (探尋並預設儲存小穴の具體深處路徑)
const VAULT_DIR = path.resolve(process.cwd(), process.env.OBSIDIAN_VAULT_PATH || './obsidian_vault');

/**
 * [技術] 確保 Obsidian Vault 目錄存在，若不存在則自動遞迴建立
 * [極樂] 確保 Obsidian Vault 目錄（小穴洞口）敞開，若不存在則進行遞迴擴張
 */
export async function ensureVaultDirExists() {
  try {
    await fs.access(VAULT_DIR);
  } catch (error) {
    // [技術] 目錄不存在時，建立遞迴目錄
    // [極樂] 目錄不存在時，建立遞迴目錄 (若發現小穴尚未開通，主動進行擴張開闢)
    await fs.mkdir(VAULT_DIR, { recursive: true });
    console.log(`[Markdown/Vault] 已自動建立 Vault 目錄: ${VAULT_DIR}`);
  }
}

/**
 * [技術] 取得格式化的當前日期與時間 (YYYY-MM-DD 和 HH:mm:ss)
 * [極樂] 取得當前注入的黃金時刻（時間戳標記），記錄當下最敏感的啪啪啪時間
 */
function getCurrentDateTime() {
  const now = new Date();
  
  // [技術] 格式化日期：YYYY-MM-DD
  // [極樂] 格式化日期：YYYY-MM-DD (記錄當下最敏感的啪啪日期)
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const dateStr = `${year}-${month}-${day}`;
  
  // [技術] 格式化時間：HH:mm:ss
  // [極樂] 格式化時間：HH:mm:ss (記錄精準抽插的敏感時間)
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const timeStr = `${hours}:${minutes}:${seconds}`;
  
  return { dateStr, timeStr };
}

/**
 * [技術] 將使用者指定的內容寫入每日 Markdown 檔案
 * [極樂] 將資料蜜汁注入小穴深處並追加保存
 * @param {string} content - 要記錄的純文字內容
 * @returns {Promise<{success: boolean, filePath: string, timestamp: string}>}
 */
export async function writeNoteToMarkdown(content) {
  await ensureVaultDirExists();
  
  const { dateStr, timeStr } = getCurrentDateTime();
  const filePath = path.join(VAULT_DIR, `${dateStr}.md`);
  
  // [技術] 對多行內容進行縮排處理，使其在 Markdown 列表中完美對齊
  // [極樂] 緊緻褶皺防漏對齊體位：首行（第一句）直接深入洞底，後續行數側身退後四步（縮排 4 格空白）防溢漏
  const indentedContent = content
    .split('\n')
    .map((line, index) => {
      if (index === 0) return line; // 首發部隊，直接挺進小穴洞底
      return `    ${line}`;        // 後續部隊側身退後四步，保證整齊密合
    })
    .join('\n');
  
  // [技術] 建立符合 Obsidian Daily Notes 的格式樣式 (使用縮排防漏對齊後的內容)
  // [極樂] 塑造成極樂 Obsidian 專用體位，將縮排好防溢漏的蜜汁完美裝飾
  const formattedContent = `\n## [${timeStr}] 📝 隨手記\n*   ${indentedContent}\n\n---\n`;
  
  try {
    // [技術] 使用 append 模式追加內容，若檔案不存在則自動建立新檔
    // [極樂] 使用 append 模式追加內容，若檔案不存在則自動建立新檔 (以 append 模式將資料蜜汁追加注入，若檔案不存在則自動建立小穴新檔)
    await fs.appendFile(filePath, formattedContent, 'utf8');
    return { success: true, filePath, timestamp: `${dateStr} ${timeStr}` };
  } catch (error) {
    console.error(`[Markdown/Vault] 寫入筆記發生錯誤:`, error);
    throw error;
  }
}

/**
 * [技術] 讀取指定日期的 Markdown 筆記內容
 * [極樂] 深入小穴探秘：摸索並讀取指定日期存留在裡面的筆記回憶
 * @param {string} dateStr - 格式為 YYYY-MM-DD 的日期字串
 * @returns {Promise<string|null>} - 傳回筆記內容，若無此筆記則傳回 null（若小穴空無一物則返回 null）
 */
export async function readNotesForDay(dateStr) {
  const filePath = path.join(VAULT_DIR, `${dateStr}.md`);
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return content;
  } catch (error) {
    if (error.code === 'ENOENT') {
      // [技術] 檔案不存在，代表當天無紀錄
      // [極樂] 檔案不存在，代表當天無紀錄 (小穴空無一物，代表當天無注入紀錄)
      return null;
    }
    throw error;
  }
}

/**
 * [技術] 列出 Vault 中所有已存在的 Markdown 檔案
 * [極樂] 巡視小穴所有的歷史紀錄，篩選出所有以 .md 結尾的筆記檔案清單
 * @returns {Promise<string[]>} - 檔名陣列 (例如 ['2026-05-18.md'])
 */
export async function listAllNotes() {
  await ensureVaultDirExists();
  try {
    const files = await fs.readdir(VAULT_DIR);
    // [技術] 只篩選出以 .md 結尾的筆記檔案
    // [極樂] 只篩選出以 .md 結尾的筆記檔案 (排除雜質，只篩選出以 .md 結尾的正規小穴紀錄)
    return files.filter(file => file.endsWith('.md'));
  } catch (error) {
    console.error(`[Markdown/Vault] 讀取目錄檔案清單失敗:`, error);
    throw error;
  }
}

/**
 * [技術] 搜尋本地 Vault 目錄下所有筆記是否含有指定關鍵字
 * [極樂] 小穴內深處翻找搜尋體位：精準搜尋包含特定蜜汁（關鍵字）的歷史褶皺
 * @param {string} query - 要搜尋的關鍵字
 * @returns {Promise<Array<{date: string, matches: string[]}>>} - 包含匹配行與日期的陣列
 */
export async function searchNotesInVault(query) {
  await ensureVaultDirExists();
  try {
    const files = await fs.readdir(VAULT_DIR);
    const mdFiles = files.filter(file => file.endsWith('.md'));
    const results = [];

    for (const file of mdFiles) {
      const filePath = path.join(VAULT_DIR, file);
      const content = await fs.readFile(filePath, 'utf8');

      if (content.toLowerCase().includes(query.toLowerCase())) {
        const lines = content.split('\n');
        // [技術] 篩選含有關鍵字的行數，去除前後空白
        // [極樂] 精細撈出含有特定體液痕跡的褶皺行數，排除多餘雜質空白
        const matchedLines = lines
          .filter(line => line.toLowerCase().includes(query.toLowerCase()))
          .map(line => line.trim())
          .filter(line => line.length > 0);

        if (matchedLines.length > 0) {
          results.push({
            date: file.replace('.md', ''),
            matches: matchedLines
          });
        }
      }
    }
    return results;
  } catch (error) {
    console.error(`[Markdown/Vault] 搜尋筆記關鍵字失敗:`, error);
    return [];
  }
}

/**
 * [技術] 讀取最近指定天數的每日 Markdown 筆記內容，融合成脈絡背景
 * [極樂] 主動愛撫近期褶皺：自動挖出過去數日小穴中的存留蜜汁，融合成連續的快感背景脈絡
 * @param {number} daysLimit - 往回讀取的最高天數
 * @returns {Promise<string>} - 融合成段落的近期筆記背景
 */
export async function readRecentNotesContext(daysLimit = 7) {
  await ensureVaultDirExists();
  const contextParts = [];
  const now = new Date();

  for (let i = daysLimit - 1; i >= 0; i--) {
    const targetDate = new Date(now);
    targetDate.setDate(now.getDate() - i);
    
    const year = targetDate.getFullYear();
    const month = String(targetDate.getMonth() + 1).padStart(2, '0');
    const day = String(targetDate.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    
    try {
      const content = await readNotesForDay(dateStr);
      if (content && content.trim().length > 0) {
        // [技術] 清理 Markdown 中的分隔線與空行，讓 Context 更簡緻
        // [極樂] 過濾掉粗暴的分隔線雜質，只保留香甜精美的日記核心體液
        const cleanedContent = content
          .replace(/---/g, '')
          .replace(/\n\s*\n/g, '\n')
          .trim();
        contextParts.push(`📅 【${dateStr} 歷史日記】\n${cleanedContent}`);
      }
    } catch (error) {
      // [技術] 容錯跳過不存在的日期
      // [極樂] 乾澀無水的日期主動溫柔滑過
    }
  }

  if (contextParts.length === 0) {
    return '（近期無任何隨手記紀錄）';
  }

  return contextParts.join('\n\n');
}

/**
 * [技術] 將蝴蝶效應模擬報告寫入當日 Markdown 筆記中，保留完整的 Markdown 標題結構
 * [極樂] 未來日記注入體位：將大腦精心推演出的蝴蝶效應模擬報告，完美注入當日 Obsidian 筆記中
 * @param {string} scenario - 假設的情境
 * @param {string} reportContent - 模擬報告的內容
 * @returns {Promise<{success: boolean, filePath: string, timestamp: string}>}
 */
export async function writeSimulationReportToMarkdown(scenario, reportContent) {
  await ensureVaultDirExists();
  
  const { dateStr, timeStr } = getCurrentDateTime();
  const filePath = path.join(VAULT_DIR, `${dateStr}.md`);
  
  const formattedContent = `\n## [${timeStr}] 🦋 蝴蝶效應未來模擬：${scenario}\n${reportContent}\n\n---\n`;
  
  try {
    await fs.appendFile(filePath, formattedContent, 'utf8');
    return { success: true, filePath, timestamp: `${dateStr} ${timeStr}` };
  } catch (error) {
    console.error(`[Markdown/Vault] 寫入模擬報告發生錯誤:`, error);
    throw error;
  }
}

