"use client";

import { fetchApi } from "@/lib/api";
import { PURPOSE_LABELS, type Purpose } from "@/lib/permits";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ScrollText, ShieldCheck, AlertCircle } from "lucide-react";

/**
 * The public register of the health data access body. No sign-in: Regulation
 * (EU) 2025/327 requires it to be public (Art. 57(1)(j)(ii) to (iv), Art.
 * 58(1)(f)). The access body works on /compliance; this page is what the
 * public and the natural persons concerned get to see. Issue #206, M2.
 */

interface Entry {
  applicationId: string;
  applicant: string | null;
  applicantDid: string | null;
  applicantCountry: string | null;
  accessBody: string | null;
  purpose: string | null;
  datasetId: string | null;
  datasetTitle: string | null;
  submittedAt: string | null;
  outcome: "permit issued" | "refused" | "permit revoked" | "pending";
  permitId: string | null;
  decidedAt: string | null;
  validUntil: string | null;
  conditions: string[];
  justification: string | null;
  publishBy: string | null;
  revokedAt: string | null;
  revocationReason: string | null;
  decisionDue: string | null;
  daysToDecision: number | null;
}

interface Register {
  generatedAt: string;
  entries: Entry[];
}

function shortDate(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : "—";
}

function purposeLabel(p: string | null): string {
  if (!p) return "—";
  return (PURPOSE_LABELS as Record<string, string>)[p as Purpose] ?? p;
}

