/**
 * constants.ts — 儀表板共用常數
 *
 * 集中管理：
 *   1. DCF 模型參數（exit multiples、永續成長率、利差下限…）
 *   2. 估值閾值（MOS 分級）
 *   3. 語意顏色（信號燈、場景分析、UI 元素）
 *
 * dashboard.tsx / HistoryChart.tsx 等元件皆從此處 import。
 */

// ══════════════════════════════════════════════════════════════
// 1. DCF 模型常數
// ══════════════════════════════════════════════════════════════

/** 產業 exit multiples（終值乘數） */
export const SECTOR_EXIT_MULTIPLES: Record<string, number> = {
  "軟體": 18, "資訊服務": 16, "遊戲軟體": 16,
  "通信網路": 14, "工業電腦": 13, "POS系統": 13,
  "電子": 12, "電子零組件": 11, "電腦週邊": 11, "電源供應器": 10,
  "文化創意": 12, "光電": 10,
  "電機機械": 10, "金屬製品": 9,
  "營建": 8,
};

/** 找不到產業對應時的預設 exit multiple */
export const DEFAULT_EXIT_MULTIPLE = 12;

/** 永續成長率（Gordon Growth 終值用） */
export const TERMINAL_GROWTH_RATE = 2;

/** 折現率利差硬性下限（防止終值爆炸） */
export const MIN_SPREAD = 3;

/** 資產保底倍率：intrinsicValue < bvps × ASSET_FLOOR_RATIO 時啟動 */
export const ASSET_FLOOR_RATIO = 0.7;

/** 折現計算年數（預設） */
export const DCF_YEARS = 10;

/** 成長率 clamp 區間 */
export const GROWTH_RATE_MIN = -5;
export const GROWTH_RATE_MAX = 15;

/** 有效成長率 clamp（含稀釋調整後） */
export const EFFECTIVE_GROWTH_MIN = -15;
export const EFFECTIVE_GROWTH_MAX = 25;

/** 可持續成長率彈性係數 */
export const SUSTAINABLE_GROWTH_FLEX = 1.2;

// ── 風險溢酬參數 ──────────────────────────────────────────
/** D/E ratio 門檻；超過此值開始加碼 */
export const DE_THRESHOLD = 0.5;
/** D/E ratio → risk premium 斜率 */
export const DE_SLOPE = 3;
/** D/E risk premium cap */
export const DE_CAP = 4;

/** Current Ratio 門檻；低於此值開始加碼 */
export const CR_THRESHOLD = 1.5;
/** CR → risk premium 斜率 */
export const CR_SLOPE = 2;
/** CR risk premium cap */
export const CR_CAP = 2;

/** 盈餘 CV 門檻；超過此值加碼 */
export const CV_THRESHOLD = 0.3;
/** CV → risk premium 斜率 */
export const CV_SLOPE = 3;
/** CV risk premium cap */
export const CV_CAP = 3;

/** 盈餘品質 — 最少歷史 EPS 筆數 */
export const MIN_HISTORICAL_EPS = 3;

// ── FCF 含金量懲罰 ────────────────────────────────────────
/** FCF 含金量懲罰 — 嚴厲（FCF ≤ 0） */
export const FCF_SEVERE_PENALTY = 0.5;
/** FCF 含金量不足門檻 */
export const FCF_CONVERSION_THRESHOLD = 0.6;
/** FCF 含金量懲罰最低 factor */
export const FCF_MIN_FACTOR = 0.4;

// ══════════════════════════════════════════════════════════════
// 2. 估值閾值 — Margin of Safety（MOS）分級
// ══════════════════════════════════════════════════════════════

/** MOS ≥ 此值 → UNDERVALUED（低估） */
export const MOS_UNDERVALUED = 30;

/** MOS ≥ 此值 → FAIR VALUE（合理）；低於則 OVERVALUED */
export const MOS_FAIR = 10;

// ── Buffett Checklist 閾值 ─────────────────────────────────
/** P/E 低估閾值 */
export const PE_LOW = 15;
/** P/E 中性上限 */
export const PE_MID = 20;
/** P/B 低估閾值 */
export const PB_LOW = 1.5;
/** P/B 中性上限 */
export const PB_MID = 3;
/** ROE 優良閾值 */
export const ROE_HIGH = 15;
/** 殖利率優良閾值 */
export const DY_HIGH = 4;
/** D/E 保守閾值 */
export const DE_LOW = 0.5;
/** Current Ratio 健康閾值 */
export const CR_HIGH = 2;

// ══════════════════════════════════════════════════════════════
// 3. 語意顏色
// ══════════════════════════════════════════════════════════════

/** 看多 / 低估 / 正面 — green-500 */
export const COLOR_BULLISH = "#22c55e";

/** 中性 / 合理 — yellow-500 */
export const COLOR_NEUTRAL = "#eab308";

/** 看空 / 高估 / 警告 — red-500 */
export const COLOR_BEARISH = "#ef4444";

/** 基準場景 / 警示 — amber-400 */
export const COLOR_CAUTION = "#f59e0b";

/** 資訊 / 數值 — blue-500 */
export const COLOR_INFO = "#3b82f6";

/** ROE / 成長率指標 — violet-400 */
export const COLOR_ROE = "#a78bfa";

/** 次要文字 — slate-400 */
export const COLOR_MUTED = "#94a3b8";

// ── 預設 UI 參數 ──────────────────────────────────────────
/** 預設折現率 (%) */
export const DEFAULT_DISCOUNT_RATE = 10;

/** 預設成長率打折 (%) */
export const DEFAULT_GROWTH_DISCOUNT = 80;
