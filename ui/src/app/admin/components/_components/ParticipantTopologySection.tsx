"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { ResourceSummary } from "./ResourceSummary";
import { SeverityDot } from "./SeverityDot";
import { TopoComponentCard } from "./TopoComponentCard";
import { ROLE_COLORS, SEVERITY_STYLES } from "./constants";
import type { PeakEntry, TopoParticipant } from "./types";

export function ParticipantTopologySection({
  participant,
  peaks,
  metricsShared = false,
}: {
  participant: TopoParticipant;
  peaks: Map<string, PeakEntry>;
  metricsShared?: boolean;
}) {
  const [expanded, setExpanded] = useState(
    participant.health === "critical" || participant.health === "warning",
  );
  const sev = SEVERITY_STYLES[participant.health];
  const roleClass =
    ROLE_COLORS[participant.role] ||
    "bg-gray-500/20 text-[var(--text-secondary)]";

  return (
    <div
      className={`border rounded-xl ${sev.border} ${sev.bg} overflow-hidden transition-all`}
    >
      {/* Header bar — click to expand/collapse */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[var(--surface-2)]/40 transition-colors"
      >
        {expanded ? (
          <ChevronDown
            size={14}
            className="text-[var(--text-secondary)] shrink-0"
          />
        ) : (
          <ChevronRight
            size={14}
            className="text-[var(--text-secondary)] shrink-0"
          />
        )}
        <SeverityDot severity={participant.health} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm text-[var(--text-primary)]">
              {participant.displayName}
            </span>
            <span className="text-xs text-[var(--text-secondary)]">
              {participant.organization}
            </span>
          </div>
          <ResourceSummary
            components={participant.components}
            peaks={peaks}
            metricsShared={metricsShared}
          />
        </div>
        <span
          className={`text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0 ${roleClass}`}
        >
          {participant.role}
        </span>
        <span className="text-[10px] text-[var(--text-secondary)] shrink-0">
          {participant.components.length} services
        </span>
      </button>

      {/* Expanded: DID + component grid */}
      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-[var(--border)]/60">
          <div className="flex items-center gap-4 text-[11px] text-[var(--text-secondary)] mb-3">
            <span>
              DID:{" "}
              <span className="font-mono text-[var(--text-secondary)]">
                {participant.did.length > 40
                  ? participant.did.slice(0, 40) + "…"
                  : participant.did}
              </span>
            </span>
            <span>
              State:{" "}
              <span
                className={
                  participant.state === "CREATED"
                    ? "text-[var(--success-text)]"
                    : "text-[var(--warning-text)]"
                }
              >
                {participant.state}
              </span>
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
            {participant.components.map((c) => (
              <TopoComponentCard
                key={c.container}
                comp={c}
                metricsShared={metricsShared}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
