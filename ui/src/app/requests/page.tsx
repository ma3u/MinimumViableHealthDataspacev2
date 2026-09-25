"use client";

import { fetchApi } from "@/lib/api";
import { PURPOSES, PURPOSE_LABELS, type Purpose } from "@/lib/permits";
import { useDemoPersona } from "@/lib/use-demo-persona";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { BarChart2, ShieldCheck, AlertCircle, Clock } from "lucide-react";

/**
 * Health data requests, Regulation (EU) 2025/327 Art. 69. A data user asks a
 * question and gets, if the access body approves, an anonymised statistic
 * and nothing else. The access body decides here too. Issue #206, M5.
 */

const IS_STATIC = process.env.NEXT_PUBLIC_STATIC_EXPORT === "true";

interface HealthDataRequest {
  requestId: string;
  applicant: string | null;
  applicantName: string | null;
  question: string | null;
  purpose: string | null;
  datasetId: string | null;
  datasetTitle: string | null;
  statisticalContent: string | null;
  safeguards: string | null;
  legalBasis: string | null;
  status: string;
  submittedAt: string | null;
  decidedAt: string | null;
  decidedBy: string | null;
  justification: string | null;
  answer: Record<string, unknown>[] | null;
  answerTemplate: string | null;
  answerError: string | null;
  answeredAt: string | null;
  suppressedCells: number | null;
  decisionDue: string | null;
  daysToDecision: number | null;
  undecided: boolean;
  holder?: string | null;
  decidedUnder?: string | null;
  feeEur?: number | null;
  canDecide?: boolean;
}

const EXAMPLES = [
  "How many patients are there?",
  "Patients by gender",
  "What are the top conditions?",
  "Age distribution of patients",
];

function shortDate(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : "—";
}

function purposeLabel(p: string | null): string {
  if (!p) return "—";
  return (PURPOSE_LABELS as Record<string, string>)[p as Purpose] ?? p;
}

