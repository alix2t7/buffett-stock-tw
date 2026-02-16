#!/usr/bin/env python3
"""
股票資料庫查詢工具
"""
import csv
import contextlib
import re
import sqlite3
import sys
from stock_config import DB_PATH


def _fmt(v, width, decimals=2, suffix=''):
    """NULL 安全的格式化：值為 None 時顯示 N/A"""
    if v is None:
        return 'N/A'.rjust(width)
    return f"{v:{width}.{decimals}f}{suffix}"

def show_menu():
    """顯示主選單"""
    print("\n" + "="*60)
    print("📊 台股歷史資料查詢系統")
    print("="*60)
    print("\n請選擇功能：")
    print("  1. 查看最新資料（所有股票）")
    print("  2. 查看特定股票歷史")
    print("  3. 查看更新日誌")
    print("  4. 查看資料庫統計")
    print("  5. 匯出特定股票 CSV")
    print("  6. 比較股票表現")
    print("  7. 查看價格趨勢")
    print("  0. 離開")
    print("\n" + "="*60)

def get_latest_data():
    """查詢最新資料"""
    with contextlib.closing(sqlite3.connect(DB_PATH)) as conn:
        cursor = conn.cursor()
        
        cursor.execute('''
        SELECT s.ticker, s.name, s.price, s.eps, s.pe, s.pb, s.roe, s.dividend_yield, 
               s.fetch_time, s.fetch_error
        FROM stock_history s
        INNER JOIN (
            SELECT ticker, MAX(fetch_time) AS max_time
            FROM stock_history
            GROUP BY ticker
        ) latest ON s.ticker = latest.ticker AND s.fetch_time = latest.max_time
        ORDER BY s.ticker
        ''')
        
        results = cursor.fetchall()
    
    if not results:
        print("\n❌ 資料庫中沒有資料")
        return
    
    print(f"\n📅 最新更新時間: {results[0][8]}")
    print(f"\n{'代碼':<8} {'名稱':<12} {'價格':>8} {'EPS':>8} {'本益比':>8} {'ROE':>8} {'狀態':<8}")
    print("-" * 80)
    
    for row in results:
        ticker, name, price, eps, pe, pb, roe, div, time, error = row
        status = "❌ 失敗" if error else "✅ 正常"
        print(f"{ticker:<8} {name or ticker:<12} {_fmt(price, 8)} {_fmt(eps, 8)} {_fmt(pe, 8)} {_fmt(roe, 7, suffix='%')} {status}")

def get_stock_history(ticker=None):
    """查詢特定股票歷史"""
    if not ticker:
        ticker = input("\n請輸入股票代碼（例如：2330）: ").strip()
    
    with contextlib.closing(sqlite3.connect(DB_PATH)) as conn:
        cursor = conn.cursor()
        
        cursor.execute('''
        SELECT name, price, eps, pe, roe, fetch_time, fetch_error
        FROM stock_history
        WHERE ticker = ?
        ORDER BY fetch_time DESC
        LIMIT 30
        ''', (ticker,))
        
        results = cursor.fetchall()
    
    if not results:
        print(f"\n❌ 找不到股票 {ticker} 的歷史資料")
        return
    
    print(f"\n📈 股票 {ticker} ({results[0][0]}) 歷史記錄（最近 30 筆）")
    print(f"\n{'日期時間':<20} {'價格':>10} {'EPS':>10} {'本益比':>10} {'ROE':>10} {'狀態':<8}")
    print("-" * 80)
    
    for row in results:
        name, price, eps, pe, roe, time, error = row
        status = "❌" if error else "✅"
        print(f"{time:<20} {_fmt(price, 10)} {_fmt(eps, 10)} {_fmt(pe, 10)} {_fmt(roe, 9, suffix='%')} {status}")

