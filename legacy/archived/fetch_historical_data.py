# ⚠️ 已棄用 — 僅供獨立除錯/回填，主流程請走 sync v2 (sync_portfolio.py)
# ⚠️ 已棄用 — 僅供獨立除錯/回填，主流程請走 sync v2 (sync_portfolio.py)
#!/usr/bin/env python3
"""
歷史資料回填腳本 - 抓取過去一年的股票資料

使用方式：
  python3 fetch_historical_data.py          # 抓取所有股票過去一年資料
  python3 fetch_historical_data.py --days 30   # 只抓取過去30天
  python3 fetch_historical_data.py --ticker 2330  # 只抓取特定股票
"""

import yfinance as yf
import sqlite3
from datetime import datetime, timedelta
import time
import argparse
from stock_config import STOCK_LIST, STOCK_NAME_MAPPING, SECTOR_MAPPING, DB_PATH, safe_number, init_database, get_yf_ticker

def get_current_fundamentals(ticker):
    """
    獲取當前財務指標（用於回填歷史記錄）
    
    注意：yfinance 只提供當前財務數據，歷史財報需要其他資料源
    這裡使用最新值填充，未來可以改進為季報更新
    """
    try:
        stock, symbol = get_yf_ticker(ticker, check_attr='info')
        if stock is None:
            return None
        info = stock.info
        
        return {
            'eps': safe_number(info.get('trailingEps')),
            'pe': safe_number(info.get('trailingPE')),
            'pb': safe_number(info.get('priceToBook')),
            'roe': safe_number(info.get('returnOnEquity'), 0) * 100,
            'dividend_yield': safe_number(info.get('dividendYield'), 0) * 100,
            'debt_to_equity': safe_number(info.get('debtToEquity'), 0) / 100,
            'current_ratio': safe_number(info.get('currentRatio')),
            'fcf': safe_number(info.get('freeCashflow'), 0) / 1_000_000,
            'bvps': safe_number(info.get('bookValue')),
            'growth_rate': safe_number(info.get('revenueGrowth'), 0.05) * 100
        }
    except Exception:
        return None

def fetch_historical_prices(ticker, days=365):
    """
    抓取歷史價格資料
    
    Args:
        ticker: 股票代碼
        days: 回溯天數（預設365天 = 約1年）
    
    Returns:
        list: 包含 (date, price) 的歷史資料
    """
    try:
        # 嘗試 .TW（上市）
        symbol = f"{ticker}.TW"
        stock = yf.Ticker(symbol)
        
        end_date = datetime.now()
        start_date = end_date - timedelta(days=days)
        
        hist = stock.history(start=start_date, end=end_date)
        
        # 如果沒資料，嘗試 .TWO（上櫃）
        if hist.empty:
            symbol = f"{ticker}.TWO"
            stock = yf.Ticker(symbol)
            hist = stock.history(start=start_date, end=end_date)
        
        if hist.empty:
            print(f"  ⚠️  {ticker} 無歷史資料")
            return []
        
        # 提取收盤價
        result = []
        for date, row in hist.iterrows():
            close_price = safe_number(row['Close'])
            if close_price > 0:  # 過濾無效資料
                # 轉換為台灣時區時間字串
                date_str = date.strftime('%Y-%m-%d %H:%M:%S')
                result.append((date_str, close_price))
        
        return result
        
    except Exception as e:
        print(f"  ❌ {ticker} 抓取失敗: {e}")
        return []

def backfill_historical_data(ticker, days=365):
    """
    回填單支股票的歷史資料到資料庫
    
    策略：
    1. 抓取歷史價格（每日收盤價）
    2. 使用當前財務指標填充（因為歷史財報資料需要其他來源）
    3. 未來可以改進為按季度更新 EPS/ROE 等指標
    """
    print(f"\n處理 {ticker} ({STOCK_NAME_MAPPING.get(ticker, ticker)})...")
    
    # 1. 獲取歷史價格
    print(f"  📡 抓取過去 {days} 天的價格資料...")
    prices = fetch_historical_prices(ticker, days)
    
    if not prices:
        print(f"  ❌ 跳過（無資料）")
        return 0
    
    print(f"  ✅ 找到 {len(prices)} 個交易日")
    
    # 2. 獲取當前財務指標（用於填充）
    print(f"  📊 獲取財務指標...")
    fundamentals = get_current_fundamentals(ticker)
    
    if not fundamentals:
        print(f"  ⚠️  無法獲取財務指標，使用預設值")
        fundamentals = {
            'eps': 0, 'pe': 0, 'pb': 0, 'roe': 0,
            'dividend_yield': 0, 'debt_to_equity': 0,
            'current_ratio': 0, 'fcf': 0, 'bvps': 0,
            'growth_rate': 5
        }
    
    # 3. 準備寫入資料庫
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # 4. 插入歷史資料
    inserted = 0
    skipped = 0
    
    for date_str, price in prices:
        # 檢查是否已存在該日期的記錄
        cursor.execute('''
        SELECT COUNT(*) FROM stock_history 
        WHERE ticker = ? AND date(fetch_time) = date(?)
        ''', (ticker, date_str))
        
        if cursor.fetchone()[0] > 0:
            skipped += 1
            continue
        
        # 插入資料
        cursor.execute('''
        INSERT INTO stock_history 
        (ticker, name, sector, price, eps, pe, pb, roe, dividend_yield,
         debt_to_equity, current_ratio, fcf, bvps, growth_rate, 
         fetch_error, fetch_time)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
        ''', (
            ticker,
            STOCK_NAME_MAPPING.get(ticker, ticker),
            SECTOR_MAPPING.get(ticker, '電子'),
            round(price, 2),
            round(fundamentals['eps'], 2),
            round(fundamentals['pe'], 2),
            round(fundamentals['pb'], 2),
            round(fundamentals['roe'], 2),
            round(fundamentals['dividend_yield'], 2),
            round(fundamentals['debt_to_equity'], 2),
            round(fundamentals['current_ratio'], 2),
            round(fundamentals['fcf'], 0),
            round(fundamentals['bvps'], 2),
            round(fundamentals['growth_rate'], 1),
            date_str
        ))
        
        inserted += 1
    
    conn.commit()
    conn.close()
    
    print(f"  💾 新增 {inserted} 筆，跳過 {skipped} 筆（已存在）")
    
    return inserted

