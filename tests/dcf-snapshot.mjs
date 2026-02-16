#!/usr/bin/env node
/**
 * dcf-snapshot.mjs
 *
 * 從 dashboard.jsx 原封不動搬出 DCF 核心函式 calcIntrinsicValue，
 * 以 5 組參數模擬計算，產出 golden snapshot（input → output），
 * 供未來拆分 DCF 引擎後做迴歸驗證。
 *
 * 用法：node tests/dcf-snapshot.mjs
 */

// ══════════════════════════════════════════════════════════════
// ▼ 從 src/dcf-engine.js 匯入 DCF 引擎
// ══════════════════════════════════════════════════════════════

import { calcIntrinsicValue } from "../src/dcf-engine.js";

// ══════════════════════════════════════════════════════════════
// ▼ 5 組測試案例
// ══════════════════════════════════════════════════════════════

const TEST_CASES = [
  {
    id: "case1_normal_growth",
    description: "正常成長、低風險 — 敦陽科技（資訊服務）",
    input: {
      baseValue: 7.88,
      initialGrowthRate: 8.3,
      discountRate: 10,
      opts: {
        sector: "資訊服務",
        financials: { debtToEquity: 0.07, currentRatio: 1.54 },
        historicalEps: [6.0, 6.91, 7.36, 7.5],
        shareDilutionRate: 0,
        bvps: 30.83,
      },
    },
  },
  {
    id: "case2_high_de_low_cr",
    description: "高負債 + 低流動 risk premium — 大東電（電機機械）",
    input: {
      baseValue: 11.83,
      initialGrowthRate: 11.0,
      discountRate: 10,
      opts: {
        sector: "電機機械",
        financials: { debtToEquity: 1.36, currentRatio: 0.95 },
        historicalEps: [2.99, 12.17, 12.58],
        shareDilutionRate: 0,
        bvps: 44.95,
      },
    },
  },
  {
    id: "case3_high_cv_volatility",
    description: "盈餘高波動 CV — 長虹建設（營建）",
    input: {
      baseValue: 3.63,     // FCF penalty: eps=7.25, fcfPerShare/eps=2.37/7.25≈0.33 → factor=0.4 → 7.25*0.5=3.63 (negative FCF scenario example overridden with 0.5)
      initialGrowthRate: -5.0,
      discountRate: 10,
      opts: {
        sector: "營建",
        financials: { debtToEquity: 1.11, currentRatio: 1.66 },
        historicalEps: [4.41, 9.82, 6.32, 7.85],
        shareDilutionRate: 0,
        bvps: 67.85,
      },
    },
  },
  {
    id: "case4_share_dilution",
    description: "股本膨脹 + 負成長 — 伸興（電機機械）",
    input: {
      baseValue: 5.53,
      initialGrowthRate: -5.0,
      discountRate: 10,
      opts: {
        sector: "電機機械",
        financials: { debtToEquity: 0.31, currentRatio: 1.85 },
        historicalEps: [8.68, 8.03, 3.81, 6.81],
        shareDilutionRate: 2.78,
        bvps: 77.48,
      },
    },
  },
  {
    id: "case5_zero_base_asset_floor",
    description: "baseValue=0 → 資產保底 — 合成測試",
    input: {
      baseValue: 0,
      initialGrowthRate: 5.0,
      discountRate: 10,
      opts: {
        sector: "電子",
        financials: { debtToEquity: 0.2, currentRatio: 2.0 },
        historicalEps: [1.0, 1.5, 2.0],
        shareDilutionRate: 0,
        bvps: 50.0,
      },
    },
  },
];

// ══════════════════════════════════════════════════════════════
// ▼ 執行 & 產出 snapshot
// ══════════════════════════════════════════════════════════════

console.log("╔══════════════════════════════════════════════════════════╗");
console.log("║  DCF calcIntrinsicValue — Golden Snapshot (5 cases)     ║");
console.log("╚══════════════════════════════════════════════════════════╝\n");

const snapshots = TEST_CASES.map(tc => {
  const { baseValue, initialGrowthRate, discountRate, opts } = tc.input;
  const output = calcIntrinsicValue(baseValue, initialGrowthRate, discountRate, opts);
  return { ...tc, output };
});

for (const snap of snapshots) {
  console.log(`── ${snap.id}: ${snap.description} ──`);
  console.log("  INPUT:", JSON.stringify(snap.input, null, 2).replace(/\n/g, "\n  "));
  console.log("  OUTPUT:", JSON.stringify(snap.output));
  console.log();
}

// 輸出 JSON 檔案供 unit test import
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outputPath = join(__dirname, "dcf-golden-snapshots.json");
writeFileSync(outputPath, JSON.stringify(snapshots, null, 2) + "\n");
console.log(`✅ Golden snapshots 已寫入 ${outputPath}`);
