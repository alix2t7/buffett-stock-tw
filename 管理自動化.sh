#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"

# Launchd 自動化管理工具
# 用於管理股票資料自動更新任務

PLIST_NAME="com.user.stocksync"
PLIST_FILE="$HOME/Library/LaunchAgents/${PLIST_NAME}.plist"

# 顏色定義
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

show_menu() {
    echo ""
    echo "======================================================================"
    echo "⚙️  Launchd 自動化管理工具"
    echo "======================================================================"
    echo ""
    echo "1. 📊 查看任務狀態"
    echo "2. ▶️  立即執行更新"
    echo "3. 📋 查看執行日誌"
    echo "4. ❌ 查看錯誤日誌"
    echo "5. 📈 查看更新歷史"
    echo "6. ⏸️  停止自動更新"
    echo "7. ▶️  啟動自動更新"
    echo "8. 🔄 重新載入配置"
    echo "9. ⏰ 修改執行時間"
    echo "0. 🚪 退出"
    echo ""
    echo "======================================================================"
}

check_status() {
    echo ""
    echo -e "${BLUE}📊 檢查 Launchd 任務狀態...${NC}"
    echo "----------------------------------------------------------------------"
    
    if launchctl list | grep -q "$PLIST_NAME"; then
        STATUS=$(launchctl list | grep "$PLIST_NAME")
        echo -e "${GREEN}✅ 任務已載入${NC}"
        echo "   詳細資訊: $STATUS"
        
        # 檢查配置文件
        if [ -f "$PLIST_FILE" ]; then
            echo -e "${GREEN}✅ 配置文件存在${NC}"
            echo "   路徑: $PLIST_FILE"
            
            # 顯示執行時間
            HOUR=$(grep -A 1 "Hour" "$PLIST_FILE" | grep "integer" | sed 's/[^0-9]//g')
            MINUTE=$(grep -A 1 "Minute" "$PLIST_FILE" | grep "integer" | sed 's/[^0-9]//g')
            echo "   ⏰ 執行時間: 每天 ${HOUR}:$(printf "%02d" $MINUTE)"
        else
            echo -e "${RED}❌ 配置文件不存在${NC}"
        fi
        
        # 檢查日誌
        if [ -f "logs/stock_update.log" ]; then
            LAST_UPDATE=$(tail -1 logs/stock_update.log 2>/dev/null | grep -o "[0-9]\{4\}-[0-9]\{2\}-[0-9]\{2\}" | head -1)
            if [ -n "$LAST_UPDATE" ]; then
                echo "   📅 最後更新: $LAST_UPDATE"
            fi
        fi
    else
        echo -e "${RED}❌ 任務未載入${NC}"
        echo "   請執行選項 7 啟動自動更新"
    fi
    echo ""
}

run_now() {
    echo ""
    echo -e "${BLUE}▶️  立即執行更新...${NC}"
    echo "----------------------------------------------------------------------"
    
    if launchctl list | grep -q "$PLIST_NAME"; then
        launchctl start "$PLIST_NAME"
        echo -e "${GREEN}✅ 更新任務已觸發${NC}"
        echo ""
        echo "⏳ 請稍候約 40 秒..."
        sleep 40
        
        echo ""
        echo "📋 最新日誌："
        tail -15 logs/stock_update.log
    else
        echo -e "${RED}❌ 任務未載入，請先啟動自動更新（選項 7）${NC}"
    fi
    echo ""
}

view_log() {
    echo ""
    echo -e "${BLUE}📋 執行日誌（最後 40 行）${NC}"
    echo "----------------------------------------------------------------------"
    
    if [ -f "logs/stock_update.log" ]; then
        tail -40 logs/stock_update.log
    else
        echo -e "${YELLOW}⚠️  日誌文件不存在${NC}"
    fi
    echo ""
}

view_error_log() {
    echo ""
    echo -e "${BLUE}❌ 錯誤日誌（最後 30 行）${NC}"
    echo "----------------------------------------------------------------------"
    
    if [ -f "logs/stock_update_error.log" ]; then
        if [ -s "logs/stock_update_error.log" ]; then
            tail -30 logs/stock_update_error.log
            echo ""
            echo -e "${YELLOW}💡 注意：404 錯誤是正常的（.TW → .TWO 自動切換）${NC}"
        else
            echo -e "${GREEN}✅ 無錯誤記錄${NC}"
        fi
    else
        echo -e "${GREEN}✅ 錯誤日誌不存在（一切正常）${NC}"
    fi
    echo ""
}

