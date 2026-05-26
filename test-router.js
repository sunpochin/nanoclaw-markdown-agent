import { processMessageWithAI } from './src/gemini-service.js';
import dotenv from 'dotenv';

// 載入環境變數設定
dotenv.config();

async function runRouterTests() {
  console.log('🧪【開始執行大腦分流決策器單元測試】\n');

  const testCases = [
    {
      msg: '哈囉，你好呀！',
      desc: '極短日常寒暄（小於 20 字，無複雜詞彙）',
      expected: 'local'
    },
    {
      msg: '記：明天下午兩點去拿快遞',
      desc: '快速記事前綴通道',
      expected: 'local'
    },
    {
      msg: '今天中午吃了一碗牛肉麵，花了 160 元，味道還可以。',
      desc: '中等字數流水帳記錄（小於 40 字，無複雜詞彙）',
      expected: 'local'
    },
    {
      msg: '請幫我用 JavaScript 寫一個 Debounce 防抖函式，並詳細解釋閉包在其中的運作原理與應用場景。',
      desc: '複雜技術問題與長文本（大於 40 字，且包含技術關鍵字）',
      expected: 'cloud'
    },
    {
      msg: '如果我今天帶媽媽去長庚醫院做健康檢查，你覺得明天的日記會怎麼寫？',
      desc: '假設性決策與未來預言模擬（包含「如果...」模擬詞彙）',
      expected: 'cloud'
    }
  ];

  for (const tc of testCases) {
    console.log(`\n─────────────────────────────────────────────`);
    console.log(`📥 測試案例: "${tc.msg}" (${tc.desc})`);
    console.log(`🎯 預期路由: ${tc.expected === 'local' ? '🤖 本地大腦' : '☁️ 雲端大腦'}`);
    
    try {
      // 呼叫 processMessageWithAI 並看它最後選用了哪個模型
      const result = await processMessageWithAI(tc.msg, [], '', false);
      console.log(`✅ 實際路由模型: ${result.modelUsed}`);
      console.log(`💬 大腦回應簡介: ${result.replyText.substring(0, 80)}...`);
    } catch (err) {
      console.error(`❌ 測試發生異常:`, err.message || err);
    }
  }
}

runRouterTests();
