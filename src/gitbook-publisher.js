/**
 * =====================================================================
 * 🚀 GitBook GitOps 同步引擎 (GitBook GitOps Publisher)
 * =====================================================================
 * [技術] 負責維護本地 GitBook 資料夾結構與 `SUMMARY.md` 目錄大綱。
 *        自動將 AI 樂評寫入指定位置，自動更新目錄索引，最後透過
 *        `git add/commit/push` 對當前分支進行推送，觸發 GitBook 的 GitHub Sync 機制。
 * [童趣] GitBook 故事書分發盒：把寫好的音樂故事書，整整齊齊收進 GitBook 小抽屜，
 *        排好目錄，再呼叫小郵差送到 GitHub 雲端大本營，讓大家都能看到！
 * =====================================================================
 */
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';
import util from 'util';

const execFilePromise = util.promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 定義本地 GitBook 目錄路徑 (存放於專案根目錄的 gitbook 目錄)
const GITBOOK_DIR = path.join(__dirname, '../gitbook');
const RELEASES_DIR = path.join(GITBOOK_DIR, 'new-releases');
const SUMMARY_PATH = path.join(GITBOOK_DIR, 'SUMMARY.md');

/**
 * 輔助函式：將字串轉為 URL 友善的 Slug 格式
 */
function generateSlug(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')           // 將空白換成 -
    .replace(/[^\w\-\u4e00-\u9fa5]+/g, '') // 只保留英文、數字、中文與 -
    .replace(/\-\-+/g, '-');        // 去除重複的 -
}

/**
 * [技術] 確保 GitBook 資料夾結構完整，並在缺少時建立預設的首頁與目錄索引
 * [童趣] 準備好故事書架：把裝滿新故事的實木小書架打掃得乾乾淨淨、寬寬敞敞！
 */
async function ensureGitBookStructure() {
  await fs.mkdir(GITBOOK_DIR, { recursive: true });
  await fs.mkdir(RELEASES_DIR, { recursive: true });

  // 1. 確保 README.md (首頁) 存在
  const readmePath = path.join(GITBOOK_DIR, 'README.md');
  try {
    await fs.access(readmePath);
  } catch {
    const defaultReadme = `# 🏠 藝人新發行 AI 樂評中心\n\n歡迎來到您的專屬音樂發現中心！這裡自動匯集了您 Spotify 關注藝人的最新專輯與單曲發行，並透過 AI 深度大腦產出高品質的剖析與風格樂評。✨\n\n您可以使用側邊欄目錄瀏覽各藝人的最新力作！`;
    await fs.writeFile(readmePath, defaultReadme, 'utf-8');
  }

  // 2. 確保 new-releases/README.md 存在
  const releasesReadmePath = path.join(RELEASES_DIR, 'README.md');
  try {
    await fs.access(releasesReadmePath);
  } catch {
    const defaultReleasesReadme = `# 🎵 最新藝人新發行樂評\n\n這裡收錄了所有近 30 天內，您關注藝人發表的精彩專輯與單曲樂評。`;
    await fs.writeFile(releasesReadmePath, defaultReleasesReadme, 'utf-8');
  }

  // 3. 確保 SUMMARY.md 存在
  try {
    await fs.access(SUMMARY_PATH);
  } catch {
    const defaultSummary = `# Table of contents\n\n* [🏠 首頁](README.md)\n* [🎵 最新藝人新發行樂評](new-releases/README.md)\n`;
    await fs.writeFile(SUMMARY_PATH, defaultSummary, 'utf-8');
  }
}

/**
 * [技術] 更新 SUMMARY.md，將新的樂評章節插入目錄大綱中 (防止重複插入)
 * [童趣] 目錄排排站：把新寫完的故事連結，像小玩具車一樣排進 SUMMARY.md 的總目錄火車裡！
 * @param {string} title - 樂評標題 (如 "Bobby Valentin - La Malanga")
 * @param {string} relativePath - 樂評檔案的相對路徑 (如 "new-releases/bobby-valentin-la-malanga.md")
 */
async function updateSummary(title, relativePath) {
  let summaryContent = await fs.readFile(SUMMARY_PATH, 'utf-8');
  const linkEntry = `  * [${title}](${relativePath})`;

  // 檢查是否已經存在此目錄連結，防止重複寫入
  if (summaryContent.includes(relativePath)) {
    console.log(`[GitBook/Summary] 🔗 目錄中已存在此發行索引: ${relativePath}，跳過更新。`);
    return;
  }

  // 將新連結追加入目錄中，尋找 "new-releases/README.md" 的下一行進行插入
  const lines = summaryContent.split('\n');
  const targetIndex = lines.findIndex(line => line.includes('new-releases/README.md'));

  if (targetIndex !== -1) {
    // 插在該分類下方，保持縮排 (兩格空白表示 GitBook 的子目錄階層)
    lines.splice(targetIndex + 1, 0, linkEntry);
    summaryContent = lines.join('\n');
  } else {
    // 若找不到分類，退化追加至尾端
    summaryContent += `\n${linkEntry}`;
  }

  await fs.writeFile(SUMMARY_PATH, summaryContent, 'utf-8');
  console.log(`[GitBook/Summary] 📝 SUMMARY.md 大綱更新成功！`);
}

