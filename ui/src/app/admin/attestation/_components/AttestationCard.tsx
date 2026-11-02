"use client";

import Link from "next/link";
import { ArrowDown, CheckCircle2, CircleSlash, XCircle } from "lucide-react";
import { PolicyHash, SpeLabelBadge } from "@/components/spe/SpeBadges";
import { SpePowerControls } from "@/components/spe/SpePowerControls";
import {
  attestationAnchor,
  attestationVerdict,
  formatSpeTime,
  speEventLabel,
  trusteeResource,
  type AttestationVerdict,
  type SpeAuditEvent,
  type SpeEntry,
  type SpeStatusResponse,
  type SpeTrustee,
} from "@/lib/spe";
import { useT } from "@/lib/i18n/translate";
import { useOptOutText } from "@/app/admin/audit/_components/SpeAuditSection";

const VERDICT_STYLES: Record<AttestationVerdict, string> = {
  pass: "text-(--success-text) border-(--success)/40 bg-(--success)/10",
  fail: "text-(--danger-text) border-(--danger)/40 bg-(--danger)/10",
  refused: "text-(--danger-text) border-(--danger)/40 bg-(--danger)/10",
  none: "text-(--text-secondary) border-(--border) bg-(--surface-2)",
};

const SIMULATED_PASS_STYLE =
  "text-(--warning-text) border-(--warning)/40 bg-(--warning)/10";

const VERDICT_ICONS = {
  pass: CheckCircle2,
  fail: XCircle,
  refused: XCircle,
  none: CircleSlash,
} as const;

