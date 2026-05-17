import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';

// 載入環境變數配置
dotenv.config();

// 取得 Obsidian Vault 目錄路徑，預設為專案目錄下的 obsidian_vault
const VAULT_DIR = path.resolve(process.cwd(), process.env.OBSIDIAN_VAULT_PATH || './obsidian_vault');

/**
 * 確保 Obsidian Vault 目錄存在，若不存在則自動遞迴建立
 */
export async function ensureVaultDirExists() {
  try {
    await fs.access(VAULT_DIR);
  } catch (error) {
    // 目錄不存在時，建立遞迴目錄
    await fs.mkdir(VAULT_DIR, { recursive: true });
    console.log(`[Markdown/Vault] 已自動建立 Vault 目錄: ${VAULT_DIR}`);
  }
}

/**
 * 取得格式化的當前日期與時間 (YYYY-MM-DD 和 HH:mm:ss)
 */
function getCurrentDateTime() {
  const now = new Date();
  
  // 格式化日期：YYYY-MM-DD
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const dateStr = `${year}-${month}-${day}`;
  
  // 格式化時間：HH:mm:ss
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const timeStr = `${hours}:${minutes}:${seconds}`;
  
  return { dateStr, timeStr };
}

/**
 * 將使用者指定的內容寫入每日 Markdown 檔案
 * @param {string} content - 要記錄的純文字內容
 * @returns {Promise<{success: boolean, filePath: string, timestamp: string}>}
 */
export async function writeNoteToMarkdown(content) {
  await ensureVaultDirExists();
  
  const { dateStr, timeStr } = getCurrentDateTime();
  const filePath = path.join(VAULT_DIR, `${dateStr}.md`);
  
  // 建立符合 Obsidian Daily Notes 的格式樣式
  const formattedContent = `\n## [${timeStr}] 📝 隨手記\n*   ${content}\n\n---\n`;
  
  try {
    // 使用 append 模式追加內容，若檔案不存在則自動建立新檔
    await fs.appendFile(filePath, formattedContent, 'utf8');
    return { success: true, filePath, timestamp: `${dateStr} ${timeStr}` };
  } catch (error) {
    console.error(`[Markdown/Vault] 寫入筆記發生錯誤:`, error);
    throw error;
  }
}

/**
 * 讀取指定日期的 Markdown 筆記內容
 * @param {string} dateStr - 格式為 YYYY-MM-DD 的日期字串
 * @returns {Promise<string|null>} - 傳回筆記內容，若無此筆記則傳回 null
 */
export async function readNotesForDay(dateStr) {
  const filePath = path.join(VAULT_DIR, `${dateStr}.md`);
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return content;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null; // 檔案不存在，代表當天無紀錄
    }
    throw error;
  }
}

/**
 * 列出 Vault 中所有已存在的 Markdown 檔案
 * @returns {Promise<string[]>} - 檔名陣列 (例如 ['2026-05-18.md'])
 */
export async function listAllNotes() {
  await ensureVaultDirExists();
  try {
    const files = await fs.readdir(VAULT_DIR);
    // 只篩選出以 .md 結尾的筆記檔案
    return files.filter(file => file.endsWith('.md'));
  } catch (error) {
    console.error(`[Markdown/Vault] 讀取目錄檔案清單失敗:`, error);
    throw error;
  }
}
