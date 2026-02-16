# Contributing 貢獻指南

感謝你對本專案的興趣！以下是參與貢獻的方式。

## 開發環境

| 工具 | 版本 |
|---|---|
| Node.js | ≥ 22 (見 `.nvmrc`) |
| Python | ≥ 3.12 (見 `.python-version`) |
| macOS | ≥ 12 Monterey |

```bash
# 1. Clone & 安裝
git clone <repo-url> && cd <repo>
nvm use               # 使用 .nvmrc 指定版本
npm install
pip install -r requirements.txt

# 2. 設定持股
cp stock_config.example.json stock_config.local.json
# 編輯 stock_config.local.json 填入你的持股

# 3. 同步資料 & 啟動
make sync
make dev
```

## 開發流程

1. **Fork** 本專案
2. 建立 feature branch：`git checkout -b feat/my-feature`
3. 提交變更：`git commit -m "feat: add my feature"`
4. 推送到你的 fork：`git push origin feat/my-feature`
5. 在 GitHub 建立 **Pull Request**

## Commit 慣例

採用 [Conventional Commits](https://www.conventionalcommits.org/)：

| 前綴 | 用途 |
|---|---|
| `feat:` | 新功能 |
| `fix:` | 修正 Bug |
| `docs:` | 文件更新 |
| `style:` | 格式調整（不影響邏輯） |
| `refactor:` | 重構 |
| `test:` | 測試相關 |
| `chore:` | 建置/工具鏈 |

## 測試

```bash
make test     # 執行 DCF 引擎測試
make validate # 驗證 JSON Schema
```

## 程式碼風格

- **TypeScript / JS** — 2 空格縮排 (見 `.editorconfig`)
- **Python** — 4 空格縮排，遵循 PEP 8
- **Shell** — 2 空格縮排

## 回報問題

請到 [Issues](../../issues) 開新議題，附上：
- 作業系統版本
- Node / Python 版本
- 錯誤訊息或截圖
- 重現步驟

## 授權

提交 PR 即表示你同意以 [MIT License](LICENSE) 授權你的貢獻。