const SCOPE_TEXT: Record<string, string> = {
  node: "Node level: the confidential VM's encrypted memory and measured boot, not which container ran",
  workload:
    "Workload level: this container group's own evidence, whose HOST_DATA is the hash of its policy, the permit's policy hash",
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
  const t = useT("admin");
  if (!value) {
    return <span className="text-(--text-secondary)">{t("not reported")}</span>;
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
  power,
  onPowerChange,
}: {
  spe: SpeEntry;
  trustee: SpeTrustee | null;
  residualTrust: string[];
  /** This SPE's spe.* events, newest first. */
  events: SpeAuditEvent[];
  /** Whether this caller may start and stop it (ADR-072). */
  power?: SpeStatusResponse["power"];
  /** Called after a Start or Stop: the page polls until it settles. */
  onPowerChange?: () => void;
}) {
  const t = useT("admin");
  const optOutText = useOptOutText();
  const when = (iso: string | null | undefined) =>
    iso ? formatSpeTime(iso) : t("not yet");
  const notReported = t("not reported");
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
      label: t("Data permit"),
      value: (
        <span className="font-mono">
          {spe.permitId ?? t("no permit loaded")}
        </span>
      ),
    },
    { label: t("Policy hash"), value: <PolicyHash hash={spe.policyHash} /> },
    {
      label: t("Trustee resource"),
      value: <span className="font-mono">{trusteeResource(spe.id)}</span>,
    },
    { label: t("Key released"), value: when(spe.keyReleasedAt) },
    {
      label: t("Workspace loaded"),
      value: when(loaded?.recorded ?? null),
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
          {spe.powerState && (
            <div className="mt-2">
              <SpePowerControls
                spe={spe}
                power={power}
                onChange={onPowerChange ?? (() => undefined)}
              />
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span
            aria-label={t("Verdict: {text}", { text: t(verdict.text) })}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
              // A pass on sample evidence proves the flow, not the hardware:
              // amber, like the "Simulated attestation" label.
              verdict.verdict === "pass" && simulated
                ? SIMULATED_PASS_STYLE
                : VERDICT_STYLES[verdict.verdict]
            }`}
          >
            <VerdictIcon size={12} aria-hidden="true" />
            {t(verdict.text)}
          </span>
          <span
            className={`text-[11px] font-semibold ${
              simulated ? "text-(--warning-text)" : "text-(--success-text)"
            }`}
          >
            {simulated ? t("Simulated") : t("Hardware")}
          </span>
          <SpeLabelBadge spe={spe} />
        </div>
      </header>

      {a?.refusalReason && (
        <p
          role="alert"
          className="text-xs text-(--danger-text) bg-(--danger)/10 border border-(--danger)/30 rounded-lg px-3 py-2"
        >
          {t("Refused: {reason}", { reason: a.refusalReason })}
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div>
          <h3 className="text-sm font-semibold text-(--text-primary) mb-2">
            {t("Who verified")}
          </h3>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
            <Field label={t("Trustee operator")}>
              {trustee?.operator ?? notReported}
            </Field>
            <Field label={t("Verifier")}>
              <span className="font-mono">
                {a?.verifier ?? trustee?.verifier ?? notReported}
              </span>
            </Field>
            <Field label={t("Attestation policy")}>
              <span className="font-mono">{a?.policyId ?? notReported}</span>
            </Field>
            <Field label={t("Token valid")}>
              {a?.tokenIssuedAt || a?.tokenExpiresAt
                ? t("{from} to {to}", {
                    from: when(a?.tokenIssuedAt),
                    to: when(a?.tokenExpiresAt),
                  })
                : notReported}
            </Field>
          </dl>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-(--text-primary) mb-2">
            {t("What was proven")}
          </h3>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
            <Field label={t("Scope")}>
              {spe.attestationScope}
              <span className="block text-[11px] text-(--text-secondary)">
                {SCOPE_TEXT[spe.attestationScope]
                  ? t(SCOPE_TEXT[spe.attestationScope])
                  : ""}
              </span>
            </Field>
            <Field label={t("TEE")}>{claims?.tee ?? spe.teeType}</Field>
            <Field label={t("Residual trust")}>
              {residualTrust.length > 0
                ? residualTrust.join(", ")
                : simulated
                  ? t("everything: no hardware proof")
                  : notReported}
            </Field>
            <Field label={t("Last attestation")}>{when(spe.attestedAt)}</Field>
          </dl>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-(--text-primary) mb-2">
          {t("Evidence")}
        </h3>
        {a ? (
          <>
            <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2">
              <Field label={t("Measurement")}>
                <Hex value={claims?.measurement} />
              </Field>
              <Field label={t("Reported TCB")}>
                {claims?.reportedTcb ?? (
                  <span className="text-(--text-secondary)">{notReported}</span>
                )}
              </Field>
              <Field label={t("Host data")}>
                <Hex value={claims?.hostData} />
              </Field>
              <Field label={t("Report data")}>
                <Hex value={claims?.reportData} />
              </Field>
              <Field label={t("VM id")}>
                {claims?.vmId ?? (
                  <span className="text-(--text-secondary)">{notReported}</span>
                )}
              </Field>
              <Field label={t("Evidence digest")}>
                <PolicyHash hash={a.evidenceDigest} />
              </Field>
            </dl>
            {pcrs.length > 0 ? (
              <details className="mt-3">
                <summary className="cursor-pointer text-xs font-semibold text-(--accent)">
                  {t("PCRs ({n})", { n: pcrs.length })}
                </summary>
                <table
                  aria-label={t("{id} PCRs", { id: spe.id })}
                  className="mt-2 w-full text-left text-[11px]"
                >
                  <thead>
                    <tr className="border-b border-(--border)">
                      <th className="py-1 pr-3 font-medium text-(--text-secondary)">
                        PCR
                      </th>
                      <th className="py-1 font-medium text-(--text-secondary)">
                        {t("Value")}
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
                {simulated
                  ? t("No PCRs reported (the sample attester has no vTPM)")
                  : t("No PCRs reported")}
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-(--text-secondary)">
            {t("No attestation recorded")}
          </p>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-(--text-primary) mb-2">
          {t("From permit to workspace")}
        </h3>
        <ol
          aria-label={t("{id} chain", { id: spe.id })}
          className="space-y-1 text-xs"
        >
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
          {t("Last audit events")}
        </h3>
        {events.length === 0 ? (
          <p className="text-xs text-(--text-secondary)">
            {t("No secure processing events recorded for {id}", {
              id: spe.id,
            })}
          </p>
        ) : (
          <ul
            aria-label={t("{id} audit events", { id: spe.id })}
            className="text-xs space-y-1"
          >
            {events.slice(0, 5).map((e) => (
              <li key={e.id} className="flex gap-3">
                <span className="w-40 shrink-0 text-(--text-secondary)">
                  {when(e.recorded)}
                </span>
                <span className="text-(--text-primary)">
                  {t(speEventLabel(e.eventType))}
                  {e.optOut && (
                    <span className="text-(--text-secondary)">
                      {" "}
                      · {optOutText(e.optOut)}
                    </span>
                  )}
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
          {t("All events in Audit & Provenance, tab Secure processing")}
        </Link>
      </div>
    </section>
  );
}
