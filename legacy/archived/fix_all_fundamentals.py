#!/usr/bin/env python3
# ⚠️ 已棄用 — 僅供獨立除錯/回填，主流程請走 sync v2 (sync_portfolio.py)
"""
全量修正腳本：用 yfinance 歷史季報修正所有股票的 stock_history 資料

⚠️  DEPRECATED — 此腳本已歸檔至 legacy/archived/。
    正式主流程請使用: python3 sync_portfolio.py --refresh
    或: make sync

此腳本從模組化套件匯入核心邏輯：
  - fetchers.fundamentals → fetch_quarterly_data
  - db.crud              → save_to_fundamentals_history
  - transforms.snapshots → build_fundamental_snapshots, update_stock_history

策略：
1. 逐支從 yfinance 抓取 5 季的季報數據（損益表、資產負債表、現金流量表、股利）
2. 存入 fundamentals_history 表
3. 為每個「財報可用期間」建立基本面快照（trailing 4Q EPS、ROE 等）
4. 根據 fetch_time 將 stock_history 中的紀錄對應到正確的財報期間
5. 用當日股價重新計算 PE、PB 等比率

使用方式：
  python3 fix_all_fundamentals.py              # 修正全部
  python3 fix_all_fundamentals.py --ticker 2397  # 只修正指定股票
  python3 fix_all_fundamentals.py --dry-run      # 只抓取資料，不更新 DB
"""

import sqlite3
import time
import argparse
from datetime import datetime

from stock_config import STOCK_LIST, STOCK_NAME_MAPPING, DB_PATH, init_database
from fetchers.fundamentals import fetch_quarterly_data
from db.crud import save_to_fundamentals_history
from transforms.snapshots import build_fundamental_snapshots, update_stock_history

REQUEST_DELAY = 1.5  # 秒，避免被 Yahoo Finance 限流


# ============================================================
# 單支股票完整流程
# ============================================================

def process_one_stock(ticker_code, dry_run=False):
    """處理單支股票的完整修正流程"""
    name = STOCK_NAME_MAPPING.get(ticker_code, ticker_code)

    # 1. 抓取季報
    result = fetch_quarterly_data(ticker_code)
    if result is None:
        return {'ticker': ticker_code, 'name': name, 'status': 'failed', 'reason': '無季報資料'}

    quarters, dividend_data = result

    if dry_run:
        snapshots = build_fundamental_snapshots(quarters, dividend_data)
        for s in snapshots:
            print(f"    {s['period_end']} → EPS={s['trailing_eps']}, BVPS={s['bvps']}, ROE={s['roe']}%")
        return {'ticker': ticker_code, 'name': name, 'status': 'dry-run', 'quarters': len(quarters)}

    # 2. 存入 fundamentals_history
    inserted = save_to_fundamentals_history(ticker_code, quarters, dividend_data)

    # 3. 建立快照
    snapshots = build_fundamental_snapshots(quarters, dividend_data)

    # 4. 更新 stock_history
    updated, total = update_stock_history(ticker_code, snapshots)

    print(f"    💾 {inserted} 季報存入, {updated}/{total} 筆 stock_history 已更新")

    return {
        'ticker': ticker_code, 'name': name, 'status': 'success',
        'quarters': len(quarters), 'updated': updated, 'total': total,
        'snapshots': len(snapshots),
    }


# ============================================================
# 驗證
# ============================================================

def verify_all():
    """驗證全部股票的更新結果"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    print(f"\n{'='*80}")
    print(f"📋 驗證結果")
    print(f"{'='*80}")

    print(f"\n{'股票':<6} {'名稱':<10} {'基本面組合數':>12} {'EPS範圍':>16} {'殖利率範圍':>18}")
    print('-' * 75)

    cursor.execute('SELECT DISTINCT ticker FROM stock_history ORDER BY ticker')
    tickers = [row[0] for row in cursor.fetchall()]

    for ticker in tickers:
        name = STOCK_NAME_MAPPING.get(ticker, ticker)

        cursor.execute('''
        SELECT COUNT(DISTINCT eps || '|' || pe || '|' || roe || '|' || bvps)
        FROM stock_history WHERE ticker = ?
        ''', (ticker,))
        distinct_count = cursor.fetchone()[0]

        cursor.execute('''
        SELECT MIN(eps), MAX(eps), MIN(dividend_yield), MAX(dividend_yield)
        FROM stock_history WHERE ticker = ? AND fetch_error = 0
        ''', (ticker,))
        min_eps, max_eps, min_dy, max_dy = cursor.fetchone()

        eps_range = f"{min_eps:.2f}~{max_eps:.2f}" if min_eps is not None else "N/A"
        dy_range = f"{min_dy:.2f}%~{max_dy:.2f}%" if min_dy is not None else "N/A"

        status = "✅" if distinct_count > 1 else "⚠️  未修正"
        print(f"{ticker:<6} {name:<10} {distinct_count:>10}  {eps_range:>16} {dy_range:>18} {status}")

    # fundamentals_history 統計
    cursor.execute('SELECT COUNT(*), COUNT(DISTINCT ticker) FROM fundamentals_history')
    total_f, tickers_f = cursor.fetchone()
    print(f"\n📚 fundamentals_history: {total_f} 筆季報, {tickers_f} 檔股票")

    conn.close()


# ============================================================
# 主程式
# ============================================================

def main():
    parser = argparse.ArgumentParser(description='修正 stock_history 歷史財報資料')
    parser.add_argument('--ticker', type=str, help='指定股票代碼（不指定則全部）')
    parser.add_argument('--dry-run', action='store_true', help='只抓取資料，不更新資料庫')
    args = parser.parse_args()

    print("=" * 80)
    print("🔧 修正 stock_history 歷史財報資料")
    print("=" * 80)
    print(f"⏰ {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    if args.ticker:
        if args.ticker not in STOCK_LIST:
            print(f"\n❌ 股票代碼 {args.ticker} 不在清單中")
            return
        stock_list = [args.ticker]
    else:
        stock_list = STOCK_LIST

    print(f"📊 目標: {len(stock_list)} 檔股票")
    if args.dry_run:
        print("🧪 模式: dry-run（不會修改資料庫）")
    print("=" * 80)

    start_time = time.time()
    init_database()

    results = []
    for i, ticker in enumerate(stock_list, 1):
        print(f"\n[{i}/{len(stock_list)}] {ticker} ({STOCK_NAME_MAPPING.get(ticker, ticker)})")
        result = process_one_stock(ticker, dry_run=args.dry_run)
        results.append(result)

        if i < len(stock_list):
            time.sleep(REQUEST_DELAY)

    duration = time.time() - start_time

    success = [r for r in results if r['status'] == 'success']
    failed = [r for r in results if r['status'] == 'failed']

    print(f"\n{'='*80}")
    print(f"📊 處理結果")
    print(f"{'='*80}")
    print(f"  ✅ 成功: {len(success)} 檔")
    if failed:
        print(f"  ❌ 失敗: {len(failed)} 檔")
        for r in failed:
            print(f"     - {r['ticker']} ({r['name']}): {r.get('reason', '未知')}")

    total_updated = sum(r.get('updated', 0) for r in success)
    total_quarters = sum(r.get('quarters', 0) for r in success)
    print(f"  📚 季報資料: {total_quarters} 筆")
    print(f"  🔧 更新紀錄: {total_updated} 筆")
    print(f"  ⏱️  耗時: {duration:.1f} 秒")

    if not args.dry_run:
        verify_all()

    print(f"\n{'='*80}")
    print("✅ 全部完成！")
    print("=" * 80)


if __name__ == '__main__':
    main()
