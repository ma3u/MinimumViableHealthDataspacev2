"use client";

/**
 * MetricTrendRow — a labelled trend series (value + unit + improving/declining
 * chip + TrendChart). Optional `markers` annotate ePA events on the line, and a
 * multi-year series shows its date range. Pure presentational; synthetic data.
 */
import { TrendingUp, TrendingDown } from "lucide-react";
import { TrendChart, type TrendMarker } from "@/components/charts/TrendChart";
import type { TrendSeries } from "@/lib/journey-config";

export function MetricTrendRow({
  s,
  markers = [],
}: {
  s: TrendSeries;
  markers?: TrendMarker[];
}) {
  const first = s.points[0];
  const last = s.points[s.points.length - 1];
  const rising = last >= first;
  const improving = rising === (s.goodDirection === "up");
  const pct =
    first === 0 ? 0 : Math.round(((last - first) / Math.abs(first)) * 100);
  const Icon = rising ? TrendingUp : TrendingDown;
  const colour = improving ? "#1E8449" : "#CA6F1E";

  // Span label: multi-year series show their year span; otherwise "3 mo".
  const fromYear = s.from?.slice(0, 4);
  const toYear = s.to?.slice(0, 4);
  const years = fromYear && toYear ? Number(toYear) - Number(fromYear) : 0;
  const span = years >= 1 ? `${years}y` : "3 mo";

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
          {pct}% · {span}
        </span>
      </div>
      <TrendChart
        points={s.points}
        color={s.color}
        height={56}
        markers={markers}
      />
      {fromYear && toYear && (
        <div className="flex justify-between text-[10px] text-[var(--text-secondary)] mt-1 tabular-nums">
          <span>{fromYear}</span>
          <span>{toYear}</span>
        </div>
      )}
    </div>
  );
}
