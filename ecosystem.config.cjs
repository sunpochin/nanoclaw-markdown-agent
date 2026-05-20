module.exports = {
  apps: [
    {
      name: 'nanoclaw-agent',
      script: 'server.js',
      // 單個實例運行
      instances: 1,
      // 崩潰時自動重啟
      autorestart: true,
      // 監聽變動並重啟
      watch: ['server.js', 'src'],
      // 忽略不需要監聽的目錄與檔案
      ignore_watch: ['node_modules', 'nanoclaw_notes', 'logs', '*.log'],
      max_memory_restart: '1G',
      // 開發環境變數設定
      env: {
        NODE_ENV: 'development'
      },
      // 錯誤與標準輸出日誌路徑
      error_file: 'logs/pm2-err.log',
      out_file: 'logs/pm2-out.log',
      // 日誌前綴加上時間戳記
      log_date_format: 'YYYY-MM-DD HH:mm:ss'
    }
  ]
};