def get_update_logs():
    """查看更新日誌"""
    with contextlib.closing(sqlite3.connect(DB_PATH)) as conn:
        cursor = conn.cursor()
        
        cursor.execute('''
        SELECT update_time, total_stocks, success_count, failed_count, 
               duration_seconds, notes
        FROM update_logs
    ORDER BY update_time DESC
    LIMIT 20
    ''')
    
        results = cursor.fetchall()
    
    if not results:
        print("\n❌ 沒有更新日誌")
        return
    
    print(f"\n📋 更新日誌（最近 20 筆）")
    print(f"\n{'更新時間':<20} {'總數':>6} {'成功':>6} {'失敗':>6} {'耗時(秒)':>10}")
    print("-" * 70)
    
    for row in results:
        time, total, success, failed, duration, notes = row
        print(f"{time:<20} {total:>6} {success:>6} {failed:>6} {duration:>10.2f}")

def get_statistics():
    """查看資料庫統計"""
    with contextlib.closing(sqlite3.connect(DB_PATH)) as conn:
        cursor = conn.cursor()
        
        # 總記錄數
        cursor.execute('SELECT COUNT(*) FROM stock_history')
        total_records = cursor.fetchone()[0]
        
        # 股票數量
        cursor.execute('SELECT COUNT(DISTINCT ticker) FROM stock_history')
        total_stocks = cursor.fetchone()[0]
        
        # 最早與最晚記錄
        cursor.execute('SELECT MIN(fetch_time), MAX(fetch_time) FROM stock_history')
        earliest, latest = cursor.fetchone()
        
        # 平均成功率
        cursor.execute('''
        SELECT 
            AVG(CASE WHEN fetch_error = 0 THEN 1.0 ELSE 0.0 END) * 100 as success_rate
        FROM stock_history
        ''')
        success_rate = cursor.fetchone()[0]
        
        # 資料庫大小
        cursor.execute('SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()')
        db_size = cursor.fetchone()[0] / 1024 / 1024  # MB
    
    print(f"\n📊 資料庫統計資訊")
    print("-" * 60)
    print(f"  總記錄數: {total_records:,} 筆")
    print(f"  股票數量: {total_stocks} 檔")
    print(f"  最早記錄: {earliest}")
    print(f"  最新記錄: {latest}")
    print(f"  成功率: {success_rate:.2f}%")
    print(f"  資料庫大小: {db_size:.2f} MB")

def export_to_csv(ticker=None):
    """匯出特定股票到 CSV"""
    if not ticker:
        ticker = input("\n請輸入股票代碼: ").strip()
    
    with contextlib.closing(sqlite3.connect(DB_PATH)) as conn:
        cursor = conn.cursor()
        
        cursor.execute('''
        SELECT ticker, name, sector, price, eps, pe, pb, roe, 
               dividend_yield, debt_to_equity, current_ratio, 
               fcf, bvps, growth_rate, fetch_time, fetch_error
        FROM stock_history
        WHERE ticker = ?
        ORDER BY fetch_time DESC
        ''', (ticker,))
        
        results = cursor.fetchall()
    
    if not results:
        print(f"\n❌ 找不到股票 {ticker}")
        return
    
    # 清理檔名，防止路徑穿越
    safe_ticker = ''.join(c for c in ticker if c.isalnum())
    if not safe_ticker:
        print("\n❌ 無效的股票代碼")
        return
    filename = f"stock_{safe_ticker}_history.csv"
    
    with open(filename, 'w', encoding='utf-8-sig', newline='') as f:
        writer = csv.writer(f)
        # 寫入標題
        headers = [
            '代碼', '名稱', '產業', '價格', 'EPS', '本益比', '股價淨值比',
            'ROE', '殖利率', '負債比', '流動比率', '自由現金流', 
            '每股淨值', '成長率', '抓取時間', '錯誤'
        ]
        writer.writerow(headers)
        
        # 寫入資料
        for row in results:
            writer.writerow(row)
    
    print(f"\n✅ 已匯出 {len(results)} 筆記錄到 {filename}")

