"""
fetchers.price — 即時報價 + 歷史走勢抓取 → stock_history
"""

import sqlite3
import contextlib
from datetime import datetime, timedelta

from stock_config import (
    STOCK_NAME_MAPPING, SECTOR_MAPPING, DB_PATH, safe_number,
)

_round_or_none = lambda v, n: round(v, n) if v is not None else None


# ─── Step 1: 即時報價 → stock_history (today) ────────────────

def save_current_snapshot(ticker_code, info):
    """
    從 yf.Ticker.info 擷取即時指標，寫入 stock_history 一筆當日快照。

    Args:
        ticker_code: 台股代碼
        info: yf.Ticker.info 字典
    """
    price = safe_number(info.get('currentPrice') or info.get('regularMarketPrice'))
    if price is None or price <= 0:
        print(f"    \u25b8 \u5373\u6642\u5831\u50f9 \u26a0\ufe0f  \u7121\u6548\u50f9\u683c ({price})\uff0c\u8df3\u904e")
        return
    eps = safe_number(info.get('trailingEps'), default=None)
    pe = safe_number(info.get('trailingPE'), default=None)
    pb = safe_number(info.get('priceToBook'), default=None)
    roe = safe_number(info.get('returnOnEquity'), 0) * 100
    raw_dy = safe_number(info.get('dividendYield'), 0)
    dividend_yield = raw_dy * 100 if raw_dy < 1 else raw_dy
    debt_to_equity = safe_number(info.get('debtToEquity'), 0) / 100
    current_ratio = safe_number(info.get('currentRatio'), default=None)
    fcf = safe_number(info.get('freeCashflow'), 0) / 1_000_000
    bvps = safe_number(info.get('bookValue'), default=None)
    growth_rate = safe_number(info.get('revenueGrowth'), 0.05) * 100

    with contextlib.closing(sqlite3.connect(DB_PATH)) as conn:
        conn.execute('''
            INSERT INTO stock_history
            (ticker, name, sector, price, eps, pe, pb, roe, dividend_yield,
             debt_to_equity, current_ratio, fcf, bvps, growth_rate, fetch_error)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)
        ''', (
            ticker_code,
            STOCK_NAME_MAPPING.get(ticker_code, info.get('shortName', ticker_code)),
            SECTOR_MAPPING.get(ticker_code, '電子'),
            round(price, 2), _round_or_none(eps, 2), _round_or_none(pe, 2), _round_or_none(pb, 2),
            round(roe, 2), round(dividend_yield, 2), round(debt_to_equity, 2),
            _round_or_none(current_ratio, 2), round(fcf, 0), _round_or_none(bvps, 2),
            round(growth_rate, 1),
        ))
        conn.commit()
    print(f"    ▸ 即時報價 ✅  ${price:.2f}")


# ─── Step 3: 歷史走勢 → stock_history (backfill) ────────────

def save_historical_prices(ticker_code, stock, symbol, info, days):
    """
    回填指定天數的日收盤進 stock_history（跳過已存在日期）。

    Args:
        ticker_code: 台股代碼
        stock: yf.Ticker 物件
        symbol: 完整 ticker（如 '2330.TW'）
        info: yf.Ticker.info 字典
        days: 回填天數
    """
    end_date = datetime.now()
    start_date = end_date - timedelta(days=days)

    try:
        hist = stock.history(start=start_date, end=end_date)
    except Exception as e:
        print(f"    ▸ 歷史走勢 ❌  {e}")
        return

    if hist.empty:
        print("    ▸ 歷史走勢 ⚠️  無資料")
        return

    # 用即時基本面填充（後續 Step 4 會以季報修正）
    fund = {
        'eps': safe_number(info.get('trailingEps'), default=None),
        'pe': safe_number(info.get('trailingPE'), default=None),
        'pb': safe_number(info.get('priceToBook'), default=None),
        'roe': safe_number(info.get('returnOnEquity'), 0) * 100,
        'dy': safe_number(info.get('dividendYield'), 0) * 100,
        'de': safe_number(info.get('debtToEquity'), 0) / 100,
        'cr': safe_number(info.get('currentRatio'), default=None),
        'fcf': safe_number(info.get('freeCashflow'), 0) / 1_000_000,
        'bvps': safe_number(info.get('bookValue'), default=None),
        'gr': safe_number(info.get('revenueGrowth'), 0.05) * 100,
    }

    with contextlib.closing(sqlite3.connect(DB_PATH)) as conn:
        cursor = conn.cursor()
        inserted = 0

        for date, row in hist.iterrows():
            close = safe_number(row['Close'])
            if close <= 0:
                continue
            date_str = date.strftime('%Y-%m-%d %H:%M:%S')

            cursor.execute(
                'SELECT COUNT(*) FROM stock_history '
                'WHERE ticker = ? AND date(fetch_time) = date(?)',
                (ticker_code, date_str))
            if cursor.fetchone()[0] > 0:
                continue

            cursor.execute('''
                INSERT INTO stock_history
                (ticker, name, sector, price, eps, pe, pb, roe, dividend_yield,
                 debt_to_equity, current_ratio, fcf, bvps, growth_rate,
                 fetch_error, fetch_time)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?)
            ''', (
                ticker_code,
                STOCK_NAME_MAPPING.get(ticker_code, ticker_code),
                SECTOR_MAPPING.get(ticker_code, '電子'),
                round(close, 2),
                _round_or_none(fund['eps'], 2), _round_or_none(fund['pe'], 2),
                _round_or_none(fund['pb'], 2), round(fund['roe'], 2),
                round(fund['dy'], 2), round(fund['de'], 2),
                _round_or_none(fund['cr'], 2), round(fund['fcf'], 0),
                _round_or_none(fund['bvps'], 2), round(fund['gr'], 1),
                date_str,
            ))
            inserted += 1

        conn.commit()
    print(f"    ▸ 歷史走勢 ✅  {inserted} 交易日")
