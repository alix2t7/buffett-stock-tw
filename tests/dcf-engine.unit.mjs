/**
 * dcf-engine.unit.mjs
 *
 * calcIntrinsicValue / getMarginOfSafety / getSignalColor / getSignalLabel
 * 的邊界值與異常輸入單元測試。
 *
 * 與 dcf-engine.test.mjs（golden snapshot 迴歸守衛）互補，
 * 專門覆蓋：負 EPS、空 historicalEps、effective growth clamp、NaN 輸入、
 * 以及三個輔助函式的邊界判斷。
 *
 * 用法：
 *   node tests/dcf-engine.unit.mjs
 */

import assert from "node:assert/strict";
import {
  calcIntrinsicValue,
  getMarginOfSafety,
  getSignalColor,
  getSignalLabel,
} from "../src/dcf-engine.ts";

// ── 常數（僅用於斷言比對，不從 constants.js 匯入以確保獨立性）──
const ASSET_FLOOR_RATIO = 0.7;
const MOS_UNDERVALUED = 30;   // ≥ 30 → UNDERVALUED
const MOS_FAIR        = 10;   // ≥ 10 → FAIR VALUE
const COLOR_BULLISH   = "#22c55e";
const COLOR_NEUTRAL   = "#eab308";
const COLOR_BEARISH   = "#ef4444";

const TOLERANCE = 1e-6;

function assertClose(actual, expected, label) {
  const diff = Math.abs(actual - expected);
  if (diff > TOLERANCE) {
    throw new Error(`${label}: expected ${expected}, got ${actual} (diff=${diff})`);
  }
}

// ── 共用 opts 工廠 ──
function makeOpts(overrides = {}) {
  return {
    sector: "電子",
    financials: { debtToEquity: 0.2, currentRatio: 2.0 },
    historicalEps: [3.0, 3.5, 4.0],
    shareDilutionRate: 0,
    bvps: 50,
    ...overrides,
  };
}

// ══════════════════════════════════════════════════════════
// ▼ 測試案例
// ══════════════════════════════════════════════════════════

const cases = [];

// ── 1. 負 baseValue → asset floor ──
cases.push({
  id: "negative_baseValue_asset_floor",
  description: "baseValue < 0 應走資產保底路徑，value = bvps × 0.7",
  run() {
    const bvps = 60;
    const r = calcIntrinsicValue(-3, 8, 10, makeOpts({ bvps }));
    assertClose(r.value, bvps * ASSET_FLOOR_RATIO, "value");
    assert.strictEqual(r.isAssetFloored, true, "isAssetFloored");
    assertClose(r.riskPremium, 0, "riskPremium");
    assertClose(r.terminalPct, 0, "terminalPct");
  },
});

// ── 2. 空 historicalEps → CV 不計算，riskPremium = 0（財務指標也低） ──
cases.push({
  id: "empty_historicalEps_no_cv",
  description: "historicalEps=[] 時 CV 計算被跳過，不產生額外 riskPremium",
  run() {
    const opts = makeOpts({
      historicalEps: [],
      financials: { debtToEquity: 0.1, currentRatio: 3.0 },
    });
    const r = calcIntrinsicValue(5, 8, 10, opts);
    assertClose(r.riskPremium, 0, "riskPremium");
    assert.ok(r.value > 0, "value should be positive");
    assert.strictEqual(r.isAssetFloored, false, "isAssetFloored");
  },
});

// ── 3. effectiveGrowth 剛好 = EFFECTIVE_GROWTH_MAX (25%) → 不被 clamp ──
cases.push({
  id: "growth_at_effective_max_no_clamp",
  description: "initialGrowthRate=25, dilution=0 → effectiveGrowth=25 不觸發 clamp",
  run() {
    const opts = makeOpts({ shareDilutionRate: 0 });
    const rAt25 = calcIntrinsicValue(5, 25, 10, opts);
    // 比較 growth=25 vs growth=24.9，前者應更大（代表 25 未被截斷到更小值）
    const rBelow = calcIntrinsicValue(5, 24.9, 10, opts);
    assert.ok(rAt25.value > rBelow.value,
      `growth=25 (${rAt25.value}) should > growth=24.9 (${rBelow.value})`);
  },
});