def compare_stocks():
    """比較多檔股票最新表現"""
    tickers = input("\n請輸入股票代碼（用逗號分隔，例如：2330,2454,2412）: ").strip()
    ticker_pattern = re.compile(r'^\d{4,6}$')
    ticker_list = [t.strip() for t in tickers.split(',') if ticker_pattern.match(t.strip())]
    
    if not ticker_list:
        print("\n❌ 無有效的股票代碼（需 4-6 位數字）")
        return
    
    with contextlib.closing(sqlite3.connect(DB_PATH)) as conn:
        cursor = conn.cursor()
        
        print(f"\n📊 股票比較（最新資料）")
        print(f"\n{'代碼':<8} {'名稱':<12} {'價格':>10} {'本益比':>10} {'ROE':>10} {'殖利率':>10}")
        print("-" * 70)
        
        for ticker in ticker_list:
            cursor.execute('''
            SELECT ticker, name, price, pe, roe, dividend_yield
            FROM stock_history
            WHERE ticker = ?
            ORDER BY fetch_time DESC
            LIMIT 1
            ''', (ticker,))
            
            result = cursor.fetchone()
            if result:
                ticker, name, price, pe, roe, div = result
                print(f"{ticker:<8} {name or ticker:<12} {_fmt(price, 10)} {_fmt(pe, 10)} {_fmt(roe, 9, suffix='%')} {_fmt(div, 9, suffix='%')}")
            else:
                print(f"{ticker:<8} {'查無資料':<12}")

def get_price_trend(ticker=None):
    """查看價格趨勢"""
    if not ticker:
        ticker = input("\n請輸入股票代碼: ").strip()
    
    with contextlib.closing(sqlite3.connect(DB_PATH)) as conn:
        cursor = conn.cursor()
        
        cursor.execute('''
        SELECT price, fetch_time
        FROM stock_history
        WHERE ticker = ? AND fetch_error = 0
        ORDER BY fetch_time DESC
        LIMIT 30
        ''', (ticker,))
        
        results = cursor.fetchall()
    
    if not results:
        print(f"\n❌ 找不到股票 {ticker}")
        return
    
    prices = [r[0] for r in reversed(results)]
    
    if len(prices) < 2:
        print("\n⚠️ 資料不足，無法分析趨勢")
        return
    
    # 計算統計
    current = prices[-1]
    prev = prices[-2]
    change = current - prev
    change_pct = (change / prev * 100) if prev > 0 else 0
    
    avg = sum(prices) / len(prices)
    max_price = max(prices)
    min_price = min(prices)
    
    print(f"\n📈 {ticker} 價格趨勢分析（近 {len(prices)} 筆）")
    print("-" * 60)
    print(f"  最新價格: {current:.2f}")
    print(f"  前次價格: {prev:.2f}")
    print(f"  變化: {change:+.2f} ({change_pct:+.2f}%)")
    print(f"  平均價格: {avg:.2f}")
    print(f"  最高價: {max_price:.2f}")
    print(f"  最低價: {min_price:.2f}")
    print(f"  波動幅度: {max_price - min_price:.2f} ({(max_price - min_price) / min_price * 100:.2f}%)")

def main():
    """主程式"""
    while True:
        show_menu()
        
        try:
            choice = input("\n請選擇功能 (0-7): ").strip()
            
            if choice == '0':
                print("\n👋 再見！\n")
                sys.exit(0)
            elif choice == '1':
                get_latest_data()
            elif choice == '2':
                get_stock_history()
            elif choice == '3':
                get_update_logs()
            elif choice == '4':
                get_statistics()
            elif choice == '5':
                export_to_csv()
            elif choice == '6':
                compare_stocks()
            elif choice == '7':
                get_price_trend()
            else:
                print("\n❌ 無效的選項，請重新選擇")
                
            input("\n按 Enter 繼續...")
            
        except KeyboardInterrupt:
            print("\n\n👋 再見！\n")
            sys.exit(0)
        except Exception as e:
            print(f"\n❌ 錯誤: {e}")
            input("\n按 Enter 繼續...")

if __name__ == "__main__":
    main()