function OutcomeBadge({ outcome }: { outcome: Entry["outcome"] }) {
  const cls =
    outcome === "permit issued"
      ? "bg-[var(--badge-active-bg)] text-[var(--badge-active-text)] border-[var(--badge-active-border)]"
      : outcome === "pending"
        ? "bg-[var(--role-hdab-bg)] text-[var(--role-hdab-text)] border-[var(--role-hdab-border)]"
        : "bg-[var(--badge-inactive-bg)] text-[var(--badge-inactive-text)] border-[var(--badge-inactive-border)]";
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded border whitespace-nowrap ${cls}`}
    >
      {outcome === "permit issued" ? (
        <ShieldCheck size={12} />
      ) : (
        <AlertCircle size={12} />
      )}
      {outcome}
    </span>
  );
}

export default function PermitsRegisterPage() {
  const [register, setRegister] = useState<Register | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchApi("/api/permits")
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok || body?.error) {
          throw new Error(body?.detail || body?.error || `HTTP ${r.status}`);
        }
        return body as Register;
      })
      .then((d) => {
        setRegister(d);
        setError(null);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => setLoading(false));
  }, []);

  const entries = register?.entries ?? [];
  const decided = entries.filter((e) => e.outcome !== "pending");
  const pending = entries.filter((e) => e.outcome === "pending");

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="page-header flex items-center gap-2">
            <ScrollText size={28} />
            Data permits register
          </h1>
          <p className="text-[var(--text-secondary)] text-lg mt-1">
            Regulation (EU) 2025/327, Art. 57(1)(j) and Art. 58(1)(f) · public,
            no sign-in
          </p>
        </div>

        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 mb-8 text-sm text-[var(--text-secondary)] space-y-2">
          <p>
            The health data access body publishes every health data access
            application it receives (Art. 57(1)(j)(ii)), every data permit
            issued and every refusal with its justification within 30 working
            days of the decision (Art. 57(1)(j)(iii)), and the measures it takes
            against non-compliance, such as a revoked permit (Art. 57(1)(j)(iv),
            Art. 63(3)). Natural persons can see here who has been granted
            access to which datasets and for what purpose (Art. 58(1)(f)).
          </p>
          <p>
            Participants are fictional. The access body decides on{" "}
            <Link
              href="/compliance"
              className="font-bold text-[var(--accent)] hover:underline"
            >
              EHDS Approval
            </Link>
            ; this register is the public face of those decisions.
          </p>
        </div>

        {loading ? (
          <p className="text-[var(--text-secondary)] text-sm">
            Reading the register…
          </p>
        ) : error ? (
          <div className="text-sm">
            <p className="text-[var(--text-secondary)]">
              The register could not be read
            </p>
            <p className="text-xs font-mono text-[var(--text-secondary)]">
              {error}
            </p>
          </div>
        ) : (
          <>
            <section className="mb-10">
              <h2 className="text-sm font-semibold mb-3 text-[var(--text-primary)]">
                Decisions ({decided.length})
              </h2>
              {decided.length === 0 ? (
                <p className="text-[var(--text-secondary)] text-sm">
                  No decision published yet
                </p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
                  <table className="text-xs w-full border-collapse">
                    <thead>
                      <tr className="bg-[var(--surface)] text-[var(--text-secondary)]">
                        <th className="text-left px-3 py-2 font-medium">
                          Applicant
                        </th>
                        <th className="text-left px-3 py-2 font-medium">
                          Dataset
                        </th>
                        <th className="text-left px-3 py-2 font-medium">
                          Purpose, Art. 53(1)
                        </th>
                        <th className="text-left px-3 py-2 font-medium">
                          Decision
                        </th>
                        <th className="text-left px-3 py-2 font-medium">
                          Decided
                        </th>
                        <th className="text-left px-3 py-2 font-medium">
                          Valid until
                        </th>
                        <th className="text-left px-3 py-2 font-medium">
                          Publish by
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {decided.map((e) => (
                        <tr
                          key={e.applicationId}
                          className="border-t border-[var(--border)] align-top"
                        >
                          <td className="px-3 py-2 text-[var(--text-primary)]">
                            <div className="font-medium">
                              {e.applicant ?? e.applicantDid ?? "—"}
                            </div>
                            {e.applicantCountry && (
                              <div className="text-[var(--text-secondary)]">
                                {e.applicantCountry}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <span title={e.datasetId ?? ""}>
                              {e.datasetTitle ?? e.datasetId ?? "—"}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            {purposeLabel(e.purpose)}
                          </td>
                          <td className="px-3 py-2">
                            <OutcomeBadge outcome={e.outcome} />
                            {e.outcome === "permit revoked" && (
                              <div className="mt-1 text-[var(--danger-text)]">
                                revoked {shortDate(e.revokedAt)}
                                {e.revocationReason
                                  ? `: ${e.revocationReason}`
                                  : ""}
                              </div>
                            )}
                            {e.outcome === "refused" && e.justification && (
                              <div className="mt-1 text-[var(--text-secondary)]">
                                {e.justification}
                              </div>
                            )}
                            {e.outcome === "permit issued" &&
                              e.conditions.length > 0 && (
                                <ul className="mt-1 list-disc list-inside text-[var(--text-secondary)]">
                                  {e.conditions.map((c, i) => (
                                    <li key={i}>{c}</li>
                                  ))}
                                </ul>
                              )}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {shortDate(e.decidedAt)}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {e.outcome === "permit issued"
                              ? shortDate(e.validUntil)
                              : "—"}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {shortDate(e.publishBy)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section>
              <h2 className="text-sm font-semibold mb-3 text-[var(--text-primary)]">
                Applications received, awaiting a decision ({pending.length})
              </h2>
              {pending.length === 0 ? (
                <p className="text-[var(--text-secondary)] text-sm">
                  No application awaiting a decision
                </p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
                  <table className="text-xs w-full border-collapse">
                    <thead>
                      <tr className="bg-[var(--surface)] text-[var(--text-secondary)]">
                        <th className="text-left px-3 py-2 font-medium">
                          Applicant
                        </th>
                        <th className="text-left px-3 py-2 font-medium">
                          Dataset
                        </th>
                        <th className="text-left px-3 py-2 font-medium">
                          Purpose, Art. 53(1)
                        </th>
                        <th className="text-left px-3 py-2 font-medium">
                          Received
                        </th>
                        <th className="text-left px-3 py-2 font-medium">
                          Decision due, Art. 68(4)
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {pending.map((e) => (
                        <tr
                          key={e.applicationId}
                          className="border-t border-[var(--border)]"
                        >
                          <td className="px-3 py-2 font-medium text-[var(--text-primary)]">
                            {e.applicant ?? e.applicantDid ?? "—"}
                          </td>
                          <td className="px-3 py-2">
                            {e.datasetTitle ?? e.datasetId ?? "—"}
                          </td>
                          <td className="px-3 py-2">
                            {purposeLabel(e.purpose)}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {shortDate(e.submittedAt)}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {shortDate(e.decisionDue)}
                            {typeof e.daysToDecision === "number" && (
                              <span
                                className={
                                  e.daysToDecision < 0
                                    ? " text-[var(--danger-text)]"
                                    : " text-[var(--text-secondary)]"
                                }
                              >
                                {e.daysToDecision < 0
                                  ? ` · ${-e.daysToDecision} days overdue`
                                  : ` · ${e.daysToDecision} days left`}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {register?.generatedAt && (
              <p className="mt-6 text-xs text-[var(--text-secondary)]">
                Register read on{" "}
                {register.generatedAt.slice(0, 19).replace("T", " ")} UTC.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
