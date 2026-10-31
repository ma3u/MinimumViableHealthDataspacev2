"use client";

import { useEffect, useState } from "react";
import { Fingerprint, Loader2 } from "lucide-react";
import { fetchApi } from "@/lib/api";
import { useSpeStatus } from "@/components/spe/use-spe-status";
import { type SpeAuditEvent } from "@/lib/spe";
import { AttestationCard } from "./_components/AttestationCard";
import { AttestationExplainer } from "./_components/AttestationExplainer";

const ENVIRONMENT_LABELS: Record<string, string> = {
  azure: "Azure",
  local: "Local stack",
  static: "Static demo",
};

/**
 * /admin/attestation (#774): the attestation evidence behind each SPE's
 * label, from /api/admin/spe, with the SPE's last events from the audit
 * chain (/api/admin/audit?type=spe).
 */
export default function AdminAttestationPage() {
  const { data, loading, error } = useSpeStatus();
  const [events, setEvents] = useState<SpeAuditEvent[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchApi("/api/admin/audit?type=spe&limit=50")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { speEvents?: SpeAuditEvent[] } | null) => {
        if (!cancelled && Array.isArray(d?.speEvents)) setEvents(d.speEvents);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-(--bg)">
      <main className="px-8 py-10 max-w-6xl mx-auto space-y-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="page-header flex items-center gap-3">
              <Fingerprint
                size={28}
                className="text-(--layer5-text)"
                aria-hidden="true"
              />
              SPE attestation
            </h1>
            <p className="text-(--text-secondary) text-lg mt-1">
              What proves each secure processing environment · EHDS Art. 73
            </p>
          </div>
          {data && (
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-(--surface-2) text-(--text-secondary) self-start md:self-auto">
              {ENVIRONMENT_LABELS[data.environment] ?? data.environment}
            </span>
          )}
        </div>

        <AttestationExplainer />

        {loading ? (
          <p className="flex items-center gap-2 text-sm text-(--text-secondary)">
            <Loader2 size={14} className="animate-spin" aria-hidden="true" />
            Loading attestation evidence…
          </p>
        ) : !data ? (
          <p className="text-sm text-(--text-secondary)">
            Secure processing environments unavailable
            {error ? `: ${error}` : ""}
          </p>
        ) : (
          <>
            {data.fallback && (
              <p
                role="note"
                className="text-xs text-(--warning-text) bg-(--warning)/10 border border-(--warning)/30 rounded-lg px-3 py-2"
              >
                {data.fallback.reason}. No attestation is known for any SPE.
              </p>
            )}
            {data.spes.length === 0 ? (
              <p className="text-sm text-(--text-secondary)">No SPE reported</p>
            ) : (
              data.spes.map((spe) => (
                <AttestationCard
                  key={spe.id}
                  spe={spe}
                  trustee={data.trustee}
                  residualTrust={data.residualTrust}
                  events={events.filter((e) => e.speId === spe.id)}
                />
              ))
            )}
          </>
        )}
      </main>
    </div>
  );
}
