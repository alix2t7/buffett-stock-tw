/**
 * DetailPanel.tsx — 個股深度分析側滑面板
 */

import HistoryChart from "./HistoryChart.tsx";
import { calcIntrinsicValue, getSignalColor, getBaseValue } from "./dcf-engine.ts";
import {
  GROWTH_RATE_MIN, GROWTH_RATE_MAX,
  PE_LOW, PB_LOW, ROE_HIGH, DY_HIGH, DE_LOW, CR_HIGH,
  MOS_UNDERVALUED,
  COLOR_BULLISH, COLOR_BEARISH, COLOR_CAUTION, COLOR_ROE,
} from "./constants.ts";
import type { EnrichedStock, ValuationMode } from "./types.ts";

interface DetailPanelProps {
  stock: EnrichedStock;
  discountRate: number;
  valuationMode: ValuationMode;
  onClose: () => void;
}

export default function DetailPanel({ stock: s, discountRate, valuationMode, onClose }: DetailPanelProps) {
  const safeGrowth = s.growthRate; // 已在 enriched 中計算好（含 SGR 約束）

  // 根據估值模式選擇基準值
  const { value: baseValue, label: baseLabel } = getBaseValue(s, valuationMode);

  // 使用 enriched 預計算的結果
  const iv = s.intrinsicValue;
  const mos = s.marginOfSafety;
  const sigColor = getSignalColor(mos);
  const effectiveDiscount = s.effectiveDiscount ?? discountRate;
  const riskPremium = s.riskPremium ?? 0;
  const terminalPct = s.terminalPct ?? 0;
  const exitMultiple = s.exitMultiple ?? 12;

  const criteria = [
    { label: `低本益比 (< ${PE_LOW})`, pass: s.pe < PE_LOW, value: s.pe.toFixed(1) },
    { label: `低淨值比 (< ${PB_LOW})`, pass: s.pb < PB_LOW, value: s.pb.toFixed(1) },
    { label: `高 ROE (> ${ROE_HIGH}%)`, pass: s.roe > ROE_HIGH, value: `${s.roe}%` },
    { label: `高殖利率 (> ${DY_HIGH}%)`, pass: s.dividendYield > DY_HIGH, value: `${s.dividendYield}%` },
    { label: `低負債 (負債比 < ${DE_LOW})`, pass: s.debtToEquity < DE_LOW, value: s.debtToEquity.toFixed(2) },
    { label: `良好流動性 (流動比 > ${CR_HIGH})`, pass: s.currentRatio > CR_HIGH, value: s.currentRatio.toFixed(1) },
    { label: `安全邊際 > ${MOS_UNDERVALUED}%`, pass: mos > MOS_UNDERVALUED, value: `${mos.toFixed(1)}%` },
  ];
  const score = criteria.filter(c => c.pass).length;

  // ── Scenario Analysis helpers ──
  const scenarioOpts = {
    sector: s.sector,
    financials: { debtToEquity: s.debtToEquity, currentRatio: s.currentRatio },
    historicalEps: s.historicalEps || [],
    shareDilutionRate: s.shareDilutionRate ?? 0,
    bvps: s.bvps,
  };
  const bearGrowth = +(safeGrowth * 0.6).toFixed(1);
  const bullGrowth = +(s.originalGrowth != null
    ? Math.min(Math.max(s.originalGrowth, GROWTH_RATE_MIN), GROWTH_RATE_MAX)
    : safeGrowth).toFixed(1);
  const bearResult = calcIntrinsicValue(baseValue, bearGrowth, discountRate + 2, scenarioOpts);
  const bullResult = calcIntrinsicValue(baseValue, bullGrowth, Math.max(discountRate - 1, 3), scenarioOpts);
  const scenarios = [
    { label: "悲觀", value: bearResult.value, color: COLOR_BEARISH, growth: bearGrowth, dr: discountRate + 2 },
    { label: "基準", value: iv, color: COLOR_CAUTION, growth: safeGrowth, dr: effectiveDiscount },
    { label: "樂觀", value: bullResult.value, color: COLOR_BULLISH, growth: bullGrowth, dr: Math.max(discountRate - 1, 3) },
  ];
  const maxVal = Math.max(...scenarios.map(sc => sc.value).filter(v => Number.isFinite(v)), 1);

  return (
    <div style={{
      position: "fixed", right: 0, top: 0, width: 550, height: "100vh",
      background: "linear-gradient(180deg, #0f1629 0%, #0a0e1a 100%)",
      borderLeft: "1px solid rgba(255,255,255,0.06)",
      boxShadow: "-20px 0 60px rgba(0,0,0,0.5)",
      padding: 36,
      overflowY: "auto",
      zIndex: 100,
    }}>
      <button onClick={onClose} style={{
        position: "absolute", top: 16, right: 16,
        background: "rgba(255,255,255,0.05)", border: "none",
        color: "#94a3b8", cursor: "pointer", borderRadius: 6,
        padding: "10px 16px", fontSize: 20, fontFamily: "inherit",
      }}>✕</button>

      <div style={{ fontSize: 16, letterSpacing: 3, color: "#cbd5e1", marginBottom: 6 }}>深度分析</div>
      <h2 style={{
        fontFamily: "'Instrument Serif', serif",
        fontSize: 48, fontWeight: 400, margin: "0 0 6px",
        color: "#f1f5f9",
      }}>{s.ticker}</h2>
      <div style={{ fontSize: 20, color: "#cbd5e1", marginBottom: 28 }}>{s.name} · {s.sector}</div>

      {/* Price vs IV */}
      <div style={{
        background: "rgba(255,255,255,0.03)", borderRadius: 14, padding: 24, marginBottom: 20,
        border: "1px solid rgba(255,255,255,0.06)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 15, letterSpacing: 2, color: "#cbd5e1" }}>市場價格</div>
            <div style={{ fontSize: 40, fontWeight: 700, color: "#f1f5f9" }}>${s.price.toFixed(1)}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 15, letterSpacing: 2, color: "#cbd5e1" }}>內在價值</div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
              <span style={{ fontSize: 40, fontWeight: 700, color: "#f59e0b" }}>${iv.toFixed(1)}</span>
              {s.isAssetFloored && (
                <span style={{
                  fontSize: 14, padding: "4px 10px", borderRadius: 4, fontWeight: 600,
                  background: "rgba(14,165,233,0.15)", color: "#38bdf8",
                  whiteSpace: "nowrap",
                }}>🛡️ 含資產保底</span>
              )}
            </div>
          </div>
        </div>
        {/* Visual bar */}
        <div style={{ position: "relative", height: 40, background: "rgba(255,255,255,0.04)", borderRadius: 10, overflow: "hidden" }}>
          <div style={{
            position: "absolute", left: 0, top: 0, height: "100%",
            width: `${iv > 0 ? Math.min((s.price / iv) * 100, 100) : 0}%`,
            background: `linear-gradient(90deg, ${sigColor}44, ${sigColor}22)`,
            borderRadius: 8,
            transition: "width 0.6s ease",
          }} />
          <div style={{
            position: "absolute", left: `${iv > 0 ? Math.min((s.price / iv) * 100, 98) : 0}%`, top: 4, bottom: 4,
            width: 3, background: sigColor, borderRadius: 2,
            boxShadow: `0 0 8px ${sigColor}88`,
          }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10 }}>
          <span style={{ fontSize: 16, color: "#cbd5e1" }}>0</span>
          <span style={{
            fontSize: 18, fontWeight: 700, color: sigColor,
            padding: "4px 14px", borderRadius: 6,
            background: `${sigColor}15`,
          }}>
            安全邊際: {mos.toFixed(1)}%
          </span>
          <span style={{ fontSize: 16, color: "#cbd5e1" }}>{iv.toFixed(0)}</span>
        </div>
      </div>

      {/* Scenario Analysis — Bear / Base / Bull */}
      <div style={{
        background: "rgba(255,255,255,0.03)", borderRadius: 14, padding: 24, marginBottom: 20,
        border: "1px solid rgba(255,255,255,0.06)",
      }}>
        <div style={{ fontSize: 16, letterSpacing: 2, color: "#cbd5e1", marginBottom: 16 }}>
          情境估值分析
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {scenarios.map((sc, i) => {
            const barH = maxVal > 0 ? Math.max((sc.value / maxVal) * 80, 6) : 6;
            const isCurrent = sc.label.includes("基準");
            return (
              <div key={i} style={{
                flex: 1, textAlign: "center",
                background: isCurrent ? "rgba(245,158,11,0.06)" : "transparent",
                borderRadius: 8, padding: "10px 4px",
                border: isCurrent ? "1px solid rgba(245,158,11,0.15)" : "1px solid transparent",
              }}>
                <div style={{ fontSize: 15, color: "#cbd5e1", letterSpacing: 1, marginBottom: 10 }}>{sc.label}</div>
                <div style={{
                  width: 38, height: barH, background: `${sc.color}55`,
                  borderRadius: 4, margin: "0 auto 6px", transition: "height 0.4s ease",
                  border: `1px solid ${sc.color}88`,
                }} />
                <div style={{ fontSize: 28, fontWeight: 700, color: sc.color }}>${sc.value.toFixed(0)}</div>
                <div style={{ fontSize: 14, color: "#cbd5e1", marginTop: 5 }}>
                  成長 {sc.growth}% · 折現 {typeof sc.dr === 'number' ? sc.dr.toFixed(1) : sc.dr}%
                </div>
                {sc.value > 0 && (
                  <div style={{
                    fontSize: 15, marginTop: 5, fontWeight: 600,
                    color: s.price < sc.value ? "#22c55e" : "#ef4444",
                  }}>
                    安全邊際 {((sc.value - s.price) / sc.value * 100).toFixed(0)}%
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div style={{
          marginTop: 12, fontSize: 14, color: "#cbd5e1", textAlign: "center", lineHeight: 1.5,
        }}>
          悲觀：成長率×0.6 + 折現率+2% ｜ 樂觀：成長率不打折 + 折現率-1%
        </div>
      </div>

      {/* Historical chart */}
      <HistoryChart ticker={s.ticker} avgEps={s.avgEps} />

      {/* Buffett Checklist */}
      <div style={{
        background: "rgba(255,255,255,0.03)", borderRadius: 14, padding: 24, marginBottom: 20,
        border: "1px solid rgba(255,255,255,0.06)",
      }}>
        <div style={{ fontSize: 16, letterSpacing: 2, color: "#cbd5e1", marginBottom: 14 }}>
          巴菲特檢核表 — {score}/7
        </div>
        <div style={{
          height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3, marginBottom: 16, overflow: "hidden",
        }}>
          <div style={{
            height: "100%", width: `${(score / 7) * 100}%`, borderRadius: 3,
            background: score >= 5 ? "linear-gradient(90deg, #22c55e, #16a34a)" : score >= 3 ? "linear-gradient(90deg, #eab308, #ca8a04)" : "linear-gradient(90deg, #ef4444, #dc2626)",
            transition: "width 0.6s ease",
          }} />
        </div>
        {criteria.map((c, i) => (
          <div key={i} style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "8px 0",
            borderBottom: i < criteria.length - 1 ? "1px solid rgba(255,255,255,0.03)" : "none",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 18 }}>
              <span style={{
                width: 26, height: 26, borderRadius: 5, display: "flex", alignItems: "center", justifyContent: "center",
                background: c.pass ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.1)",
                color: c.pass ? "#22c55e" : "#ef4444", fontSize: 16,
              }}>
                {c.pass ? "✓" : "✗"}
              </span>
              <span style={{ color: "#cbd5e1" }}>{c.label}</span>
            </div>
            <span style={{ fontSize: 18, fontWeight: 600, color: c.pass ? "#22c55e" : "#ef4444" }}>{c.value}</span>
          </div>
        ))}
      </div>

      {/* Key Metrics Grid */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12,
      }}>
        {[
          { l: "每股盈餘", v: s.eps.toFixed(1), c: "#3b82f6" },
          { l: "平滑EPS", v: s.avgEps != null ? s.avgEps.toFixed(1) : "無資料", c: valuationMode === "avgEps" ? "#f59e0b" : "#3b82f6" },
          { l: "每股自由現金流", v: s.fcfPerShare != null ? s.fcfPerShare.toFixed(1) : "無資料", c: valuationMode === "fcfps" ? "#f59e0b" : (s.fcfPerShare != null && s.fcfPerShare < 0 ? "#ef4444" : "#22c55e") },
          { l: "原始成長率", v: `${s.originalGrowth ?? s.growthRate}%`, c: "#64748b" },
          { l: "調整後成長率", v: `${safeGrowth}%`, c: COLOR_ROE },
          { l: "實際折現率", v: `${effectiveDiscount}%`, c: effectiveDiscount > discountRate ? "#ef4444" : "#3b82f6" },
          { l: "每股淨值", v: s.bvps.toFixed(1), c: "#f59e0b" },
          { l: "自由現金流", v: `${s.fcf}M`, c: "#22c55e" },
          { l: "出場倍數", v: `${exitMultiple}x`, c: "#6366f1" },
          { l: "終值佔比", v: `${terminalPct}%`, c: terminalPct > 75 ? "#ef4444" : terminalPct > 60 ? "#eab308" : "#22c55e" },
        ].map((m, i) => (
          <div key={i} style={{
            background: "rgba(255,255,255,0.03)", borderRadius: 12, padding: "14px 18px",
            border: "1px solid rgba(255,255,255,0.06)",
          }}>
            <div style={{ fontSize: 14, letterSpacing: 1.5, color: "#cbd5e1" }}>{m.l}</div>
            <div style={{ fontSize: 30, fontWeight: 700, color: m.c, marginTop: 3 }}>{m.v}</div>
          </div>
        ))}
      </div>

      {/* 終值佔比警示 */}
      {terminalPct > 75 && (
        <div style={{
          marginTop: 10, padding: "8px 14px", borderRadius: 8,
          background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)",
          fontSize: 16, color: "#f87171", display: "flex", alignItems: "center", gap: 8,
        }}>
          ⚠️ 終值佔估值 {terminalPct}%，估值高度依賴遠期假設，請謹慎參考
        </div>
      )}

      <div style={{
        marginTop: terminalPct > 75 ? 12 : 24, padding: 18, borderRadius: 12,
        background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.12)",
        fontSize: 15, color: "#cbd5e1", lineHeight: 1.6,
      }}>
        💡 估值基準：{baseLabel}={baseValue > 0 ? baseValue.toFixed(1) : '無資料'}，兩階段 DCF：前5年 {safeGrowth}% → 後5年遞減至 2%，折現率 {effectiveDiscount}%{riskPremium > 0 ? `（含 +${riskPremium.toFixed(1)}% 風險溢酬）` : ''}，終值取 Gordon/{exitMultiple}x 較保守值。
      </div>
    </div>
  );
}
