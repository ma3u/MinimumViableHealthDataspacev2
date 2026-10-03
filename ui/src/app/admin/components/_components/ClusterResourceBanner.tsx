"use client";

import { Activity, Cpu, HardDrive } from "lucide-react";
import { TrendArrow } from "./TrendArrow";
import type { TopologyData } from "./types";

export function ClusterResourceBanner({
  metrics,
}: {
  metrics: NonNullable<TopologyData["clusterMetrics"]>;
}) {
  const fmtMem = (mb: number) =>
    mb > 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`;
  const hasPrev = metrics.prev24h.samples > 0;

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border border-[var(--border)] rounded-xl px-4 py-3 mb-6 bg-[var(--surface)]/40">
      <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
        <Activity
          size={14}
          className="text-teal-800 dark:text-teal-300 shrink-0"
        />
        <span className="font-medium text-[var(--text-primary)]">Cluster</span>
      </div>

      {/* Current */}
      <div className="flex items-center gap-1.5 text-xs">
        <Cpu size={11} className="text-[var(--accent)]" />
        <span className="text-[var(--text-primary)] tabular-nums">
          {metrics.currentCpu.toFixed(1)}%
        </span>
        <span className="text-[var(--text-secondary)]">now</span>
      </div>
      <div className="flex items-center gap-1.5 text-xs">
        <HardDrive size={11} className="text-[var(--accent)]" />
        <span className="text-[var(--text-primary)] tabular-nums">
          {fmtMem(metrics.currentMemMB)}
        </span>
        <span className="text-[var(--text-secondary)]">now</span>
      </div>

      <span className="text-[var(--text-secondary)]">│</span>

      {/* 24h peaks */}
      <div className="flex items-center gap-1 text-xs">
        <TrendArrow
          current={metrics.last24h.peakCpu}
          previous={metrics.prev24h.peakCpu}
          hasPrevData={hasPrev}
        />
        <span className="text-[var(--accent)] tabular-nums font-medium">
          CPU {metrics.last24h.peakCpu.toFixed(1)}%
        </span>
        <span className="text-[var(--text-secondary)]">peak 24h</span>
      </div>
      <div className="flex items-center gap-1 text-xs">
        <TrendArrow
          current={metrics.last24h.peakMemMB}
          previous={metrics.prev24h.peakMemMB}
          hasPrevData={hasPrev}
        />
        <span className="text-[var(--accent)] tabular-nums font-medium">
          MEM {fmtMem(metrics.last24h.peakMemMB)}
        </span>
        <span className="text-[var(--text-secondary)]">peak 24h</span>
      </div>

      {metrics.last24h.samples > 0 && (
        <span
          className="text-[10px] text-[var(--text-secondary)]"
          title="Number of data points collected in the last 24h"
        >
          ({metrics.last24h.samples} samples)
        </span>
      )}
    </div>
  );
}
