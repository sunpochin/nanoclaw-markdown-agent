import { processImageWithLocalOllama } from './src/gemini-service.js';
import dotenv from 'dotenv';

dotenv.config();

// 執行本地視覺大腦測試
async function runLocalVisionTest() {
  console.log('🧪【開始執行本地視覺大腦 qwen2.5vl:7b 摩擦測試】\n');

  // 1x1 黑色像素 PNG Base64 數據蜜汁，用來模擬圖片上傳
  const mockImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  const mockMimeType = 'image/png';
  const mockPrompt = '這是一張純黑色的測試圖片，請確認您已經看見並成功啟動本地視覺解析！';

  console.log(`📥 測試影像 MIME: ${mockMimeType}`);
  console.log(`📥 測試指令: "${mockPrompt}"`);

  try {
    console.log('\n--- 正在呼叫本地視覺通道進行 OCR 與影像摩擦 ---');
    const result = await processImageWithLocalOllama(mockImageBase64, mockMimeType, mockPrompt);
    console.log('\n🎉 本地視覺大腦解析成功！');
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('❌ 本地視覺大腦測試失敗:', error);
  }
}

runLocalVisionTest();
