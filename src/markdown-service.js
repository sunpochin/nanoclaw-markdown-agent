/**
 * =====================================================================
 * 🗃️ Obsidian 魔法畫筆記事盒管理員 (Markdown File System Service)
 * =====================================================================
 * 本服務負責管理 Obsidian 記事畫筆盒 (Vault Directory)。
 * 透過我們的小彩筆（File Writer）將溫馨亮晶晶的文字墨水畫進記事本裡。
 * 並用超整齊的「乖乖排隊魔法陣」讓筆記整整齊齊排好，絕不凌亂！
 * =====================================================================
 */
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';
import { acquireLock } from './file-lock.js';

// [技術] 載入環境變數配置
// [童趣] 魔法配方載入：把神奇的魔法粉末（環境變數）放進魔法小卡片儲藏箱裡！
dotenv.config();

// [技術] 取得 Obsidian Vault 目錄路徑，預設為專案目錄下的 obsidian_vault
// [童趣] 魔法記事本的路徑：定位我們的魔法故事書到底放在哪一個祕密基地！
const VAULT_DIR = path.resolve(process.cwd(), process.env.OBSIDIAN_VAULT_PATH || './obsidian_vault');

/**
 * [技術] 確保 Obsidian Vault 目錄存在，若不存在則自動遞迴建立
 * [童趣] 準備好書架：確保魔法記事盒是打開的，如果發現沒有這個小抽屜，就立刻親手做一個！
 */
export async function ensureVaultDirExists() {
  try {
    await fs.access(VAULT_DIR);
  } catch (error) {
    // [技術] 目錄不存在時，建立遞迴目錄
    // [童趣] 動手做抽屜：如果發現小抽屜沒有做出來，主動動動小手把它拼裝開闢好
    await fs.mkdir(VAULT_DIR, { recursive: true });
    console.log(`[Markdown/Vault] 已自動建立 Vault 目錄: ${VAULT_DIR}`);
  }
}

/**
 * [技術] 取得格式化的當前日期與時間 (YYYY-MM-DD 和 HH:mm:ss)
 * [童趣] 魔法時間沙漏：滴答滴答，記錄下我們現在寫下日記的神奇小時間！
 */
function getCurrentDateTime() {
  const now = new Date();
  
  // [技術] 格式化日期：YYYY-MM-DD
  // [童趣] 蓋上日期印章：在故事書頁面蓋上今天好玩的日期印章
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const dateStr = `${year}-${month}-${day}`;
  
  // [技術] 格式化時間：HH:mm:ss
  // [童趣] 畫上時鐘指針：精確記錄我們是在幾分幾秒寫完故事的
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const timeStr = `${hours}:${minutes}:${seconds}`;
  
  return { dateStr, timeStr };
}

/**
 * [技術] 將使用者指定的內容寫入每日 Markdown 檔案
 * [童趣] 畫筆塗鴉：把我們想記下來的悄悄話寫進小記事本的最後一頁！
 * @param {string} content - 要記錄的純文字內容
 * @returns {Promise<{success: boolean, filePath: string, timestamp: string}>}
 */
export async function writeNoteToMarkdown(content) {
  await ensureVaultDirExists();
  
  const { dateStr, timeStr } = getCurrentDateTime();
  const filePath = path.join(VAULT_DIR, `${dateStr}.md`);
  
  // [童趣] 乖乖排隊對齊魔法陣：第一行往前走，後續行數側身退後四步（縮排 4 格空白）防止亂七八糟溢出來
  const indentedContent = content
    .split('\n')
    .map((line, index) => {
      if (index === 0) return line; // 第一隻小動物，直接走到隊伍最前面
      return `    ${line}`;        // 後面的小動物側身退後四步，保證隊伍排得整整齊齊
    })
    .join('\n');
  
  // [技術] 建立符合 Obsidian Daily Notes 的格式樣式 (使用縮排防漏對齊後的內容)
  // [童趣] 裝飾魔法花邊：用小星星符號把我們排版好的小日記打扮得漂漂亮亮！
  const formattedContent = `\n## [${timeStr}] 📝 隨手記\n*   ${indentedContent}\n\n---\n`;
  
  // [技術] 引入檔案鎖確保並行追加的原子性與檔案安全
  // [童趣] 寫日記前，要拿著小鎖排隊進去寫喔，這樣才不會撞在一起打架！
  const release = await acquireLock(filePath);
  try {
    // [技術] 使用 append 模式追加內容，若檔案不存在則自動建立新檔
    // [童趣] 寫在最後面：把新的字體黏在筆記本的尾巴上，如果是本全新的書，會自動生出嶄新精美封面！
    await fs.appendFile(filePath, formattedContent, 'utf8');
    return { success: true, filePath, timestamp: `${dateStr} ${timeStr}` };
  } catch (error) {
    console.error(`[Markdown/Vault] 寫入筆記發生錯誤:`, error);
    throw error;
  } finally {
    release();
  }
}

