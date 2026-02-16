import { useMemo } from "react";
import { calcIntrinsicValue, getMarginOfSafety, getBaseValue } from "./dcf-engine.ts";
import {
  GROWTH_RATE_MIN, GROWTH_RATE_MAX,
  SUSTAINABLE_GROWTH_FLEX,
  FCF_SEVERE_PENALTY, FCF_CONVERSION_THRESHOLD, FCF_MIN_FACTOR,
} from "./constants.ts";
import type { Stock, EnrichedStock, ValuationMode } from "./types.ts";

/**
 * useDCF – 將持股清單做 DCF 估值增強。
 */
export default function useDCF(
  stocks: Stock[],
  discountRate: number,
  growthDiscount: number,
  valuationMode: ValuationMode,
): EnrichedStock[] {
  return useMemo(() =>
    stocks.map(s => {
      // 欄位正規化：避免 undefined / null 傳播 NaN
      const growthRate = s.growthRate ?? 0;
      const roe        = s.roe ?? 0;
      const eps        = s.eps ?? 0;
      const price      = s.price ?? 0;
      const dividendYield = s.dividendYield ?? 0;

      // Capping：限制成長率在 [GROWTH_RATE_MIN, GROWTH_RATE_MAX] 區間，再乘以成長率打折係數
      const capped = Math.min(Math.max(growthRate, GROWTH_RATE_MIN), GROWTH_RATE_MAX);
      let safeGrowthRate = +(capped * (growthDiscount / 100)).toFixed(1);

      // ROE 約束：可持續成長率 = ROE × (1 - 配息率)，允許 20% 彈性
      if (roe > 0 && eps > 0) {
        const payoutRatio = Math.min((dividendYield * price) / (eps * 100), 1);
        const sustainableGrowth = roe * (1 - payoutRatio);
        safeGrowthRate = +Math.min(safeGrowthRate, sustainableGrowth * SUSTAINABLE_GROWTH_FLEX).toFixed(1);
      }

      // 根據估值模式選擇基準值
      let baseValue = getBaseValue(s, valuationMode).value;

      // 盈餘含金量懲罰：EPS/avgEps 模式下，用 FCF 轉換率調整
      let fcfPenalty: number | null = null; // 記錄實際使用的懲罰倍數，供 UI 顯示
      if ((valuationMode === "eps" || valuationMode === "avgEps")
          && eps > 0 && s.fcfPerShare != null && s.sector !== "金融") {
        const conversionRatio = s.fcfPerShare / eps;
        if (conversionRatio <= 0) {
          // 自由現金流為負 → 嚴厲懲罰
          baseValue *= FCF_SEVERE_PENALTY;
          fcfPenalty = FCF_SEVERE_PENALTY;
        } else if (conversionRatio < FCF_CONVERSION_THRESHOLD) {
          // 含金量不足 → 按比例懲罰，底線 FCF_MIN_FACTOR
          const factor = Math.max(conversionRatio, FCF_MIN_FACTOR);
          baseValue *= factor;
          fcfPenalty = +factor.toFixed(2);
        }
      }

      const financials = { debtToEquity: s.debtToEquity, currentRatio: s.currentRatio };
      const result = calcIntrinsicValue(baseValue, safeGrowthRate, discountRate, {
        sector: s.sector, financials, historicalEps: s.historicalEps || [],
        shareDilutionRate: s.shareDilutionRate ?? 0,
        bvps: s.bvps,
      });
      const mos = getMarginOfSafety(s.price, result.value);
      return {
        ...s,
        originalGrowth: growthRate,     // 保留原始值供 Deep Dive 顯示
        growthRate: safeGrowthRate,     // 覆蓋為安全參數
        baseValue,                      // 實際使用的基準值
        intrinsicValue: result.value,
        marginOfSafety: mos,
        terminalPct: result.terminalPct,
        effectiveDiscount: result.effectiveDiscount,
        riskPremium: result.riskPremium,
        exitMultiple: result.exitMultiple,
        fcfPenalty,  // 盈餘含金量懲罰倍數（null = 無懲罰）
        isAssetFloored: result.isAssetFloored,  // 資產保底標記
      } satisfies EnrichedStock;
    }), [stocks, discountRate, growthDiscount, valuationMode]
  );
}
