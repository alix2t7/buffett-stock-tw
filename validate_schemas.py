#!/usr/bin/env python3
"""
validate_schemas.py — 驗證 public/*.json 是否符合 schemas/*.schema.json
用法：python3 validate_schemas.py
"""
import json, sys, os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SCHEMAS_DIR = os.path.join(SCRIPT_DIR, "schemas")
PUBLIC_DIR  = os.path.join(SCRIPT_DIR, "public")

# 映射：JSON 檔 → schema 檔
TARGETS = {
    "stock_data.json":  "stock_data.schema.json",
    "history_all.json": "history_all.schema.json",
}

class Colors:
    OK   = "\033[92m"
    WARN = "\033[93m"
    FAIL = "\033[91m"
    END  = "\033[0m"

def validate_stock_data(data, schema):
    """手動驗證 stock_data.json（不依賴 jsonschema 套件）"""
    errors = []
    warnings = []

    if "lastUpdate" not in data:
        errors.append("缺少頂層欄位 'lastUpdate'")
    if "stocks" not in data:
        errors.append("缺少頂層欄位 'stocks'")
        return errors, warnings

    stock_schema = schema.get("$defs", {}).get("Stock", {})
    required_fields = stock_schema.get("required", [])
    prop_defs = stock_schema.get("properties", {})

    for i, s in enumerate(data["stocks"]):
        ticker = s.get("ticker", f"[index {i}]")

        # 必備欄位檢查
        for field in required_fields:
            if field not in s:
                errors.append(f"{ticker}: 缺少必備欄位 '{field}'")

        # 型別檢查
        for field, value in s.items():
            if field not in prop_defs:
                warnings.append(f"{ticker}: 未定義欄位 '{field}'（schema 不認識）")
                continue

            expected = prop_defs[field].get("type")
            if expected is None:
                continue

            # 處理 ["number", "null"] 型態
            allowed_types = expected if isinstance(expected, list) else [expected]
            type_map = {"string": str, "number": (int, float), "boolean": bool, "array": list, "null": type(None)}

            actual_ok = any(
                isinstance(value, type_map.get(t, object))
                for t in allowed_types
            )
            if not actual_ok:
                errors.append(f"{ticker}.{field}: 期望 {expected}，實際 {type(value).__name__} = {repr(value)[:40]}")

        # 負值警告
        for field in ["price", "pb", "dividendYield", "debtToEquity", "currentRatio", "bvps"]:
            v = s.get(field)
            if isinstance(v, (int, float)) and v < 0:
                warnings.append(f"{ticker}.{field} = {v} (意外的負值)")

    return errors, warnings

def validate_history(data, schema):
    """手動驗證 history_all.json"""
    errors = []
    warnings = []

    if "generatedAt" not in data:
        errors.append("缺少頂層欄位 'generatedAt'")
    if "history" not in data:
        errors.append("缺少頂層欄位 'history'")
        return errors, warnings

    point_schema = schema.get("$defs", {}).get("HistoryPoint", {})
    required_fields = point_schema.get("required", [])

    for ticker, points in data["history"].items():
        if not isinstance(points, list):
            errors.append(f"{ticker}: history 值應為陣列，實際 {type(points).__name__}")
            continue
        if len(points) == 0:
            warnings.append(f"{ticker}: 歷史資料為空陣列")
            continue

        # 只抽查第一筆和最後一筆
        for label, p in [("首筆", points[0]), ("末筆", points[-1])]:
            for field in required_fields:
                if field not in p:
                    errors.append(f"{ticker} {label}: 缺少必備欄位 '{field}'")

            date_val = p.get("date", "")
            if not (len(date_val) == 10 and date_val[4] == "-" and date_val[7] == "-"):
                errors.append(f"{ticker} {label}: date 格式不正確 '{date_val}'")

        # 日期排序檢查
        dates = [p.get("date", "") for p in points]
        if dates != sorted(dates):
            warnings.append(f"{ticker}: 歷史資料未按日期排序")

    return errors, warnings


def main():
    total_errors = 0
    total_warnings = 0

    for json_file, schema_file in TARGETS.items():
        json_path   = os.path.join(PUBLIC_DIR, json_file)
        schema_path = os.path.join(SCHEMAS_DIR, schema_file)

        print(f"\n{'─' * 50}")
        print(f"📋 驗證 {json_file}")

        if not os.path.exists(json_path):
            print(f"  {Colors.FAIL}✗ 檔案不存在: {json_path}{Colors.END}")
            total_errors += 1
            continue

        if not os.path.exists(schema_path):
            print(f"  {Colors.FAIL}✗ Schema 不存在: {schema_path}{Colors.END}")
            total_errors += 1
            continue

        with open(json_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        with open(schema_path, "r", encoding="utf-8") as f:
            schema = json.load(f)

        if "stock_data" in json_file:
            errors, warnings = validate_stock_data(data, schema)
            stock_count = len(data.get("stocks", []))
            print(f"  📊 {stock_count} 支股票")
        else:
            errors, warnings = validate_history(data, schema)
            ticker_count = len(data.get("history", {}))
            total_points = sum(len(v) for v in data.get("history", {}).values())
            print(f"  📈 {ticker_count} 支股票, {total_points} 筆歷史資料")

        for e in errors:
            print(f"  {Colors.FAIL}✗ {e}{Colors.END}")
        for w in warnings:
            print(f"  {Colors.WARN}⚠ {w}{Colors.END}")

        if not errors and not warnings:
            print(f"  {Colors.OK}✓ 全部通過{Colors.END}")
        elif not errors:
            print(f"  {Colors.OK}✓ 通過（{len(warnings)} 個警告）{Colors.END}")
        else:
            print(f"  {Colors.FAIL}✗ {len(errors)} 個錯誤, {len(warnings)} 個警告{Colors.END}")

        total_errors += len(errors)
        total_warnings += len(warnings)

    print(f"\n{'═' * 50}")
    if total_errors == 0:
        print(f"{Colors.OK}✅ 全部驗證通過 ({total_warnings} 個警告){Colors.END}")
    else:
        print(f"{Colors.FAIL}❌ {total_errors} 個錯誤, {total_warnings} 個警告{Colors.END}")

    return 1 if total_errors > 0 else 0


if __name__ == "__main__":
    sys.exit(main())
