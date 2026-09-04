export function ProgressBar({ value, max, label, color }: { value: number; max: number; label?: string; color?: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="j-progress flex-1" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} role="progressbar">
        <div style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="j-muted w-12 text-end text-xs tabular-nums">{label ?? `${pct}%`}</span>
    </div>
  );
}