// ── 4. effectiveGrowth 超過 EFFECTIVE_GROWTH_MAX → 被 clamp ──
cases.push({
  id: "growth_exceeds_effective_max_clamped",
  description: "growth=30 被 clamp：增幅遠小於 growth=20→25（第一階段 5 年全被截平）",
  run() {
    const opts = makeOpts({ shareDilutionRate: 0 });
    const r20 = calcIntrinsicValue(5, 20, 10, opts);
    const r25 = calcIntrinsicValue(5, 25, 10, opts);
    const r30 = calcIntrinsicValue(5, 30, 10, opts);
    // 20→25 增幅（完全不受 clamp 影響）
    const delta_20_25 = r25.value - r20.value;
    // 25→30 增幅（第一階段 5 年全被 clamp 到 25，只有 fade 路徑不同）
    const delta_25_30 = r30.value - r25.value;
    assert.ok(delta_25_30 < delta_20_25 * 0.5,
      `clamp should flatten gain: Δ25→30=${delta_25_30.toFixed(2)} should be << Δ20→25=${delta_20_25.toFixed(2)}`);
    // growth=30 仍略高於 25（fade 路徑略慢衰退）
    assert.ok(r30.value > r25.value,
      `growth=30 (${r30.value.toFixed(2)}) should still > growth=25 (${r25.value.toFixed(2)}) due to slower fade`);
  },
});

// ── 5. NaN baseValue → 安全回傳（asset floor 或 zero） ──
cases.push({
  id: "nan_baseValue_safe_return",
  description: "baseValue=NaN → !baseValue 為 true，走資產保底或回傳 0",
  run() {
    // 有 bvps → asset floor
    const r1 = calcIntrinsicValue(NaN, 8, 10, makeOpts({ bvps: 40 }));
    assertClose(r1.value, 40 * ASSET_FLOOR_RATIO, "value with bvps");
    assert.strictEqual(r1.isAssetFloored, true, "isAssetFloored with bvps");

    // 無 bvps → value = 0
    const r2 = calcIntrinsicValue(NaN, 8, 10, makeOpts({ bvps: undefined }));
    assertClose(r2.value, 0, "value without bvps");
    assert.strictEqual(r2.isAssetFloored, false, "isAssetFloored without bvps");
  },
});

// ── 6. getMarginOfSafety 邊界 ──
cases.push({
  id: "margin_of_safety_boundaries",
  description: "getMarginOfSafety: 正常、零 IV、負 IV、price > IV",
  run() {
    // IV=100, price=60 → MOS = 40%
    assertClose(getMarginOfSafety(60, 100), 40, "normal MOS");
    // IV=0 → MOS = 0（避免除以零）
    assertClose(getMarginOfSafety(50, 0), 0, "IV=0");
    // IV=-10 → MOS = 0（避免負數 IV）
    assertClose(getMarginOfSafety(50, -10), 0, "IV<0");
    // price > IV → 負 MOS
    assert.ok(getMarginOfSafety(150, 100) < 0, "overvalued should be negative");
  },
});

// ── 7. getSignalColor / getSignalLabel 邊界 ──
cases.push({
  id: "signal_color_label_boundaries",
  description: "getSignalColor / getSignalLabel 在門檻值上的判斷",
  run() {
    // MOS = 30（剛好 UNDERVALUED 門檻）
    assert.strictEqual(getSignalColor(MOS_UNDERVALUED), COLOR_BULLISH, "color@30");
    assert.strictEqual(getSignalLabel(MOS_UNDERVALUED), "低估", "label@30");

    // MOS = 29.9（低於 UNDERVALUED 但高於 FAIR）
    assert.strictEqual(getSignalColor(29.9), COLOR_NEUTRAL, "color@29.9");
    assert.strictEqual(getSignalLabel(29.9), "合理價位", "label@29.9");

    // MOS = 10（剛好 FAIR VALUE 門檻）
    assert.strictEqual(getSignalColor(MOS_FAIR), COLOR_NEUTRAL, "color@10");
    assert.strictEqual(getSignalLabel(MOS_FAIR), "合理價位", "label@10");

    // MOS = 9.9（低於 FAIR → OVERVALUED）
    assert.strictEqual(getSignalColor(9.9), COLOR_BEARISH, "color@9.9");
    assert.strictEqual(getSignalLabel(9.9), "高估", "label@9.9");

    // MOS = -50（極端高估）
    assert.strictEqual(getSignalColor(-50), COLOR_BEARISH, "color@-50");
    assert.strictEqual(getSignalLabel(-50), "高估", "label@-50");
  },
});

// ══════════════════════════════════════════════════════════
// ▼ 執行
// ══════════════════════════════════════════════════════════

let passed = 0;
let failed = 0;

for (const c of cases) {
  try {
    c.run();
    console.log(`  ✅ ${c.id}: ${c.description}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ ${c.id}: ${c.description}`);
    console.error(`     ${err.message}`);
    failed++;
  }
}

console.log(`\n══════════════════════════════════════════════`);
console.log(`  結果：${passed} passed, ${failed} failed (共 ${cases.length} 組)`);
console.log(`══════════════════════════════════════════════`);

if (failed > 0) process.exit(1);
