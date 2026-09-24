"use client";

/**
 * The detail panel of a persona overview (issue #271): one node at a time,
 * with its latest value against the expected band, the trend, a chart, the
 * description, the facts, the series table and the links to the page that
 * owns the record. Plain HTML and inline SVG, so it reads without the scene.
 */
import Link from "next/link";
import { X } from "lucide-react";
import { isOutOfRange, trendOf } from "@/lib/overview/derive";
import type { OverviewNode } from "@/lib/overview/types";

const DIR_CLASS: Record<string, string> = {
  bad: "border-red-500 text-red-600 dark:text-red-400",
  warn: "border-amber-500 text-amber-600 dark:text-amber-400",
  ok: "border-emerald-500 text-emerald-600 dark:text-emerald-400",
  info: "border-sky-500 text-sky-600 dark:text-sky-400",
};

export function SeriesChart({ node }: { node: OverviewNode }) {
  const pts = node.series ?? [];
  if (pts.length < 2) return null;
  const W = 340;
  const H = 170;
  const L = 38;
  const R = 14;
  const T = 14;
  const B = 26;
  const xs = pts.map((p) => new Date(p.date).getTime());
  const vs = pts.map((p) => p.value);
  const lo = node.range?.low ?? null;
  const hi = node.range?.high ?? null;
  let ymin = Math.min(...vs, lo ?? Infinity);
  let ymax = Math.max(...vs, hi ?? -Infinity);
  const pad = (ymax - ymin || 1) * 0.15;
  ymin -= pad;
  ymax += pad;
  const x = (t: number) =>
    L + ((t - xs[0]) / (xs[xs.length - 1] - xs[0] || 1)) * (W - L - R);
  const y = (v: number) => T + (1 - (v - ymin) / (ymax - ymin)) * (H - T - B);
  const bandTop = y(hi ?? ymax);
  const bandBot = y(lo ?? ymin);
  const line = pts
    .map(
      (p) =>
        `${x(new Date(p.date).getTime()).toFixed(1)},${y(p.value).toFixed(1)}`,
    )
    .join(" ");
  return (
    <svg
      className="w-full h-[170px] block my-1"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`${node.measure ?? node.label} over time`}
      data-testid="overview-chart"
    >
      <rect
        x={L}
        y={Math.min(bandTop, bandBot).toFixed(1)}
        width={W - L - R}
        height={Math.abs(bandBot - bandTop).toFixed(1)}
        fill="#22c55e"
        opacity="0.12"
      />
      {hi != null && (
        <text
          x={L - 4}
          y={(y(hi) + 4).toFixed(1)}
          textAnchor="end"
          fontSize="10"
          fill="#9ca3af"
        >
          {hi}
        </text>
      )}
      {lo != null && (
        <text
          x={L - 4}
          y={(y(lo) + 4).toFixed(1)}
          textAnchor="end"
          fontSize="10"
          fill="#9ca3af"
        >
          {lo}
        </text>
      )}
      <polyline points={line} fill="none" stroke="#93c5fd" strokeWidth="2" />
      {pts.map((p) => {
        const out = isOutOfRange(p.value, node.range);
        return (
          <circle
            key={p.date}
            cx={x(new Date(p.date).getTime()).toFixed(1)}
            cy={y(p.value).toFixed(1)}
            r="4"
            fill={out ? "#f59e0b" : "#22c55e"}
            stroke="#0b1220"
            strokeWidth="1.5"
          >
            <title>{`${p.date}: ${p.value} ${node.unit ?? ""}`}</title>
          </circle>
        );
      })}
      <text x={L} y={H - 8} fontSize="10" fill="#9ca3af">
        {pts[0].date.slice(0, 7)}
      </text>
      <text x={W - R} y={H - 8} fontSize="10" fill="#9ca3af" textAnchor="end">
        {pts[pts.length - 1].date.slice(0, 7)}
      </text>
    </svg>
  );
}

export interface OverviewDetailProps {
  node: OverviewNode;
  expanded: boolean;
  onClose: () => void;
  onToggleExpand?: () => void;
}

export default function OverviewDetail({
  node,
  expanded,
  onClose,
  onToggleExpand,
}: OverviewDetailProps) {
  const trend =
    node.series && node.series.length > 1
      ? trendOf(node.series, {
          range: node.range,
          higherIsWorse: node.higherIsWorse !== false,
        })
      : null;
  return (
    <aside
      className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4 text-sm overflow-auto lg:max-h-[calc(100vh-120px)]"
      data-testid="overview-detail"
      aria-label={`Details: ${node.title ?? node.label}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs uppercase tracking-wide text-[var(--text-secondary)]">
            {node.kind}
          </div>
          <h3 className="text-base font-semibold">
            {node.title ?? node.label}
          </h3>
          {node.sub && (
            <div className="text-xs text-[var(--text-secondary)]">
              {node.sub}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded hover:bg-[var(--bg)]"
          aria-label="Close details"
        >
          <X size={16} />
        </button>
      </div>

      {node.description && (
        <p className="my-3 leading-relaxed" data-testid="overview-description">
          {node.description}
        </p>
      )}

      {trend && node.series && (
        <div className="my-2">
          <div
            className="flex items-baseline gap-3"
            data-testid="overview-trend"
          >
            <span className="text-2xl font-bold">
              {trend.last} {node.unit ?? ""}
            </span>
            <span
              className={`text-xs px-2 py-0.5 rounded-full border ${
                DIR_CLASS[trend.severity] ?? ""
              }`}
              data-severity={trend.severity}
            >
              {trend.dir}
              {trend.dir === "stable"
                ? ""
                : ` from ${trend.first} over ${trend.months} months`}
            </span>
          </div>
          <SeriesChart node={node} />
          <div className="text-xs text-[var(--text-secondary)]">
            Reference {node.range?.text ?? "n/a"}. Green band: the expected
            range.{" "}
            {node.expand && (
              <button
                type="button"
                className="underline"
                onClick={onToggleExpand}
                data-testid="overview-toggle-expand"
              >
                {expanded
                  ? "Fold the single values back into the node."
                  : "Unfold the single values as nodes."}
              </button>
            )}
          </div>
          <table className="mt-2 w-full text-xs" data-testid="overview-series">
            <thead>
              <tr className="text-left text-[var(--text-secondary)]">
                <th className="pr-3 font-medium">Date</th>
                <th className="font-medium">Value</th>
              </tr>
            </thead>
            <tbody>
              {[...node.series].reverse().map((p) => {
                const out = isOutOfRange(p.value, node.range);
                return (
                  <tr key={p.date} data-testid="overview-series-row">
                    <td className="pr-3">{p.date}</td>
                    <td
                      className={
                        out ? "text-amber-600 dark:text-amber-400" : ""
                      }
                    >
                      {p.value} {node.unit ?? ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {node.facts && node.facts.length > 0 && (
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          {node.facts.map(([k, v], i) => (
            <div key={`${k}-${i}`} className="contents">
              <dt className="text-[var(--text-secondary)]">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      )}

      {node.article && (
        <div className="mt-3 text-xs text-[var(--text-secondary)]">
          {node.article}
        </div>
      )}

      {node.links && node.links.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-3 text-xs">
          {node.links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="underline text-[var(--accent)]"
            >
              {l.text}
            </Link>
          ))}
        </div>
      )}
    </aside>
  );
}
