"use client";

import { ComponentActions } from "@/components/ComponentActions";
import { Cpu, HardDrive } from "lucide-react";
import { InfoPopover } from "./InfoPopover";
import { SeverityDot } from "./SeverityDot";
import { KNOWN_BROKEN_ACA_APPS, SEVERITY_STYLES } from "./constants";
import type { TopoComponent } from "./types";

export function TopoComponentCard({
  comp,
  metricsShared = false,
}: {
  comp: TopoComponent;
  // When true the same underlying ACA app serves every participant. The
  // CPU/MEM numbers are real (the container's actual draw) but identical
  // across rows; we render a small "shared" suffix so users understand
  // why eight rows show the same value.
  metricsShared?: boolean;
}) {
  const sev = SEVERITY_STYLES[comp.severity];
  const sharedTitle = metricsShared
    ? "Shared ACA container — same value applies to every participant. See Layer View for the cluster total."
    : undefined;
  const isBroken =
    KNOWN_BROKEN_ACA_APPS.has(comp.container) ||
    comp.severity === "critical" ||
    comp.severity === "warning";
  return (
    <div
      className={`border rounded-lg p-3 ${sev.border} ${sev.bg} transition-colors`}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-primary)]">
          <SeverityDot severity={comp.severity} />
          {comp.name}
          <InfoPopover name={comp.name} />
        </span>
        <span className="text-[10px] text-[var(--text-secondary)] capitalize">
          {comp.status}
          {metricsShared && (
            <span
              className="ml-1 italic text-[9px] text-[var(--text-secondary)]"
              title={sharedTitle}
            >
              · shared
            </span>
          )}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-1 text-[10px] text-[var(--text-secondary)]">
        <span title={sharedTitle}>
          <Cpu size={9} className="inline mr-0.5" />
          {`${comp.cpu.toFixed(1)}%`}
        </span>
        <span title={sharedTitle}>
          <HardDrive size={9} className="inline mr-0.5" />
          {`${comp.memMB < 1 ? "<1" : Math.round(comp.memMB)} MB`}
        </span>
        <span className="text-right" title={sharedTitle}>
          {comp.uptime}
        </span>
      </div>
      <ComponentActions name={comp.container} isBroken={isBroken} />
    </div>
  );
}
