/**
 * StockRow.tsx — 個股表格列
 */

import { getSignalColor, getSignalLabel } from "./dcf-engine.ts";
import MiniBar from "./MiniBar.tsx";
import {
  PE_LOW, PE_MID, PB_LOW, PB_MID, DE_LOW,
  COLOR_BULLISH, COLOR_NEUTRAL, COLOR_BEARISH, COLOR_MUTED, COLOR_ROE,
} from "./constants.ts";
import type { EnrichedStock } from "./types.ts";

interface StockRowProps {
  stock: EnrichedStock;
  idx: number;
  selectedTicker: string | null;
  onSelect: (ticker: string | null) => void;
  maxROE: number;
  maxDY: number;
  maxCR: number;
}

export default function StockRow({ stock: s, idx, selectedTicker, onSelect, maxROE, maxDY, maxCR }: StockRowProps) {
  const sigColor = getSignalColor(s.marginOfSafety);
  const sigLabel = getSignalLabel(s.marginOfSafety);
  const isSelected = selectedTicker === s.ticker;

  return (
    <tr
      onClick={() => onSelect(isSelected ? null : s.ticker)}
      style={{
        background: isSelected
          ? "rgba(59,130,246,0.08)"
          : s.fetchError ? "rgba(239,68,68,0.03)"
          : idx % 2 === 0 ? "rgba(255,255,255,0.015)" : "transparent",
        cursor: "pointer",
        transition: "background 0.2s",
        opacity: s.fetchError ? 0.6 : 1,
      }}
      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = s.fetchError ? "rgba(239,68,68,0.05)" : "rgba(255,255,255,0.04)"; }}
      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = s.fetchError ? "rgba(239,68,68,0.03)" : (idx % 2 === 0 ? "rgba(255,255,255,0.015)" : "transparent"); }}
    >
      <td style={{ padding: "14px 10px", textAlign: "right", fontWeight: 600, color: "#f1f5f9" }}>
        {s.ticker}
        {s.fetchError && <span style={{ fontSize: 12, color: "#ef4444", marginLeft: 4 }}>⚠</span>}
      </td>
      <td style={{ padding: "14px 10px", color: "#cbd5e1" }}>
        {s.name}
        {s.fetchError && <div style={{ fontSize: 12, color: "#ef4444", marginTop: 2 }}>抓取失敗</div>}
      </td>
      <td style={{ padding: "14px 10px" }}>
        <span style={{
          fontSize: 13, padding: "3px 10px", borderRadius: 4,
          background: "rgba(255,255,255,0.05)", color: "#94a3b8",
        }}>{s.sector}</span>
      </td>
      <td style={{ padding: "14px 10px", textAlign: "right", fontWeight: 500, color: s.fetchError ? "#94a3b8" : "inherit" }}>
        {s.fetchError ? "-" : s.price.toFixed(1)}
      </td>
      <td style={{ padding: "14px 10px", textAlign: "right", color: s.fetchError ? "#94a3b8" : "#3b82f6" }}>
        {s.fetchError ? "-" : s.eps.toFixed(1)}
      </td>
      <td style={{ padding: "14px 10px", textAlign: "right", color: s.fetchError ? "#94a3b8" : "#60a5fa" }}>
        {s.fetchError || s.avgEps == null ? "-" : s.avgEps.toFixed(1)}
      </td>
      <td style={{ padding: "14px 10px", textAlign: "right", color: s.fetchError ? COLOR_MUTED : (s.pe < PE_LOW ? COLOR_BULLISH : s.pe < PE_MID ? COLOR_NEUTRAL : COLOR_BEARISH) }}>
        {s.fetchError ? "-" : s.pe.toFixed(1)}
      </td>
      <td style={{ padding: "14px 10px", textAlign: "right", color: s.fetchError ? COLOR_MUTED : (s.pb < PB_LOW ? COLOR_BULLISH : s.pb < PB_MID ? COLOR_NEUTRAL : COLOR_BEARISH) }}>
        {s.fetchError ? "-" : s.pb.toFixed(1)}
      </td>
      <td style={{ padding: "14px 10px", textAlign: "right" }}>
        {s.fetchError ? (
          <span style={{ color: "#94a3b8" }}>-</span>
        ) : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
            <MiniBar value={s.roe} max={maxROE} color={COLOR_ROE} />
            <span style={{ color: COLOR_ROE }}>{s.roe.toFixed(1)}</span>
          </div>
        )}
      </td>
      <td style={{ padding: "14px 10px", textAlign: "right" }}>
        {s.fetchError ? (
          <span style={{ color: "#94a3b8" }}>-</span>
        ) : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
            <MiniBar value={s.dividendYield} max={maxDY} color="#22c55e" />
            <span style={{ color: "#22c55e" }}>{s.dividendYield.toFixed(1)}</span>
          </div>
        )}
      </td>
      <td style={{ padding: "14px 10px", textAlign: "right", color: s.fetchError ? COLOR_MUTED : (s.debtToEquity < DE_LOW ? COLOR_BULLISH : COLOR_NEUTRAL) }}>
        {s.fetchError ? "-" : s.debtToEquity.toFixed(2)}
      </td>
      <td style={{ padding: "14px 10px", textAlign: "right" }}>
        {s.fetchError ? (
          <span style={{ color: "#94a3b8" }}>-</span>
        ) : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
            <MiniBar value={s.currentRatio} max={maxCR} color="#3b82f6" />
            <span>{s.currentRatio.toFixed(1)}</span>
          </div>
        )}
      </td>
      <td style={{ padding: "14px 10px", textAlign: "right", color: "#94a3b8" }}>
        {s.fetchError ? "-" : s.fcf.toLocaleString()}
      </td>
      <td style={{ padding: "14px 10px", textAlign: "right", fontWeight: 600, color: s.fetchError ? "#94a3b8" : "#f59e0b" }}>
        {s.fetchError ? "-" : (
          <span>
            {s.intrinsicValue.toFixed(1)}
            {s.isAssetFloored && <span title="含資產保底" style={{ marginLeft: 3, fontSize: 13 }}>🛡️</span>}
          </span>
        )}
      </td>
      <td style={{ padding: "14px 10px", textAlign: "right" }}>
        {s.fetchError ? (
          <span style={{ fontSize: 14, color: "#ef4444", fontWeight: 600 }}>抓取失敗</span>
        ) : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
            <span style={{
              fontSize: 12, padding: "3px 10px", borderRadius: 4, fontWeight: 700,
              background: `${sigColor}18`, color: sigColor, letterSpacing: 0.5,
            }}>{sigLabel}</span>
            <span style={{ fontWeight: 700, color: sigColor }}>{s.marginOfSafety.toFixed(1)}%</span>
          </div>
        )}
      </td>
    </tr>
  );
}
