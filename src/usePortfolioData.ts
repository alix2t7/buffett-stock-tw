/**
 * usePortfolioData.ts — 持股資料載入 / 同步 hook
 *
 * 管理 stocks, loading, error, lastUpdate, syncLog, syncing 六個 state，
 * 以及 loadData() / syncPortfolio() 兩個 async 動作。
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { fetchStockData, apiSync } from "./services/api.ts";
import type { Stock, SyncRequest } from "./types.ts";

export interface PortfolioData {
  stocks: Stock[];
  loading: boolean;
  error: string | null;
  lastUpdate: Date | null;
  syncLog: string | null;
  syncing: boolean;
  loadData: () => Promise<void>;
  syncPortfolio: (opts?: SyncRequest) => Promise<void>;
  setError: (msg: string | null) => void;
  setSyncLog: (msg: string | null) => void;
}

export default function usePortfolioData(): PortfolioData {
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [syncLog, setSyncLog] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const busyRef = useRef(false);

  /** 內部載入（不檢查 busyRef，供 syncPortfolio 內部呼叫） */
  const _doLoad = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchStockData();
      setStocks(data.stocks);
      setLastUpdate(new Date(data.lastUpdate));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  /** 外部載入（有 busyRef 防護） */
  const loadData = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      await _doLoad();
    } finally {
      busyRef.current = false;
    }
  }, [_doLoad]);

  useEffect(() => { loadData(); }, [loadData]);

  const syncPortfolio = useCallback(async (opts: SyncRequest = {}) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setSyncing(true);
    setSyncLog(null);
    setError(null);
    try {
      const data = await apiSync(opts);
      setSyncLog(data.output || data.error || "無輸出訊息");
      if (data.success) {
        await _doLoad();
      } else {
        setError("同步失敗 — 可能是網路問題，請稍後再點「⚙ 同步持股」重試");
      }
    } catch (e) {
      setError((e as Error).message);
      setSyncLog((e as Error).message);
    } finally {
      setSyncing(false);
      busyRef.current = false;
    }
  }, [_doLoad]);

  return { stocks, loading, error, lastUpdate, syncLog, syncing, loadData, syncPortfolio, setError, setSyncLog };
}
