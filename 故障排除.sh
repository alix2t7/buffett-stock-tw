#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"

# Launchd 故障排除腳本

echo "======================================================================"
echo "🔍 Launchd 故障排除診斷"
echo "======================================================================"
echo ""

PLIST_NAME="com.user.stocksync"
PLIST_FILE="$HOME/Library/LaunchAgents/${PLIST_NAME}.plist"

# 1. 檢查任務是否載入
echo "1️⃣  檢查任務載入狀態..."
if launchctl list | grep -q "$PLIST_NAME"; then
    echo "   ✅ 任務已載入"
    launchctl list | grep "$PLIST_NAME"
else
    echo "   ❌ 任務未載入"
    echo "   解決方法: launchctl load $PLIST_FILE"
fi
echo ""

# 2. 檢查配置文件
echo "2️⃣  檢查配置文件..."
if [ -f "$PLIST_FILE" ]; then
    echo "   ✅ 配置文件存在"
    
    # 檢查 Python 路徑
    PYTHON_PATH=$(grep -A 2 "ProgramArguments" "$PLIST_FILE" | grep "python3" | sed 's/<[^>]*>//g' | xargs)
    if [ -f "$PYTHON_PATH" ]; then
        echo "   ✅ Python 路徑正確: $PYTHON_PATH"
    else
        echo "   ❌ Python 路徑錯誤: $PYTHON_PATH"
        ACTUAL_PYTHON=$(which python3)
        echo "   實際路徑應為: $ACTUAL_PYTHON"
        echo "   解決方法: 編輯 plist 修正路徑"
    fi
    
    # 檢查腳本路徑
    SCRIPT_PATH=$(grep -A 3 "ProgramArguments" "$PLIST_FILE" | grep "sync_portfolio.py" | sed 's/<[^>]*>//g' | xargs)
    if [ -f "$SCRIPT_PATH" ]; then
        echo "   ✅ 腳本路徑正確: $SCRIPT_PATH"
    else
        echo "   ❌ 腳本路徑錯誤: $SCRIPT_PATH"
        echo "   解決方法: 檢查腳本是否存在"
    fi
else
    echo "   ❌ 配置文件不存在"
    echo "   解決方法: 執行 ./setup_automation.sh 重新安裝"
fi
echo ""

# 3. 檢查日誌目錄
echo "3️⃣  檢查日誌目錄..."
if [ -d "logs" ]; then
    echo "   ✅ 日誌目錄存在"
    
    if [ -f "logs/stock_update.log" ]; then
        SIZE=$(ls -lh logs/stock_update.log | awk '{print $5}')
        echo "   ✅ 執行日誌存在 ($SIZE)"
    else
        echo "   ⚠️  執行日誌不存在（尚未執行過）"
    fi
    
    if [ -f "logs/stock_update_error.log" ]; then
        SIZE=$(ls -lh logs/stock_update_error.log | awk '{print $5}')
        echo "   📋 錯誤日誌存在 ($SIZE)"
    fi
else
    echo "   ❌ 日誌目錄不存在"
    echo "   解決方法: mkdir logs"
fi
echo ""

# 4. 測試手動執行
echo "4️⃣  測試手動執行..."
SCRIPT_DIR="$PWD"
if [ -f "$SCRIPT_DIR/sync_portfolio.py" ]; then
    echo "   腳本存在，測試執行..."
    
    # 測試 Python 是否能執行
    if python3 --version > /dev/null 2>&1; then
        echo "   ✅ Python 可執行"
        PYTHON_VERSION=$(python3 --version)
        echo "   版本: $PYTHON_VERSION"
    else
        echo "   ❌ Python 無法執行"
    fi
    
    # 檢查 yfinance
    if python3 -c "import yfinance" 2>/dev/null; then
        echo "   ✅ yfinance 已安裝"
    else
        echo "   ❌ yfinance 未安裝"
        echo "   解決方法: pip3 install yfinance"
    fi
else
    echo "   ❌ 腳本不存在: $SCRIPT_DIR/sync_portfolio.py"
fi
echo ""

# 5. 檢查權限
echo "5️⃣  檢查檔案權限..."
if [ -f "$PLIST_FILE" ]; then
    PERM=$(ls -l "$PLIST_FILE" | awk '{print $1}')
    echo "   plist 權限: $PERM"
fi

if [ -f "sync_portfolio.py" ]; then
    PERM=$(ls -l "sync_portfolio.py" | awk '{print $1}')
    echo "   腳本權限: $PERM"
fi
echo ""

# 6. 建議的解決步驟
echo "======================================================================"
echo "🔧 常見問題解決方法"
echo "======================================================================"
echo ""
echo "問題 1: 任務未載入"
echo "   解決: launchctl load ~/Library/LaunchAgents/com.user.stocksync.plist"
echo ""
echo "問題 2: Python 路徑錯誤"
echo "   1. 查找正確路徑: which python3"
echo "   2. 編輯 plist: nano ~/Library/LaunchAgents/com.user.stocksync.plist"
echo "   3. 重新載入: ./管理自動化.sh 選擇 8"
echo ""
echo "問題 3: 權限問題"
echo "   chmod +x sync_portfolio.py"
echo ""
echo "問題 4: 完全重置"
echo "   ./setup_automation.sh"
echo ""
echo "======================================================================"
echo ""
echo "💡 需要立即測試執行？"
echo "   launchctl start com.user.stocksync"
echo "   tail -f logs/stock_update.log"
echo ""
