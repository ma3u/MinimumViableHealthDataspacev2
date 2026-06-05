"use client";

/**
 * MetricTrendRow — a labelled trend series (value + unit + improving/declining
 * chip + TrendChart). Reused by the personal-research NLQ answers. Pure
 * presentational; synthetic data.
 */
import { TrendingUp, TrendingDown } from "lucide-react";
import { TrendChart } from "@/components/charts/TrendChart";
import type { TrendSeries } from "@/lib/journey-config";

export function MetricTrendRow({ s }: { s: TrendSeries }) {
  const first = s.points[0];
  const last = s.points[s.points.length - 1];
  const rising = last >= first;
  const improving = rising === (s.goodDirection === "up");
  const pct =
    first === 0 ? 0 : Math.round(((last - first) / Math.abs(first)) * 100);
  const Icon = rising ? TrendingUp : TrendingDown;
  const colour = improving ? "#1E8449" : "#CA6F1E";
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-bold text-[var(--text-primary)]">
            {s.label}
          </span>
          <span className="text-base font-black text-[var(--text-primary)]">
            {s.current}
          </span>
          <span className="text-xs text-[var(--text-secondary)]">{s.unit}</span>
        </div>
        <span
          className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full"
          style={{ color: colour, background: `${colour}1a` }}
        >
          <Icon size={12} />
          {pct > 0 ? "+" : ""}
          {pct}% · 3 mo
        </span>
      </div>
      <TrendChart points={s.points} color={s.color} height={48} />
    </div>
  );
}
