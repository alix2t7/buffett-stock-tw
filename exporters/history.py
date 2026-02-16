"""
exporters.history — 從 SQLite 歷史資料匯出 history_all.json

輸出格式（history_all.json）：
{
  "generatedAt": "2024-01-02T12:34:56",
  "history": {
    "1537": [
      { "date": "2024-01-02", "price": 218.5, "eps": 14.2, ... },
      ...
    ]
  }
}
"""

import json
import os
import sqlite3
import contextlib
from datetime import datetime
from typing import Any, Dict, List

from stock_config import STOCK_LIST, DB_PATH


def _atomic_write_json(path, data):
    """原子寫入 JSON：tmp + fsync + os.replace，避免寫入中斷產生損壞檔。"""
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write('\n')
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)


def fetch_history_from_db() -> Dict[str, List[Dict[str, Any]]]:
    """
    從 SQLite 讀取所有成功的歷史記錄，依 ticker 分組。
    只保留 STOCK_LIST 中的股票。
    """
    if not os.path.exists(DB_PATH):
        print(f"❌ 找不到資料庫檔案：{DB_PATH}")
        return {}

    with contextlib.closing(sqlite3.connect(DB_PATH)) as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        cursor.execute("""
            SELECT
                ticker, price, eps, pe, pb, roe,
                dividend_yield, growth_rate, fetch_time
            FROM stock_history
            WHERE fetch_error = 0
            ORDER BY ticker, fetch_time ASC
        """)

        rows = cursor.fetchall()

    history: Dict[str, List[Dict[str, Any]]] = {}

    for row in rows:
        ticker = row["ticker"]
        fetch_time = row["fetch_time"]
        if not fetch_time:
            continue

        date_str = str(fetch_time).split(" ")[0]

        point = {
            "date": date_str,
            "price": row["price"],
            "eps": row["eps"],
            "pe": row["pe"],
            "pb": row["pb"],
            "roe": row["roe"],
            "dividendYield": row["dividend_yield"],
            "growthRate": row["growth_rate"],
        }

        history.setdefault(ticker, []).append(point)

    # 依日期排序
    for ticker, points in history.items():
        points.sort(key=lambda p: p["date"])

    # 只保留 STOCK_LIST 中的股票
    active_set = set(STOCK_LIST)
    history = {t: pts for t, pts in history.items() if t in active_set}

    return history


def export_history_json(output_root: str = ".") -> str:
    """
    匯出 history_all.json 到 public/ 目錄。

    Args:
        output_root: 專案根目錄

    Returns:
        public/history_all.json 的實際路徑
    """
    history = fetch_history_from_db()

    total_points = sum(len(points) for points in history.values())
    print(f"📊 共有 {len(history)} 檔股票，總計 {total_points} 筆歷史記錄")

    now = datetime.now().isoformat()
    payload = {
        "generatedAt": now,
        "history": history,
    }

    root = os.path.abspath(output_root)
    public_dir = os.path.join(root, "public")
    os.makedirs(public_dir, exist_ok=True)

    # 1. 輸出 history_all.json（保留原有格式，方便前端過渡）
    public_path = os.path.join(public_dir, "history_all.json")
    try:
        _atomic_write_json(public_path, payload)
        print(f"✅ 已輸出歷史 JSON：{public_path}")
    except Exception as e:
        print(f"⚠️ 寫入 {public_path} 失敗：{e}")

    # 2. 拆分為 public/history/{ticker}.json
    history_dir = os.path.join(public_dir, "history")
    os.makedirs(history_dir, exist_ok=True)
    for ticker, points in history.items():
        ticker_path = os.path.join(history_dir, f"{ticker}.json")
        ticker_payload = {
            "generatedAt": now,
            "ticker": ticker,
            "history": points,
        }
        try:
            _atomic_write_json(ticker_path, ticker_payload)
            print(f"  └─ {ticker_path} ({len(points)} 筆)")
        except Exception as e:
            print(f"⚠️ 寫入 {ticker_path} 失敗：{e}")

    # 3. 清除已移除股票的殘留 JSON
    try:
        existing_files = {f[:-5] for f in os.listdir(history_dir) if f.endswith('.json')}
        for orphan in existing_files - set(history.keys()):
            orphan_path = os.path.join(history_dir, f"{orphan}.json")
            os.remove(orphan_path)
            print(f"  🗑️  已刪除殘留: {orphan_path}")
    except Exception as e:
        print(f"⚠️ 清除殘留檔失敗: {e}")

    return public_path
