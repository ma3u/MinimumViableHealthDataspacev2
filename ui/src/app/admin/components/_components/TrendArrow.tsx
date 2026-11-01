"use client";

import { useT } from "@/lib/i18n/translate";

export function TrendArrow({
  current,
  previous,
  hasPrevData,
}: {
  current: number;
  previous: number;
  hasPrevData: boolean;
}) {
  const t = useT("admin");
  if (!hasPrevData) return <span className="text-(--text-secondary)">—</span>;
  const delta = current - previous;
  const pct =
    previous > 0 ? Math.round((delta / previous) * 100) : delta > 0 ? 100 : 0;
  if (Math.abs(pct) < 3) return <span title={t("Stable vs yesterday")}>→</span>;
  if (delta > 0)
    return (
      <span
        className="text-(--danger-text)"
        title={t("{pct}% vs yesterday", { pct: `+${pct}` })}
      >
        ↑
      </span>
    );
  return (
    <span
      className="text-(--success-text)"
      title={t("{pct}% vs yesterday", { pct })}
    >
      ↓
    </span>
  );
}
