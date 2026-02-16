# ⚠️ 已棄用 — 僅供獨立除錯/回填，主流程請走 sync v2 (sync_portfolio.py)
# ⚠️ 已棄用 — 僅供獨立除錯/回填，主流程請走 sync v2 (sync_portfolio.py)
#!/usr/bin/env python3
"""
從 yfinance 抓取年度財報資料，存入 annual_fundamentals 表

提供每支股票最近 4 年的年度 EPS、FCF、Shares 等，
供 regenerate_stock_json.py 計算近 3 年平滑化 EPS 與每股自由現金流。

使用方式：
  python3 fetch_annual_fundamentals.py              # 全部股票
  python3 fetch_annual_fundamentals.py --ticker 2480 # 指定股票
"""

import yfinance as yf
import sqlite3
import time
import argparse
from datetime import datetime
from stock_config import STOCK_LIST, STOCK_NAME_MAPPING, DB_PATH, safe_float, get_yf_ticker as _shared_get_yf_ticker


# ────────────────────────────────────────────────────────────
# 資料庫
# ────────────────────────────────────────────────────────────

def init_annual_table():
    """建立 annual_fundamentals 表"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS annual_fundamentals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticker TEXT NOT NULL,
        fiscal_year INTEGER NOT NULL,
        period_end DATE NOT NULL,
        eps REAL,
        net_income REAL,
        revenue REAL,
        operating_income REAL,
        equity REAL,
        total_debt REAL,
        total_assets REAL,
        shares_outstanding REAL,
        fcf REAL,
        bvps REAL,
        roe REAL,
        source TEXT DEFAULT 'yfinance',
        fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(ticker, fiscal_year)
    )
    ''')
    cursor.execute('''
    CREATE INDEX IF NOT EXISTS idx_annual_ticker_year
    ON annual_fundamentals(ticker, fiscal_year)
    ''')
    conn.commit()
    conn.close()


# ────────────────────────────────────────────────────────────
# yfinance 工具
# ────────────────────────────────────────────────────────────

def get_yf_ticker(ticker_code):
    """嘗試 .TW 和 .TWO，回傳有效的 Ticker（用年報驗證）"""
    return _shared_get_yf_ticker(ticker_code, check_attr='financials')


# ────────────────────────────────────────────────────────────
# 抓取 + 儲存
# ────────────────────────────────────────────────────────────

def fetch_and_save(ticker_code):
    """抓取單支股票的年度資料並存入 DB"""
    name = STOCK_NAME_MAPPING.get(ticker_code, ticker_code)

    stock, symbol = get_yf_ticker(ticker_code)
    if stock is None:
        print(f"  ❌ {ticker_code} ({name}) 無法取得資料")
        return 0

    print(f"  📡 {symbol} ...", end=" ", flush=True)

    af = stock.financials
    ab = stock.balance_sheet
    ac = stock.cashflow

    if af is None or af.empty:
        print("無年度損益表")
        return 0

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    count = 0

    for col in sorted(af.columns):
        period_end = col.strftime('%Y-%m-%d')
        fiscal_year = col.year

        # 損益表
        eps = safe_float(af.loc['Basic EPS', col]) if 'Basic EPS' in af.index else None
        ni = safe_float(af.loc['Net Income', col]) if 'Net Income' in af.index else 0
        rev = safe_float(af.loc['Total Revenue', col]) if 'Total Revenue' in af.index else 0
        oi = safe_float(af.loc['Operating Income', col]) if 'Operating Income' in af.index else 0

        # 資產負債表
        equity = 0
        total_debt = 0
        total_assets = 0
        shares = 0
        if ab is not None and col in ab.columns:
            equity = safe_float(ab.loc['Stockholders Equity', col]) if 'Stockholders Equity' in ab.index else 0
            total_debt = safe_float(ab.loc['Total Debt', col]) if 'Total Debt' in ab.index else 0
            total_assets = safe_float(ab.loc['Total Assets', col]) if 'Total Assets' in ab.index else 0
            shares = safe_float(ab.loc['Ordinary Shares Number', col]) if 'Ordinary Shares Number' in ab.index else 0

        # 現金流量表
        fcf = 0
        if ac is not None and col in ac.columns:
            fcf = safe_float(ac.loc['Free Cash Flow', col]) if 'Free Cash Flow' in ac.index else 0

        # EPS fallback
        if (eps is None or eps == 0) and shares > 0:
            eps = ni / shares

        # 衍生指標
        bvps = equity / shares if shares > 0 else 0
        roe = (ni / equity * 100) if equity > 0 else 0

        try:
            cursor.execute('''
            INSERT OR REPLACE INTO annual_fundamentals
            (ticker, fiscal_year, period_end, eps, net_income, revenue,
             operating_income, equity, total_debt, total_assets,
             shares_outstanding, fcf, bvps, roe, source)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                ticker_code, fiscal_year, period_end,
                round(eps, 2) if eps is not None else None,
                round(ni, 0), round(rev, 0), round(oi, 0),
                round(equity, 0), round(total_debt, 0), round(total_assets, 0),
                round(shares, 0),
                round(fcf, 0),
                round(bvps, 2), round(roe, 2),
                'yfinance'
            ))
            count += 1
        except Exception as e:
            print(f"\n    ❌ {fiscal_year} 插入失敗: {e}")

    conn.commit()
    conn.close()

    print(f"{count} 年")
    return count


# ────────────────────────────────────────────────────────────
# 主程式
# ────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description='抓取年度財報資料')
    parser.add_argument('--ticker', type=str, help='只處理指定股票代碼')
    args = parser.parse_args()

    tickers = [args.ticker] if args.ticker else STOCK_LIST

    print("=" * 70)
    print("📊 抓取年度財報資料 → annual_fundamentals")
    print(f"⏰ {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"📋 目標: {len(tickers)} 檔股票")
    print("=" * 70)

    init_annual_table()

    total_years = 0
    success = 0
    start = time.time()

    for i, ticker in enumerate(tickers, 1):
        name = STOCK_NAME_MAPPING.get(ticker, ticker)
        print(f"\n[{i}/{len(tickers)}] {ticker} ({name})")
        n = fetch_and_save(ticker)
        if n > 0:
            success += 1
            total_years += n
        if i < len(tickers):
            time.sleep(1.5)

    elapsed = time.time() - start

    print(f"\n{'=' * 70}")
    print(f"✅ 完成: {success}/{len(tickers)} 檔成功, 共 {total_years} 筆年度資料")
    print(f"⏱️  耗時: {elapsed:.1f} 秒")
    print("=" * 70)

    # 驗證
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    cur.execute('''
        SELECT ticker, COUNT(*) as years,
               MIN(fiscal_year) as from_year, MAX(fiscal_year) as to_year,
               ROUND(AVG(eps), 2) as avg_eps
        FROM annual_fundamentals
        GROUP BY ticker ORDER BY ticker
    ''')
    print(f"\n{'ticker':<7} {'years':>5} {'range':>12} {'avg_eps':>8}")
    print('-' * 36)
    for r in cur.fetchall():
        print(f"{r['ticker']:<7} {r['years']:>5} {r['from_year']}~{r['to_year']:>5} {r['avg_eps']:>8.2f}")
    conn.close()


if __name__ == '__main__':
    main()
