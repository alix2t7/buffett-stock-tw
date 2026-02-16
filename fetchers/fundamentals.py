"""
fetchers.fundamentals — 年報 / 季報抓取與修正

Step 2: 年報 → annual_fundamentals
Step 4: 季報修正 → fundamentals_history + UPDATE stock_history
"""

import sqlite3
import contextlib

from stock_config import (
    DB_PATH, safe_number,
)
from db.crud import save_to_fundamentals_history
from transforms.snapshots import build_fundamental_snapshots, update_stock_history


# ─── Step 2: 年報 → annual_fundamentals ──────────────────────

def save_annual_fundamentals(ticker_code, stock):
    """
    從 yf.Ticker 擷取年度財報（損益、資產負債、現金流），
    存入 annual_fundamentals 表。

    Args:
        ticker_code: 台股代碼
        stock: yf.Ticker 物件
    """
    af = stock.financials
    ab = stock.balance_sheet
    ac = stock.cashflow

    if af is None or af.empty:
        print("    ▸ 年報 ⚠️  無資料")
        return

    with contextlib.closing(sqlite3.connect(DB_PATH)) as conn:
        cursor = conn.cursor()

        count = 0
        for col in sorted(af.columns):
            period_end = col.strftime('%Y-%m-%d')
            fy = col.year

            eps = safe_number(af.loc['Basic EPS', col]) if 'Basic EPS' in af.index else None
            ni  = safe_number(af.loc['Net Income', col]) if 'Net Income' in af.index else 0
            rev = safe_number(af.loc['Total Revenue', col]) if 'Total Revenue' in af.index else 0
            oi  = safe_number(af.loc['Operating Income', col]) if 'Operating Income' in af.index else 0

            equity = debt = assets = shares = 0
            if ab is not None and col in ab.columns:
                equity = safe_number(ab.loc['Stockholders Equity', col]) if 'Stockholders Equity' in ab.index else 0
                debt   = safe_number(ab.loc['Total Debt', col]) if 'Total Debt' in ab.index else 0
                assets = safe_number(ab.loc['Total Assets', col]) if 'Total Assets' in ab.index else 0
                shares = safe_number(ab.loc['Ordinary Shares Number', col]) if 'Ordinary Shares Number' in ab.index else 0

            fcf = 0
            if ac is not None and col in ac.columns:
                fcf = safe_number(ac.loc['Free Cash Flow', col]) if 'Free Cash Flow' in ac.index else 0

            if (eps is None or eps == 0) and shares > 0:
                eps = ni / shares

            bvps = equity / shares if shares > 0 else 0
            roe  = (ni / equity * 100) if equity > 0 else 0

            cursor.execute('''
                INSERT OR REPLACE INTO annual_fundamentals
                (ticker, fiscal_year, period_end, eps, net_income, revenue,
                 operating_income, equity, total_debt, total_assets,
                 shares_outstanding, fcf, bvps, roe, source)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            ''', (
                ticker_code, fy, period_end,
                round(eps, 2) if eps is not None else None,
                round(ni, 0), round(rev, 0), round(oi, 0),
                round(equity, 0), round(debt, 0), round(assets, 0),
                round(shares, 0), round(fcf, 0),
                round(bvps, 2), round(roe, 2), 'yfinance',
            ))
            count += 1

        conn.commit()
    print(f"    ▸ 年報 ✅  {count} 年")


# ─── Step 4: 季報修正 → fundamentals_history + UPDATE ────────

def save_quarterly_and_fix(ticker_code, stock):
    """
    從 yf.Ticker 擷取季報 → save_to_fundamentals_history
    建立快照 → build_fundamental_snapshots
    修正歷史 → update_stock_history

    Args:
        ticker_code: 台股代碼
        stock: yf.Ticker 物件
    """
    qf = stock.quarterly_financials
    qb = stock.quarterly_balance_sheet
    qc = stock.quarterly_cashflow
    divs = stock.dividends

    if qf is None or qf.empty:
        print("    ▸ 季報修正 ⚠️  無季度損益表")
        return

    quarters = _extract_quarters(qf, qb, qc)

    dividend_data = {}
    if divs is not None and not divs.empty:
        for div_date, val in divs.items():
            dividend_data[div_date.year] = dividend_data.get(div_date.year, 0) + safe_number(val)

    # ── 存入 fundamentals_history ──
    inserted = save_to_fundamentals_history(ticker_code, quarters, dividend_data)

    # ── 建立快照 → 修正 stock_history ──
    snapshots = build_fundamental_snapshots(quarters, dividend_data)
    updated, total = update_stock_history(ticker_code, snapshots)

    print(f"    ▸ 季報修正 ✅  {len(quarters)} 季, {updated}/{total} 筆已修正")


def _extract_quarters(qf, qb, qc):
    """將 yfinance 季報 DataFrame 轉為 list[dict] 格式。"""
    quarters = []
    for col in sorted(qf.columns):
        q = {
            'period_end': col.strftime('%Y-%m-%d'),
            'fiscal_year': col.year,
            'fiscal_quarter': (col.month - 1) // 3 + 1,
            'net_income': safe_number(qf.loc['Net Income', col]) if 'Net Income' in qf.index else 0,
            'revenue': safe_number(qf.loc['Total Revenue', col]) if 'Total Revenue' in qf.index else 0,
            'basic_eps': safe_number(qf.loc['Basic EPS', col]) if 'Basic EPS' in qf.index else None,
            'operating_income': safe_number(qf.loc['Operating Income', col]) if 'Operating Income' in qf.index else 0,
        }
        if qb is not None and col in qb.columns:
            q['equity'] = safe_number(qb.loc['Stockholders Equity', col]) if 'Stockholders Equity' in qb.index else 0
            q['total_debt'] = safe_number(qb.loc['Total Debt', col]) if 'Total Debt' in qb.index else 0
            q['total_assets'] = safe_number(qb.loc['Total Assets', col]) if 'Total Assets' in qb.index else 0
            q['shares'] = safe_number(qb.loc['Ordinary Shares Number', col]) if 'Ordinary Shares Number' in qb.index else 0
        else:
            q['equity'] = q['total_debt'] = q['total_assets'] = q['shares'] = 0

        if qc is not None and col in qc.columns:
            q['fcf'] = safe_number(qc.loc['Free Cash Flow', col]) if 'Free Cash Flow' in qc.index else 0
        else:
            q['fcf'] = 0

        if (q['basic_eps'] is None or q['basic_eps'] == 0) and q['shares'] > 0:
            q['basic_eps'] = q['net_income'] / q['shares']
        elif q['basic_eps'] is None:
            q['basic_eps'] = 0

        quarters.append(q)
    return quarters


