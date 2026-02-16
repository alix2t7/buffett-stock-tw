#!/bin/bash
set -euo pipefail

# ============================================================
#  巴菲特選股器 — 新 Mac 一鍵設置腳本
#  適用於「完全沒有開發工具」的 macOS
#
#  使用方式：
#    1. 開啟「終端機」(Spotlight 搜尋 "Terminal")
#    2. 執行：bash setup_new_mac.sh
#       或指定 GitHub repo：
#       bash setup_new_mac.sh https://github.com/<帳號>/buffett-stock-tw.git
# ============================================================

echo ""
echo "🚀 巴菲特選股器 — 新 Mac 環境設置"
echo "======================================"
echo ""

# ── 色彩 ──
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

step() { echo -e "\n${GREEN}📦 [$1] $2${NC}"; }
warn() { echo -e "${YELLOW}   ⚠️  $1${NC}"; }
fail() { echo -e "${RED}   ❌ $1${NC}"; exit 1; }
ok()   { echo -e "${GREEN}   ✅ $1${NC}"; }

TOTAL_STEPS=6

# ────────────────────────────────────────────
# 1. Xcode Command Line Tools（含 git）
# ────────────────────────────────────────────
step "1/$TOTAL_STEPS" "Xcode Command Line Tools（含 git）"

if xcode-select -p &>/dev/null; then
    ok "已安裝"
else
    echo "   系統會彈出安裝對話框，請點『安裝』並等待完成"
    xcode-select --install 2>/dev/null || true

    echo -n "   ⏳ 等待安裝完成"
    until xcode-select -p &>/dev/null; do
        echo -n "."
        sleep 5
    done
    echo ""
    ok "安裝完成"
fi

# ────────────────────────────────────────────
# 2. Homebrew
# ────────────────────────────────────────────
step "2/$TOTAL_STEPS" "Homebrew"

if command -v brew &>/dev/null; then
    ok "已安裝 ($(brew --version | head -1))"
else
    echo "   安裝 Homebrew（會要求輸入密碼）..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

    # Apple Silicon vs Intel
    if [[ -f /opt/homebrew/bin/brew ]]; then
        eval "$(/opt/homebrew/bin/brew shellenv)"
        # 寫入 shell profile 以便之後的 terminal 也有
        PROFILE="${HOME}/.zprofile"
        if ! grep -q 'homebrew' "$PROFILE" 2>/dev/null; then
            echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> "$PROFILE"
        fi
    elif [[ -f /usr/local/bin/brew ]]; then
        eval "$(/usr/local/bin/brew shellenv)"
    fi
    ok "安裝完成"
fi

# ────────────────────────────────────────────
# 3. Node.js
# ────────────────────────────────────────────
step "3/$TOTAL_STEPS" "Node.js"

if command -v node &>/dev/null; then
    ok "已安裝 ($(node --version))"
else
    brew install node
    ok "安裝完成 ($(node --version))"
fi

# 版本檢查
NODE_MAJOR=$(node --version | sed 's/v\([0-9]*\).*/\1/')
if (( NODE_MAJOR < 18 )); then
    warn "Node $NODE_MAJOR 版本過低，建議 18+。執行 brew upgrade node"
fi

# ────────────────────────────────────────────
# 4. Python 3 + pip
# ────────────────────────────────────────────
step "4/$TOTAL_STEPS" "Python 3"

if command -v python3 &>/dev/null; then
    ok "已安裝 ($(python3 --version))"
else
    brew install python3
    ok "安裝完成 ($(python3 --version))"
fi

# 確保 pip 可用
if ! python3 -m pip --version &>/dev/null; then
    echo "   安裝 pip..."
    python3 -m ensurepip --upgrade 2>/dev/null || brew install python3
fi

# ────────────────────────────────────────────
# 5. Clone 專案（或偵測本地已存在）
# ────────────────────────────────────────────
step "5/$TOTAL_STEPS" "下載專案"

# 判斷是否從專案內部執行（已有 sync_portfolio.py 表示在專案裡）
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "$SCRIPT_DIR/sync_portfolio.py" ]]; then
    # 在專案內部執行 — 不需要 clone
    INSTALL_DIR="$SCRIPT_DIR"
    ok "偵測到已在專案目錄內：$INSTALL_DIR"
else
    # 需要 clone
    REPO_URL="${1:-}"
    if [[ -z "$REPO_URL" ]]; then
        echo ""
        read -rp "   請輸入 GitHub repo URL: " REPO_URL
        if [[ -z "$REPO_URL" ]]; then
            fail "未提供 repo URL，請以參數傳入：bash setup_new_mac.sh <repo-url>"
        fi
    fi

    INSTALL_DIR="$HOME/Desktop/持股分析儀表版"

    if [[ -d "$INSTALL_DIR/.git" ]]; then
        warn "目錄已存在，執行 git pull 更新..."
        cd "$INSTALL_DIR"
        git pull --rebase || true
    else
        echo "   Cloning 到 $INSTALL_DIR ..."
        git clone "$REPO_URL" "$INSTALL_DIR"
    fi
    ok "專案已就緒：$INSTALL_DIR"
fi

cd "$INSTALL_DIR"

# ────────────────────────────────────────────
# 6. 安裝依賴 + 設定
# ────────────────────────────────────────────
step "6/$TOTAL_STEPS" "安裝依賴與初始設定"

echo "   📦 npm install..."
npm install

echo "   📦 建立 Python 虛擬環境 + 安裝依賴..."
if [[ ! -d .venv ]]; then
    python3 -m venv .venv
fi
.venv/bin/pip install -r requirements.txt --quiet

# 建立設定檔
if [[ ! -f stock_config.local.json ]] && [[ -f stock_config.example.json ]]; then
    cp stock_config.example.json stock_config.local.json
    warn "已建立 stock_config.local.json（預設範例股票）"
    echo "   📝 請稍後編輯此檔案，填入你的持股代碼"
else
    ok "stock_config.local.json 已存在"
fi

# 修復執行權限（以防 Google Drive / zip 傳輸遺失）
echo "   🔧 修復腳本執行權限..."
chmod +x *.sh *.command 2>/dev/null || true

# 建立桌面捷徑
echo "   🖥️  建立桌面捷徑..."
if [[ -f create_app_shortcut.sh ]]; then
    bash create_app_shortcut.sh
else
    warn "找不到 create_app_shortcut.sh，跳過桌面捷徑"
fi

ok "依賴安裝完成"

# ────────────────────────────────────────────
# 完成
# ────────────────────────────────────────────
echo ""
echo "=============================================="
echo -e "${GREEN}🎉 設置完成！${NC}"
echo "=============================================="
echo ""
echo "📍 專案位置：$INSTALL_DIR"
echo ""
echo "▶️  啟動方式："
echo "   • 雙擊桌面「持股儀表板」圖示（推薦）"
echo "   • 或在終端執行：cd '$INSTALL_DIR' && make sync && make dev"
echo ""
echo "⚠️  首次使用請先："
echo "   1. 編輯 stock_config.local.json（填入你的持股代碼）"
echo "   2. 雙擊桌面「持股儀表板」（會自動同步資料）"
echo ""

# 詢問是否編輯持股清單
read -rp "是否現在編輯持股清單？(y/N) " yn
if [[ "$yn" =~ ^[Yy]$ ]]; then
    open -e "$INSTALL_DIR/stock_config.local.json"
fi
