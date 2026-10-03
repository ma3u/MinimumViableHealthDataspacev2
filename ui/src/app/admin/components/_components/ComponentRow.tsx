"use client";

import { InfoPopover } from "./InfoPopover";
import { Sparkline } from "./Sparkline";
import { StatusBadge } from "./StatusBadge";
import type { ComponentInfo, HistoryEntry } from "./types";

export function ComponentRow({
  comp,
  history,
}: {
  comp: ComponentInfo;
  history: HistoryEntry[];
}) {
  const cpuData = history.map((h) => h.cpu);
  const memData = history.map((h) => h.mem);
  const maxCpu = Math.max(...cpuData, 1);

  return (
    <tr className="border-b border-(--border) hover:bg-(--surface-2)/40 transition-colors">
      <td className="py-2.5 px-3 text-sm font-medium text-(--text-primary)">
        <span className="flex items-center gap-1.5">
          {comp.component}
          <InfoPopover name={comp.component} />
        </span>
      </td>
      <td className="py-2.5 px-3">
        <StatusBadge status={comp.status} />
      </td>
      <td className="py-2.5 px-3 text-xs text-(--text-secondary) tabular-nums">
        {comp.uptime}
      </td>
      <td className="py-2.5 px-3">
        <div className="flex items-center gap-2">
          <span className="text-xs tabular-nums text-(--text-primary) w-12 text-right">
            {comp.cpu.toFixed(1)}%
          </span>
          <Sparkline data={cpuData} max={maxCpu} color="#60a5fa" />
        </div>
      </td>
      <td className="py-2.5 px-3">
        <div className="flex items-center gap-2">
          <span className="text-xs tabular-nums text-(--text-primary) w-16 text-right">
            {comp.mem.usedMB < 1 ? "<1" : Math.round(comp.mem.usedMB)} MB
          </span>
          <Sparkline
            data={memData}
            max={comp.mem.limitMB || 100}
            color="#a78bfa"
          />
        </div>
      </td>
      <td className="py-2.5 px-3 text-xs text-(--text-secondary) tabular-nums">
        {comp.mem.percent.toFixed(1)}%
      </td>
    </tr>
  );
}
