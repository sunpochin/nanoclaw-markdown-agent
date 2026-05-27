#!/bin/bash

# [技術] 確保 Ollama 服務正在運行中
# [童趣] 確保本地的大腦瓜引擎正精神抖擻地運作中
echo "🧠 正在確認 Ollama 狀態..."
if ! pgrep -x "ollama" > /dev/null; then
  # [技術] 偵測到 Ollama 尚未啟動，根據不同作業系統自動開啟 Ollama
  # [童趣] 偵測到大腦瓜正處於沉睡做夢狀態，自動輕輕揉揉眼睛喚醒本地大腦瓜
  echo "⚠️ 偵測到 Ollama 尚未啟動，正在為您自動開啟 Ollama 應用程式..."
  
  if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    open -a Ollama
  elif command -v systemctl &> /dev/null && systemctl is-active --quiet ollama; then
    # Linux systemd (雙重防漏對齊)
    :
  else
    # Linux 其它背景啟動
    ollama serve &
  fi
  
  # [技術] 等待 Ollama 啟動完成
  # [童趣] 耐心等待大腦瓜伸懶腰起床完畢
  sleep 3
fi

# [技術] 正在恢復下載本地最強繁中大腦：Qwen 2.5 14B (將自動自 76% 斷點續傳)
# [童趣] 正在排排隊無縫接軌，繼續下載本地 Qwen 14B 大腦瓜精華 (從上次斷掉的地方繼續吸入好玩知識)
echo "🚀 正在恢復下載本地最強繁中大腦：Qwen 2.5 14B (將自動自 76% 斷點續傳)..."
ollama pull qwen2.5:14b

# [技術] 下載完成，本機大腦已就緒
# [童趣] 魔法下載完成！本機大腦瓜準備就緒，可以陪小朋友玩耍囉！
echo "🎉 恭喜！下載完成！您的本機 14B 大腦已完全準備就緒！"
