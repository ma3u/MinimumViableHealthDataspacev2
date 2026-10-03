"use client";

import type { RowSource } from "@/lib/row-provenance";

/**
 * Says where one exchange row came from, when that is not the control plane.
 *
 * Issue #358. The negotiation and transfer lists merge three sources; the
 * detail endpoints ask the control plane alone. A FINALIZED badge on a row
 * nobody can open, in front of a regulator, claims an agreement that was never
 * signed. A control-plane row gets no badge, because that is the ordinary case
 * and a badge on every row says nothing.
 */
export default function RowSourceBadge({
  source,
  reason,
}: {
  source?: RowSource;
  /** The row's own explanation, preferred over the generic one when present. */
  reason?: string;
}) {
  if (source === undefined || source === "controlplane") return null;

  const label = source === "demo" ? "Demo" : "Sample";
  const title =
    reason ||
    (source === "demo"
      ? "Recorded by this demonstrator, not negotiated with a counter-party. It has no record in the control plane, so it cannot be opened."
      : "Bundled sample data, shown so the page is not empty. It has no record in the control plane, so it cannot be opened.");

  return (
    <span
      title={title}
      data-testid={`row-source-${source}`}
      className="text-xs px-2 py-0.5 rounded-full bg-(--surface-2) text-(--text-secondary) border border-(--border)"
    >
      {label}
    </span>
  );
}
