#!/usr/bin/env python3
"""
共用股票設定模組

集中管理股票清單、名稱/產業對照表、工具函數與資料庫初始化，
供所有 Python 腳本匯入使用，避免重複定義。

自訂持股清單：
  複製 stock_config.example.json → stock_config.local.json，
  修改其中的 STOCK_LIST / STOCK_NAME_MAPPING / SECTOR_MAPPING。
  stock_config.local.json 已被 .gitignore 排除，不會提交到版本控制。
"""
import sqlite3
import contextlib
import json
import math
import os

# ─── 資料庫路徑 ──────────────────────────────────────────────
DB_PATH = 'stock_history.db'

# ─── 預設股票清單（範例） ────────────────────────────────────
# 這些是示範用的台股標的，請在 stock_config.local.json 中自訂你的持股
STOCK_LIST = [
    "2330", "2317", "2454", "2382", "3711"
]

STOCK_NAME_MAPPING = {
    '2330': '台積電', '2317': '鴻海', '2454': '聯發科',
    '2382': '廣達', '3711': '日月光投控',
}

SECTOR_MAPPING = {
    '2330': '半導體', '2317': 'EMS代工', '2454': 'IC設計',
    '2382': '筆電代工', '3711': '封測',
}

# ─── 載入使用者自訂設定（如果存在） ────────────────────────────
_PROJECT_DIR = os.path.dirname(os.path.abspath(__file__))
_local_config = os.path.join(_PROJECT_DIR, 'stock_config.local.json')
if os.path.isfile(_local_config):
    with open(_local_config, 'r', encoding='utf-8') as _f:
        _local_data = json.load(_f)
    # 只讀取預期的資料屬性，嚴格型別檢查
    # S-3: 明確賦值而非 globals() 注入
    if 'STOCK_LIST' in _local_data and isinstance(_local_data['STOCK_LIST'], list):
        STOCK_LIST = _local_data['STOCK_LIST']
    if 'STOCK_NAME_MAPPING' in _local_data and isinstance(_local_data['STOCK_NAME_MAPPING'], dict):
        STOCK_NAME_MAPPING = _local_data['STOCK_NAME_MAPPING']
    if 'SECTOR_MAPPING' in _local_data and isinstance(_local_data['SECTOR_MAPPING'], dict):
        SECTOR_MAPPING = _local_data['SECTOR_MAPPING']
    if 'DB_PATH' in _local_data and isinstance(_local_data['DB_PATH'], str):
        # S-2: DB_PATH 路徑安全驗證 — 必須在專案目錄內且為 .db 檔
        _resolved = os.path.realpath(os.path.join(_PROJECT_DIR, _local_data['DB_PATH']))
        if _resolved.startswith(_PROJECT_DIR + os.sep) and _resolved.endswith('.db'):
            DB_PATH = _resolved
        else:
            print(f'⚠️  stock_config.local.json 中的 DB_PATH 被拒絕（必須位於專案目錄內且為 .db 檔）: {_local_data["DB_PATH"]}')

# ─── 工具函數 ───────────────────────────────────────────────
def safe_number(value, default=0):
    """安全轉換數字，處理 None / NaN / Inf"""
    if value is None:
        return default
    try:
        num = float(value)
        if math.isnan(num) or math.isinf(num):
            return default
        return num
    except (ValueError, TypeError):
        return default




# ─── 資料庫初始化 ────────────────────────────────────────────
def init_database(db_path=None):
    """
    初始化 SQLite 資料庫（CREATE IF NOT EXISTS）。
    
    建立三張表：
      - stock_history: 每日股票數據快照
      - update_logs: 更新日誌
      - fundamentals_history: 季報歷史資料
    """
    with contextlib.closing(sqlite3.connect(db_path or DB_PATH)) as conn:
        cursor = conn.cursor()

        # 股票歷史資料表
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS stock_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticker TEXT NOT NULL,
            name TEXT,
            sector TEXT,
            price REAL,
            eps REAL,
            pe REAL,
            pb REAL,
            roe REAL,
            dividend_yield REAL,
            debt_to_equity REAL,
            current_ratio REAL,
            fcf REAL,
            bvps REAL,
            growth_rate REAL,
            fetch_error INTEGER DEFAULT 0,
            fetch_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        ''')

        cursor.execute('''
        CREATE INDEX IF NOT EXISTS idx_ticker_time 
        ON stock_history(ticker, fetch_time)
        ''')

        cursor.execute('''
        CREATE INDEX IF NOT EXISTS idx_fetch_time 
        ON stock_history(fetch_time)
        ''')

        # 更新日誌表
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS update_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            update_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            total_stocks INTEGER,
            success_count INTEGER,
            failed_count INTEGER,
            duration_seconds REAL,
            notes TEXT
        )
        ''')

        # 財報歷史表（完整 schema，含季報所有欄位）
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS fundamentals_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticker TEXT NOT NULL,
            period_end DATE NOT NULL,
            fiscal_year INTEGER NOT NULL,
            fiscal_quarter INTEGER NOT NULL,
            eps REAL,
            net_income REAL,
            revenue REAL,
            operating_income REAL,
            equity REAL,
            total_debt REAL,
            total_assets REAL,
            shares_outstanding REAL,
            bvps REAL,
            roe REAL,
            fcf REAL,
            dividend_per_share REAL,
            payout_ratio REAL,
            source TEXT,
            fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(ticker, period_end)
        )
        ''')

        cursor.execute('''
        CREATE INDEX IF NOT EXISTS idx_fundamentals_ticker_period 
        ON fundamentals_history(ticker, period_end)
        ''')

        # 年度財報表
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS annual_fundamentals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticker TEXT NOT NULL,
            fiscal_year INTEGER NOT NULL,
            period_end DATE NOT NULL,
            eps REAL,
            net_income REAL,
            revenue REAL,
            operating_income REAL,
            equity REAL,
            total_debt REAL,
            total_assets REAL,
            shares_outstanding REAL,
            fcf REAL,
            bvps REAL,
            roe REAL,
            source TEXT DEFAULT 'yfinance',
            fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(ticker, fiscal_year)
        )
        ''')

        cursor.execute('''
        CREATE INDEX IF NOT EXISTS idx_annual_ticker_year
        ON annual_fundamentals(ticker, fiscal_year)
        ''')

        conn.commit()
    print("✅ 資料庫初始化完成")
