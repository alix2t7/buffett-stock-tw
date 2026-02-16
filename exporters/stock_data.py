"""
exporters.stock_data — 從 DB 最新資料生成 stock_data.json

stock_data.json 供前端主儀表板使用，包含各股最新的價格和基本面指標。
此模組直接從 stock_history 表取最新一筆修正後的資料，
並從 fundamentals_history 表計算平滑化 EPS 與每股自由現金流。
"""

import json
import os
import sqlite3
import contextlib
from collections import defaultdict
from datetime import datetime

from stock_config import STOCK_LIST, STOCK_NAME_MAPPING, SECTOR_MAPPING, DB_PATH


def _atomic_write_json(path, data):
    """原子寫入 JSON：tmp + fsync + os.replace，避免寫入中斷產生損壞檔。"""
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write('\n')
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)


def compute_fundamentals_enrichment(cursor):
    """
    從 annual_fundamentals (年報) 和 fundamentals_history (季報) 計算進階估值欄位：
    - avgEps: 近 3 年年度 EPS 平均值（來自 annual_fundamentals）
    - fcfPerShare: 每股自由現金流（最近 4Q FCF / 在外流通股數）
    - avgFcfPerShare: 近 3 年年度 FCF per share 平均值
    - historicalEps: 全部年度 EPS 陣列（供前端計算盈餘穩定性 CV）
    - shareDilutionRate: 年化股本稀釋率 %
    """
    enrichment = {}

    # ── 1. 從 annual_fundamentals 計算近 3 年平均 EPS 和 FCF per share ──
    try:
        cursor.execute('''
            SELECT ticker, fiscal_year, eps, fcf, shares_outstanding
            FROM annual_fundamentals
            ORDER BY ticker, fiscal_year ASC
        ''')
        annual_by_ticker = defaultdict(list)
        for r in cursor.fetchall():
            annual_by_ticker[r['ticker']].append(dict(r))
    except Exception:
        annual_by_ticker = {}

    for ticker, years in annual_by_ticker.items():
        recent = years[-3:] if len(years) >= 3 else years

        eps_values = [y['eps'] for y in recent if y['eps'] is not None]
        avg_eps = round(sum(eps_values) / len(eps_values), 2) if eps_values else None

        historical_eps = [y['eps'] for y in years if y['eps'] is not None]

        fcfps_values = []
        for y in recent:
            if y['fcf'] is not None and y['shares_outstanding'] and y['shares_outstanding'] > 0:
                fcfps_values.append(y['fcf'] / y['shares_outstanding'])
        avg_fcfps = round(sum(fcfps_values) / len(fcfps_values), 2) if fcfps_values else None

        enrichment[ticker] = {
            'avgEps': avg_eps,
            'avgFcfPerShare': avg_fcfps,
            'fcfPerShare': None,
            'historicalEps': historical_eps,
            'shareDilutionRate': None,
        }

        # 股本稀釋率
        shares_data = [(y['fiscal_year'], y['shares_outstanding'])
                       for y in years if y.get('shares_outstanding') and y['shares_outstanding'] > 0]
        if len(shares_data) >= 2:
            shares_data.sort(key=lambda x: x[0])
            oldest_year, oldest_shares = shares_data[0]
            newest_year, newest_shares = shares_data[-1]
            n_years = newest_year - oldest_year
            if n_years > 0 and oldest_shares > 0:
                dilution = ((newest_shares / oldest_shares) ** (1 / n_years) - 1) * 100
                enrichment[ticker]['shareDilutionRate'] = round(dilution, 2)

    # ── 2. 從 fundamentals_history 計算 TTM FCFPS（最新 4 季）──
    cursor.execute('''
        SELECT ticker, period_end, eps, fcf, shares_outstanding
        FROM fundamentals_history
        ORDER BY ticker, period_end ASC
    ''')

    quarterly_by_ticker = defaultdict(list)
    for r in cursor.fetchall():
        quarterly_by_ticker[r['ticker']].append(dict(r))

    for ticker, quarters in quarterly_by_ticker.items():
        shares = 0
        for q in reversed(quarters):
            if q['shares_outstanding'] and q['shares_outstanding'] > 0:
                shares = q['shares_outstanding']
                break

        fcf_per_share = None
        if len(quarters) >= 4 and shares > 0:
            ttm_fcf_m = sum(quarters[j]['fcf'] or 0 for j in range(len(quarters) - 4, len(quarters)))
            fcf_per_share = round(ttm_fcf_m * 1_000_000 / shares, 2)

        if ticker not in enrichment:
            enrichment[ticker] = {
                'avgEps': None, 'avgFcfPerShare': None,
                'fcfPerShare': None, 'historicalEps': [],
                'shareDilutionRate': None,
            }

        enrichment[ticker]['fcfPerShare'] = fcf_per_share
        if enrichment[ticker]['avgFcfPerShare'] is None and fcf_per_share is not None:
            enrichment[ticker]['avgFcfPerShare'] = fcf_per_share

    return enrichment


