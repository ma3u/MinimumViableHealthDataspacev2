"use client";

import { Cpu, KeyRound, Loader2, ShieldQuestion } from "lucide-react";
import { ADR_068_URL, formatSpeTime, type SpeStatusResponse } from "@/lib/spe";
import { SpeLabelBadge, SpeStatusText } from "./SpeBadges";
import { useSpeStatus } from "./use-spe-status";

const ENVIRONMENT_LABELS: Record<string, string> = {
  azure: "Azure",
  local: "Local stack",
  static: "Static demo",
};

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <dt className="text-[10px] uppercase tracking-wide text-(--text-secondary)">
        {label}
      </dt>
      <dd className="text-xs text-(--text-primary) break-words">{value}</dd>
    </div>
  );
}

/** The SPE list, presentational, so it can be tested with a fixed answer. */
export function SpeStatusView({ data }: { data: SpeStatusResponse }) {
  return (
    <div className="space-y-4">
      {data.fallback && (
        <p
          role="note"
          className="text-xs text-(--warning-text) bg-(--warning)/10 border border-(--warning)/30 rounded-lg px-3 py-2"
        >
          {data.fallback.reason}. Shown from the proxy&apos;s federated
          statistics: no attestation and no key release are known.
        </p>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {data.spes.map((spe) => (
          <section
            key={spe.id}
            aria-label={`${spe.id}, ${spe.holder}`}
            className="surface-card border border-(--border) rounded-xl p-4 space-y-3"
          >
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div>
                <h3 className="font-bold text-(--text-primary)">{spe.id}</h3>
                <p className="text-xs text-(--text-secondary)">{spe.holder}</p>
              </div>
              <SpeLabelBadge spe={spe} />
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
              <Field label="Runs on" value={spe.runsOn} />
              <Field label="TEE" value={spe.teeType} />
              <Field label="Attestation scope" value={spe.attestationScope} />
              <Field
                label="Status"
                value={<SpeStatusText status={spe.status} />}
              />
              <Field
                label="Last attestation"
                value={formatSpeTime(spe.attestedAt)}
              />
              <Field
                label="Last key release"
                value={formatSpeTime(spe.keyReleasedAt)}
              />
              <Field
                label="Patients"
                value={spe.patients === null ? "unknown" : spe.patients}
              />
            </dl>
          </section>
        ))}
      </div>
      <div className="text-xs text-(--text-secondary) space-y-1">
        {data.trustee ? (
          <p data-testid="spe-trustee">
            <KeyRound size={12} className="inline mr-1" aria-hidden="true" />
            Trustee: operated by{" "}
            <span className="text-(--text-primary)">
              {data.trustee.operator}
            </span>
            , verifier{" "}
            <span className="font-mono text-(--text-primary)">
              {data.trustee.verifier}
            </span>
            ,{" "}
            {data.trustee.reachable ? (
              <span className="text-(--success-text)">reachable</span>
            ) : (
              <span className="text-(--danger-text)">not reachable</span>
            )}
          </p>
        ) : (
          <p data-testid="spe-trustee">
            <ShieldQuestion
              size={12}
              className="inline mr-1"
              aria-hidden="true"
            />
            Trustee: not reported by the proxy
          </p>
        )}
        {data.residualTrust.length > 0 && (
          <p data-testid="spe-residual-trust">
            <Cpu size={12} className="inline mr-1" aria-hidden="true" />
            Residual trust: {data.residualTrust.join(", ")} (ADR-068 decision 7)
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * "Secure processing environments" on the operator dashboard (#774): per SPE
 * where it runs, what proves it and when the key was last released.
 */
export function SpeStatusCard() {
  const { data, loading, error } = useSpeStatus();
  return (
    <section
      aria-labelledby="spe-card-title"
      className="bg-(--surface) rounded-xl p-6 border border-(--border)"
    >
      <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
        <div>
          <h2
            id="spe-card-title"
            className="text-xl font-bold tracking-tight text-(--text-primary)"
          >
            Secure processing environments
          </h2>
          <p className="text-sm text-(--text-secondary) mt-0.5">
            EHDS Art. 73 · confidential SPEs with a Trustee run by the access
            body (
            <a
              href={ADR_068_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-(--accent) hover:underline"
            >
              ADR-068
            </a>
            )
          </p>
        </div>
        {data && (
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-(--surface-2) text-(--text-secondary)">
            {ENVIRONMENT_LABELS[data.environment] ?? data.environment}
          </span>
        )}
      </div>
      {loading ? (
        <p className="flex items-center gap-2 text-sm text-(--text-secondary)">
          <Loader2 size={14} className="animate-spin" aria-hidden="true" />
          Loading secure processing environments…
        </p>
      ) : data ? (
        <SpeStatusView data={data} />
      ) : (
        <p className="text-sm text-(--text-secondary)">
          Secure processing environments unavailable
          {error ? `: ${error}` : ""}
        </p>
      )}
    </section>
  );
}
