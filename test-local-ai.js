import { processMessageWithAI } from './src/gemini-service.js';
import dotenv from 'dotenv';

dotenv.config();

async function runTest() {
  console.log('🧪【開始執行 AI 管道整合測試】\n');

  const testMessage = '記：今天買了普拿疼藥物花了 150 元';
  console.log(`📥 測試輸入: "${testMessage}"`);

  try {
    console.log('\n--- 1. 測試 [純本地離線 Qwen 2.5:14b] 模式 ---');
    const localResult = await processMessageWithAI(testMessage, [], '', true);
    console.log('🎉 本地大腦解析成功！');
    console.log(JSON.stringify(localResult, null, 2));
  } catch (error) {
    console.error('❌ 本地大腦測試失敗:', error);
  }

  try {
    console.log('\n--- 2. 測試 [雲端 Gemini] 模式 (若有 API Key 且額度足夠) ---');
    if (!process.env.GEMINI_API_KEY) {
      console.log('⚠️ 未設定 GEMINI_API_KEY，跳過雲端測試。');
      return;
    }
    const cloudResult = await processMessageWithAI(testMessage, [], '', false);
    console.log('🎉 雲端大腦解析成功！');
    console.log(JSON.stringify(cloudResult, null, 2));
  } catch (error) {
    console.error('❌ 雲端大腦測試失敗 (可能遇到 Rate Limit，將自動降級到本地或噴出錯誤):', error.message || error);
  }
}

runTest();
