# Changelog

本專案所有重要變更皆記錄於此檔案。  
格式基於 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.1.0/)，版本號遵循 [Semantic Versioning](https://semver.org/lang/zh-TW/)。

## [1.0.0] - 2026-02-16

### Added
- 持股即時資料儀表板 — React + TypeScript + Recharts
- Python 後端 — yfinance 資料抓取 + SQLite 存儲
- 兩階段 DCF 估值引擎（含風險溢酬、資產保底、終值雙重校驗）
- 多維度篩選：類股、搜尋、排序
- 個股詳情面板 — 歷史走勢圖 + 財務指標
- macOS .app 桌面一鍵啟動
- launchd 每日自動同步排程
- Makefile 統一管理（13 個目標）
- JSON Schema 驗證工具
- MIT 授權

### Fixed
- 兩輪程式碼審計共修正 64 項問題
- plist 名稱統一為 `com.user.stocksync`
- 啟動腳本 port 衝突智慧偵測
- 自動建立 `stock_config.local.json`
