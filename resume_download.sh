#!/bin/bash

# 確保 Ollama 服務正在運行中
echo "🧠 正在確認 Ollama 狀態..."
if ! pgrep -x "ollama" > /dev/null; then
  echo "⚠️ 偵測到 Ollama 尚未啟動，正在為您自動開啟 Ollama 應用程式..."
  open -a Ollama
  sleep 3 # 等待 Ollama 啟動完成
fi

echo "🚀 正在恢復下載本地最強繁中大腦：Qwen 2.5 14B (將自動自 76% 斷點續傳)..."
ollama pull qwen2.5:14b

echo "🎉 恭喜！下載完成！您的本機 14B 大腦已完全準備就緒！"
