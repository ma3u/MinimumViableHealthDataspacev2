"use client";

import { Cpu, HardDrive } from "lucide-react";
import type { PeakEntry, TopoComponent } from "./types";

export function ResourceSummary({
  components,
  label,
  metricsShared = false,
}: {
  components: TopoComponent[];
  peaks?: Map<string, PeakEntry>;
  label?: string;
  // When true the backend has zeroed per-participant CPU/MEM because
  // those containers are shared on this deployment (Azure ACA). Render a
  // "shared — see Layer View" marker instead of a meaningless 0.0%.
  metricsShared?: boolean;
}) {
  const totalCpu = components.reduce((s, c) => s + c.cpu, 0);
  const totalMem = components.reduce((s, c) => s + c.memMB, 0);
  const fmtMem = (mb: number) =>
    mb > 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`;

  if (metricsShared) {
    return (
      <div className="flex items-center gap-2 text-xs text-(--text-secondary) italic">
        {label && <span className="mr-1">{label}</span>}
        <span title="Containers are shared across all participants on this deployment — per-container CPU/MEM is shown in Layer View.">
          shared infrastructure — see Layer View
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-x-4 text-xs text-(--text-secondary)">
      {label && <span className="text-(--text-secondary) mr-1">{label}</span>}
      <span className="flex items-center gap-1 tabular-nums">
        <Cpu size={10} className="text-(--accent)" />
        <span className="text-(--text-primary) font-medium">
          CPU {totalCpu.toFixed(1)}%
        </span>
      </span>
      <span className="flex items-center gap-1 tabular-nums">
        <HardDrive size={10} className="text-(--accent)" />
        <span className="text-(--text-primary) font-medium">
          MEM {fmtMem(totalMem)}
        </span>
      </span>
    </div>
  );
}
