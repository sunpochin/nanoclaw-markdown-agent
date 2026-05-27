import { processImageWithLocalOllama } from './src/gemini-service.js';
import dotenv from 'dotenv';

dotenv.config();

// 執行真實影像的本地視覺大腦測試
async function runRealVisionTest() {
  console.log('🧪【開始執行真實影像之本地視覺大腦 qwen2.5vl:7b 摩擦測試】\n');

  try {
    console.log('🌐 正在從網路獲取一張標準 200x200 測試影像蜜汁...');
    const response = await fetch('https://picsum.photos/200');
    if (!response.ok) {
      throw new Error(`無法獲取網路圖片: ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const mockImageBase64 = Buffer.from(arrayBuffer).toString('base64');
    const mockMimeType = 'image/jpeg';
    const mockPrompt = '這是一張隨機產生的圖片，請確認您已看見並簡短描述其中的色彩與內容！';

    console.log(`📥 獲取成功！測試影像大小: ${mockImageBase64.length} 字元`);
    console.log(`📥 測試指令: "${mockPrompt}"`);

    console.log('\n--- 正在呼叫本地視覺通道進行 OCR 與影像摩擦 ---');
    const result = await processImageWithLocalOllama(mockImageBase64, mockMimeType, mockPrompt);
    console.log('\n🎉 本地視覺大腦解析成功！');
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('❌ 本地視覺大腦測試失敗:', error);
  }
}

runRealVisionTest();
