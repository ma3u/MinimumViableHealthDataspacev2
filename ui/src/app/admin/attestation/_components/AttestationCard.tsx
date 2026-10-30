"use client";

import Link from "next/link";
import { ArrowDown, CheckCircle2, CircleSlash, XCircle } from "lucide-react";
import { PolicyHash, SpeLabelBadge } from "@/components/spe/SpeBadges";
import {
  attestationAnchor,
  attestationVerdict,
  formatSpeTime,
  speEventLabel,
  trusteeResource,
  type AttestationVerdict,
  type SpeAuditEvent,
  type SpeEntry,
  type SpeTrustee,
} from "@/lib/spe";

const VERDICT_STYLES: Record<AttestationVerdict, string> = {
  pass: "text-(--success-text) border-(--success)/40 bg-(--success)/10",
  fail: "text-(--danger-text) border-(--danger)/40 bg-(--danger)/10",
  refused: "text-(--danger-text) border-(--danger)/40 bg-(--danger)/10",
  none: "text-(--text-secondary) border-(--border) bg-(--surface-2)",
};

const VERDICT_ICONS = {
  pass: CheckCircle2,
  fail: XCircle,
  refused: XCircle,
  none: CircleSlash,
} as const;

const SCOPE_TEXT: Record<string, string> = {
  node: "Node level: the confidential VM's encrypted memory and measured boot, not which container ran",
  workload:
    "Workload level: the workspace's own evidence, which carries the permit's policy hash",
  none: "Nothing in hardware: the evidence comes from the sample attester",
};

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[10px] uppercase tracking-wide text-(--text-secondary)">
        {label}
      </dt>
      <dd className="text-xs text-(--text-primary) break-words">{children}</dd>
    </div>
  );
}

/** A hex value in full, wrapped, or "not reported". */
function Hex({ value }: { value: string | null | undefined }) {
  if (!value) {
    return <span className="text-(--text-secondary)">not reported</span>;
  }
  return <code className="font-mono text-[11px] break-all">{value}</code>;
}

/**
 * One SPE on /admin/attestation (#774): the verdict, who verified, what was
 * proven, the evidence, the chain from permit to loaded workspace, and the
 * SPE's last audit events.
 */
