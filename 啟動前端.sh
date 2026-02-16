#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"

# 台股儀表板啟動腳本

echo "======================================================================"
echo "🚀 台股價值投資儀表板啟動程式"
echo "======================================================================"
echo ""

# 顏色定義
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 檢查 Node.js
echo -e "${BLUE}📍 步驟 1/3：檢查環境...${NC}"
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js 未安裝${NC}"
    echo "   請先安裝 Node.js: https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node --version)
echo -e "${GREEN}✅ Node.js $NODE_VERSION${NC}"

# 檢查依賴
echo ""
echo -e "${BLUE}📍 步驟 2/3：檢查依賴套件...${NC}"
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}⚠️  node_modules 不存在，正在安裝...${NC}"
    npm install
else
    echo -e "${GREEN}✅ 依賴已安裝${NC}"
fi

# 檢查資料來源
echo ""
echo -e "${BLUE}📍 步驟 3/3：檢查資料來源...${NC}"

# 檢查 JSON 檔案
if [ -f "public/stock_data.json" ]; then
    SIZE=$(ls -lh public/stock_data.json | awk '{print $5}')
    UPDATE_TIME=$(grep -o '"lastUpdate":"[^"]*' public/stock_data.json | cut -d'"' -f4)
    echo -e "${GREEN}✅ Python 數據檔案存在${NC}"
    echo "   大小: $SIZE"
    echo "   更新時間: $UPDATE_TIME"
else
    echo -e "${YELLOW}⚠️  stock_data.json 不存在${NC}"
    echo "   請先執行 make sync 同步持股資料"
fi

echo ""
echo "======================================================================"
echo -e "${GREEN}✅ 環境檢查完成！${NC}"
echo "======================================================================"
echo ""
echo "🌐 正在啟動開發伺服器..."
echo ""
echo "   前端網址: http://localhost:3000"
echo "   停止伺服器: 按 Ctrl + C"
echo ""
echo "======================================================================"
echo ""

# 啟動 Vite
npm run dev
