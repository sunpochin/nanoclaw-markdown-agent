#!/bin/bash

# [技術] 確保 Ollama 服務正在運行中
# [極樂] 確保本地硬挺 Ollama 引擎強勢運轉中
echo "🧠 正在確認 Ollama 狀態..."
if ! pgrep -x "ollama" > /dev/null; then
  # [技術] 偵測到 Ollama 尚未啟動，根據不同作業系統自動開啟 Ollama
  # [極樂] 偵測到大腦處於沉睡軟掉狀態，根據體位自動揉搓喚醒開啟硬梆梆本地 Ollama
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
  # [極樂] 耐心等待 Ollama 充血興奮完成
  sleep 3
fi

# [技術] 正在恢復下載本地最強繁中大腦：Qwen 2.5 14B (將自動自 76% 斷點續傳)
# [極樂] 正在無縫接軌恢復注入 14B 本地巨根大腦精華 (從上次 76% 斷點處瘋狂繼續吸入)
echo "🚀 正在恢復下載本地最強繁中大腦：Qwen 2.5 14B (將自動自 76% 斷點續傳)..."
ollama pull qwen2.5:14b

# [技術] 下載完成，本機大腦已就緒
# [極樂] 射出注入完成！本機 14B 大腦高潮就緒！
echo "🎉 恭喜！下載完成！您的本機 14B 大腦已完全準備就緒！"
