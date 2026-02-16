/**
 * types.ts — 全專案共用型別定義
 *
 * Stock        原始 JSON 持股資料
 * EnrichedStock  經 useDCF 增強後的持股
 * DCFOptions / DCFResult  DCF 引擎 I/O
 * API 相關型別
 */

// ═══════════════════════════════════════════════════════════
// 1. Stock — 來自 public/stock_data.json
// ═══════════════════════════════════════════════════════════

export interface Stock {
  ticker: string;
  name: string;
  sector: string;
  price: number;
  eps: number;
  pe: number;
  pb: number;
  roe: number;
  dividendYield: number;
  debtToEquity: number;
  currentRatio: number;
  fcf: number;
  bvps: number;
  growthRate: number;
  avgEps: number | null;
  fcfPerShare: number | null;
  avgFcfPerShare: number | null;
  historicalEps: number[];
  shareDilutionRate: number;
  fetchError: boolean;
}

// ═══════════════════════════════════════════════════════════
// 2. EnrichedStock — useDCF 增強後
// ═══════════════════════════════════════════════════════════

export interface EnrichedStock extends Stock {
  /** 原始成長率（未經 cap / SGR 約束） */
  originalGrowth: number;
  /** 實際使用的基準值 */
  baseValue: number;
  /** 內在價值 */
  intrinsicValue: number;
  /** 安全邊際 (%) */
  marginOfSafety: number;
  /** 終值佔比 (%) */
  terminalPct: number;
  /** 有效折現率（含風險溢酬） */
  effectiveDiscount: number;
  /** 風險溢酬 */
  riskPremium: number;
  /** exit multiple */
  exitMultiple: number;
  /** FCF 含金量懲罰倍數（null = 無懲罰） */
  fcfPenalty: number | null;
  /** 是否啟用資產保底 */
  isAssetFloored: boolean;
}

// ═══════════════════════════════════════════════════════════
// 3. DCF 引擎 I/O
// ═══════════════════════════════════════════════════════════

export interface DCFFinancials {
  debtToEquity?: number;
  currentRatio?: number;
}

export interface DCFOptions {
  sector?: string;
  financials?: DCFFinancials;
  historicalEps?: number[];
  years?: number;
  shareDilutionRate?: number;
  bvps?: number;
}

export interface DCFResult {
  value: number;
  terminalPct: number;
  effectiveDiscount: number;
  riskPremium: number;
  exitMultiple: number;
  isAssetFloored: boolean;
}

export interface BaseValueResult {
  value: number;
  label: string;
}

// ═══════════════════════════════════════════════════════════
// 4. API 型別
// ═══════════════════════════════════════════════════════════

export interface StockDataResponse {
  lastUpdate: string;
  stocks: Stock[];
}

export interface SyncRequest {
  add?: { ticker: string; name?: string; sector?: string };
  remove?: string;
  refresh?: boolean;
  regenOnly?: boolean;
}

export interface SyncResponse {
  success: boolean;
  output?: string;
  error?: string;
}

// ═══════════════════════════════════════════════════════════
// 5. 估值模式 / 信號
// ═══════════════════════════════════════════════════════════

export type ValuationMode = "eps" | "avgEps" | "fcfps";

export type SignalLabel = "低估" | "合理價位" | "高估";

export type SortDir = "asc" | "desc";

export type ViewMode = "table" | "cards";
