"use client";

export function TrendArrow({
  current,
  previous,
  hasPrevData,
}: {
  current: number;
  previous: number;
  hasPrevData: boolean;
}) {
  if (!hasPrevData) return <span className="text-(--text-secondary)">—</span>;
  const delta = current - previous;
  const pct =
    previous > 0 ? Math.round((delta / previous) * 100) : delta > 0 ? 100 : 0;
  if (Math.abs(pct) < 3) return <span title="Stable vs yesterday">→</span>;
  if (delta > 0)
    return (
      <span className="text-(--danger-text)" title={`+${pct}% vs yesterday`}>
        ↑
      </span>
    );
  return (
    <span className="text-(--success-text)" title={`${pct}% vs yesterday`}>
      ↓
    </span>
  );
}
