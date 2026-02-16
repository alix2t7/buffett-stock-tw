/**
 * ManageModal.tsx — 管理持股清單（新增 / 移除）
 */

import { useState } from "react";
import { apiSync } from "./services/api.ts";
import type { Stock } from "./types.ts";

interface ManageModalProps {
  stocks: Stock[];
  onClose: () => void;
  onLoadData: () => Promise<void>;
  onError: (msg: string | null) => void;
  onSyncLog: (msg: string | null) => void;
}

export default function ManageModal({ stocks, onClose, onLoadData, onError, onSyncLog }: ManageModalProps) {
  const [newTicker, setNewTicker] = useState("");
  const [newName, setNewName] = useState("");
  const [newSector, setNewSector] = useState("");
  const [addingTicker, setAddingTicker] = useState(false);
  const [removingTicker, setRemovingTicker] = useState<string | null>(null);

  // 一鍵新增股票
  const addTicker = async () => {
    const t = newTicker.trim();
    if (!t) return;
    setAddingTicker(true);
    onSyncLog(null);
    onError(null);
    try {
      const data = await apiSync({
        add: { ticker: t, name: newName.trim() || undefined, sector: newSector.trim() || undefined },
      });
      onSyncLog(data.output || data.error || "無輸出訊息");
      if (data.success) {
        await onLoadData();
        setNewTicker("");
        setNewName("");
        setNewSector("");
      } else {
        onError("新增失敗，請查看日誌");
      }
    } catch (e) {
      onError(`新增錯誤：${(e as Error).message}`);
    } finally {
      setAddingTicker(false);
    }
  };

  // 一鍵移除股票
  const removeTicker = async (ticker: string) => {
    setRemovingTicker(ticker);
    onSyncLog(null);
    onError(null);
    try {
      const data = await apiSync({ remove: ticker });
      onSyncLog(data.output || data.error || "無輸出訊息");
      if (data.success) {
        await onLoadData();
      } else {
        onError("移除失敗，請查看日誌");
      }
    } catch (e) {
      onError(`移除錯誤：${(e as Error).message}`);
    } finally {
      setRemovingTicker(null);
    }
  };

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)",
        zIndex: 1000,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <div style={{
        background: "linear-gradient(145deg, #141a2e, #1a2040)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 16, padding: 28,
        width: 640, maxHeight: "80vh", overflowY: "auto",
        boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
      }}>
        {/* Title */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 20, color: "#fbbf24" }}>📋 管理持股清單</h3>
          <button onClick={onClose}
            style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 22, fontFamily: "inherit" }}>✕</button>
        </div>

        {/* Add Ticker Row */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          <input
            placeholder="股票代碼 *"
            value={newTicker}
            onChange={e => setNewTicker(e.target.value)}
            onKeyDown={e => e.key === "Enter" && addTicker()}
            style={{
              flex: "0 0 120px", padding: "10px 14px", borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.05)",
              color: "#e2e8f0", fontSize: 15, fontFamily: "inherit", outline: "none",
            }}
          />
          <input
            placeholder="名稱 (選填，自動偵測)"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            style={{
              flex: "1 1 160px", padding: "10px 14px", borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.05)",
              color: "#e2e8f0", fontSize: 15, fontFamily: "inherit", outline: "none",
            }}
          />
          <input
            placeholder="產業 (選填，預設 電子)"
            value={newSector}
            onChange={e => setNewSector(e.target.value)}
            style={{
              flex: "1 1 140px", padding: "10px 14px", borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.05)",
              color: "#e2e8f0", fontSize: 15, fontFamily: "inherit", outline: "none",
            }}
          />
          <button
            onClick={addTicker}
            disabled={!newTicker.trim() || addingTicker}
            style={{
              flex: "0 0 auto", padding: "10px 20px", borderRadius: 8,
              border: "1px solid rgba(34,197,94,0.3)",
              background: addingTicker ? "rgba(34,197,94,0.25)" : "rgba(34,197,94,0.12)",
              color: "#22c55e", cursor: !newTicker.trim() || addingTicker ? "not-allowed" : "pointer",
              fontSize: 15, fontFamily: "inherit", fontWeight: 600,
            }}
          >
            {addingTicker ? "新增中..." : "➕ 新增"}
          </button>
        </div>

        {addingTicker && (
          <div style={{
            margin: "0 0 12px", padding: 10, borderRadius: 8,
            background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.1)",
            fontSize: 14, color: "#86efac",
          }}>
            ⏳ 正在從 yfinance 抓取資料，通常需要 15-30 秒...
          </div>
        )}

        {/* Current Stock List */}
        <div style={{ fontSize: 14, color: "#94a3b8", marginBottom: 8 }}>
          目前持股 ({stocks.length} 檔)
        </div>
        <div style={{
          maxHeight: 360, overflowY: "auto",
          border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10,
        }}>
          {[...stocks].sort((a, b) => a.ticker.localeCompare(b.ticker)).map(s => (
            <div key={s.ticker} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "12px 16px",
              borderBottom: "1px solid rgba(255,255,255,0.04)",
              background: removingTicker === s.ticker ? "rgba(239,68,68,0.08)" : "transparent",
              transition: "background 0.2s",
            }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <span style={{ color: "#94a3b8", fontWeight: 600, width: 54, fontSize: 15 }}>{s.ticker}</span>
                <span style={{ color: "#e2e8f0", fontSize: 15 }}>{s.name}</span>
                <span style={{
                  fontSize: 13, color: "#94a3b8",
                  background: "rgba(255,255,255,0.04)", padding: "3px 10px", borderRadius: 4,
                }}>{s.sector}</span>
                <span style={{ fontSize: 13, color: "#94a3b8" }}>${s.price}</span>
              </div>
              <button
                onClick={() => {
                  if (confirm(`確定要移除 ${s.ticker} (${s.name}) 嗎？\n將從持股清單和資料庫中完全刪除。`)) {
                    removeTicker(s.ticker);
                  }
                }}
                disabled={removingTicker !== null}
                style={{
                  background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)",
                  borderRadius: 6, padding: "6px 12px",
                  color: "#ef4444", cursor: removingTicker !== null ? "not-allowed" : "pointer",
                  fontSize: 14, fontFamily: "inherit",
                }}
              >
                {removingTicker === s.ticker ? "移除中..." : "🗑️"}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
