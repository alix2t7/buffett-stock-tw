"""
transforms.snapshots — 財報快照建立與歷史修正

提供：
  build_fundamental_snapshots — 從季報 list 建立每季基本面快照
  get_applicable_snapshot     — 根據 fetch_time 找到適用的快照
  update_stock_history        — 用快照修正 stock_history 中的財報欄位
"""

import sqlite3
import contextlib
from datetime import datetime, timedelta

from stock_config import DB_PATH

REPORT_DELAY_DAYS = 45


# ─── 建立財報快照 ────────────────────────────────────────────

def build_fundamental_snapshots(quarters, dividend_data):
    """
    從季報列表建立每季基本面快照（trailing 4Q EPS / ROE / FCF 等）。

    Args:
        quarters: list[dict]，需含 period_end, basic_eps, net_income, equity,
                  total_debt, shares, fcf, revenue...
        dividend_data: dict，key=年度, value=每股股利

    Returns:
        list[dict]: 每筆含 period_end, available_from, trailing_eps, bvps, roe, ...
    """
    quarters_sorted = sorted(quarters, key=lambda x: x['period_end'])

    snapshots = []
    for i, q in enumerate(quarters_sorted):
        period_end = datetime.strptime(q['period_end'], '%Y-%m-%d')
        available_from = period_end + timedelta(days=REPORT_DELAY_DAYS)

        # Trailing 4Q EPS / 淨利 / FCF
        if i >= 3:
            trailing_eps = sum(quarters_sorted[j]['basic_eps'] for j in range(i - 3, i + 1))
            trailing_net_income = sum(quarters_sorted[j]['net_income'] for j in range(i - 3, i + 1))
            trailing_fcf = sum(quarters_sorted[j]['fcf'] for j in range(i - 3, i + 1))
        elif i >= 1:
            # 至少 2 季才做年化，降低單季異常值的影響
            count = i + 1
            trailing_eps = sum(quarters_sorted[j]['basic_eps'] for j in range(0, i + 1)) * (4 / count)
            trailing_net_income = sum(quarters_sorted[j]['net_income'] for j in range(0, i + 1)) * (4 / count)
            trailing_fcf = sum(quarters_sorted[j]['fcf'] for j in range(0, i + 1)) * (4 / count)
        else:
            # 僅 1 季資料，不做年化放大，直接使用單季數據並標註
            trailing_eps = quarters_sorted[0]['basic_eps']
            trailing_net_income = quarters_sorted[0]['net_income']
            trailing_fcf = quarters_sorted[0]['fcf']

        # BVPS
        bvps = q['equity'] / q['shares'] if q['shares'] > 0 else 0

        # ROE
        roe = (trailing_net_income / q['equity'] * 100) if q['equity'] > 0 else 0

        # D/E ratio
        de_ratio = q['total_debt'] / q['equity'] if q['equity'] > 0 else 0

        # FCF（百萬）
        fcf_m = trailing_fcf / 1_000_000

        # 營收成長率（YoY quarterly）
        growth_rate = 0
        if i >= 4:
            prev_revenue = quarters_sorted[i - 4]['revenue']
            if prev_revenue > 0:
                growth_rate = (q['revenue'] - prev_revenue) / prev_revenue * 100

        # 股利
        dividend = dividend_data.get(q['fiscal_year'], 0)

        snapshots.append({
            'period_end': q['period_end'],
            'available_from': available_from.strftime('%Y-%m-%d'),
            'trailing_eps': round(trailing_eps, 2),
            'bvps': round(bvps, 2),
            'roe': round(roe, 2),
            'de_ratio': round(de_ratio, 4),
            'fcf': round(fcf_m, 0),
            'dividend': dividend,
            'growth_rate': round(growth_rate, 1),
        })

    return snapshots


# ─── 查找適用快照 ────────────────────────────────────────────

def get_applicable_snapshot(fetch_time_str, snapshots):
    """根據 fetch_time 找到適用的財報快照（available_from <= fetch_date 中最新的）。"""
    fetch_date = datetime.strptime(fetch_time_str[:10], '%Y-%m-%d')
    applicable = None
    for s in snapshots:
        avail = datetime.strptime(s['available_from'], '%Y-%m-%d')
        if avail <= fetch_date:
            applicable = s
    return applicable


# ─── 修正 stock_history ──────────────────────────────────────

def update_stock_history(ticker_code, snapshots):
    """
    用快照修正 stock_history 中指定 ticker 的所有紀錄。

    Args:
        ticker_code: 台股代碼
        snapshots: build_fundamental_snapshots() 的回傳值

    Returns:
        tuple: (updated, total)
    """
    with contextlib.closing(sqlite3.connect(DB_PATH)) as conn:
        cursor = conn.cursor()

        cursor.execute('''
        SELECT id, fetch_time, price FROM stock_history
        WHERE ticker = ? ORDER BY fetch_time
        ''', (ticker_code,))
        records = cursor.fetchall()

        updated = 0
        for row_id, fetch_time, price in records:
            if price is None:
                continue
            snapshot = get_applicable_snapshot(fetch_time, snapshots)
            if snapshot is None:
                snapshot = snapshots[0] if snapshots else None
                if snapshot is None:
                    continue

            trailing_eps = snapshot['trailing_eps']
            bvps = snapshot['bvps']
            pe = (price / trailing_eps) if trailing_eps != 0 else 0
            pb = (price / bvps) if bvps > 0 else 0
            dividend_yield = (snapshot['dividend'] / price * 100) if price > 0 else 0

            cursor.execute('''
            UPDATE stock_history SET
                eps = ?, pe = ?, pb = ?, roe = ?,
                dividend_yield = ?, debt_to_equity = ?,
                fcf = ?, bvps = ?, growth_rate = ?
            WHERE id = ?
            ''', (
                trailing_eps,
                round(pe, 2),
                round(pb, 2),
                snapshot['roe'],
                round(dividend_yield, 2),
                snapshot['de_ratio'],
                snapshot['fcf'],
                bvps,
                snapshot['growth_rate'],
                row_id
            ))
            updated += 1

        conn.commit()
    return updated, len(records)
