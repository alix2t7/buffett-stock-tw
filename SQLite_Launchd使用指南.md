# SQLite + Launchd 自動化方案

## 📋 已創建檔案

### 1. **sync_portfolio.py** — 主同步腳本
- 使用 yfinance 抓取持股清單中的台股
- 儲存到 SQLite 資料庫 (stock_history.db)
- 同時生成 JSON 供前端使用
- 支援 CLI 新增 / 移除持股

### 2. **query_stock.py** - 互動式查詢工具
功能選單：
1. 查看最新資料（所有股票）
2. 查看特定股票歷史
3. 查看更新日誌
4. 查看資料庫統計
5. 匯出特定股票 CSV
6. 比較股票表現
7. 查看價格趨勢

### 3. **com.user.stocksync.plist** - Launchd 配置
- 每天早上 9:00 自動執行
- 開機後延遲 60 秒執行一次
- 日誌儲存在 logs/ 目錄

### 4. **setup_automation.sh** - 一鍵安裝腳本
自動完成：
- 檢查 Python 環境
- 安裝必要套件
- 創建日誌目錄
- 初始化資料庫
- 安裝 Launchd 任務
- 設定執行權限

## 🚀 快速開始

### 步驟 1：執行安裝腳本
```bash
chmod +x setup_automation.sh
./setup_automation.sh
```

### 步驟 2：設定持股清單
```bash
cp stock_config.example.json stock_config.local.json
# 編輯 stock_config.local.json，填入持股代碼
```

### 步驟 3：同步並測試前端
```bash
make sync    # 同步持股資料
make dev     # 啟動前端 http://localhost:3000
```

## 📊 資料庫結構

### stock_history 表（歷史資料）
| 欄位 | 類型 | 說明 |
|------|------|------|
| id | INTEGER | 主鍵 |
| ticker | TEXT | 股票代碼 |
| name | TEXT | 股票名稱 |
| sector | TEXT | 產業類別 |
| price | REAL | 股價 |
| eps | REAL | 每股盈餘 |
| pe | REAL | 本益比 |
| pb | REAL | 股價淨值比 |
| roe | REAL | 股東權益報酬率 |
| dividend_yield | REAL | 殖利率 |
| debt_to_equity | REAL | 負債比 |
| current_ratio | REAL | 流動比率 |
| fcf | REAL | 自由現金流 |
| bvps | REAL | 每股淨值 |
| growth_rate | REAL | 成長率 |
| fetch_error | INTEGER | 是否錯誤 (0/1) |
| fetch_time | TIMESTAMP | 抓取時間 |

### update_logs 表（更新日誌）
| 欄位 | 類型 | 說明 |
|------|------|------|
| id | INTEGER | 主鍵 |
| update_time | TIMESTAMP | 更新時間 |
| total_stocks | INTEGER | 總股票數 |
| success_count | INTEGER | 成功數 |
| failed_count | INTEGER | 失敗數 |
| duration_seconds | REAL | 執行時間 |

## 🔧 管理指令

### Launchd 控制
```bash
# 查看任務狀態
launchctl list | grep stocksync

# 停止任務
launchctl unload ~/Library/LaunchAgents/com.user.stocksync.plist

# 重新啟動
launchctl load ~/Library/LaunchAgents/com.user.stocksync.plist

# 立即執行（測試用）
launchctl start com.user.stocksync

# 查看日誌
tail -f logs/stock_update.log
tail -f logs/stock_update_error.log
```

### 手動更新
```bash
# 同步持股資料
make sync
# 或直接執行
python3 sync_portfolio.py

# 查詢歷史資料
python3 query_stock.py
```

### 資料庫查詢範例
```bash
# 直接用 sqlite3 查詢
sqlite3 stock_history.db

# 查看最新資料
SELECT ticker, name, price, pe, roe, fetch_time 
FROM stock_history 
ORDER BY fetch_time DESC 
LIMIT 24;

# 查看特定股票歷史
SELECT price, eps, pe, fetch_time 
FROM stock_history 
WHERE ticker = '2330' 
ORDER BY fetch_time DESC;

# 統計每月平均價格
SELECT 
    ticker,
    strftime('%Y-%m', fetch_time) as month,
    AVG(price) as avg_price,
    COUNT(*) as records
FROM stock_history 
WHERE ticker = '2330'
GROUP BY ticker, month
ORDER BY month DESC;
```

## 📈 使用查詢工具

### 啟動互動式查詢
```bash
python3 query_stock.py
```

### 功能說明
- **選項 1**: 查看所有股票的最新資料
- **選項 2**: 輸入股票代碼，查看近 30 筆歷史記錄
- **選項 3**: 查看系統更新日誌（成功率、執行時間）
- **選項 4**: 資料庫統計（總記錄數、成功率、資料庫大小）
- **選項 5**: 匯出股票歷史為 CSV 檔案
- **選項 6**: 比較多檔股票（輸入如 2330,2454,2412）
- **選項 7**: 查看價格趨勢與波動分析

## 🎯 優勢特點

