# ══════════════════════════════════════════════════════════════
# 持股分析儀表板 — Makefile
# 用法：make <target>
# ══════════════════════════════════════════════════════════════

PYTHON  := python3
NPX     := npx
PORT    := 3000

.PHONY: help install dev sync export regen validate test build clean status app

# ── 預設：顯示說明 ──────────────────────────────────────────
help:
	@echo ""
	@echo "  📊 持股分析儀表板 — 常用指令"
	@echo "  ════════════════════════════════════════"
	@echo ""
	@echo "  開發 ─────────────────────────────────"
	@echo "    make install    安裝前端依賴 (npm install)"
	@echo "    make dev        啟動 Vite 開發伺服器"
	@echo "    make build      產生靜態 production build"
	@echo ""
	@echo "  資料 ─────────────────────────────────"
	@echo "    make sync       同步全部持股（抓取 + 匯出 JSON）"
	@echo "    make export     僅重新匯出 JSON（不抓新資料）"
	@echo "    make regen      僅重建 stock_data.json"
	@echo "    make validate   驗證 JSON 符合 schema"
	@echo "    make test       執行 DCF 單元測試"
	@echo ""
	@echo "  工具 ─────────────────────────────────"
	@echo "    make status     顯示 DB 與 JSON 狀態"
	@echo "    make app        在桌面建立 .app 捷徑"
	@echo "    make clean      清除暫存檔"
	@echo "    make all        完整流程：sync → validate → dev"
	@echo ""

# ── 安裝依賴 ─────────────────────────────────────────────
install:
	@echo "📦 安裝前端依賴..."
	npm install
	@echo "📦 檢查 Python 依賴..."
	$(PYTHON) -c "import yfinance, sqlite3" 2>/dev/null || \
		(echo "⚠️  請先執行: pip install -r requirements.txt" && exit 1)
	@echo "✅ 依賴就緒"

# ── 開發伺服器 ───────────────────────────────────────────
dev:
	@echo "🚀 啟動 Vite 開發伺服器 (port $(PORT))..."
	$(NPX) vite --port $(PORT)

# ── 同步持股（完整流程）──────────────────────────────────
sync:
	@echo "🔄 同步全部持股..."
	$(PYTHON) sync_portfolio.py --refresh
	@echo ""
	@$(MAKE) --no-print-directory validate
	@echo ""
	@echo "✅ 同步完成！可執行 make dev 檢視"

# ── 僅匯出 JSON（DB → JSON，不抓新資料）──────────────────
export:
	@echo "📄 匯出 stock_data.json..."
	$(PYTHON) -c "from exporters.stock_data import generate_stock_data_json; generate_stock_data_json()"
	@echo "📄 匯出 history_all.json..."
	$(PYTHON) -c "from exporters.history import export_history_json; export_history_json('.')"
	@echo "✅ JSON 匯出完成"

# ── 僅重建 stock_data.json ────────────────────
regen:
	@echo "📄 重建 stock_data.json..."
	$(PYTHON) -c "from exporters.stock_data import generate_stock_data_json; generate_stock_data_json()"
	@echo "✅ 完成"

# ── 測試 ─────────────────────────────────────────────────
test:
	@echo "🧪 執行 DCF 單元測試..."
	@$(NPX) tsx tests/dcf-engine.test.mjs
	@echo ""
	@echo "🧪 執行 DCF 邊界值測試..."
	@$(NPX) tsx tests/dcf-engine.unit.mjs

# ── Schema 驗證 ──────────────────────────────────────────
validate:
	@echo "🔍 驗證 JSON schema..."
	@$(PYTHON) validate_schemas.py

# ── Production build ─────────────────────────────────────
build:
	@echo "🏗️  產生 production build..."
	$(NPX) vite build
	@echo "✅ Build 完成，輸出於 dist/"

# ── 顯示系統狀態 ─────────────────────────────────────────
status:
	@echo ""
	@echo "📊 系統狀態"
	@echo "════════════════════════════════════════"
	@echo ""
	@echo "📁 JSON 檔案："
	@ls -lh public/stock_data.json public/history_all.json 2>/dev/null || echo "  ⚠️  JSON 檔案不存在"
	@echo ""
	@echo "🗄️  SQLite 資料庫："
	@if [ -f stock_history.db ]; then \
		echo "  stock_history:  $$($(PYTHON) -c "import sqlite3; c=sqlite3.connect('stock_history.db'); print(c.execute('SELECT COUNT(*) FROM stock_history').fetchone()[0])") 筆"; \
		echo "  annual_fund:    $$($(PYTHON) -c "import sqlite3; c=sqlite3.connect('stock_history.db'); print(c.execute('SELECT COUNT(*) FROM annual_fundamentals').fetchone()[0])") 筆"; \
		echo "  fund_history:   $$($(PYTHON) -c "import sqlite3; c=sqlite3.connect('stock_history.db'); print(c.execute('SELECT COUNT(*) FROM fundamentals_history').fetchone()[0])") 筆"; \
	else \
		echo "  ⚠️  stock_history.db 不存在"; \
	fi
	@echo ""
	@echo "📋 持股清單："
	@$(PYTHON) -c "from stock_config import STOCK_LIST; print(f'  {len(STOCK_LIST)} 支: {STOCK_LIST[:5]}...')"
	@echo ""

# ── 桌面 App 捷徑 ────────────────────────────────────────
app:
	@echo "📱 建立桌面 App 捷徑..."
	sh create_app_shortcut.sh

# ── 清除暫存 ─────────────────────────────────────────────
clean:
	@echo "🧹 清除暫存..."
	rm -rf dist/ __pycache__/ logs/*.log
	rm -rf fetchers/__pycache__/ db/__pycache__/ transforms/__pycache__/ exporters/__pycache__/
	rm -f *.py.bak
	@echo "✅ 清除完成"

# ── 完整流程 ─────────────────────────────────────────────
all: sync dev
