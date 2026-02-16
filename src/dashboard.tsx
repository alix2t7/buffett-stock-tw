import { useState, useMemo, useEffect } from "react";
import DetailPanel from "./DetailPanel.tsx";
import ManageModal from "./ManageModal.tsx";
import StockRow from "./StockRow.tsx";
import StockCard from "./StockCard.tsx";
import useDCF from "./useDCF.ts";
import usePortfolioData from "./usePortfolioData.ts";
import {
  MOS_UNDERVALUED, MOS_FAIR,
  COLOR_BULLISH, COLOR_NEUTRAL, COLOR_BEARISH,
  COLOR_INFO, COLOR_MUTED, COLOR_ROE,
  DEFAULT_DISCOUNT_RATE, DEFAULT_GROWTH_DISCOUNT,
} from "./constants.ts";
import type { EnrichedStock, ValuationMode, SortDir, ViewMode } from "./types.ts";

// ─── Sort Indicator ─────────────────────────────────────────────────────
function SortIcon({ col, sortKey, sortDir }: { col: string; sortKey: string; sortDir: SortDir }) {
  if (sortKey !== col) return <span style={{ opacity: 0.3, fontSize: 13 }}>⇅</span>;
  return <span style={{ fontSize: 13 }}>{sortDir === "asc" ? "↑" : "↓"}</span>;
}

