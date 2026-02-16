"""
db.crud — 資料庫查詢 / 新增 / 刪除操作

提供：
  get_db_tickers       — 取得 DB 中所有 ticker 集合
  remove_ticker_from_db — 刪除指定 ticker 的全部資料
  save_to_fundamentals_history — 將季報資料存入 fundamentals_history 表
"""

import os
import sqlite3
import contextlib

from stock_config import DB_PATH

# S-5: 允許查詢的表名白名單
_VALID_TABLES = frozenset(['stock_history', 'annual_fundamentals', 'fundamentals_history'])


# ─── 查詢 DB 中所有 ticker ──────────────────────────────────

def get_db_tickers():
    """回傳 DB stock_history / annual_fundamentals / fundamentals_history 中的所有 ticker 集合。"""
    if not os.path.exists(DB_PATH):
        return set()
    with contextlib.closing(sqlite3.connect(DB_PATH)) as conn:
        tickers = set()
        for table in ['stock_history', 'annual_fundamentals', 'fundamentals_history']:
            if table not in _VALID_TABLES:
                continue
            try:
                rows = conn.execute(f'SELECT DISTINCT ticker FROM {table}').fetchall()
                tickers.update(r[0] for r in rows)
            except sqlite3.OperationalError:
                pass
    return tickers


# ─── 刪除指定 ticker ─────────────────────────────────────────

def remove_ticker_from_db(ticker):
    """從 stock_history / annual_fundamentals / fundamentals_history 中移除指定 ticker。"""
    with contextlib.closing(sqlite3.connect(DB_PATH)) as conn:
        total = 0
        for table in ['stock_history', 'annual_fundamentals', 'fundamentals_history']:
            if table not in _VALID_TABLES:
                continue
            try:
                cursor = conn.execute(f'DELETE FROM {table} WHERE ticker = ?', (ticker,))
                total += cursor.rowcount
            except sqlite3.OperationalError:
                pass
        conn.commit()
    return total


# ─── 存入 fundamentals_history ────────────────────────────────

def save_to_fundamentals_history(ticker_code, quarters, dividend_data):
    """
    將季報資料存入 fundamentals_history 表。

    Args:
        ticker_code: 台股代碼
        quarters: list[dict]，每筆含 period_end / fiscal_year / fiscal_quarter / ...
        dividend_data: dict，key=年度, value=每股股利

    Returns:
        int: 成功插入的筆數
    """
    with contextlib.closing(sqlite3.connect(DB_PATH)) as conn:
        cursor = conn.cursor()

        inserted = 0
        for q in quarters:
            bvps = q['equity'] / q['shares'] if q['shares'] > 0 else 0
            div = dividend_data.get(q['fiscal_year'], 0)

            # 計算單季年化 ROE
            quarterly_roe = (q['net_income'] * 4 / q['equity'] * 100) if q['equity'] > 0 else 0

            try:
                cursor.execute('''
                INSERT OR REPLACE INTO fundamentals_history
                (ticker, period_end, fiscal_year, fiscal_quarter, eps, net_income,
                 revenue, operating_income, equity, total_debt, total_assets,
                 shares_outstanding, bvps, roe, fcf, dividend_per_share, source)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    ticker_code, q['period_end'], q['fiscal_year'], q['fiscal_quarter'],
                    round(q['basic_eps'], 2),
                    round(q['net_income'], 0),
                    round(q['revenue'], 0),
                    round(q['operating_income'], 0),
                    round(q['equity'], 0),
                    round(q['total_debt'], 0),
                    round(q['total_assets'], 0),
                    round(q['shares'], 0),
                    round(bvps, 2),
                    round(quarterly_roe, 2),
                    round(q['fcf'] / 1_000_000, 2),
                    div,
                    'yfinance'
                ))
                inserted += 1
            except Exception as e:
                print(f"    ❌ 插入 {q['period_end']} 失敗: {e}")

        conn.commit()
    return inserted