### vs 原始 fetch_stock_data.py
✅ **保留歷史資料** - 每次更新都會新增記錄，不會覆蓋
✅ **趨勢分析** - 可查詢價格變化、波動幅度
✅ **更新追蹤** - 記錄每次更新的成功率和耗時
✅ **自動清理** - 90 天後自動清除舊資料，節省空間

### vs Crontab
✅ **macOS 原生** - Launchd 是 macOS 官方推薦方案
✅ **更穩定** - 系統級服務，不受使用者登入影響
✅ **日誌管理** - 自動記錄標準輸出和錯誤
✅ **開機執行** - RunAtLoad 確保系統重啟後自動運作

## 📁 檔案結構
```
持股分析儀表版/
├── sync_portfolio.py           # 主同步腳本
├── stock_config.py             # 設定載入（JSON 格式）
├── stock_config.local.json     # 持股清單設定
├── query_stock.py              # 互動式查詢工具
├── setup_automation.sh         # Launchd 安裝腳本
├── stock_history.db            # SQLite 資料庫（自動生成）
├── logs/                       # 日誌目錄
├── public/
│   ├── stock_data.json         # 前端用 JSON（自動同步）
│   └── history/                # 個股歷史 JSON
└── src/                        # React + TypeScript 前端
```

## ⚙️ 自訂設定

### 資料保留策略（重要！）
**預設：保留所有歷史資料**（已停用自動清理）

資料量很小（10年約40MB），建議保留完整歷史用於趨勢分析。

如需啟用清理，可在 `sync_portfolio.py` 或資料庫管理腳本中加入清理邏輯：
```python
# 範例：清理 N 天前的資料
cleanup_old_data(days=1825)   # 保留 5 年
cleanup_old_data(days=3650)   # 保留 10 年
```

**資料量參考**：
- 1 年歷史 ≈ 4 MB
- 5 年歷史 ≈ 19 MB  
- 10 年歷史 ≈ 39 MB （推薦，適合長期價值投資分析）

### 修改更新時間
編輯 `com.user.stocksync.plist`：
```xml
<key>StartCalendarInterval</key>
<dict>
    <key>Hour</key>
    <integer>9</integer>    <!-- 改為你要的小時 (0-23) -->
    <key>Minute</key>
    <integer>0</integer>    <!-- 改為你要的分鐘 (0-59) -->
</dict>
```

修改後重新載入：
```bash
launchctl unload ~/Library/LaunchAgents/com.user.stocksync.plist
launchctl load ~/Library/LaunchAgents/com.user.stocksync.plist
```

### 修改保留天數
可在資料庫管理腳本中設定清理遏輯：
```python
cleanup_old_data(days=90)  # 改為你要的天數
```

### 增加更新頻率
在 plist 中新增多個時間：
```xml
<key>StartCalendarInterval</key>
<array>
    <dict>
        <key>Hour</key>
        <integer>9</integer>
        <key>Minute</key>
        <integer>0</integer>
    </dict>
    <dict>
        <key>Hour</key>
        <integer>15</integer>
        <key>Minute</key>
        <integer>0</integer>
    </dict>
</array>
```

## 🐛 故障排除

### Launchd 沒有執行？
```bash
# 1. 檢查任務狀態
launchctl list | grep stocksync

# 2. 查看錯誤日誌
cat logs/stock_update_error.log

# 3. 手動測試腳本
python3 sync_portfolio.py

# 4. 檢查 Python 路徑
which python3
# 確保與 plist 中的路徑一致
```

### 資料庫被鎖定？
```bash
# 確保沒有其他程式正在使用
lsof stock_history.db

# 強制解鎖（謹慎使用）
rm -f stock_history.db-journal
```

### 前端沒有顯示資料？
```bash
# 1. 檢查 JSON 是否生成
ls -lh public/stock_data.json

# 2. 驗證 JSON 格式
python3 -m json.tool public/stock_data.json

# 3. 確認前端是否可正常啟動
make dev
```

## 📞 命令速查表

```bash
# === 安裝 ===
chmod +x setup_automation.sh && ./setup_automation.sh

# === 日常使用 ===
python3 query_stock.py                    # 查詢資料
launchctl start com.user.stocksync       # 立即更新
tail -f logs/stock_update.log            # 查看日誌

# === 維護 ===
launchctl list | grep stock              # 檢查狀態
sqlite3 stock_history.db "SELECT COUNT(*) FROM stock_history"  # 記錄數
du -h stock_history.db                   # 資料庫大小

# === 緊急處理 ===
launchctl unload ~/Library/LaunchAgents/com.user.stocksync.plist   # 停止
rm stock_history.db && python3 sync_portfolio.py  # 重建資料庫
```

## ✅ 完成檢查清單

- [ ] 執行 `./setup_automation.sh` 成功
- [ ] `stock_history.db` 已創建
- [ ] `launchctl list | grep stocksync` 顯示任務
- [ ] `python3 query_stock.py` 可以查詢資料
- [ ] `stock_config.local.json` 已建立
- [ ] 前端 `make dev` 可以顯示持股數據
- [ ] logs/ 目錄有日誌檔案

全部完成後，系統將：
- ✅ 每天早上 9:00 自動更新
- ✅ 保留完整歷史資料
- ✅ 前端即時顯示最新數據
- ✅ 可隨時查詢歷史趨勢