// ─── Main App ───────────────────────────────────────────────────────────
export default function BuffettDashboard() {
  const { stocks, loading, error, lastUpdate, syncLog, syncing, loadData, syncPortfolio, setError, setSyncLog: clearSyncLog } = usePortfolioData();

  const [sortKey, setSortKey] = useState<keyof EnrichedStock>("ticker");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [filterSector, setFilterSector] = useState("ALL");
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [discountRate, setDiscountRate] = useState(DEFAULT_DISCOUNT_RATE);
  const [growthDiscount, setGrowthDiscount] = useState(DEFAULT_GROWTH_DISCOUNT);
  const [valuationMode, setValuationMode] = useState<ValuationMode>("avgEps");
  const [searchTerm, setSearchTerm] = useState("");
  const [view, setView] = useState<ViewMode>("table");
  const [animate, setAnimate] = useState(false);

  // 管理持股 modal
  const [showManage, setShowManage] = useState(false);

  useEffect(() => { setAnimate(true); }, []);

  const sectors = useMemo(() => ["ALL", ...new Set(stocks.map(s => s.sector))], [stocks]);

  const enriched = useDCF(stocks, discountRate, growthDiscount, valuationMode);

  // 從 enriched 即時衍生完整物件，避免參數異動時 stale data
  const selectedStock = selectedTicker
    ? enriched.find(s => s.ticker === selectedTicker) ?? null
    : null;

  const filtered = useMemo(() => {
    let list = enriched;
    if (filterSector !== "ALL") list = list.filter(s => s.sector === filterSector);
    if (searchTerm) list = list.filter(s => s.ticker.includes(searchTerm) || s.name.includes(searchTerm));
    return list;
  }, [enriched, filterSector, searchTerm]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "string" && typeof bv === "string") return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
  }, [filtered, sortKey, sortDir]);

  const handleSort = (key: keyof EnrichedStock) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  // Summary stats
  const validStocks = enriched.filter(s => !s.fetchError);
  const undervalued = validStocks.filter(s => s.marginOfSafety >= MOS_UNDERVALUED).length;
  const fairValue = validStocks.filter(s => s.marginOfSafety >= MOS_FAIR && s.marginOfSafety < MOS_UNDERVALUED).length;
  const overvalued = validStocks.filter(s => s.marginOfSafety < MOS_FAIR).length;
  const avgDividend = validStocks.length > 0 ? (validStocks.reduce((a, s) => a + s.dividendYield, 0) / validStocks.length).toFixed(1) : "0.0";
  const avgROE = validStocks.length > 0 ? (validStocks.reduce((a, s) => a + s.roe, 0) / validStocks.length).toFixed(1) : "0.0";

  const maxROE = enriched.length > 0 ? Math.max(...enriched.map(s => s.roe)) : 1;
  const maxDY = enriched.length > 0 ? Math.max(...enriched.map(s => s.dividendYield)) : 1;
  const maxCR = enriched.length > 0 ? Math.max(...enriched.map(s => s.currentRatio)) : 1;



  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(145deg, #0a0e1a 0%, #0f1629 40%, #121a30 100%)",
      color: "#e2e8f0",
      fontFamily: "system-ui, -apple-system, 'Noto Sans TC', 'Microsoft JhengHei', sans-serif",
      padding: "0",
      overflow: "hidden",
    }}>
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        /* ─── 高齡友善全域樣式 ─── */
        * { line-height: 1.6; }
        input, select, button { min-height: 44px; }
        ::-webkit-scrollbar { width: 10px; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 5px; }
        ::placeholder { color: #94a3b8 !important; }
      `}</style>

      {/* ─── Header ─── */}
      <header style={{
        padding: "28px 36px 20px",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        background: "rgba(0,0,0,0.2)",
        backdropFilter: "blur(20px)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-end",
        flexWrap: "wrap",
        gap: 16,
        opacity: animate ? 1 : 0,
        transform: animate ? "translateY(0)" : "translateY(-10px)",
        transition: "all 0.6s ease",
      }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
            <div style={{
              width: 14, height: 14, borderRadius: "50%",
              background: "linear-gradient(135deg, #22c55e, #16a34a)",
              boxShadow: "0 0 12px rgba(34,197,94,0.5)",
            }} />
            <span style={{ fontSize: 14, letterSpacing: 4, color: "#94a3b8", textTransform: "uppercase" }}>
              台灣價值投資終端
            </span>
          </div>
          <h1 style={{
            fontFamily: "'Instrument Serif', serif",
            fontSize: 44,
            fontWeight: 400,
            margin: 0,
            letterSpacing: -0.5,
            background: "linear-gradient(135deg, #f1f5f9, #94a3b8)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}>
            巴菲特選股器
          </h1>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <button
            onClick={loadData}
            disabled={loading || syncing}
            title="重新讀取 JSON"
            style={{
              background: "rgba(34,197,94,0.15)",
              border: "1px solid rgba(34,197,94,0.3)",
              borderRadius: 10,
              padding: "12px 20px",
              color: "#22c55e",
              cursor: loading || syncing ? "not-allowed" : "pointer",
              fontSize: 15,
              fontFamily: "inherit",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span style={{ fontSize: 18 }}>{loading ? "⟳" : "↻"}</span>
            {loading ? "載入中..." : "重新載入"}
          </button>
          <button
            onClick={() => syncPortfolio({})}
            disabled={syncing || loading}
            title="同步持股：偵測新增/移除並更新資料"
            style={{
              background: syncing ? "rgba(168,85,247,0.25)" : "rgba(168,85,247,0.12)",
              border: "1px solid rgba(168,85,247,0.3)",
              borderRadius: 10,
              padding: "12px 20px",
              color: "#a855f7",
              cursor: syncing || loading ? "not-allowed" : "pointer",
              fontSize: 15,
              fontFamily: "inherit",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span style={{ fontSize: 18, display: "inline-block", animation: syncing ? "spin 1s linear infinite" : "none" }}>⚙️</span>
            {syncing ? "同步中..." : "同步持股"}
          </button>
          <button
            onClick={() => setShowManage(true)}
            disabled={syncing}
            title="新增 / 移除持股"
            style={{
              background: "rgba(251,191,36,0.12)",
              border: "1px solid rgba(251,191,36,0.3)",
              borderRadius: 10,
              padding: "12px 20px",
              color: "#fbbf24",
              cursor: "pointer",
              fontSize: 15,
              fontFamily: "inherit",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span style={{ fontSize: 18 }}>📋</span> 管理持股
          </button>
          {lastUpdate && (
            <span style={{ fontSize: 14, color: "#94a3b8" }}>
              最後更新: {lastUpdate.toLocaleTimeString('zh-TW')}
            </span>
          )}
          <div style={{ width: 1, height: 24, background: "rgba(255,255,255,0.12)" }} />
          <span style={{ fontSize: 14, color: "#94a3b8", marginRight: 4 }}>折現率</span>
          <input
            type="range" min="5" max="20" step="0.5" value={discountRate}
            onChange={e => setDiscountRate(Number(e.target.value))}
            style={{ width: 100, accentColor: "#3b82f6", height: 6 }}
          />
          <span style={{
            fontSize: 16, fontWeight: 600, color: "#3b82f6",
            background: "rgba(59,130,246,0.1)", padding: "4px 12px", borderRadius: 6,
          }}>{discountRate}%</span>
          <div style={{ width: 1, height: 24, background: "rgba(255,255,255,0.12)" }} />
          <span style={{ fontSize: 14, color: "#94a3b8", marginRight: 4 }}>成長打折</span>
          <input
            type="range" min="20" max="100" step="5" value={growthDiscount}
            onChange={e => setGrowthDiscount(Number(e.target.value))}
            style={{ width: 100, accentColor: COLOR_ROE, height: 6 }}
          />
          <span style={{
            fontSize: 16, fontWeight: 600, color: COLOR_ROE,
            background: "rgba(167,139,250,0.1)", padding: "4px 12px", borderRadius: 6,
          }}>{growthDiscount}%</span>
          <div style={{ width: 1, height: 24, background: "rgba(255,255,255,0.12)" }} />
          <div style={{ display: "flex", gap: 6 }}>
            {([
              { key: "avgEps" as ValuationMode, label: "平滑EPS" },
              { key: "eps" as ValuationMode, label: "每股盈餘" },
              { key: "fcfps" as ValuationMode, label: "每股自由現金流" },
            ]).map(m => (
              <button key={m.key} onClick={() => setValuationMode(m.key)} style={{
                background: valuationMode === m.key ? "rgba(245,158,11,0.15)" : "transparent",
                border: valuationMode === m.key ? "1px solid rgba(245,158,11,0.3)" : "1px solid rgba(255,255,255,0.06)",
                borderRadius: 8, padding: "8px 14px",
                color: valuationMode === m.key ? "#f59e0b" : "#94a3b8",
                cursor: "pointer", fontSize: 14, fontFamily: "inherit", fontWeight: 500,
              }}>{m.label}</button>
            ))}
          </div>
        </div>
      </header>

      {/* ─── Error Message（含伺服器離線偵測）─── */}
      {error && (
        <div style={{
          margin: "16px 36px",
          padding: "16px 20px",
          background: error.includes("伺服器") ? "rgba(251,191,36,0.08)" : "rgba(239,68,68,0.1)",
          border: `1px solid ${error.includes("伺服器") ? "rgba(251,191,36,0.3)" : "rgba(239,68,68,0.3)"}`,
          borderRadius: 8,
          color: error.includes("伺服器") ? "#fbbf24" : "#ef4444",
          fontSize: 15,
          lineHeight: 1.7,
        }}>
          <div>{error.includes("伺服器") ? "🔌" : "⚠️"} {error}</div>
          {error.includes("伺服器") && (
            <button
              onClick={() => { setError(null); loadData(); }}
              style={{
                marginTop: 10, padding: "6px 16px",
                background: "rgba(251,191,36,0.15)", border: "1px solid rgba(251,191,36,0.3)",
                borderRadius: 6, color: "#fbbf24", cursor: "pointer",
                fontSize: 14, fontFamily: "inherit",
              }}
            >🔄 重新嘗試連線</button>
          )}
        </div>
      )}

      {/* ─── Sync Log ─── */}
      {syncLog && (
        <div style={{
          margin: "8px 36px",
          padding: "12px 16px",
          background: "rgba(168,85,247,0.06)",
          border: "1px solid rgba(168,85,247,0.15)",
          borderRadius: 8,
          fontSize: 13,
          fontFamily: "'JetBrains Mono', monospace",
          color: "#c4b5fd",
          maxHeight: 240,
          overflowY: "auto",
          whiteSpace: "pre-wrap",
          lineHeight: 1.6,
          position: "relative",
        }}>
          <button
            onClick={() => clearSyncLog(null)}
            style={{
              position: "absolute", top: 6, right: 8,
              background: "none", border: "none", color: "#94a3b8",
              cursor: "pointer", fontSize: 15, fontFamily: "inherit",
            }}
          >✕</button>
          {syncLog}
        </div>
      )}

      {/* ─── Summary Cards ─── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
        gap: 16,
        padding: "20px 36px",
        opacity: animate ? 1 : 0,
        transform: animate ? "translateY(0)" : "translateY(10px)",
        transition: "all 0.7s ease 0.1s",
      }}>
        {[
          { label: "低估", value: undervalued, color: COLOR_BULLISH, icon: "◆" },
          { label: "合理價位", value: fairValue, color: COLOR_NEUTRAL, icon: "◇" },
          { label: "高估", value: overvalued, color: COLOR_BEARISH, icon: "▽" },
          { label: "平均殖利率", value: `${avgDividend}%`, color: COLOR_INFO, icon: "$" },
          { label: "平均 ROE", value: `${avgROE}%`, color: COLOR_ROE, icon: "%" },
        ].map((card, i) => (
          <div key={i} style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 12,
            padding: "16px 20px",
            position: "relative",
            overflow: "hidden",
          }}>
            <div style={{
              position: "absolute", top: -8, right: -4,
              fontSize: 48, opacity: 0.04, color: card.color,
            }}>{card.icon}</div>
            <div style={{ fontSize: 13, letterSpacing: 2, color: "#94a3b8", marginBottom: 6 }}>{card.label}</div>
            <div style={{ fontSize: 34, fontWeight: 700, color: card.color }}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* ─── Controls ─── */}
      <div style={{
        padding: "0 36px 16px",
        display: "flex",
        gap: 12,
        alignItems: "center",
        flexWrap: "wrap",
      }}>
        <input
          type="text"
          placeholder="🔍 搜尋代碼或名稱..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 8,
            padding: "10px 16px",
            color: "#e2e8f0",
            fontSize: 15,
            width: 220,
            outline: "none",
            fontFamily: "inherit",
          }}
        />
        <select
          value={filterSector}
          onChange={e => setFilterSector(e.target.value)}
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 8,
            padding: "10px 16px",
            color: "#e2e8f0",
            fontSize: 15,
            fontFamily: "inherit",
            cursor: "pointer",
          }}
        >
          {sectors.map(s => <option key={s} value={s}>{s === "ALL" ? "全部類股" : s}</option>)}
        </select>
        <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
          {["table", "cards"].map(v => (
            <button key={v} onClick={() => setView(v as ViewMode)} style={{
              background: view === v ? "rgba(59,130,246,0.15)" : "transparent",
              border: view === v ? "1px solid rgba(59,130,246,0.3)" : "1px solid rgba(255,255,255,0.06)",
              borderRadius: 8, padding: "8px 16px", color: view === v ? "#3b82f6" : "#94a3b8",
              cursor: "pointer", fontSize: 14, fontFamily: "inherit",
            }}>
              {v === "table" ? "▤ 表格" : "▦ 卡片"}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 14, color: "#94a3b8" }}>
          {filtered.length} / {enriched.length} 檔
        </div>
      </div>

      {/* ─── Table View ─── */}
      {view === "table" && (
        <div style={{
          padding: "0 36px 36px",
          overflowX: "auto",
          opacity: animate ? 1 : 0,
          transition: "all 0.7s ease 0.2s",
        }}>
          <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: "0 2px", fontSize: 15 }}>
            <thead>
              <tr>
                {([
                  { key: "ticker" as keyof EnrichedStock, label: "代碼", w: 60 },
                  { key: "name" as keyof EnrichedStock, label: "名稱", w: 90 },
                  { key: "sector" as keyof EnrichedStock, label: "類股", w: 80 },
                  { key: "price" as keyof EnrichedStock, label: "股價", w: 65 },
                  { key: "eps" as keyof EnrichedStock, label: "每股盈餘", w: 55 },
                  { key: "avgEps" as keyof EnrichedStock, label: "3年均EPS", w: 65 },
                  { key: "pe" as keyof EnrichedStock, label: "本益比", w: 55 },
                  { key: "pb" as keyof EnrichedStock, label: "淨值比", w: 50 },
                  { key: "roe" as keyof EnrichedStock, label: "ROE%", w: 70 },
                  { key: "dividendYield" as keyof EnrichedStock, label: "殖利率%", w: 75 },
                  { key: "debtToEquity" as keyof EnrichedStock, label: "負債比", w: 60 },
                  { key: "currentRatio" as keyof EnrichedStock, label: "流動比", w: 60 },
                  { key: "fcf" as keyof EnrichedStock, label: "自由現金流(M)", w: 65 },
                  { key: "intrinsicValue" as keyof EnrichedStock, label: "內在價值", w: 75 },
                  { key: "marginOfSafety" as keyof EnrichedStock, label: "安全邊際", w: 90 },
                ]).map(col => (
                  <th key={col.key} onClick={() => handleSort(col.key)} style={{
                    padding: "14px 10px",
                    textAlign: col.key === "name" || col.key === "sector" ? "left" : "right",
                    color: "#cbd5e1",
                    fontSize: 13,
                    letterSpacing: 1,
                    textTransform: "uppercase",
                    cursor: "pointer",
                    userSelect: "none",
                    borderBottom: "1px solid rgba(255,255,255,0.06)",
                    whiteSpace: "nowrap",
                    minWidth: col.w,
                    fontFamily: "inherit",
                    background: sortKey === col.key ? "rgba(59,130,246,0.05)" : "transparent",
                  }}>
                    {col.label} <SortIcon col={col.key} sortKey={sortKey} sortDir={sortDir} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((s, idx) => (
                <StockRow
                  key={s.ticker}
                  stock={s}
                  idx={idx}
                  selectedTicker={selectedTicker}
                  onSelect={setSelectedTicker}
                  maxROE={maxROE}
                  maxDY={maxDY}
                  maxCR={maxCR}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ─── Cards View ─── */}
      {view === "cards" && (
        <div style={{
          padding: "0 36px 36px",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
          gap: 14,
        }}>
          {sorted.map(s => (
            <StockCard
              key={s.ticker}
              stock={s}
              selectedTicker={selectedTicker}
              onSelect={setSelectedTicker}
            />
          ))}
        </div>
      )}

      {/* ─── Detail Panel (slide-in) ─── */}
      {selectedStock && (
        <DetailPanel
          stock={selectedStock}
          discountRate={discountRate}
          valuationMode={valuationMode}
          onClose={() => setSelectedTicker(null)}
        />
      )}

      {/* ─── Footer ─── */}
      {/* ─── 管理持股 Modal ─── */}
      {showManage && (
        <ManageModal
          stocks={stocks}
          onClose={() => setShowManage(false)}
          onLoadData={loadData}
          onError={setError}
          onSyncLog={clearSyncLog}
        />
      )}

      <footer style={{
        padding: "20px 36px",
        borderTop: "1px solid rgba(255,255,255,0.04)",
        display: "flex",
        justifyContent: "space-between",
        fontSize: 14,
        color: "#64748b",
        flexWrap: "wrap",
        gap: 8,
      }}>
        <span>🐍 Python yfinance 真實數據 | 📄 從 stock_data.json 讀取</span>
        <span>
          基於巴菲特投資原則
          {loading && <span style={{ color: "#3b82f6", marginLeft: 8 }}>● 載入中...</span>}
        </span>
      </footer>
    </div>
  );
}
