import express from 'express';
import { ensureNotesDirExists, writeNote, readNote, listNotes } from './src/fs-utils.js';
import { connectToWhatsApp } from './src/whatsapp-client.js';

const app = express();
const PORT = process.env.PORT || 3000;

// 解析 JSON 格式的 Request Body
app.use(express.json());

// 確保啟動時資料夾已存在
await ensureNotesDirExists();

/**
 * 記錄新的筆記
 * POST /api/notes
 * Body 格式: { "content": "這是要記錄的事情" }
 */
app.post('/api/notes', async (req, res) => {
  try {
    const { content } = req.body;
    
    if (!content) {
      return res.status(400).json({ error: '請提供要記錄的內容 (content 欄位)' });
    }
    
    const result = await writeNote(content);
    res.status(201).json({
      message: '筆記記錄成功',
      data: result
    });
  } catch (error) {
    res.status(500).json({ error: '寫入筆記時發生錯誤' });
  }
});

/**
 * 查詢所有筆記清單
 * GET /api/notes
 */
app.get('/api/notes', async (req, res) => {
  try {
    const files = await listNotes();
    res.json({ files });
  } catch (error) {
    res.status(500).json({ error: '讀取筆記清單失敗' });
  }
});

/**
 * 讀取指定日期的筆記
 * GET /api/notes/:date
 * 範例: GET /api/notes/2026-05-18
 */
app.get('/api/notes/:date', async (req, res) => {
  try {
    const { date } = req.params;
    const content = await readNote(date);
    
    if (content === null) {
      return res.status(404).json({ error: '找不到該日期的筆記檔案' });
    }
    
    res.json({ date, content });
  } catch (error) {
    res.status(500).json({ error: '讀取筆記內容失敗' });
  }
});

app.listen(PORT, async () => {
  console.log(`[NanoClaw] Markdown 代理伺服器已啟動於 http://localhost:${PORT}`);
  console.log(`[NanoClaw] 預設儲存目錄: ./nanoclaw_notes`);
  
  // 啟動 WhatsApp 監聽器
  try {
    await connectToWhatsApp();
  } catch (error) {
    console.error('[NanoClaw/WhatsApp] 初始化 WhatsApp 客戶端失敗:', error);
  }
});