/**
 * [技術] 讀取指定日期的 Markdown 筆記內容
 * [童趣] 翻看舊故事書：在小抽屜裡找找看指定日期的故事，如果書架上是空空的就搖搖頭回傳 null
 */
export async function readNotesForDay(dateStr) {
  const filePath = path.join(VAULT_DIR, `${dateStr}.md`);
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return content;
  } catch (error) {
    if (error.code === 'ENOENT') {
      // [技術] 檔案不存在，代表當天無紀錄
      // [童趣] 檔案不存在，代表當天無紀錄 (小抽屜空空如也，表示今天還沒有寫過任何好玩的事情喔)
      return null;
    }
    throw error;
  }
}

/**
 * [技術] 列出 Vault 中所有已存在的 Markdown 檔案
 * [童趣] 點點名小圖書：把我們寶箱裡所有的書拿出來，數數看有幾本結尾是 .md 的故事書！
 * @returns {Promise<string[]>} - 檔名陣列 (例如 ['2026-05-18.md'])
 */
export async function listAllNotes() {
  await ensureVaultDirExists();
  try {
    const files = await fs.readdir(VAULT_DIR);
    // [技術] 只篩選出以 .md 結尾的筆記檔案
    // [童趣] 挑選出 .md 小糖果：把那些奇形怪狀的雜質丟掉，只留下結尾是 .md 的魔法小餅乾！
    return files.filter(file => file.endsWith('.md'));
  } catch (error) {
    console.error(`[Markdown/Vault] 讀取目錄檔案清單失敗:`, error);
    throw error;
  }
}

/**
 * [技術] 搜尋本地 Vault 目錄下所有筆記是否含有指定關鍵字
 * [童趣] 祕密藏寶圖搜尋：在我們密密麻麻的故事本子裡，翻找包含指定神奇密碼（關鍵字）的句子！
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
        // [童趣] 用放大鏡挑出金幣：挑選出包含神奇密碼的那一行句子，把多餘的垃圾空白拍拍乾淨
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
 * [童趣] 翻閱上週故事大綱：把過去幾天寫下的魔法悄悄話拼湊在一起，變成一篇超棒的背景日記！
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
        // [童趣] 擦掉多餘黑板線：把粗粗的橫線（---）擦掉，只留下香噴噴的故事正文精華！
        const cleanedContent = content
          .replace(/---/g, '')
          .replace(/\n\s*\n/g, '\n')
          .trim();
        contextParts.push(`📅 【${dateStr} 歷史日記】\n${cleanedContent}`);
      }
    } catch (error) {
      // [技術] 容錯跳過不存在的日期
      // [童趣] 空白沒有寫字的天數，我們就輕輕地翻過去，不打擾它
    }
  }

  if (contextParts.length === 0) {
    return '（近期無任何隨手記紀錄）';
  }

  return contextParts.join('\n\n');
}

/**
 * [技術] 將蝴蝶效應模擬報告寫入當日 Markdown 筆記中，保留完整的 Markdown 標題結構
 * [童趣] 蝴蝶日記大變身：把小精靈精心推演出好玩的「如果那樣做會怎樣」模擬報告，畫到我們今天的日記本裡！
 * @param {string} scenario - 假設的情境
 * @param {string} reportContent - 模擬報告的內容
 * @returns {Promise<{success: boolean, filePath: string, timestamp: string}>}
 */
export async function writeSimulationReportToMarkdown(scenario, reportContent) {
  await ensureVaultDirExists();
  
  const { dateStr, timeStr } = getCurrentDateTime();
  const filePath = path.join(VAULT_DIR, `${dateStr}.md`);
  
  const formattedContent = `\n## [${timeStr}] 🦋 蝴蝶效應未來模擬：${scenario}\n${reportContent}\n\n---\n`;
  
  // [技術] 引入檔案鎖確保並行追加的原子性與檔案安全
  // [童趣] 蝴蝶日記變身前，也要乖乖排隊拿小鎖才可以動手喔！
  const release = await acquireLock(filePath);
  try {
    await fs.appendFile(filePath, formattedContent, 'utf8');
    return { success: true, filePath, timestamp: `${dateStr} ${timeStr}` };
  } catch (error) {
    console.error(`[Markdown/Vault] 寫入模擬報告發生錯誤:`, error);
    throw error;
  } finally {
    release();
  }
}

