/**
 * MiniBar.tsx — 迷你水平 Sparkline 長條
 */

interface MiniBarProps {
  value: number;
  max: number;
  color: string;
}

export default function MiniBar({ value, max, color }: MiniBarProps) {
  if (!max || !Number.isFinite(max) || max <= 0) return null;
  const pct = Math.min(Math.max((value / max) * 100, 0), 100);
  return (
    <div style={{ width: 60, height: 10, background: "rgba(255,255,255,0.06)", borderRadius: 5, overflow: "hidden" }}>
      <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 5, transition: "width 0.4s ease" }} />
    </div>
  );
}
