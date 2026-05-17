import { makeWASocket, useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import pino from 'pino';
import { writeNote } from './fs-utils.js';

export async function connectToWhatsApp() {
    // 儲存登入授權狀態，這樣不需要每次重啟都重新掃描 QR Code
    const { state, saveCreds } = await useMultiFileAuthState('baileys_auth_info');

    // 建立 WhatsApp Socket 連線
    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }), // 避免終端機輸出過多日誌
        printQRInTerminal: false,
        browser: ['NanoClaw Markdown Agent', 'Mac', '1.0.0']
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log('\n=============================================');
            console.log('[NanoClaw/WhatsApp] 請使用手機 WhatsApp 掃描以下 QR Code 進行登入：');
            qrcode.generate(qr, { small: true });
            console.log('=============================================\n');
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('[NanoClaw/WhatsApp] 連線中斷，是否嘗試重連:', shouldReconnect);
            if (shouldReconnect) {
                connectToWhatsApp();
            } else {
                console.log('[NanoClaw/WhatsApp] 您已登出，請刪除 baileys_auth_info 目錄後重啟伺服器來重新掃碼。');
            }
        } else if (connection === 'open') {
            console.log('[NanoClaw/WhatsApp] ✅ 連線成功！現在可以直接傳送 WhatsApp 訊息給這個帳號了。');
        }
    });

    // 將認證資訊存回檔案
    sock.ev.on('creds.update', saveCreds);

    // 監聽收到的訊息
    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        
        // 忽略自己發送的訊息以及無對話內容的事件
        if (!msg.message || msg.key.fromMe) return;
        
        // 解析不同類型的純文字訊息
        const textMessage = msg.message.conversation || msg.message.extendedTextMessage?.text;
        
        if (textMessage) {
            console.log(`\n[NanoClaw/WhatsApp] 收到訊息: "${textMessage}"`);
            
            try {
                // 將文字寫入您的本地 Markdown 系統
                await writeNote(`**[WhatsApp 來源]** ${textMessage}`);
                console.log(`[NanoClaw/WhatsApp] 訊息已成功寫入 Markdown！`);
                
                // 自動回覆確認給手機端
                await sock.sendMessage(msg.key.remoteJid, { text: '✅ 已將您的訊息記錄至本地筆記。' });
            } catch (error) {
                console.error('[NanoClaw/WhatsApp] 寫入筆記失敗:', error);
                await sock.sendMessage(msg.key.remoteJid, { text: '❌ 記錄失敗，請查看伺服器日誌。' });
            }
        }
    });
}