export function AttestationCard({
  spe,
  trustee,
  residualTrust,
  events,
}: {
  spe: SpeEntry;
  trustee: SpeTrustee | null;
  residualTrust: string[];
  /** This SPE's spe.* events, newest first. */
  events: SpeAuditEvent[];
}) {
  const a = spe.attestation ?? null;
  const claims = a?.claims ?? null;
  const verdict = attestationVerdict(spe);
  const VerdictIcon = VERDICT_ICONS[verdict.verdict];
  const titleId = `${attestationAnchor(spe.id)}-title`;
  const loaded = events.find((e) => e.eventType === "spe.workspace_loaded");
  const pcrs = claims?.pcrs ? Object.entries(claims.pcrs) : [];
  const simulated = spe.simulated !== false;

  const chain: { label: string; value: React.ReactNode }[] = [
    {
      label: "Data permit",
      value: (
        <span className="font-mono">{spe.permitId ?? "no permit loaded"}</span>
      ),
    },
    { label: "Policy hash", value: <PolicyHash hash={spe.policyHash} /> },
    {
      label: "Trustee resource",
      value: <span className="font-mono">{trusteeResource(spe.id)}</span>,
    },
    { label: "Key released", value: formatSpeTime(spe.keyReleasedAt) },
    {
      label: "Workspace loaded",
      value: formatSpeTime(loaded?.recorded ?? null),
    },
  ];

  return (
    <section
      id={attestationAnchor(spe.id)}
      aria-labelledby={titleId}
      className="scroll-mt-24 bg-(--surface) border border-(--border) rounded-xl p-5 space-y-5"
    >
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 id={titleId} className="text-lg font-bold text-(--text-primary)">
            {spe.id} · {spe.holder}
          </h2>
          <p className="text-xs text-(--text-secondary)">{spe.runsOn}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span
            aria-label={`Verdict: ${verdict.text}`}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
              VERDICT_STYLES[verdict.verdict]
            }`}
          >
            <VerdictIcon size={12} aria-hidden="true" />
            {verdict.text}
          </span>
          <span
            className={`text-[11px] font-semibold ${
              simulated ? "text-(--warning-text)" : "text-(--success-text)"
            }`}
          >
            {simulated ? "Simulated" : "Hardware"}
          </span>
          <SpeLabelBadge spe={spe} />
        </div>
      </header>

      {a?.refusalReason && (
        <p
          role="alert"
          className="text-xs text-(--danger-text) bg-(--danger)/10 border border-(--danger)/30 rounded-lg px-3 py-2"
        >
          Refused: {a.refusalReason}
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div>
          <h3 className="text-sm font-semibold text-(--text-primary) mb-2">
            Who verified
          </h3>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
            <Field label="Trustee operator">
              {trustee?.operator ?? "not reported"}
            </Field>
            <Field label="Verifier">
              <span className="font-mono">
                {a?.verifier ?? trustee?.verifier ?? "not reported"}
              </span>
            </Field>
            <Field label="Attestation policy">
              <span className="font-mono">{a?.policyId ?? "not reported"}</span>
            </Field>
            <Field label="Token valid">
              {a?.tokenIssuedAt || a?.tokenExpiresAt
                ? `${formatSpeTime(a?.tokenIssuedAt)} to ${formatSpeTime(
                    a?.tokenExpiresAt,
                  )}`
                : "not reported"}
            </Field>
          </dl>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-(--text-primary) mb-2">
            What was proven
          </h3>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
            <Field label="Scope">
              {spe.attestationScope}
              <span className="block text-[11px] text-(--text-secondary)">
                {SCOPE_TEXT[spe.attestationScope] ?? ""}
              </span>
            </Field>
            <Field label="TEE">{claims?.tee ?? spe.teeType}</Field>
            <Field label="Residual trust">
              {residualTrust.length > 0
                ? residualTrust.join(", ")
                : simulated
                  ? "everything: no hardware proof"
                  : "not reported"}
            </Field>
            <Field label="Last attestation">
              {formatSpeTime(spe.attestedAt)}
            </Field>
          </dl>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-(--text-primary) mb-2">
          Evidence
        </h3>
        {a ? (
          <>
            <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2">
              <Field label="Measurement">
                <Hex value={claims?.measurement} />
              </Field>
              <Field label="Reported TCB">
                {claims?.reportedTcb ?? (
                  <span className="text-(--text-secondary)">not reported</span>
                )}
              </Field>
              <Field label="Host data">
                <Hex value={claims?.hostData} />
              </Field>
              <Field label="Report data">
                <Hex value={claims?.reportData} />
              </Field>
              <Field label="VM id">
                {claims?.vmId ?? (
                  <span className="text-(--text-secondary)">not reported</span>
                )}
              </Field>
              <Field label="Evidence digest">
                <PolicyHash hash={a.evidenceDigest} />
              </Field>
            </dl>
            {pcrs.length > 0 ? (
              <details className="mt-3">
                <summary className="cursor-pointer text-xs font-semibold text-(--accent)">
                  PCRs ({pcrs.length})
                </summary>
                <table
                  aria-label={`${spe.id} PCRs`}
                  className="mt-2 w-full text-left text-[11px]"
                >
                  <thead>
                    <tr className="border-b border-(--border)">
                      <th className="py-1 pr-3 font-medium text-(--text-secondary)">
                        PCR
                      </th>
                      <th className="py-1 font-medium text-(--text-secondary)">
                        Value
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {pcrs.map(([k, v]) => (
                      <tr key={k} className="border-b border-(--border)">
                        <td className="py-1 pr-3 font-mono">{k}</td>
                        <td className="py-1 font-mono break-all">{v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            ) : (
              <p className="mt-3 text-xs text-(--text-secondary)">
                No PCRs reported
                {simulated ? " (the sample attester has no vTPM)" : ""}
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-(--text-secondary)">
            No attestation recorded
          </p>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-(--text-primary) mb-2">
          From permit to workspace
        </h3>
        <ol aria-label={`${spe.id} chain`} className="space-y-1 text-xs">
          {chain.map((step, i) => (
            <li key={step.label}>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="w-32 shrink-0 text-(--text-secondary)">
                  {step.label}
                </span>
                <span className="text-(--text-primary)">{step.value}</span>
              </div>
              {i < chain.length - 1 && (
                <ArrowDown
                  size={11}
                  className="ml-12 my-0.5 text-(--text-secondary)"
                  aria-hidden="true"
                />
              )}
            </li>
          ))}
        </ol>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-(--text-primary) mb-2">
          Last audit events
        </h3>
        {events.length === 0 ? (
          <p className="text-xs text-(--text-secondary)">
            No secure processing events recorded for {spe.id}
          </p>
        ) : (
          <ul
            aria-label={`${spe.id} audit events`}
            className="text-xs space-y-1"
          >
            {events.slice(0, 5).map((e) => (
              <li key={e.id} className="flex gap-3">
                <span className="w-40 shrink-0 text-(--text-secondary)">
                  {formatSpeTime(e.recorded)}
                </span>
                <span className="text-(--text-primary)">
                  {speEventLabel(e.eventType)}
                </span>
                {e.outcome && e.outcome !== "success" && (
                  <span className="text-(--danger-text)">{e.outcome}</span>
                )}
              </li>
            ))}
          </ul>
        )}
        <Link
          href="/admin/audit"
          className="inline-block mt-2 text-xs text-(--accent) hover:underline"
        >
          All events in Audit &amp; Provenance, tab Secure processing
        </Link>
      </div>
    </section>
  );
}
