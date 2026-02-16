"""
fetchers.ticker — Ticker 解析（.TW / .TWO 自動偵測）
"""

import yfinance as yf


def resolve_ticker(ticker_code, check_attr='info'):
    """
    嘗試 .TW（上市）→ .TWO（上櫃），回傳 (stock, symbol) 或 (None, None)。

    Args:
        ticker_code: 台股代碼（如 '2330'）
        check_attr: 用來驗證資料有效性的屬性名稱
                     'info'                 — 基本資訊（預設）
                     'quarterly_financials' — 季報
                     'financials'           — 年報

    Returns:
        tuple: (yf.Ticker, str) 或 (None, None)
    """
    for suffix in ['.TW', '.TWO']:
        symbol = f"{ticker_code}{suffix}"
        stock = yf.Ticker(symbol)
        try:
            if check_attr == 'info':
                info = stock.info
                if info and 'symbol' in info:
                    return stock, symbol
            else:
                data = getattr(stock, check_attr, None)
                if data is not None and not data.empty:
                    return stock, symbol
        except Exception:
            continue
    return None, None
