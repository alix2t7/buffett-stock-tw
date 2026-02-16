/**
 * services/api.ts — 後端 API 呼叫封裝
 *
 * 匯出：
 *   - fetchStockData()   讀取 /stock_data.json
 *   - apiSync(body)      POST /api/sync（同步、新增、移除共用）
 */

import type { StockDataResponse, SyncRequest, SyncResponse } from "../types.ts";

export async function fetchStockData(): Promise<StockDataResponse> {
  let response: Response;
  try {
    response = await fetch("/stock_data.json");
  } catch {
    throw new Error(
      "無法連線到伺服器 — 請雙擊桌面「持股儀表板」重新啟動"
    );
  }
  if (!response.ok) {
    throw new Error(
      "尚未同步持股資料 — 請點擊上方「⚙ 同步持股」按鈕，首次需等待約 30 秒"
    );
  }
  try {
    return await response.json();
  } catch {
    throw new Error(
      "持股資料檔案損壞 — 請點擊「⚙ 同步持股」重新產生"
    );
  }
}

export async function apiSync(body: SyncRequest = {}): Promise<SyncResponse> {
  let res: Response;
  try {
    res = await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error(
      "無法連線到伺服器 — 請確認儀表板已啟動（雙擊桌面「持股儀表板」）"
    );
  }
  if (res.status === 429) {
    throw new Error("同步正在進行中，請稍候片刻再試");
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`同步失敗（錯誤碼 ${res.status}）— 請稍後再試${text ? `\n${text}` : ""}`);
  }
  try {
    return await res.json();
  } catch {
    throw new Error("同步回應異常 — 請關閉瀏覽器後重新開啟儀表板");
  }
}