function DecidedUnder({ r }: { r: HealthDataRequest }) {
  if (!r.decidedUnder || !r.decidedAt) return null;
  return (
    <span
      className="text-xs text-[var(--text-secondary)]"
      data-testid="decided-under"
    >
      {r.decidedUnder === "Art. 72"
        ? "decided by the trusted data holder, Art. 72"
        : "decided by the access body, Art. 69(3)"}
      {r.feeEur ? ` · fee ${r.feeEur} EUR (Art. 62)` : ""}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "ANSWERED"
      ? "bg-[var(--badge-active-bg)] text-[var(--badge-active-text)] border-[var(--badge-active-border)]"
      : status === "PENDING"
        ? "bg-[var(--role-hdab-bg)] text-[var(--role-hdab-text)] border-[var(--role-hdab-border)]"
        : status === "APPROVED"
          ? "bg-[var(--role-holder-bg)] text-[var(--role-holder-text)] border-[var(--role-holder-border)]"
          : "bg-[var(--badge-inactive-bg)] text-[var(--badge-inactive-text)] border-[var(--badge-inactive-border)]";
  const label =
    status === "ANSWERED"
      ? "answered"
      : status === "PENDING"
        ? "awaiting decision"
        : status === "APPROVED"
          ? "approved, no statistic"
          : status === "REJECTED"
            ? "refused"
            : status.toLowerCase();
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded border whitespace-nowrap ${cls}`}
    >
      {status === "ANSWERED" ? (
        <ShieldCheck size={12} />
      ) : status === "PENDING" ? (
        <Clock size={12} />
      ) : (
        <AlertCircle size={12} />
      )}
      {label}
    </span>
  );
}

function AnswerTable({ rows }: { rows: Record<string, unknown>[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-xs text-[var(--text-secondary)]">
        The statistic is empty.
      </p>
    );
  }
  const columns = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  return (
    <div className="overflow-x-auto rounded border border-[var(--border)]">
      <table className="text-xs border-collapse" data-testid="answer-table">
        <thead>
          <tr className="bg-[var(--surface)] text-[var(--text-secondary)]">
            {columns.map((c) => (
              <th key={c} className="text-left px-3 py-1.5 font-medium">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-[var(--border)]">
              {columns.map((c) => (
                <td key={c} className="px-3 py-1.5 font-mono tabular-nums">
                  {r[c] === null || r[c] === undefined ? "—" : String(r[c])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function RequestsPage() {
  const { data: session } = useSession();
  const demoPersona = useDemoPersona();
  const roles: readonly string[] = IS_STATIC
    ? demoPersona?.roles ?? []
    : (session as { roles?: string[] } | null)?.roles ?? [];
  const isBody = roles.includes("HDAB_AUTHORITY");
  const [trustedHolder, setTrustedHolder] = useState(false);
  const canSubmit =
    roles.includes("DATA_USER") ||
    roles.includes("EDC_USER_PARTICIPANT") ||
    roles.includes("EDC_ADMIN");

  const [requests, setRequests] = useState<HealthDataRequest[]>([]);
  const [scope, setScope] = useState<string>("own");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [question, setQuestion] = useState("");
  const [purpose, setPurpose] = useState<string>("SCIENTIFIC_RESEARCH");
  const [datasetId, setDatasetId] = useState("dataset:synthea-fhir-r4-mvd");
  const [statisticalContent, setStatisticalContent] = useState("");
  const [safeguards, setSafeguards] = useState(
    "No record leaves the environment; counts below 5 are suppressed.",
  );
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState<string | null>(null);

  const [justifications, setJustifications] = useState<Record<string, string>>(
    {},
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [decideMsg, setDecideMsg] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const r = await fetchApi("/api/compliance/requests");
      const body = await r.json();
      if (!r.ok || body?.error) {
        throw new Error(body?.detail || body?.error || `HTTP ${r.status}`);
      }
      setRequests(body.requests ?? []);
      setScope(body.scope ?? "own");
      setTrustedHolder(body.trustedHolder === true);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async () => {
    setSubmitting(true);
    setSubmitMsg(null);
    try {
      const r = await fetchApi("/api/compliance/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          purpose,
          datasetId,
          statisticalContent,
          safeguards,
        }),
      });
      const body = (await r.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      if (!r.ok) {
        setSubmitMsg(String(body.error ?? `HTTP ${r.status}`));
        return;
      }
      setSubmitMsg(
        body.requestId
          ? `Request ${body.requestId} filed; the access body decides within three months (Art. 69(4)).`
          : "Request filed.",
      );
      setQuestion("");
      setStatisticalContent("");
      await load();
    } catch (e) {
      setSubmitMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const decide = async (
    requestId: string,
    decision: "APPROVED" | "REJECTED",
  ) => {
    setBusy(requestId);
    try {
      const r = await fetchApi("/api/compliance/requests/decide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId,
          decision,
          justification: justifications[requestId] ?? "",
        }),
      });
      const body = (await r.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      if (!r.ok) {
        setDecideMsg((m) => ({
          ...m,
          [requestId]: String(body.error ?? `HTTP ${r.status}`),
        }));
        return;
      }
      setDecideMsg((m) => ({
        ...m,
        [requestId]:
          decision === "REJECTED"
            ? "Refused; the justification is published with the decision."
            : body.answered
              ? `Answered in anonymised statistical format${
                  Number(body.suppressedCells) > 0
                    ? `, ${body.suppressedCells} small count(s) suppressed`
                    : ""
                }.`
              : `Approved, but no statistic could be produced: ${
                  body.answerError ?? "unknown reason"
                }`,
      }));
      await load();
    } catch (e) {
      setDecideMsg((m) => ({
        ...m,
        [requestId]: e instanceof Error ? e.message : String(e),
      }));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="page-header flex items-center gap-2">
            <BarChart2 size={28} />
            Statistical requests
          </h1>
          <p className="text-[var(--text-secondary)] text-lg mt-1">
            Regulation (EU) 2025/327, Art. 69 · answers in anonymised
            statistical format only
          </p>
        </div>

        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 mb-8 text-sm text-[var(--text-secondary)] space-y-2">
          <p>
            A health data request asks the access body for a statistic, not for
            data. If the body approves, the question is run once in the
            applicant&apos;s name and only the anonymised result is kept: no
            records, no identifiers, counts below five suppressed. The applicant
            never sees the data behind it (Art. 69(1)). The body decides within
            three months (Art. 69(4)), and the decision is published on the{" "}
            <Link
              href="/permits"
              className="font-bold text-[var(--accent)] hover:underline"
            >
              public register
            </Link>
            .
          </p>
        </div>

        {trustedHolder && (
          <p
            className="mb-6 text-sm text-[var(--text-secondary)]"
            data-testid="trusted-holder-note"
          >
            You are a trusted data holder (Art. 72): requests for the datasets
            you offer are answered here, under the supervision of the access
            body; the decision is published like any other.
          </p>
        )}

        {canSubmit && (
          <section className="mb-10 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
            <h2 className="text-sm font-semibold mb-3 text-[var(--text-primary)]">
              Ask for a statistic
            </h2>
            <form
              className="space-y-3 text-sm"
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
              aria-label="Health data request"
            >
              <div className="flex flex-wrap gap-2">
                {EXAMPLES.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setQuestion(q)}
                    className="text-xs px-2 py-1 rounded border border-[var(--border)] hover:bg-[var(--surface-2)]"
                  >
                    {q}
                  </button>
                ))}
              </div>
              <label className="flex flex-col gap-1">
                <span className="text-[var(--text-secondary)]">Question</span>
                <textarea
                  id="request-question"
                  rows={2}
                  required
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  className="rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1"
                />
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-[var(--text-secondary)]">
                    Purpose, Art. 53(1)
                  </span>
                  <select
                    id="request-purpose"
                    value={purpose}
                    onChange={(e) => setPurpose(e.target.value)}
                    className="rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1"
                  >
                    {PURPOSES.map((p) => (
                      <option key={p} value={p}>
                        {PURPOSE_LABELS[p]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[var(--text-secondary)]">Dataset</span>
                  <input
                    id="request-dataset"
                    value={datasetId}
                    onChange={(e) => setDatasetId(e.target.value)}
                    className="rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1 font-mono"
                  />
                </label>
              </div>
              <label className="flex flex-col gap-1">
                <span className="text-[var(--text-secondary)]">
                  Statistical content, Art. 69(2)(d)
                </span>
                <input
                  id="request-content"
                  required
                  value={statisticalContent}
                  onChange={(e) => setStatisticalContent(e.target.value)}
                  placeholder="One count of the cohort, no breakdown"
                  className="rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[var(--text-secondary)]">
                  Safeguards, Art. 69(2)(e)
                </span>
                <input
                  id="request-safeguards"
                  value={safeguards}
                  onChange={(e) => setSafeguards(e.target.value)}
                  className="rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1"
                />
              </label>
              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={
                    submitting || !question.trim() || !statisticalContent.trim()
                  }
                  className="px-3 py-1.5 rounded font-semibold bg-[var(--accent)] text-white disabled:opacity-60"
                >
                  {submitting ? "Filing…" : "File the request"}
                </button>
                {submitMsg && (
                  <span
                    className="text-xs text-[var(--text-secondary)]"
                    role="status"
                  >
                    {submitMsg}
                  </span>
                )}
              </div>
            </form>
          </section>
        )}

        <section>
          <h2 className="text-sm font-semibold mb-3 text-[var(--text-primary)]">
            {scope === "all"
              ? "All requests"
              : scope === "holder"
                ? "Requests on my datasets, as a trusted holder (Art. 72)"
                : "My requests"}{" "}
            ({requests.length})
          </h2>
          {loading ? (
            <p className="text-[var(--text-secondary)] text-sm">
              Reading requests…
            </p>
          ) : error ? (
            <div className="text-sm">
              <p className="text-[var(--text-secondary)]">
                Requests could not be read
              </p>
              <p className="text-xs font-mono text-[var(--text-secondary)]">
                {error}
              </p>
            </div>
          ) : requests.length === 0 ? (
            <p className="text-[var(--text-secondary)] text-sm">
              No request yet
            </p>
          ) : (
            <div className="space-y-3">
              {requests.map((r) => (
                <article
                  key={r.requestId}
                  className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-sm"
                  data-testid="request-card"
                  data-request-id={r.requestId}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                    <div>
                      <div className="font-semibold text-[var(--text-primary)]">
                        {r.question ?? "—"}
                      </div>
                      <div className="text-xs text-[var(--text-secondary)]">
                        {r.applicantName ?? r.applicant ?? "—"} ·{" "}
                        {purposeLabel(r.purpose)} ·{" "}
                        {r.datasetTitle ?? r.datasetId ?? "any dataset"} · filed{" "}
                        {shortDate(r.submittedAt)}
                        {r.undecided && r.decisionDue
                          ? ` · decision due ${shortDate(r.decisionDue)}${
                              typeof r.daysToDecision === "number"
                                ? r.daysToDecision < 0
                                  ? ` (${-r.daysToDecision} days overdue)`
                                  : ` (${r.daysToDecision} days left)`
                                : ""
                            }`
                          : ""}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <StatusBadge status={r.status} />
                      <DecidedUnder r={r} />
                    </div>
                  </div>
                  <div className="text-xs text-[var(--text-secondary)] grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 mb-2">
                    <div>
                      <span className="font-medium">Statistical content </span>
                      {r.statisticalContent ?? "—"}
                    </div>
                    <div>
                      <span className="font-medium">Safeguards </span>
                      {r.safeguards ?? "—"}
                    </div>
                    <div className="md:col-span-2">
                      <span className="font-medium">Legal basis </span>
                      {r.legalBasis ?? "—"}
                    </div>
                  </div>

                  {r.status === "ANSWERED" && r.answer && (
                    <div className="space-y-1 mb-2">
                      <div className="text-xs text-[var(--text-secondary)]">
                        Anonymised statistical answer
                        {r.answerTemplate ? ` (${r.answerTemplate})` : ""}
                        {r.answeredAt ? `, ${shortDate(r.answeredAt)}` : ""}
                        {typeof r.suppressedCells === "number" &&
                        r.suppressedCells > 0
                          ? `; ${r.suppressedCells} small count(s) suppressed`
                          : ""}
                      </div>
                      <AnswerTable rows={r.answer} />
                    </div>
                  )}
                  {r.status === "APPROVED" && r.answerError && (
                    <p className="text-xs text-[var(--warning-text)] mb-2">
                      Approved on {shortDate(r.decidedAt)}, but no statistic
                      could be produced: {r.answerError}
                    </p>
                  )}
                  {r.status === "REJECTED" && (
                    <p className="text-xs text-[var(--danger-text)] mb-2">
                      Refused on {shortDate(r.decidedAt)}
                      {r.justification ? `: ${r.justification}` : ""}
                    </p>
                  )}

                  {(isBody || r.canDecide === true) &&
                    r.status === "PENDING" && (
                      <div className="mt-2 rounded border border-[var(--border)] bg-[var(--bg)] p-3 space-y-2 text-xs">
                        <div className="font-semibold text-[var(--text-primary)]">
                          {isBody
                            ? "Decide · Art. 69(3)"
                            : "Decide as the trusted data holder · Art. 72"}
                        </div>
                        <label className="flex flex-col gap-1">
                          <span className="text-[var(--text-secondary)]">
                            Justification (required for a refusal)
                          </span>
                          <textarea
                            id={`justification-${r.requestId}`}
                            rows={2}
                            value={justifications[r.requestId] ?? ""}
                            onChange={(e) =>
                              setJustifications((j) => ({
                                ...j,
                                [r.requestId]: e.target.value,
                              }))
                            }
                            className="rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1"
                          />
                        </label>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={busy === r.requestId}
                            onClick={() => void decide(r.requestId, "APPROVED")}
                            className="px-3 py-1.5 rounded font-semibold bg-[var(--accent)] text-white disabled:opacity-60"
                          >
                            {busy === r.requestId
                              ? "Working…"
                              : "Approve and answer"}
                          </button>
                          <button
                            type="button"
                            disabled={
                              busy === r.requestId ||
                              !(justifications[r.requestId] ?? "").trim()
                            }
                            onClick={() => void decide(r.requestId, "REJECTED")}
                            className="px-3 py-1.5 rounded font-semibold border border-[var(--danger-text)] text-[var(--danger-text)] disabled:opacity-50"
                          >
                            Refuse
                          </button>
                        </div>
                      </div>
                    )}
                  {decideMsg[r.requestId] && (
                    <p
                      className="text-xs text-[var(--text-secondary)] mt-2"
                      role="status"
                    >
                      {decideMsg[r.requestId]}
                    </p>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
