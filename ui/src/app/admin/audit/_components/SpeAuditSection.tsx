"use client";

import { useMemo, useState } from "react";
import { Lock } from "lucide-react";
import { PolicyHash } from "@/components/spe/SpeBadges";
import {
  ADR_068_URL,
  SPE_EVENT_LABELS,
  SPE_EVENT_TYPES,
  formatSpeTime,
  speEventLabel,
  type SpeAuditEvent,
  type SpeEventType,
} from "@/lib/spe";

const EVENT_CLASSES: Record<string, string> = {
  "spe.attestation":
    "bg-(--role-holder-bg) text-(--role-holder-text) border border-(--role-holder-border)",
  "spe.key_release":
    "bg-(--role-user-bg) text-(--role-user-text) border border-(--role-user-border)",
  "spe.key_refused":
    "bg-(--role-admin-bg) text-(--role-admin-text) border border-(--role-admin-border)",
  "spe.workspace_loaded":
    "bg-(--role-trust-bg) text-(--role-trust-text) border border-(--role-trust-border)",
  "spe.workspace_destroyed":
    "bg-(--surface-2) text-(--text-secondary) border border-(--border)",
};

function SimulatedMarker({ simulated }: { simulated: boolean | null }) {
  if (simulated === null) {
    return <span className="text-(--text-secondary)">unknown</span>;
  }
  return simulated ? (
    <span className="text-(--warning-text) font-semibold">Simulated</span>
  ) : (
    <span className="text-(--success-text) font-semibold">Hardware</span>
  );
}

/**
 * The "Secure processing" group of the audit trail (#774): attestations, key
 * releases and refusals, workspaces loaded and destroyed, each with the
 * evidence summary the proxy recorded on the ADR-045 chain.
 */
export function SpeAuditSection({ events }: { events: SpeAuditEvent[] }) {
  const [shown, setShown] = useState<Set<SpeEventType>>(
    () => new Set(SPE_EVENT_TYPES),
  );
  const [speId, setSpeId] = useState("");

  const speIds = useMemo(
    () =>
      [
        ...new Set(events.map((e) => e.speId).filter(Boolean) as string[]),
      ].sort(),
    [events],
  );

  const visible = events.filter(
    (e) =>
      (!(SPE_EVENT_TYPES as readonly string[]).includes(e.eventType) ||
        shown.has(e.eventType as SpeEventType)) &&
      (!speId || e.speId === speId),
  );

  const toggle = (t: SpeEventType) =>
    setShown((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });

  return (
    <section className="mb-8" data-testid="spe-audit-section">
      <h2 className="font-semibold text-sm mb-1 flex items-center gap-2">
        <Lock size={14} className="text-(--layer5-text)" aria-hidden="true" />
        Secure processing
        <span className="text-xs font-normal text-(--text-secondary)">
          ({visible.length} of {events.length})
        </span>
      </h2>
      <p className="text-xs text-(--text-secondary) mb-3">
        Attestation and key release for each SPE workspace, appended to the
        audit chain (ADR-045). What each label proves:{" "}
        <a
          href={ADR_068_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-(--accent) hover:underline"
        >
          ADR-068
        </a>
        .
      </p>

      <fieldset
        aria-label="Secure processing event types"
        className="flex flex-wrap items-center gap-2 p-3 mb-4 bg-(--surface) border border-(--border) rounded-lg text-xs"
      >
        <legend className="sr-only">Secure processing event types</legend>
        {SPE_EVENT_TYPES.map((t) => (
          <label
            key={t}
            className="flex items-center gap-1.5 px-2 py-1 rounded-sm border border-(--border) cursor-pointer"
          >
            <input
              type="checkbox"
              checked={shown.has(t)}
              onChange={() => toggle(t)}
              className="w-3.5 h-3.5"
            />
            {SPE_EVENT_LABELS[t]}
          </label>
        ))}
        {speIds.length > 1 && (
          <select
            aria-label="SPE"
            value={speId}
            onChange={(e) => setSpeId(e.target.value)}
            className="bg-(--surface-2) border border-(--border) rounded-sm px-2 py-1 text-(--text-primary)"
          >
            <option value="">All SPEs</option>
            {speIds.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        )}
      </fieldset>

      {visible.length === 0 ? (
        <p className="text-sm text-(--text-secondary)">
          No secure processing events recorded
        </p>
      ) : (
        <div className="overflow-x-auto border border-(--border) rounded-xl">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-(--border) bg-(--surface)/60">
                {[
                  "Recorded",
                  "Event",
                  "SPE",
                  "Permit",
                  "Policy hash",
                  "TEE",
                  "Scope",
                  "Evidence",
                ].map((h) => (
                  <th
                    key={h}
                    className="py-2 px-3 font-medium text-(--text-secondary)"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((e) => (
                <tr
                  key={e.id}
                  className="border-b border-(--border) hover:bg-(--surface-2)/40"
                >
                  <td className="py-2 px-3 whitespace-nowrap text-(--text-secondary)">
                    {formatSpeTime(e.recorded)}
                  </td>
                  <td className="py-2 px-3">
                    <span
                      title={e.eventType}
                      className={`inline-block px-1.5 py-0.5 rounded-sm text-[10px] font-semibold ${
                        EVENT_CLASSES[e.eventType] ??
                        "bg-(--surface-2) text-(--text-secondary)"
                      }`}
                    >
                      {speEventLabel(e.eventType)}
                    </span>
                  </td>
                  <td className="py-2 px-3 font-semibold text-(--text-primary)">
                    {e.speId ?? "unknown"}
                  </td>
                  <td className="py-2 px-3 font-mono text-[11px]">
                    {e.permitId ?? "none"}
                  </td>
                  <td className="py-2 px-3">
                    <PolicyHash hash={e.policyHash} />
                  </td>
                  <td className="py-2 px-3">{e.teeType ?? "unknown"}</td>
                  <td className="py-2 px-3">
                    {e.attestationScope ?? "unknown"}
                  </td>
                  <td className="py-2 px-3">
                    <SimulatedMarker simulated={e.simulated} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
