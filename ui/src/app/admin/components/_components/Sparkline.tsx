"use client";

export function Sparkline({
  data,
  max,
  color,
  width = 80,
  height = 24,
}: {
  data: number[];
  max: number;
  color: string;
  width?: number;
  height?: number;
}) {
  if (data.length < 2)
    return (
      <span className="text-[10px] text-[var(--text-secondary)]">
        collecting…
      </span>
    );

  const effectiveMax = max > 0 ? max : 1;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y =
      height - (Math.min(v, effectiveMax) / effectiveMax) * (height - 2) - 1;
    return `${x},${y}`;
  });

  return (
    <svg width={width} height={height} className="inline-block">
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        points={points.join(" ")}
      />
    </svg>
  );
}