def generate_stock_data_json():
    """從 DB 最新修正資料生成 stock_data.json"""
    with contextlib.closing(sqlite3.connect(DB_PATH)) as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        cursor.execute('''
            SELECT s.*
            FROM stock_history s
            INNER JOIN (
                SELECT ticker, MAX(fetch_time) as max_time
                FROM stock_history
                WHERE fetch_error = 0
                GROUP BY ticker
            ) latest ON s.ticker = latest.ticker AND s.fetch_time = latest.max_time
            ORDER BY s.ticker
        ''')

        rows = cursor.fetchall()
        fundamentals = compute_fundamentals_enrichment(cursor)

    active_set = set(STOCK_LIST)

    stocks = []
    for row in rows:
        ticker = row['ticker']
        if ticker not in active_set:
            continue
        enrich = fundamentals.get(ticker, {})

        stock = {
            'ticker': ticker,
            'name': STOCK_NAME_MAPPING.get(ticker, row['name'] or ticker),
            'sector': SECTOR_MAPPING.get(ticker, row['sector'] or '電子'),
            'price': round(row['price'] or 0, 2),
            'eps': round(row['eps'] or 0, 2),
            'pe': round(row['pe'] or 0, 2),
            'pb': round(row['pb'] or 0, 2),
            'roe': round(row['roe'] or 0, 2),
            'dividendYield': round(row['dividend_yield'] or 0, 2),
            'debtToEquity': round(row['debt_to_equity'] or 0, 4),
            'currentRatio': round(row['current_ratio'] or 0, 2),
            'fcf': round(row['fcf'] or 0, 0),
            'bvps': round(row['bvps'] or 0, 2),
            'growthRate': round(row['growth_rate'] or 0, 1),
            'avgEps': enrich.get('avgEps'),
            'fcfPerShare': enrich.get('fcfPerShare'),
            'avgFcfPerShare': enrich.get('avgFcfPerShare'),
            'historicalEps': enrich.get('historicalEps', []),
            'shareDilutionRate': enrich.get('shareDilutionRate'),
            'fetchError': False,
        }
        stocks.append(stock)

    output = {
        'lastUpdate': datetime.now().isoformat(),
        'stocks': stocks,
    }

    os.makedirs('public', exist_ok=True)
    _atomic_write_json('public/stock_data.json', output)

    print(f"✅ stock_data.json 已從 DB 重新生成（{len(stocks)} 檔股票）")

    # 驗證
    print(f"\n{'ticker':<7} {'name':<10} {'price':>8} {'eps':>7} {'avgEps':>8} {'FCFPS':>8} {'pe':>7} {'roe':>7}")
    print('-' * 75)
    for s in stocks:
        avg_e = f"{s['avgEps']:>8.2f}" if s['avgEps'] is not None else '     N/A'
        fcfps = f"{s['fcfPerShare']:>8.2f}" if s['fcfPerShare'] is not None else '     N/A'
        print(f"{s['ticker']:<7} {s['name']:<10} {s['price']:>8.2f} {s['eps']:>7.2f} {avg_e} {fcfps} {s['pe']:>7.2f} {s['roe']:>7.2f}")
