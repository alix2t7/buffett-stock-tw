/**
 * dcf-engine.ts — DCF 估值引擎（純函式，無 React 依賴）
 *
 * 匯出：
 *   - calcIntrinsicValue()  兩階段 DCF + Gordon Growth + Sector Exit Multiple
 *   - getBaseValue()        基準值選擇
 *   - getMarginOfSafety()   安全邊際計算
 *   - getSignalColor()      MOS → 語意色碼
 *   - getSignalLabel()      MOS → 語意標籤
 */

import type { Stock, DCFOptions, DCFResult, BaseValueResult, ValuationMode, SignalLabel } from "./types.ts";
import {
  SECTOR_EXIT_MULTIPLES, DEFAULT_EXIT_MULTIPLE,
  TERMINAL_GROWTH_RATE, MIN_SPREAD, ASSET_FLOOR_RATIO, DCF_YEARS,
  EFFECTIVE_GROWTH_MIN, EFFECTIVE_GROWTH_MAX,
  DE_THRESHOLD, DE_SLOPE, DE_CAP,
  CR_THRESHOLD, CR_SLOPE, CR_CAP,
  CV_THRESHOLD, CV_SLOPE, CV_CAP, MIN_HISTORICAL_EPS,
  MOS_UNDERVALUED, MOS_FAIR,
  COLOR_BULLISH, COLOR_NEUTRAL, COLOR_BEARISH,
} from "./constants.ts";

// ─── Two-Stage DCF + Gordon Growth + Sector Exit Multiple + Continuous Risk Premium + CV ───
export function calcIntrinsicValue(
  baseValue: number,
  initialGrowthRate: number,
  discountRate: number,
  opts: DCFOptions = {},
): DCFResult {
  const { sector, financials = {}, historicalEps = [], years = DCF_YEARS, shareDilutionRate = 0, bvps } = opts;
  if (!baseValue || baseValue <= 0) {
    let floorValue = 0;
    let isAssetFloored = false;
    if (bvps != null && bvps > 0) {
      floorValue = bvps * ASSET_FLOOR_RATIO;
      isAssetFloored = true;
    }
    return { value: floorValue, terminalPct: 0, effectiveDiscount: discountRate, riskPremium: 0, exitMultiple: 0, isAssetFloored };
  }

  // 1. 連續風險溢酬：超過門檻部分按比例加碼
  let riskPremium = 0;
  const de = financials.debtToEquity;
  if (de != null && de > DE_THRESHOLD) {
    riskPremium += Math.min((de - DE_THRESHOLD) * DE_SLOPE, DE_CAP);
  }
  const cr = financials.currentRatio;
  if (cr != null && cr < CR_THRESHOLD) {
    riskPremium += Math.min((CR_THRESHOLD - cr) * CR_SLOPE, CR_CAP);
  }

  // 2. 盈餘品質：CV > 門檻時加碼折現率
  if (historicalEps.length >= MIN_HISTORICAL_EPS) {
    const mean = historicalEps.reduce((a, b) => a + b, 0) / historicalEps.length;
    if (Math.abs(mean) > 0.01) {
      const std = Math.sqrt(historicalEps.reduce((a, b) => a + (b - mean) ** 2, 0) / historicalEps.length);
      const cv = std / Math.abs(mean);
      if (cv > CV_THRESHOLD) riskPremium += Math.min(cv * CV_SLOPE, CV_CAP);
    }
  }

  riskPremium = +riskPremium.toFixed(2);
  const adjustedDiscount = discountRate + riskPremium;

  let totalPV = 0;
  let currentValue = baseValue;

  // 3. 兩階段折現計算（含股本膨脹/回購調整）
  for (let i = 1; i <= years; i++) {
    let currentGrowth = initialGrowthRate;
    if (i > 5) {
      const fadeRatio = (i - 5) / 5;
      currentGrowth = initialGrowthRate - ((initialGrowthRate - TERMINAL_GROWTH_RATE) * fadeRatio);
    }
    const effectiveGrowth = currentGrowth - shareDilutionRate;
    const safeEffectiveGrowth = Math.min(Math.max(effectiveGrowth, EFFECTIVE_GROWTH_MIN), EFFECTIVE_GROWTH_MAX);
    currentValue = currentValue * (1 + safeEffectiveGrowth / 100);
    totalPV += currentValue / Math.pow(1 + adjustedDiscount / 100, i);
  }

  // 4. 終值雙重校驗：Gordon Model vs Sector Exit Multiple，取較保守值
  const finalYearValue = currentValue * (1 + TERMINAL_GROWTH_RATE / 100);
  const spread = adjustedDiscount - TERMINAL_GROWTH_RATE;
  const safeSpread = Math.max(spread, MIN_SPREAD);
  const gordonTV = finalYearValue / (safeSpread / 100);
  const exitMultiple = (sector && SECTOR_EXIT_MULTIPLES[sector]) || DEFAULT_EXIT_MULTIPLE;
  const exitMultipleTV = finalYearValue * exitMultiple;
  const terminalValue = Math.min(gordonTV, exitMultipleTV);
  const discountedTerminalValue = terminalValue / Math.pow(1 + adjustedDiscount / 100, years);

  let intrinsicValue = totalPV + discountedTerminalValue;
  const terminalPct = intrinsicValue > 0 ? +(discountedTerminalValue / intrinsicValue * 100).toFixed(1) : 0;

  // 5. 條件式資產保底
  let isAssetFloored = false;
  if (bvps != null && bvps > 0 && intrinsicValue < bvps * ASSET_FLOOR_RATIO) {
    intrinsicValue = bvps * ASSET_FLOOR_RATIO;
    isAssetFloored = true;
  }

  return {
    value: intrinsicValue,
    terminalPct,
    effectiveDiscount: +adjustedDiscount.toFixed(2),
    riskPremium,
    exitMultiple,
    isAssetFloored,
  };
}

/**
 * 根據估值模式選擇基準值（EPS / 平滑EPS / FCFPS）。
 * useDCF.ts 和 DetailPanel.tsx 共用。
 */
export function getBaseValue(stock: Pick<Stock, "eps" | "avgEps" | "fcfPerShare">, mode: ValuationMode): BaseValueResult {
  const eps = stock.eps ?? 0;
  if (mode === "avgEps" && stock.avgEps != null) {
    return { value: stock.avgEps, label: "平滑EPS" };
  }
  if (mode === "fcfps" && stock.fcfPerShare != null) {
    return { value: stock.fcfPerShare, label: "每股自由現金流" };
  }
  return { value: eps, label: "每股盈餘" };
}

export function getMarginOfSafety(price: number, intrinsicValue: number): number {
  if (!intrinsicValue || intrinsicValue <= 0) return 0;
  return ((intrinsicValue - price) / intrinsicValue) * 100;
}

export function getSignalColor(mos: number): string {
  if (mos >= MOS_UNDERVALUED) return COLOR_BULLISH;
  if (mos >= MOS_FAIR) return COLOR_NEUTRAL;
  return COLOR_BEARISH;
}

export function getSignalLabel(mos: number): SignalLabel {
  if (mos >= MOS_UNDERVALUED) return "低估";
  if (mos >= MOS_FAIR) return "合理價位";
  return "高估";
}
