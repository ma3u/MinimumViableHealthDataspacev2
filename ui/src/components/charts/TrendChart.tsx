"use client";

/**
 * TrendChart — a tiny zero-dependency SVG line+area sparkline for personal-health
 * trends (normalised to the series min/max so small variations are visible).
 * Optional `markers` overlay vertical event annotations (rendered as HTML so
 * they aren't distorted by the stretched SVG). Pure presentational; synthetic.
 */
export interface TrendMarker {
  /** position along the x-axis, 0 (oldest) … 1 (newest) */
  x: number;
  color: string;
  label: string;
}

export function TrendChart({
  points,
  color,
  height = 64,
  markers = [],
}: {
  points: number[];
  color: string;
  height?: number;
  markers?: TrendMarker[];
}) {
  if (!points || points.length < 2) return null;
  const W = 260;
  const H = 64;
  const pad = 6;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const xy = points.map((v, i) => {
    const x = pad + (i / (points.length - 1)) * (W - 2 * pad);
    const y = pad + (1 - (v - min) / range) * (H - 2 * pad);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const line = xy.join(" ");
  const area = `${pad},${H - pad} ${line} ${W - pad},${H - pad}`;
  const gid = `tg-${color.replace("#", "")}`;
  return (
    <div className="relative w-full" style={{ height }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-hidden="true"
        className="block w-full h-full"
      >
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={area} fill={`url(#${gid})`} />
        <polyline
          points={line}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {markers.map((m, i) => {
        const left = `${Math.max(0, Math.min(1, m.x)) * 100}%`;
        return (
          <div
            key={i}
            className="absolute top-0 bottom-0 pointer-events-none"
            style={{ left }}
            title={m.label}
          >
            <div
              className="absolute top-1.5 bottom-1.5 -translate-x-1/2 border-l border-dashed"
              style={{ borderColor: m.color, opacity: 0.75 }}
            />
            <div
              className="absolute top-0 -translate-x-1/2 w-2 h-2 rounded-full ring-1 ring-white"
              style={{ background: m.color }}
            />
          </div>
        );
      })}
    </div>
  );
}
