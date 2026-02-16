# ⚠️ 已棄用 — 僅供獨立除錯/回填，主流程請走 sync v2 (sync_portfolio.py)
# ⚠️ 已棄用 — 僅供獨立除錯/回填，主流程請走 sync v2 (sync_portfolio.py)
import yfinance as yf
import json
import time
import sqlite3
from datetime import datetime
import os
from stock_config import STOCK_LIST, STOCK_NAME_MAPPING, SECTOR_MAPPING, DB_PATH, safe_number, init_database, get_yf_ticker

def fetch_stock_data(ticker):
    """抓取單支股票數據"""
    try:
        stock, symbol = get_yf_ticker(ticker, check_attr='info')
        if stock is None:
            raise ValueError(f"{ticker} 無法取得資料")
        info = stock.info
        
        # 提取數據
        price = safe_number(info.get('currentPrice') or info.get('regularMarketPrice'))
        eps = safe_number(info.get('trailingEps'))
        pe = safe_number(info.get('trailingPE'))
        pb = safe_number(info.get('priceToBook'))
        roe = safe_number(info.get('returnOnEquity'), 0) * 100
        # Yahoo 對台股有時回傳小數(0.085)有時回傳百分比(8.5)
        raw_dy = safe_number(info.get('dividendYield'), 0)
        dividend_yield = raw_dy * 100 if raw_dy < 1 else raw_dy
        debt_to_equity = safe_number(info.get('debtToEquity'), 0) / 100
        current_ratio = safe_number(info.get('currentRatio'))
        fcf = safe_number(info.get('freeCashflow'), 0) / 1_000_000
        bvps = safe_number(info.get('bookValue'))
        revenue_growth = safe_number(info.get('revenueGrowth'), 0.05) * 100
        
        stock_data = {
            'ticker': ticker,
            'name': STOCK_NAME_MAPPING.get(ticker, info.get('shortName', ticker)),
            'sector': SECTOR_MAPPING.get(ticker, '電子'),
            'price': round(price, 2),
            'eps': round(eps, 2),
            'pe': round(pe, 2),
            'pb': round(pb, 2),
            'roe': round(roe, 2),
            'dividendYield': round(dividend_yield, 2),
            'debtToEquity': round(debt_to_equity, 2),
            'currentRatio': round(current_ratio, 2),
            'fcf': round(fcf, 0),
            'bvps': round(bvps, 2),
            'growthRate': round(revenue_growth, 1),
            'fetchError': False
        }
        
        print(f"✅ {ticker} ({stock_data['name']}) - 價格: {price:.2f}")
        return stock_data
        
    except Exception as e:
        print(f"❌ {ticker} 抓取失敗: {e}")
        return {
            'ticker': ticker,
            'name': STOCK_NAME_MAPPING.get(ticker, ticker),
            'sector': SECTOR_MAPPING.get(ticker, '不明'),
            'price': 0, 'eps': 0, 'pe': 0, 'pb': 0, 'roe': 0,
            'dividendYield': 0, 'debtToEquity': 0, 'currentRatio': 0,
            'fcf': 0, 'bvps': 0, 'growthRate': 5,
            'fetchError': True
        }

def save_to_database(stocks, duration):
    """儲存到 SQLite 資料庫"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    success_count = 0
    failed_count = 0
    
    for stock in stocks:
        try:
            cursor.execute('''
            INSERT INTO stock_history 
            (ticker, name, sector, price, eps, pe, pb, roe, dividend_yield, 
             debt_to_equity, current_ratio, fcf, bvps, growth_rate, fetch_error)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                stock['ticker'], stock['name'], stock['sector'],
                stock['price'], stock['eps'], stock['pe'], stock['pb'],
                stock['roe'], stock['dividendYield'], stock['debtToEquity'],
                stock['currentRatio'], stock['fcf'], stock['bvps'], 
                stock['growthRate'], 1 if stock['fetchError'] else 0
            ))
            
            if stock['fetchError']:
                failed_count += 1
            else:
                success_count += 1
                
        except Exception as e:
            print(f"⚠️ 儲存 {stock['ticker']} 失敗: {e}")
            failed_count += 1
    
    # 記錄更新日誌
    cursor.execute('''
    INSERT INTO update_logs (total_stocks, success_count, failed_count, duration_seconds)
    VALUES (?, ?, ?, ?)
    ''', (len(stocks), success_count, failed_count, duration))
    
    conn.commit()
    conn.close()
    
    print(f"\n📊 資料庫更新完成:")
    print(f"   ✅ 成功: {success_count} 檔")
    print(f"   ❌ 失敗: {failed_count} 檔")
    print(f"   ⏱️  耗時: {duration:.2f} 秒")

def save_to_json(_stocks):
    """從 DB 重新生成 stock_data.json（含進階估值欄位）"""
    try:
        import regenerate_stock_json
        regenerate_stock_json.generate_stock_data_json()
    except Exception as e:
        # Fallback：直接寫入基本資料
        print(f"⚠️ regenerate_stock_json 失敗，改用基本匯出: {e}")
        output = {
            'lastUpdate': datetime.now().isoformat(),
            'stocks': _stocks
        }
        os.makedirs('public', exist_ok=True)
        with open('public/stock_data.json', 'w', encoding='utf-8') as f:
            json.dump(output, f, ensure_ascii=False, indent=2)
    print(f"💾 JSON 檔案已更新")

def main():
    """主程式"""
    print(f"{'='*60}")
    print(f"🚀 台股數據更新程式")
    print(f"📅 {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*60}\n")
    
    start_time = time.time()
    
    # 初始化資料庫
    init_database()
    
    # 抓取股票資料
    print(f"\n📡 開始抓取 {len(STOCK_LIST)} 檔股票數據...\n")
    
    results = []
    for i, ticker in enumerate(STOCK_LIST, 1):
        print(f"[{i}/{len(STOCK_LIST)}] 抓取 {ticker}...")
        data = fetch_stock_data(ticker)
        results.append(data)
        
        # yfinance 建議每秒 1 個請求
        if i < len(STOCK_LIST):
            time.sleep(1)
    
    duration = time.time() - start_time
    
    # 統計結果
    success = sum(1 for r in results if not r['fetchError'])
    failed = len(results) - success
    
    print(f"\n{'='*60}")
    print(f"✅ 成功: {success} 檔 | ❌ 失敗: {failed} 檔")
    print(f"⏱️  總耗時: {duration:.2f} 秒")
    print(f"{'='*60}\n")
    
    # 儲存到資料庫
    save_to_database(results, duration)
    
    # 儲存到 JSON（供前端使用）
    save_to_json(results)

    # 重新匯出歷史走勢 JSON（供前端視覺化使用）
    try:
        import export_history_json
        print("\n📚 重新匯出歷史資料 JSON（history_all.json）...")
        export_history_json.export_history_json(".")
    except Exception as e:
        print(f"⚠️ 匯出歷史 JSON 失敗：{e}")
    
    print(f"\n✅ 所有任務完成！\n")
    print(f"📁 資料庫位置: {DB_PATH}")
    print(f"📄 JSON 位置: public/stock_data.json")
    print(f"📄 歷史 JSON 位置: public/history_all.json")
    print(f"\n💡 使用 'python query_stock.py' 查詢歷史資料")

if __name__ == "__main__":
    main()
