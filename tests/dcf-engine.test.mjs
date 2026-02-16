/**
 * dcf-engine.test.mjs
 *
 * DCF calcIntrinsicValue 的迴歸測試。
 * 使用 Node.js 內建 assert，不需安裝任何測試框架。
 *
 * ── 目的 ──
 * 確保將 DCF 引擎從 dashboard.jsx 拆分後，計算結果與 golden snapshots 完全一致。
 *
 * ── 使用方式 ──
 *   node tests/dcf-engine.test.mjs          # 跑 5 組迴歸測試
 *   node --test tests/dcf-engine.test.mjs   # Node 18+ 內建 test runner
 *
 * ── 重構後 ──
 * 將下方 import 改為新模組路徑即可：
 *   import { calcIntrinsicValue } from '../src/dcf-engine.js';
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// ──────────────────────────────────────────────────────────
// ▼ 從 src/dcf-engine.js 匯入 DCF 引擎
// ──────────────────────────────────────────────────────────

import { calcIntrinsicValue } from "../src/dcf-engine.ts";

// ──────────────────────────────────────────────────────────
// ▼ 載入 Golden Snapshots
// ──────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const snapshots = JSON.parse(readFileSync(join(__dirname, "dcf-golden-snapshots.json"), "utf-8"));

// ──────────────────────────────────────────────────────────
// ▼ 測試工具
// ──────────────────────────────────────────────────────────

const TOLERANCE = 1e-6; // 浮點容許誤差

function assertClose(actual, expected, label) {
  if (typeof expected === "number" && typeof actual === "number") {
    const diff = Math.abs(actual - expected);
    if (diff > TOLERANCE) {
      throw new Error(`${label}: expected ${expected}, got ${actual} (diff=${diff})`);
    }
  } else {
    assert.deepStrictEqual(actual, expected, `${label}: mismatch`);
  }
}

// ──────────────────────────────────────────────────────────
// ▼ 執行測試
// ──────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

for (const snap of snapshots) {
  const { id, description, input, output: expected } = snap;
  const { baseValue, initialGrowthRate, discountRate, opts } = input;

  try {
    const actual = calcIntrinsicValue(baseValue, initialGrowthRate, discountRate, opts);

    assertClose(actual.value,             expected.value,             `${id}.value`);
    assertClose(actual.terminalPct,       expected.terminalPct,       `${id}.terminalPct`);
    assertClose(actual.effectiveDiscount, expected.effectiveDiscount, `${id}.effectiveDiscount`);
    assertClose(actual.riskPremium,       expected.riskPremium,       `${id}.riskPremium`);
    assertClose(actual.exitMultiple,      expected.exitMultiple,      `${id}.exitMultiple`);
    assert.strictEqual(actual.isAssetFloored, expected.isAssetFloored, `${id}.isAssetFloored`);

    console.log(`  ✅ ${id}: ${description}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ ${id}: ${description}`);
    console.error(`     ${err.message}`);
    failed++;
  }
}

console.log(`\n══════════════════════════════════════════════`);
console.log(`  結果：${passed} passed, ${failed} failed (共 ${snapshots.length} 組)`);
console.log(`══════════════════════════════════════════════`);

if (failed > 0) process.exit(1);
