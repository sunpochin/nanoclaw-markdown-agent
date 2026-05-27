/**
 * =====================================================================
 * 🚀 一鍵新發行掃描、分析與 GitBook 發布運行器 (CLI Release Orchestrator)
 * =====================================================================
 * [技術] 作為專案的獨立 CLI 進入點。調度 Spotify、AI 樂評大腦與 GitBook 同步引擎，
 *        執行一氣呵成的全自動掃描、分析與推送流程，具備完善的錯誤隔離防禦。
 * [童趣] 魔法音樂大噴泉：點一下按鈕，小精靈就會出發幫我們把新歌裝進音樂盒，
 *        並且自動把好聽的童話故事寫在 GitBook 魔法書上喔！
 * =====================================================================
 */
import { scanRecentNewReleases } from './src/spotify-client.js';
import { generateAlbumReview } from './src/album-reviewer.js';
import { publishToGitBook, gitPushChanges } from './src/gitbook-publisher.js';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  console.log('🏁【開始執行 Spotify 關注藝人新發行掃描與 GitBook 同步管線】\n');
  const days = 30; // 掃描近 30 天發行

  try {
    // 1. 執行新發行掃描，獲取去重後的近 30 天作品
    const newReleases = await scanRecentNewReleases(days);

    if (newReleases.length === 0) {
      console.log(`\n📅 近 ${days} 天內，您關注的藝人沒有任何新專輯或單曲發行。掃描管線靜默結束。☕`);
      return;
    }

    console.log(`\n🔍 共尋獲 ${newReleases.length} 個待處理的新發行！開始進行 AI 樂評分析與同步...\n`);
    let successCount = 0;

    // 2. 逐一處理每個新發行，進行錯誤隔離保護，避免單張專輯出錯中斷整個流程
    for (let i = 0; i < newReleases.length; i++) {
      const album = newReleases[i];
      const title = `${album.primary_artist} - ${album.name}`;
      console.log(`─────────────────────────────────────────────`);
      console.log(`📦 [${i + 1}/${newReleases.length}] 正在處理: ${title}`);
      console.log(`   - 類型: ${album.type} | 曲目: ${album.total_tracks} 首 | 日期: ${album.release_date}`);
      
      try {
        // A. 呼叫 AI 生成深度樂評
        const reviewMarkdown = await generateAlbumReview(album);
        
        // B. 發布至 GitBook 並自動執行 GitOps 推送 (啟用批次優化，避免迴圈內重複高頻推送)
        const publishResult = await publishToGitBook(album, reviewMarkdown, true);
        
        if (publishResult.success) {
          console.log(`✅ 成功同步樂評《${title}》至 GitBook！`);
          successCount++;
        }
      } catch (err) {
        console.error(`❌ 處理樂評《${title}》時發生異常:`, err.message || err);
      }
    }

    // 批次處理結束後，若有成功產出，執行單次 GitOps 批次推送，避免迴圈內重複高頻推送 Git
    if (successCount > 0) {
      console.log(`\n📡 正在將本批次 ${successCount} 首新發行樂評批次推送至 GitHub 並同步 GitBook...`);
      const commitMsg = `docs(music): batch add ${successCount} new AI reviews via CLI`;
      await gitPushChanges(commitMsg);
    }

    console.log(`\n─────────────────────────────────────────────`);
    console.log(`🎉【全流程執行完畢】`);
    console.log(`📊 掃描總數: ${newReleases.length} | 成功發布與同步數: ${successCount}`);
    console.log(`🚀 GitOps 同步火花已點燃，GitBook 將在數秒內自動渲染上線！✨\n`);

  } catch (error) {
    console.error('❌ 執行核心掃描管線發生嚴重致命錯誤:', error.message || error);
    process.exit(1);
  }
}

main();
