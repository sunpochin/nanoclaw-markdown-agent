import fs from 'fs/promises';
import path from 'path';

// 設定預設筆記存放目錄
const NOTES_DIR = path.resolve(process.cwd(), 'nanoclaw_notes');

/**
 * 確保筆記目錄存在，若不存在則建立
 */
export async function ensureNotesDirExists() {
  try {
    await fs.access(NOTES_DIR);
  } catch (error) {
    // 如果目錄不存在，建立它
    await fs.mkdir(NOTES_DIR, { recursive: true });
    console.log(`[NanoClaw] 已建立筆記目錄: ${NOTES_DIR}`);
  }
}

/**
 * 取得格式化的當前日期與時間 (YYYY-MM-DD 和 HH:mm:ss)
 */
function getCurrentDateTime() {
  const now = new Date();
  
  // 取得 YYYY-MM-DD 格式
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const dateStr = `${year}-${month}-${day}`;
  
  // 取得 HH:mm:ss 格式
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const timeStr = `${hours}:${minutes}:${seconds}`;
  
  return { dateStr, timeStr };
}

/**
 * 將內容寫入 Markdown 檔案，以日期為檔名，內容加上時間戳記
 * @param {string} content - 要記錄的內容
 */
export async function writeNote(content) {
  await ensureNotesDirExists();
  
  const { dateStr, timeStr } = getCurrentDateTime();
  const filePath = path.join(NOTES_DIR, `${dateStr}.md`);
  
  // 格式化寫入內容
  const formattedContent = `\n## [${timeStr}]\n${content}\n\n---\n`;
  
  try {
    // 使用 append 模式寫入檔案，若檔案不存在則自動建立
    await fs.appendFile(filePath, formattedContent, 'utf8');
    return { success: true, filePath, timestamp: `${dateStr} ${timeStr}` };
  } catch (error) {
    console.error(`[NanoClaw] 寫入筆記失敗:`, error);
    throw error;
  }
}

/**
 * 取得指定日期的筆記內容
 * @param {string} dateStr - YYYY-MM-DD 格式的日期字串
 */
export async function readNote(dateStr) {
  const filePath = path.join(NOTES_DIR, `${dateStr}.md`);
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return content;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null; // 檔案不存在
    }
    throw error;
  }
}

/**
 * 列出所有筆記檔案
 */
export async function listNotes() {
  await ensureNotesDirExists();
  try {
    const files = await fs.readdir(NOTES_DIR);
    // 過濾出 .md 結尾的檔案
    return files.filter(file => file.endsWith('.md'));
  } catch (error) {
    console.error(`[NanoClaw] 讀取目錄失敗:`, error);
    throw error;
  }
}
