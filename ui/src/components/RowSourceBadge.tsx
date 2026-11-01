"use client";

import type { RowSource } from "@/lib/row-provenance";
import { useT } from "@/lib/i18n/translate";

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
  // Used only by the health data user's exchange pages (negotiate, transfer).
  const t = useT("research");
  if (source === undefined || source === "controlplane") return null;

  const label = source === "demo" ? t("Demo") : t("Sample");
  // The row's own reason comes from the API and stays as it was sent.
  const title =
    reason ||
    (source === "demo"
      ? t(
          "Recorded by this demonstrator, not negotiated with a counter-party. It has no record in the control plane, so it cannot be opened.",
        )
      : t(
          "Bundled sample data, shown so the page is not empty. It has no record in the control plane, so it cannot be opened.",
        ));

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
