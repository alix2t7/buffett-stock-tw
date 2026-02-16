import { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  ReferenceLine,
} from "recharts";

// Lazy load cache for each ticker (with TTL)
interface HistoryPoint {
  date: string;
  price: number;
  roe: number;
  eps: number;
  _dateObj?: Date;
}

type RangeOption = "1M" | "3M" | "6M" | "1Y" | "ALL";

interface CacheEntry {
  data: HistoryPoint[];
  ts: number;
}

const CACHE_TTL = 5 * 60 * 1000; // 5 分鐘後自動失效
const MAX_CACHE_SIZE = 50; // S-7: 最多快取 50 支股票
const tickerCache: Record<string, CacheEntry> = {};

/** S-7: 快取達上限時刪除最舊的 entry */
function evictOldestCache() {
  const keys = Object.keys(tickerCache);
  if (keys.length <= MAX_CACHE_SIZE) return;
  let oldestKey = keys[0];
  let oldestTs = tickerCache[oldestKey].ts;
  for (const k of keys) {
    if (tickerCache[k].ts < oldestTs) {
      oldestTs = tickerCache[k].ts;
      oldestKey = k;
    }
  }
  delete tickerCache[oldestKey];
}

interface HistoryState {
  loading: boolean;
  error: string | null;
  points: HistoryPoint[];
}

function useHistoricalSeries(ticker: string, range: RangeOption = "1Y"): HistoryState {
  const [state, setState] = useState<HistoryState>({
    loading: true,
    error: null,
    points: [],
  });

  useEffect(() => {
    let mounted = true;
    let ignore = false;

    async function fetchHistory() {
      setState((s) => ({ ...s, loading: true, error: null }));
      // S-8: validate ticker to prevent path traversal
      if (!/^\d{4,6}$/.test(ticker)) {
        setState({ loading: false, error: "無效的股票代碼", points: [] });
        return;
      }
      const cached = tickerCache[ticker];
      if (cached && Date.now() - cached.ts < CACHE_TTL) {
        updatePoints(cached.data);
        return;
      }
      try {
        const res = await fetch(`/history/${ticker}.json`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const series = (json.history || []).map((p: Record<string, unknown>) => ({
          ...p,
          _dateObj: new Date(p.date as string),
        }));
        tickerCache[ticker] = { data: series, ts: Date.now() };
        evictOldestCache();
        if (!ignore) updatePoints(series);
      } catch (err) {
        if (!ignore) setState({ loading: false, error: err instanceof Error ? err.message : "載入失敗", points: [] });
      }
    }

    function updatePoints(series: HistoryPoint[]) {
      let filtered = series;
      if (series.length && range !== "ALL") {
        const now = new Date();
        const days =
          range === "6M" ? 183 : range === "3M" ? 92 : range === "1M" ? 31 : 365;
        const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
        filtered = series.filter((p) => p._dateObj && p._dateObj >= cutoff);
      }
      const cleaned = filtered.map((p) => ({
        date: p.date,
        price: p.price,
        roe: p.roe,
        eps: p.eps,
      }));
      if (mounted) setState({ loading: false, error: null, points: cleaned });
    }

    fetchHistory();
    return () => {
      mounted = false;
      ignore = true;
    };
  }, [ticker, range]);

  return state;
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ dataKey: string; value?: number }>;
  label?: string;
}

function CustomTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload || !payload.length) return null;
  const priceDatum = payload.find((p) => p.dataKey === "price");
  const roeDatum = payload.find((p) => p.dataKey === "roe");

  return (
    <div
      style={{
        background: "rgba(15,23,42,0.95)",
        border: "1px solid rgba(148,163,184,0.4)",
        borderRadius: 8,
        padding: "10px 14px",
        fontSize: 13,
        color: "#e2e8f0",
      }}
    >
      <div style={{ marginBottom: 4, color: "#94a3b8" }}>{label}</div>
      {priceDatum && (
        <div style={{ color: "#f97316" }}>
          價格：<strong>{priceDatum.value?.toFixed(1)}</strong>
        </div>
      )}
      {roeDatum && (
        <div style={{ color: "#a855f7" }}>
          ROE：<strong>{roeDatum.value?.toFixed(1)}%</strong>
        </div>
      )}
      {payload.find((p) => p.dataKey === "eps") && (
        <div style={{ color: "#22d3ee" }}>
          EPS：<strong>{payload.find((p) => p.dataKey === "eps")?.value?.toFixed(2)}</strong>
        </div>
      )}
    </div>
  );
}

