#!/usr/bin/env python3
"""
持股同步主控腳本 v2（方案 B — 統一抓取）

將 4 支 fetch 腳本的邏輯合併為單一迴圈：
每支股票只建立一次 yf.Ticker，一次抓完所有資料。

功能：
  • diff sync  — 比對 STOCK_LIST vs DB，自動新增/移除
  • --add       — 從儀表板一鍵新增股票（更新 config + 抓取 + 重生 JSON）
  • --remove    — 從儀表板一鍵移除股票（更新 config + 清 DB + 重生 JSON）
  • --refresh   — 強制全部重抓
  • --regen-only — 只重新生成 JSON

Usage:
  python3 sync_portfolio.py                                 # diff sync
  python3 sync_portfolio.py --add 2330 --name 台積電 --sector 半導體
  python3 sync_portfolio.py --remove 2330
  python3 sync_portfolio.py --refresh
  python3 sync_portfolio.py --dry-run
  python3 sync_portfolio.py --regen-only
"""

import argparse
import json
import os
import re
import time
from datetime import datetime

from stock_config import (
    STOCK_LIST, STOCK_NAME_MAPPING, SECTOR_MAPPING,
    DB_PATH, init_database,
)
from fetchers.ticker import resolve_ticker
from fetchers.price import save_current_snapshot, save_historical_prices
from fetchers.fundamentals import save_annual_fundamentals, save_quarterly_and_fix
from db.crud import get_db_tickers, remove_ticker_from_db
from exporters.stock_data import generate_stock_data_json
from exporters.history import export_history_json

# ─── Constants ────────────────────────────────────────────────
BACKFILL_DAYS = 365
REQUEST_DELAY = 1.0
TICKER_PATTERN = re.compile(r'^\d{4,6}$')
MAX_NAME_LEN = 50


# ═════════════════════════════════════════════════════════════
# § Config Persistence
# ═════════════════════════════════════════════════════════════

def _config_local_path():
    return os.path.join(os.path.dirname(os.path.abspath(__file__)),
                        'stock_config.local.json')


def _write_config_local():
    """將目前的 STOCK_LIST / NAME / SECTOR 寫回 stock_config.local.json（原子寫入）"""
    path = _config_local_path()
    data = {
        "STOCK_LIST": sorted(STOCK_LIST),
        "STOCK_NAME_MAPPING": dict(sorted(STOCK_NAME_MAPPING.items())),
        "SECTOR_MAPPING": dict(sorted(SECTOR_MAPPING.items())),
    }
    tmp_path = path + '.tmp'
    with open(tmp_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write('\n')
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp_path, path)  # 原子重命名，避免寫入中斷導致不一致


# ═════════════════════════════════════════════════════════════
# § Unified Fetch — 一支 Ticker 抓完全部
# ═════════════════════════════════════════════════════════════

def unified_fetch_one(ticker_code, *, backfill_days=BACKFILL_DAYS):
    """
    建立一個 yf.Ticker 物件，一次抓完：
      1) 即時報價  → stock_history (today)
      2) 年報      → annual_fundamentals
      3) 歷史走勢  → stock_history (backfill)
      4) 季報修正  → fundamentals_history + UPDATE stock_history

    回傳 auto-detected name（成功）或 None（失敗）。
    """
    name = STOCK_NAME_MAPPING.get(ticker_code, ticker_code)
    print(f"\n  📡 {ticker_code} ({name})")

    stock, symbol = resolve_ticker(ticker_code)
    if stock is None:
        print(f"    ❌ 無法解析（.TW / .TWO 均無）")
        return None

    print(f"    ✓ 使用 {symbol}")
    info = stock.info

    detected_name = info.get('shortName', info.get('longName', ticker_code))

    # Step 1: 即時報價
    save_current_snapshot(ticker_code, info)

    # Step 2: 年報
    save_annual_fundamentals(ticker_code, stock)

    # Step 3: 歷史走勢（需在 Step 4 前，因為 Step 4 會 UPDATE 這些 rows）
    save_historical_prices(ticker_code, stock, symbol, info, backfill_days)

    # Step 4: 季報修正
    save_quarterly_and_fix(ticker_code, stock)

    return detected_name


# ═════════════════════════════════════════════════════════════
# § JSON Regeneration
# ═════════════════════════════════════════════════════════════

