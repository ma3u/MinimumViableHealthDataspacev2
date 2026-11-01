"use client";

import { AlertTriangle } from "lucide-react";
import type { TopoParticipant } from "./types";
import { useT } from "@/lib/i18n/translate";

export function CriticalBanner({
  degraded,
  total,
  participants,
}: {
  degraded: number;
  total: number;
  participants: TopoParticipant[];
}) {
  const t = useT("admin");
  if (degraded === 0) return null;
  const names = participants
    .filter((p) => p.health === "critical" || p.health === "warning")
    .map((p) => p.displayName);

  return (
    <div className="flex items-center gap-3 border border-red-500/40 bg-red-900/15 rounded-xl px-4 py-3 mb-6">
      <AlertTriangle size={18} className="text-(--danger-text) shrink-0" />
      <div className="text-sm">
        <span className="font-semibold text-(--danger-text)">
          {t("{degraded} of {total} participants degraded", {
            degraded,
            total,
          })}
        </span>
        <span className="text-(--text-secondary) ml-2">
          ({names.join(", ")})
        </span>
      </div>
    </div>
  );
}
