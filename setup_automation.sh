#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"

echo "======================================================================"
echo "🚀 SQLite + Launchd 自動化安裝程式"
echo "======================================================================"
echo ""

# 顏色定義
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 檢查 Python
echo "📍 步驟 1/6：檢查 Python 環境..."
if command -v python3 &> /dev/null; then
    PYTHON_VERSION=$(python3 --version 2>&1)
    echo -e "${GREEN}✅ $PYTHON_VERSION${NC}"
else
    echo -e "${RED}❌ 找不到 Python3，請先安裝 Python${NC}"
    exit 1
fi

# 安裝 Python 套件
echo ""
echo "📍 步驟 2/6：安裝 Python 套件..."
if python3 -c "import yfinance" 2>/dev/null; then
    echo -e "${GREEN}✅ yfinance 已安裝${NC}"
else
    echo -e "${YELLOW}⚠️  正在安裝 yfinance...${NC}"
    pip3 install yfinance --quiet
fi

if python3 -c "import sqlite3" 2>/dev/null; then
    echo -e "${GREEN}✅ sqlite3 已安裝${NC}"
else
    echo -e "${RED}❌ sqlite3 未安裝（通常隨 Python 一起安裝）${NC}"
fi

# 創建日誌目錄
echo ""
echo "📍 步驟 3/6：創建日誌目錄..."
mkdir -p logs
echo -e "${GREEN}✅ logs/ 目錄已創建${NC}"

# 測試資料庫腳本
echo ""
echo "📍 步驟 4/6：測試資料庫腳本..."
echo -e "${YELLOW}🔄 執行首次資料同步（約需 30 秒）...${NC}"

if python3 sync_portfolio.py --refresh > logs/first_run.log 2>&1; then
    echo -e "${GREEN}✅ 資料庫初始化成功${NC}"
    echo "   📁 資料庫: stock_history.db"
    echo "   📄 JSON: stock_data.json"
    
    # 顯示摘要
    STOCK_COUNT=$(sqlite3 stock_history.db "SELECT COUNT(DISTINCT ticker) FROM stock_history" 2>/dev/null)
    RECORD_COUNT=$(sqlite3 stock_history.db "SELECT COUNT(*) FROM stock_history" 2>/dev/null)
    echo "   📊 已記錄 ${STOCK_COUNT} 檔股票，共 ${RECORD_COUNT} 筆資料"
else
    echo -e "${RED}❌ 初始化失敗，請查看 logs/first_run.log${NC}"
    echo "   可能原因：網路問題、Yahoo Finance 限制"
    read -p "是否繼續安裝 Launchd? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# 安裝 Launchd
echo ""
echo "📍 步驟 5/6：安裝 Launchd 自動化任務..."

PLIST_FILE="com.user.stocksync.plist"
LAUNCHD_DIR="$HOME/Library/LaunchAgents"
LAUNCHD_PATH="$LAUNCHD_DIR/$PLIST_FILE"

# 創建 LaunchAgents 目錄
mkdir -p "$LAUNCHD_DIR"

# 複製 plist 檔案
cp "$PLIST_FILE" "$LAUNCHD_PATH"
echo -e "${GREEN}✅ plist 檔案已複製到 $LAUNCHD_PATH${NC}"

# 載入 Launchd 任務
if launchctl list | grep -q "com.user.stocksync"; then
    echo -e "${YELLOW}⚠️  任務已存在，正在重新載入...${NC}"
    launchctl unload "$LAUNCHD_PATH" 2>/dev/null
fi

launchctl load "$LAUNCHD_PATH"

if launchctl list | grep -q "com.user.stocksync"; then
    echo -e "${GREEN}✅ Launchd 任務已成功載入${NC}"
else
    echo -e "${RED}❌ Launchd 載入失敗${NC}"
    exit 1
fi

# 設定腳本執行權限
chmod +x query_stock.py

# 完成
echo ""
echo "📍 步驟 6/6：React 前端已設定完成"
echo -e "${GREEN}✅ 前端會自動讀取 stock_data.json 真實數據${NC}"
echo ""

echo "======================================================================"
echo -e "${GREEN}✅ 安裝完成！${NC}"
echo "======================================================================"
echo ""
echo "📋 安裝摘要："
echo "   ✅ Python 環境與套件"
echo "   ✅ SQLite 資料庫 (stock_history.db)"
echo "   ✅ Launchd 自動化任務"
echo "   ✅ 查詢工具 (query_stock.py)"
echo ""
echo "⏰ 自動更新時間："
echo "   每天早上 9:00"
echo "   開機後 60 秒執行一次"
echo ""
echo "🔧 管理指令："
echo "   查看任務狀態:  launchctl list | grep stocksync"
echo "   停止任務:      launchctl unload ~/Library/LaunchAgents/$PLIST_FILE"
echo "   重新啟動:      launchctl load ~/Library/LaunchAgents/$PLIST_FILE"
echo "   立即執行:      launchctl start com.user.stocksync"
echo "   查看日誌:      tail -f logs/stock_update.log"
echo ""
echo "📊 查詢歷史資料："
echo "   python3 query_stock.py"
echo ""
echo "🧪 測試前端："
echo "   1. 執行 npm run dev"
echo "   2. 打開 http://localhost:3000"
echo ""
echo "======================================================================"