interface HistoryChartProps {
  ticker: string;
  avgEps: number | null;
}

export default function HistoryChart({ ticker, avgEps }: HistoryChartProps) {
  const [range, setRange] = useState<RangeOption>("1Y");
  const { loading, error, points } = useHistoricalSeries(ticker, range);

  return (
    <div
      style={{
        marginTop: 16,
        marginBottom: 16,
        padding: 16,
        borderRadius: 12,
        border: "1px solid rgba(148,163,184,0.35)",
        background:
          "radial-gradient(circle at top left, rgba(59,130,246,0.18), transparent 55%), rgba(15,23,42,0.9)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 10,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 13,
              letterSpacing: 2,
              color: "#94a3b8",
              textTransform: "uppercase",
              marginBottom: 2,
            }}
          >
            價格與 ROE 歷史走勢
          </div>
          <div style={{ fontSize: 15, color: "#cbd5e1" }}>
            {ticker} · 歷史價格、ROE 與 EPS 走勢
          </div>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {(["1M", "3M", "6M", "1Y", "ALL"] as const).map((r) => {
            const rangeLabel: Record<string, string> = { "1M": "近1月", "3M": "近3月", "6M": "近半年", "1Y": "近1年", "ALL": "全部" };
            return (
            <button
              key={r}
              onClick={() => setRange(r as RangeOption)}
              style={{
                fontSize: 13,
                padding: "5px 12px",
                borderRadius: 999,
                border:
                  range === r
                    ? "1px solid rgba(59,130,246,0.8)"
                    : "1px solid rgba(148,163,184,0.4)",
                background:
                  range === r
                    ? "rgba(37,99,235,0.28)"
                    : "rgba(15,23,42,0.8)",
                color: range === r ? "#e5f2ff" : "#9ca3af",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {rangeLabel[r]}
            </button>
          );
          })}
        </div>
      </div>

      {loading && (
        <div
          style={{
            padding: 14,
            fontSize: 14,
            color: "#60a5fa",
          }}
        >
          讀取歷史資料中...
        </div>
      )}

      {!loading && error && (
        <div
          style={{
            padding: 14,
            fontSize: 14,
            color: "#f97373",
          }}
        >
          無法載入歷史資料：{error}。請確認已執行{" "}
          <code style={{ fontSize: 13 }}>fetch_historical_data.py</code> 或{" "}
          <code style={{ fontSize: 13 }}>export_history_json.py</code>。
        </div>
      )}

      {!loading && !error && (!points || points.length === 0) && (
        <div
          style={{
            padding: 14,
            fontSize: 14,
            color: "#9ca3af",
          }}
        >
          目前尚無 {ticker} 的歷史資料。請先回填歷史價格（
          <code style={{ fontSize: 13 }}>fetch_historical_data.py</code>）並重新匯出 JSON。
        </div>
      )}

      {!loading && !error && points && points.length > 0 && (
        <div style={{ width: "100%", height: 220 }}>
          <ResponsiveContainer>
            <LineChart data={points} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(30,64,175,0.5)"
                vertical={false}
              />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 12, fill: "#94a3b8" }}
                tickLine={false}
                axisLine={{ stroke: "rgba(148,163,184,0.4)" }}
                minTickGap={20}
              />
              <YAxis
                yAxisId="left"
                tick={{ fontSize: 12, fill: "#9ca3af" }}
                tickLine={false}
                axisLine={{ stroke: "rgba(148,163,184,0.4)" }}
                width={48}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fontSize: 12, fill: "#a855f7" }}
                tickLine={false}
                axisLine={{ stroke: "rgba(148,163,184,0.4)" }}
                width={48}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                verticalAlign="top"
                height={24}
                iconSize={10}
                wrapperStyle={{ fontSize: 12, color: "#9ca3af" }}
              />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="price"
                stroke="#fb923c"
                strokeWidth={2}
                dot={false}
                name="價格"
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="roe"
                stroke="#a855f7"
                strokeWidth={1.6}
                dot={false}
                name="ROE%"
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="eps"
                stroke="#22d3ee"
                strokeWidth={1.6}
                dot={false}
                name="每股盈餘"
              />
              {avgEps != null && (
                <ReferenceLine
                  yAxisId="right"
                  y={avgEps}
                  stroke="#facc15"
                  strokeDasharray="6 3"
                  strokeWidth={1.5}
                  label={{
                    value: `3年均EPS：${avgEps.toFixed(1)}`,
                    position: "insideTopRight",
                    fill: "#facc15",
                    fontSize: 12,
                  }}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

