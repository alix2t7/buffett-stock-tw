#!/bin/zsh
# ─────────────────────────────────────────────
# 📊 持股分析儀表板 — 一鍵啟動
# 雙擊此檔案即可啟動儀表板
# ─────────────────────────────────────────────

# Finder 啟動環境的 PATH 可能不含 /usr/local/bin
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"

# 切換到專案目錄
cd "$(dirname "$0")"

PORT=3000
URL="http://localhost:$PORT"

echo "📊 持股分析儀表板"
echo "════════════════════════════════════"

# 檢查是否已在運行
if lsof -ti:$PORT > /dev/null 2>&1; then
    PORT_CMD=$(lsof -ti:$PORT | head -1 | xargs ps -o comm= -p 2>/dev/null || echo "unknown")

    if echo "$PORT_CMD" | grep -qi "node"; then
        echo "✅ 伺服器已在運行中"
        echo "🌐 開啟瀏覽器..."
        open "$URL"
        echo ""
        echo "💡 如需重啟，請先關閉此視窗再重新開啟"
        echo "════════════════════════════════════"
        sleep 3
        exit 0
    else
        echo "⚠️  Port $PORT 被其他程式佔用（$PORT_CMD）"
        read -p "   是否清除佔用並啟動？(y/n) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            lsof -ti:$PORT | xargs kill -9 2>/dev/null
            sleep 1
            echo "✅ 已清除"
        else
            echo "❌ 取消啟動"
            sleep 2
            exit 0
        fi
    fi
fi

# 檢查 node_modules
if [ ! -d "node_modules" ]; then
    echo "📦 首次啟動，安裝依賴..."
    npm install
    echo ""
fi

# 自動建立 stock_config.local.json
if [ ! -f "stock_config.local.json" ] && [ -f "stock_config.example.json" ]; then
    echo "📋 首次設定：自動建立 stock_config.local.json"
    cp stock_config.example.json stock_config.local.json
    echo "   ⚠️  請編輯 stock_config.local.json 填入你的持股代碼"
    echo "   然後在儀表板中點「⚙ 同步持股」"
    echo ""
fi

echo "🚀 啟動伺服器..."
echo "🌐 準備開啟 $URL"
echo "════════════════════════════════════"
echo ""
echo "💡 關閉此視窗即可停止伺服器"
echo ""

# 啟動 Vite（會自動開瀏覽器，因為 vite.config.js 設了 open: true）
npx vite --port $PORT
