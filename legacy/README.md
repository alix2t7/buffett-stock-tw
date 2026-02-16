# legacy/archived/ — 已棄用腳本

> ⚠️ 此目錄中的腳本僅供獨立除錯 / 回填，**主流程請走 sync v2 (`sync_portfolio.py`)**。

## 歸檔清單

| 腳本 | 原始位置 | 歸檔日期 | 取代方案 |
|------|---------|---------|---------|
| `fetch_stock_data_db.py` | `/` (root) | 2025 | `fetchers/price.py` → `save_current_snapshot()` |
| `fetch_annual_fundamentals.py` | `/` (root) | 2025 | `fetchers/fundamentals.py` → `save_annual_fundamentals()` |
| `fetch_historical_data.py` | `/` (root) | 2025 | `fetchers/price.py` → `save_historical_prices()` |
| `fix_all_fundamentals.py` | `/` (root) | 2026-02 | `sync_portfolio.py --refresh`（內部呼叫 `save_quarterly_and_fix()`） |

## 正式流程

```bash
make sync                          # 一鍵同步全部持股
python3 sync_portfolio.py --refresh  # 手動全量更新
```

## 何時使用歸檔腳本

- 需要針對單支股票進行獨立除錯時
- 需要大量回填歷史資料、且主流程無法滿足需求時
- ⚠️ 歸檔腳本可能引用已移除的函式（如 `fetch_quarterly_data`），執行前請先確認相依性