def main():
    """主程式"""
    parser = argparse.ArgumentParser(description='回填股票歷史資料')
    parser.add_argument('--days', type=int, default=365, help='回溯天數（預設365天）')
    parser.add_argument('--ticker', type=str, help='指定股票代碼（不指定則全部抓取）')
    args = parser.parse_args()
    
    print("="*70)
    print("📚 歷史資料回填程式")
    print("="*70)
    print(f"\n📅 回溯天數: {args.days} 天")
    print(f"📊 目標股票: {args.ticker if args.ticker else '全部 24 檔'}")
    print(f"⏰ 開始時間: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("\n⚠️  注意事項：")
    print("   • 歷史價格：從 Yahoo Finance 實際抓取")
    print("   • 財務指標：使用最新值填充（歷史財報需要其他資料源）")
    print("   • 交易日：僅包含有交易的日期（週末/假日自動跳過）")
    print("   • 重複檢查：已存在的日期會自動跳過")
    print("="*70)
    
    start_time = time.time()
    
    # 初始化資料庫
    init_database()
    
    # 確定要處理的股票列表
    if args.ticker:
        if args.ticker in STOCK_LIST:
            stock_list = [args.ticker]
        else:
            print(f"\n❌ 錯誤：股票代碼 {args.ticker} 不在清單中")
            print(f"可用代碼：{', '.join(STOCK_LIST)}")
            return
    else:
        stock_list = STOCK_LIST
    
    # 開始回填
    print(f"\n{'='*70}")
    print(f"🚀 開始處理 {len(stock_list)} 檔股票")
    print(f"{'='*70}\n")
    
    total_inserted = 0
    success_count = 0
    
    for i, ticker in enumerate(stock_list, 1):
        print(f"[{i}/{len(stock_list)}] ", end="")
        inserted = backfill_historical_data(ticker, args.days)
        total_inserted += inserted
        
        if inserted > 0:
            success_count += 1
        
        # 避免過於頻繁請求
        if i < len(stock_list):
            time.sleep(1)
    
    duration = time.time() - start_time
    
    # 統計結果
    print(f"\n{'='*70}")
    print(f"✅ 回填完成！")
    print(f"{'='*70}")
    print(f"\n📊 統計結果：")
    print(f"   • 處理股票: {len(stock_list)} 檔")
    print(f"   • 成功: {success_count} 檔")
    print(f"   • 新增記錄: {total_inserted:,} 筆")
    print(f"   • 總耗時: {duration:.2f} 秒")
    
    # 顯示資料庫統計
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    cursor.execute('SELECT COUNT(*) FROM stock_history')
    total_records = cursor.fetchone()[0]
    
    cursor.execute('SELECT COUNT(DISTINCT ticker) FROM stock_history')
    total_stocks = cursor.fetchone()[0]
    
    cursor.execute('SELECT MIN(fetch_time), MAX(fetch_time) FROM stock_history')
    earliest, latest = cursor.fetchone()
    
    conn.close()
    
    print(f"\n📈 資料庫現況：")
    print(f"   • 總記錄數: {total_records:,} 筆")
    print(f"   • 股票數量: {total_stocks} 檔")
    print(f"   • 時間範圍: {earliest} 至 {latest}")
    
    print(f"\n💡 下一步：")
    print(f"   • 查詢歷史: python3 query_stock.py")
    print(f"   • 測試系統: python3 test_system.py")
    print(f"   • 查看趨勢: 選擇功能 7（價格趨勢）")
    print()

if __name__ == "__main__":
    main()