def regenerate_json():
    """直接呼叫 exporters 模組重新生成 JSON（取代 subprocess 方式）。"""
    errors = []
    print("\n  🔄 重新生成 JSON：")
    print("    ▸ stock_data.json ...", end=" ", flush=True)
    try:
        generate_stock_data_json()
        print("✅")
    except Exception as e:
        print(f"❌ {e}")
        errors.append(f"stock_data.json: {e}")

    print("    ▸ history_all.json ...", end=" ", flush=True)
    try:
        export_history_json(".")
        print("✅")
    except Exception as e:
        print(f"❌ {e}")
        errors.append(f"history_all.json: {e}")

    if errors:
        print(f"\n  ⚠️ JSON 重新生成部分失敗：{'; '.join(errors)}")
    return len(errors) == 0


# ═════════════════════════════════════════════════════════════
# § Main
# ═════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(description='持股同步主控 v2（統一抓取）')
    parser.add_argument('--add', type=str, metavar='TICKER',
                        help='新增股票代碼')
    parser.add_argument('--remove', type=str, metavar='TICKER',
                        help='移除股票代碼')
    parser.add_argument('--name', type=str,
                        help='新增股票名稱（可選，自動偵測）')
    parser.add_argument('--sector', type=str, default='',
                        help='新增股票產業（可選，預設 "電子"）')
    parser.add_argument('--refresh', action='store_true',
                        help='強制全部重抓')
    parser.add_argument('--dry-run', action='store_true',
                        help='僅顯示差異，不執行')
    parser.add_argument('--regen-only', action='store_true',
                        help='只重新生成 JSON')
    args = parser.parse_args()

    print("=" * 60)
    print("🔄 持股同步主控 v2")
    print(f"📅 {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)

    # ── 首次使用：自動建立 stock_config.local.json ──
    config_local = _config_local_path()
    config_example = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                  'stock_config.example.json')
    if not os.path.isfile(config_local) and os.path.isfile(config_example):
        import shutil
        shutil.copy2(config_example, config_local)
        print(f"\n📋 首次使用：已自動建立 stock_config.local.json（預設範例股票）")
        print(f"   請編輯 {config_local} 填入你的持股代碼\n")

    init_database()

    # ──────────── Mode: Add ────────────
    if args.add:
        ticker = args.add.strip()
        user_name = args.name
        user_sector = args.sector or '電子'

        # S-3: 輸入驗證
        if not TICKER_PATTERN.match(ticker):
            print(f"\n❌ 無效的股票代碼格式：{ticker}（應為 4-6 位數字）")
            return
        if user_name and len(user_name) > MAX_NAME_LEN:
            print(f"\n❌ 名稱過長（最大 {MAX_NAME_LEN} 字）")
            return
        if user_sector and len(user_sector) > MAX_NAME_LEN:
            print(f"\n❌ 產業名稱過長（最大 {MAX_NAME_LEN} 字）")
            return

        print(f"\n🆕 新增股票: {ticker}")

        was_new = ticker not in STOCK_LIST
        if was_new:
            STOCK_LIST.append(ticker)
        STOCK_NAME_MAPPING.setdefault(ticker, user_name or ticker)
        SECTOR_MAPPING.setdefault(ticker, user_sector)

        start = time.time()
        detected_name = unified_fetch_one(ticker)

        if detected_name:
            if not user_name and detected_name != ticker:
                STOCK_NAME_MAPPING[ticker] = detected_name
            elif user_name:
                STOCK_NAME_MAPPING[ticker] = user_name
            _write_config_local()
            regenerate_json()
            final_name = STOCK_NAME_MAPPING[ticker]
            print(f"\n{'='*60}")
            print(f"✅ {ticker} ({final_name}) 新增完成！耗時 {time.time()-start:.1f} 秒")
            print(f"   名稱: {final_name}")
            print(f"   產業: {SECTOR_MAPPING[ticker]}")
            print(f"{'='*60}")
        else:
            if was_new:
                STOCK_LIST.remove(ticker)
                STOCK_NAME_MAPPING.pop(ticker, None)
                SECTOR_MAPPING.pop(ticker, None)
            print(f"\n❌ {ticker} 新增失敗（無法從 yfinance 取得資料）")
        return

    # ──────────── Mode: Remove ────────────
    if args.remove:
        ticker = args.remove.strip()
        if not TICKER_PATTERN.match(ticker):
            print(f"\n❌ 無效的股票代碼格式：{ticker}（應為 4-6 位數字）")
            return
        name = STOCK_NAME_MAPPING.get(ticker, ticker)
        print(f"\n🗑️  移除股票: {ticker} ({name})")

        deleted = remove_ticker_from_db(ticker)
        print(f"   刪除 DB 記錄: {deleted} 筆")

        if ticker in STOCK_LIST:
            STOCK_LIST.remove(ticker)
        STOCK_NAME_MAPPING.pop(ticker, None)
        SECTOR_MAPPING.pop(ticker, None)
        _write_config_local()
        print("   已從 stock_config.local.json 移除")

        regenerate_json()
        print(f"\n{'='*60}")
        print(f"✅ {ticker} ({name}) 已移除")
        print(f"{'='*60}")
        return

    # ──────────── Mode: Regen Only ────────────
    if args.regen_only:
        regenerate_json()
        print("\n✅ JSON 重新生成完成")
        return

    # ──────────── Mode: Diff Sync ────────────
    config_set = set(STOCK_LIST)
    db_set = get_db_tickers()
    added = config_set - db_set
    removed = db_set - config_set
    existing = config_set & db_set

    print(f"\n📋 STOCK_LIST: {len(config_set)} 檔")
    print(f"💾 DB 現有:    {len(db_set)} 檔")
    print(f"{'─' * 40}")
    print(f"  🆕 新增: {len(added)} 檔  {sorted(added) if added else ''}")
    print(f"  🗑️  移除: {len(removed)} 檔  {sorted(removed) if removed else ''}")
    print(f"  ✓  保留: {len(existing)} 檔")

    if args.dry_run:
        print("\n📝 [Dry Run] 僅顯示差異，未執行任何操作")
        regenerate_json()
        return

    start_time = time.time()

    # 新增
    failures = []
    if added:
        print(f"\n{'─' * 40}")
        print(f"🆕 新增 {len(added)} 檔股票（統一抓取）")
        for i, ticker in enumerate(sorted(added)):
            try:
                unified_fetch_one(ticker)
            except Exception as e:
                print(f"    ⚠️ {ticker} 失敗: {e}")
                failures.append(ticker)
            if i < len(added) - 1:
                time.sleep(REQUEST_DELAY)

    # 移除幽靈股
    if removed:
        print(f"\n{'─' * 40}")
        print(f"🗑️  移除 {len(removed)} 檔幽靈股")
        for ticker in sorted(removed):
            try:
                n = remove_ticker_from_db(ticker)
                print(f"  ✗ {ticker}: 刪除 {n} 筆")
            except Exception as e:
                print(f"  ⚠️ {ticker} 移除失敗: {e}")
                failures.append(ticker)

    # 更新既有股票
    if existing:
        if args.refresh:
            # --refresh: 完整重抓（即時報價 + 年報 + 歷史走勢 + 季報修正）
            print(f"\n{'─' * 40}")
            print(f"🔄 重新抓取 {len(existing)} 檔既有股票（統一抓取）")
            for i, ticker in enumerate(sorted(existing)):
                try:
                    unified_fetch_one(ticker)
                except Exception as e:
                    print(f"    ⚠️ {ticker} 失敗: {e}")
                    failures.append(ticker)
                if i < len(existing) - 1:
                    time.sleep(REQUEST_DELAY)
        else:
            # 預設: 輕量更新 — 只抓即時報價（Step 1）
            print(f"\n{'─' * 40}")
            print(f"📡 更新 {len(existing)} 檔既有股票即時報價")
            for i, ticker in enumerate(sorted(existing)):
                name = STOCK_NAME_MAPPING.get(ticker, ticker)
                try:
                    stock, symbol = resolve_ticker(ticker)
                    if stock is None:
                        print(f"  ⚠️ {ticker} ({name}) 無法解析，跳過")
                        failures.append(ticker)
                        continue
                    info = stock.info
                    save_current_snapshot(ticker, info)
                except Exception as e:
                    print(f"  ⚠️ {ticker} ({name}) 更新失敗: {e}")
                    failures.append(ticker)
                if i < len(existing) - 1:
                    time.sleep(REQUEST_DELAY)

    # JSON
    regenerate_json()

    duration = time.time() - start_time
    print(f"\n{'=' * 60}")
    print(f"✅ 同步完成！耗時 {duration:.1f} 秒")
    if added:
        print(f"   🆕 新增: {', '.join(sorted(added))}")
    if removed:
        print(f"   🗑️  移除: {', '.join(sorted(removed))}")
    if failures:
        print(f"   ⚠️  失敗: {', '.join(failures)}")
    print(f"{'=' * 60}")


if __name__ == '__main__':
    main()
