/**
 * =====================================================================
 * 🚀 GitBook GitOps 同步引擎 (GitBook GitOps Publisher)
 * =====================================================================
 * [技術] 負責維護本地 GitBook 資料夾結構與 `SUMMARY.md` 目錄大綱。
 *        自動將 AI 樂評寫入指定位置，自動更新目錄索引，最後透過
 *        `git add/commit/push` 對當前分支進行推送，觸發 GitBook 的 GitHub Sync 機制。
 * [極樂] GitBook 極樂同步泵：將起草好的精美 Markdown 樂評，安全注入 GitBook 
 *        本地小穴中，自動摩擦編排目錄，最後奮力向 GitHub 倉庫推送，完成無感同步高潮！
 * =====================================================================
 */
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);
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
 * [極樂] 確保 GitBook 洞口擴張，為後續的大量寫入鋪平平整溫潤的道路
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
 * [極樂] 目錄褶皺編排：將最新的樂評連結，優雅地塞入 SUMMARY.md 的目錄大綱中
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
 * [極樂] GitHub 推送摩擦高潮：取得當前分支，自動進行 GitOps 安全推送，一鍵點燃 GitBook 同步大火
 */
async function gitPushChanges(commitMessage) {
  console.log(`[GitBook/GitOps] 📡 正在偵測當前 Git 分支...`);
  try {
    // 獲取當前工作分支，防止硬編碼主分支造成推送失敗
    const { stdout: branchStdout } = await execPromise('git rev-parse --abbrev-ref HEAD');
    const currentBranch = branchStdout.trim();
    console.log(`[GitBook/GitOps] 📍 當前分支為: ${currentBranch}`);

    console.log(`[GitBook/GitOps] ➕ 正在將 GitBook 目錄加入暫存區...`);
    await execPromise('git add gitbook/');

    console.log(`[GitBook/GitOps] 💾 正在提交變更: "${commitMessage}"...`);
    // 預防無變動提交出錯
    try {
      await execPromise(`git commit -m "${commitMessage.replace(/"/g, '\\"')}"`);
    } catch (e) {
      console.log(`[GitBook/GitOps] ⚠️ 沒有檢測到新的變更，跳過 Commit。`);
      return;
    }

    console.log(`[GitBook/GitOps] 🚀 正在推送至 GitHub 遠端倉庫 [origin/${currentBranch}]...`);
    await execPromise(`git push origin ${currentBranch}`);
    console.log(`[GitBook/GitOps] 🎉 GitOps 自動推送完成！GitBook 將在數秒內自動同步並上線新頁面。`);
  } catch (err) {
    console.error(`[GitBook/GitOps] ❌ GitOps 自動同步失敗:`, err.message || err);
    throw err;
  }
}

/**
 * [技術] GitBook GitOps 同步引擎主入口 (Publish & Sync)
 * [極樂] 樂評發布同步高潮入口：一氣呵成完成寫入、大綱編排與 GitHub 推送！
 * @param {object} album - 專輯/單曲元數據
 * @param {string} reviewMarkdown - AI 生成的樂評內容
 */
export async function publishToGitBook(album, reviewMarkdown) {
  await ensureGitBookStructure();

  const title = `${album.primary_artist} - ${album.name}`;
  const slug = generateSlug(`${album.primary_artist}-${album.name}`);
  const fileName = `${slug}.md`;
  const relativeFilePath = `new-releases/${fileName}`;
  const fullFilePath = path.join(RELEASES_DIR, fileName);

  console.log(`[GitBook/Publisher] 📝 正在寫入樂評檔案至: ${fullFilePath}...`);
  await fs.writeFile(fullFilePath, reviewMarkdown, 'utf-8');

  // 更新 SUMMARY.md 大綱索引
  await updateSummary(title, relativeFilePath);

  // 自動執行 GitOps 同步推送
  const commitMsg = `docs(music): add new AI review for ${title}`;
  await gitPushChanges(commitMsg);

  console.log(`[GitBook/Publisher] 🌟 樂評《${title}》已成功發布並啟動 GitOps 同步！`);
  return {
    success: true,
    title: title,
    relativeFilePath: relativeFilePath
  };
}