/**
 * [技術] 自動執行本機 Git 指令，將異動內容 add, commit 並 push 至 GitHub
 * [童趣] 魔法傳送火箭：坐上傳送小火箭，把最新的故事書統統打包一次性發射到 GitHub 雲端星球！
 */
export async function gitPushChanges(commitMessage) {
  console.log(`[GitBook/GitOps] 📡 正在偵測當前 Git 分支...`);
  try {
    // [技術] 使用 execFile 代替 exec 以安全傳遞參數，防範惡意 commitMessage 命令注入漏洞
    // [童趣] 戴上魔法防護手套：用 execFile 像捏橡皮泥一樣抓緊程式參數，不讓怪人利用古怪符號把木馬偷偷塞進去！
    const { stdout: branchStdout } = await execFilePromise('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
    const currentBranch = branchStdout.trim();
    console.log(`[GitBook/GitOps] 📍 當前分支為: ${currentBranch}`);

    console.log(`[GitBook/GitOps] ➕ 正在將 GitBook 目錄加入暫存區...`);
    await execFilePromise('git', ['add', 'gitbook/']);

    console.log(`[GitBook/GitOps] 💾 正在提交變更: "${commitMessage}"...`);
    // 預防無變動提交出錯
    try {
      await execFilePromise('git', ['commit', '-m', commitMessage]);
    } catch (e) {
      const errMessage = e.message || '';
      // 僅在確定是「無變動」的情況下才安全跳過，其餘錯誤應主動拋出以利除錯
      if (errMessage.includes('nothing to commit') || errMessage.includes('working tree clean')) {
        console.log(`[GitBook/GitOps] ⚠️ 沒有檢測到新的變更，跳過 Commit。`);
        return;
      }
      console.error(`[GitBook/GitOps] ❌ Git commit 失敗:`, e.message || e);
      throw e;
    }

    console.log(`[GitBook/GitOps] 🚀 正在推送至 GitHub 遠端倉庫 [origin/${currentBranch}]...`);
    await execFilePromise('git', ['push', 'origin', currentBranch]);
    console.log(`[GitBook/GitOps] 🎉 GitOps 自動推送完成！GitBook 將在數秒內自動同步並上線新頁面。`);
  } catch (err) {
    console.error(`[GitBook/GitOps] ❌ GitOps 自動同步失敗:`, err.message || err);
    throw err;
  }
}

/**
 * [技術] GitBook GitOps 同步引擎主入口 (Publish & Sync)
 * [童趣] 魔法音樂發布派對：一氣呵成把故事寫完、畫好目錄、再發射火箭送上雲端，太好玩啦！
 * @param {object} album - 專輯/單曲元數據
 * @param {string} reviewMarkdown - AI 生成的樂評內容
 */
export async function publishToGitBook(album, reviewMarkdown, skipPush = false) {
  await ensureGitBookStructure();

  const title = `${album.primary_artist} - ${album.name}`;
  // 產生 URL 友善的 Slug，若為空則安全回退至專輯 ID 或預設值，防範特殊字元導致隱藏檔案異常
  const slug = generateSlug(`${album.primary_artist}-${album.name}`) || album.id || 'unknown';
  const fileName = `${slug}.md`;
  const relativeFilePath = `new-releases/${fileName}`;
  const fullFilePath = path.join(RELEASES_DIR, fileName);

  console.log(`[GitBook/Publisher] 📝 正在寫入樂評檔案至: ${fullFilePath}...`);
  await fs.writeFile(fullFilePath, reviewMarkdown, 'utf-8');

  // 更新 SUMMARY.md 大綱索引
  await updateSummary(title, relativeFilePath);

  // 自動執行 GitOps 同步推送 (支援批次跳過)
  if (!skipPush) {
    const commitMsg = `docs(music): add new AI review for ${title}`;
    await gitPushChanges(commitMsg);
  }

  console.log(`[GitBook/Publisher] 🌟 樂評《${title}》已成功發布並啟動 GitOps 同步！`);
  return {
    success: true,
    title: title,
    relativeFilePath: relativeFilePath
  };
}