view_history() {
    echo ""
    echo -e "${BLUE}📈 更新歷史記錄${NC}"
    echo "----------------------------------------------------------------------"
    
    if [ -f "stock_history.db" ]; then
        sqlite3 stock_history.db << 'EOF'
.headers on
.mode column
SELECT 
    update_time as 更新時間,
    total_stocks as 總數,
    success_count as 成功,
    failed_count as 失敗,
    ROUND(duration_seconds, 2) as 耗時秒數
FROM update_logs
ORDER BY update_time DESC
LIMIT 10;
EOF
    else
        echo -e "${RED}❌ 資料庫不存在${NC}"
    fi
    echo ""
}

stop_task() {
    echo ""
    echo -e "${YELLOW}⏸️  停止自動更新...${NC}"
    echo "----------------------------------------------------------------------"
    
    if launchctl list | grep -q "$PLIST_NAME"; then
        launchctl unload "$PLIST_FILE"
        echo -e "${GREEN}✅ 自動更新已停止${NC}"
        echo "   重新啟動請執行選項 7"
    else
        echo -e "${YELLOW}⚠️  任務本來就沒有運行${NC}"
    fi
    echo ""
}

start_task() {
    echo ""
    echo -e "${BLUE}▶️  啟動自動更新...${NC}"
    echo "----------------------------------------------------------------------"
    
    if [ ! -f "$PLIST_FILE" ]; then
        echo -e "${RED}❌ 配置文件不存在：$PLIST_FILE${NC}"
        echo "   請先執行 ./setup_automation.sh 安裝"
        return
    fi
    
    # 卸載（如果已載入）
    launchctl unload "$PLIST_FILE" 2>/dev/null
    
    # 重新載入
    launchctl load "$PLIST_FILE"
    
    if launchctl list | grep -q "$PLIST_NAME"; then
        echo -e "${GREEN}✅ 自動更新已啟動${NC}"
        check_status
    else
        echo -e "${RED}❌ 啟動失敗${NC}"
    fi
    echo ""
}

reload_config() {
    echo ""
    echo -e "${BLUE}🔄 重新載入配置...${NC}"
    echo "----------------------------------------------------------------------"
    
    stop_task
    sleep 1
    start_task
}

change_schedule() {
    echo ""
    echo -e "${BLUE}⏰ 修改執行時間${NC}"
    echo "----------------------------------------------------------------------"
    echo ""
    
    # 讀取當前設定
    CURRENT_HOUR=$(grep -A 1 "Hour" "$PLIST_FILE" | grep "integer" | sed 's/[^0-9]//g')
    CURRENT_MINUTE=$(grep -A 1 "Minute" "$PLIST_FILE" | grep "integer" | sed 's/[^0-9]//g')
    
    echo "📅 當前執行時間: 每天 ${CURRENT_HOUR}:$(printf "%02d" $CURRENT_MINUTE)"
    echo ""
    
    read -p "請輸入新的小時 (0-23): " NEW_HOUR
    read -p "請輸入新的分鐘 (0-59): " NEW_MINUTE
    
    # 驗證輸入
    if ! [[ "$NEW_HOUR" =~ ^[0-9]+$ ]] || [ "$NEW_HOUR" -lt 0 ] || [ "$NEW_HOUR" -gt 23 ]; then
        echo -e "${RED}❌ 無效的小時值${NC}"
        return
    fi
    
    if ! [[ "$NEW_MINUTE" =~ ^[0-9]+$ ]] || [ "$NEW_MINUTE" -lt 0 ] || [ "$NEW_MINUTE" -gt 59 ]; then
        echo -e "${RED}❌ 無效的分鐘值${NC}"
        return
    fi
    
    # 備份原配置
    cp "$PLIST_FILE" "${PLIST_FILE}.backup"
    
    # 修改配置
    sed -i '' "/<key>Hour<\/key>/,/<integer>/ s/<integer>[0-9]*<\/integer>/<integer>$NEW_HOUR<\/integer>/" "$PLIST_FILE"
    sed -i '' "/<key>Minute<\/key>/,/<integer>/ s/<integer>[0-9]*<\/integer>/<integer>$NEW_MINUTE<\/integer>/" "$PLIST_FILE"
    
    echo ""
    echo -e "${GREEN}✅ 執行時間已修改為: 每天 ${NEW_HOUR}:$(printf "%02d" $NEW_MINUTE)${NC}"
    echo ""
    
    read -p "是否立即重新載入配置？(y/n) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        reload_config
    fi
}

# 主程式
while true; do
    show_menu
    read -p "請選擇功能 (0-9): " choice
    
    case $choice in
        1) check_status ;;
        2) run_now ;;
        3) view_log ;;
        4) view_error_log ;;
        5) view_history ;;
        6) stop_task ;;
        7) start_task ;;
        8) reload_config ;;
        9) change_schedule ;;
        0) 
            echo ""
            echo "👋 再見！"
            echo ""
            exit 0
            ;;
        *)
            echo ""
            echo -e "${RED}❌ 無效的選項，請重新選擇${NC}"
            ;;
    esac
    
    read -p "按 Enter 繼續..." dummy
done
