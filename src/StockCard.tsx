/**
 * StockCard.tsx — 個股卡片（Cards 視圖）
 */

import { getSignalColor, getSignalLabel } from "./dcf-engine.ts";
import {
  PE_LOW, PB_LOW, DE_LOW,
  COLOR_BULLISH, COLOR_NEUTRAL, COLOR_ROE,
} from "./constants.ts";
import type { EnrichedStock } from "./types.ts";

interface StockCardProps {
  stock: EnrichedStock;
  selectedTicker: string | null;
  onSelect: (ticker: string | null) => void;
}

export default function StockCard({ stock: s, selectedTicker, onSelect }: StockCardProps) {
  const sigColor = getSignalColor(s.marginOfSafety);
  const sigLabel = getSignalLabel(s.marginOfSafety);
  const isSelected = selectedTicker === s.ticker;

  return (
    <div onClick={() => onSelect(isSelected ? null : s.ticker)} style={{
      background: s.fetchError ? "rgba(239,68,68,0.03)" : "rgba(255,255,255,0.025)",
      border: `1px solid ${isSelected ? "rgba(59,130,246,0.3)" : s.fetchError ? "rgba(239,68,68,0.2)" : "rgba(255,255,255,0.06)"}`,
      borderRadius: 14,
      padding: 20,
      cursor: "pointer",
      transition: "all 0.3s",
      position: "relative",
      overflow: "hidden",
      opacity: s.fetchError ? 0.7 : 1,
    }}>
      <div style={{
        position: "absolute", top: 0, left: 0, width: 4, height: "100%",
        background: s.fetchError ? "#ef4444" : sigColor, borderRadius: "14px 0 0 14px",
      }} />
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
        <div>
          <span style={{ fontSize: 22, fontWeight: 700, color: "#f1f5f9" }}>{s.ticker}</span>
          <span style={{ fontSize: 15, color: "#94a3b8", marginLeft: 8 }}>{s.name}</span>
        </div>
        {s.fetchError ? (
          <span style={{
            fontSize: 12, padding: "4px 12px", borderRadius: 6, fontWeight: 700, height: "fit-content",
            background: "rgba(239,68,68,0.15)", color: "#ef4444",
          }}>抓取失敗</span>
        ) : (
          <span style={{
            fontSize: 12, padding: "4px 12px", borderRadius: 6, fontWeight: 700, height: "fit-content",
            background: `${sigColor}18`, color: sigColor,
          }}>{sigLabel}</span>
        )}
      </div>
      {s.fetchError ? (
        <div style={{ padding: "20px", textAlign: "center", color: "#ef4444", fontSize: 15 }}>
          ⚠️ 無法取得資料
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, fontSize: 14 }}>
          {[
            { l: "股價", v: s.price.toFixed(1), c: "#f1f5f9" },
            { l: "本益比", v: s.pe.toFixed(1), c: s.pe < PE_LOW ? COLOR_BULLISH : COLOR_NEUTRAL },
            { l: "淨值比", v: s.pb.toFixed(1), c: s.pb < PB_LOW ? COLOR_BULLISH : COLOR_NEUTRAL },
            { l: "每股盈餘", v: s.eps.toFixed(1), c: "#3b82f6" },
            { l: "ROE", v: `${s.roe}%`, c: COLOR_ROE },
            { l: "殖利率%", v: `${s.dividendYield}%`, c: "#22c55e" },
            { l: "負債比", v: s.debtToEquity.toFixed(2), c: s.debtToEquity < DE_LOW ? COLOR_BULLISH : COLOR_NEUTRAL },
            { l: "流動比", v: s.currentRatio.toFixed(1), c: "#3b82f6" },
            { l: "自由現金流", v: s.fcf.toLocaleString(), c: "#94a3b8" },
          ].map((m, i) => (
            <div key={i}>
              <div style={{ color: "#94a3b8", fontSize: 12, letterSpacing: 1 }}>{m.l}</div>
              <div style={{ color: m.c, fontWeight: 600, fontSize: 16 }}>{m.v}</div>
            </div>
          ))}
        </div>
      )}
      {!s.fetchError && (
        <div style={{
          marginTop: 14, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.06)",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div>
            <span style={{ fontSize: 12, color: "#94a3b8", letterSpacing: 1 }}>內在價值 </span>
            <span style={{ color: "#f59e0b", fontWeight: 700, fontSize: 18 }}>{s.intrinsicValue.toFixed(1)}</span>
          </div>
          <div style={{ textAlign: "right" }}>
            <span style={{ fontSize: 12, color: "#94a3b8", letterSpacing: 1 }}>安全邊際 </span>
            <span style={{ color: sigColor, fontWeight: 700, fontSize: 18 }}>{s.marginOfSafety.toFixed(1)}%</span>
          </div>
        </div>
      )}
    </div>
  );
}
