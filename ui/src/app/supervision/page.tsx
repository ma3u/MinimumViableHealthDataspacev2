"use client";

import { fetchApi } from "@/lib/api";
import {
  MEASURES,
  MEASURE_LABELS,
  type Finding,
  type InformationRequest,
  type Measure,
} from "@/lib/supervision";
import { useDemoPersona } from "@/lib/use-demo-persona";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Gavel, AlertCircle, ShieldCheck, Clock } from "lucide-react";

/**
 * Supervision, Regulation (EU) 2025/327 Art. 63: the access body records a
 * finding of non-compliance against a data user or holder, the party states
 * its views within four weeks (63(2)), the body takes a measure (63(3)) and
 * publishes it (57(1)(j)(iv)); and the body asks a party for information
 * (63(1)), which is answered on record. The access body works here; a data
 * user or holder sees what concerns it and answers. Issue #206, M4.
 */

const IS_STATIC = process.env.NEXT_PUBLIC_STATIC_EXPORT === "true";

interface Party {
  id: string;
  name: string;
  type: string | null;
}

interface Permit {
  permitId: string | null;
  applicant: string | null;
  applicantDid: string | null;
  outcome: string;
  datasetTitle: string | null;
  datasetId: string | null;
}

function shortDate(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : "—";
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "CLOSED" || status === "ANSWERED"
      ? "bg-[var(--badge-inactive-bg)] text-[var(--badge-inactive-text)] border-[var(--badge-inactive-border)]"
      : status === "VIEWS_RECEIVED"
        ? "bg-[var(--badge-active-bg)] text-[var(--badge-active-text)] border-[var(--badge-active-border)]"
        : "bg-[var(--role-hdab-bg)] text-[var(--role-hdab-text)] border-[var(--role-hdab-border)]";
  const words: Record<string, string> = {
    OPEN: "open, views awaited",
    VIEWS_RECEIVED: "views received",
    CLOSED: "closed",
    ANSWERED: "answered",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded border whitespace-nowrap ${cls}`}
      data-testid="supervision-status"
    >
      {status === "OPEN" ? <Clock size={12} /> : <ShieldCheck size={12} />}
      {words[status] ?? status.toLowerCase()}
    </span>
  );
}

const inputCls =
  "rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 w-full";

async function postJson(path: string, body: unknown) {
  const r = await fetchApi(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok) throw new Error(String(data.error ?? `HTTP ${r.status}`));
  return data;
}

function FindingCard({
  f,
  isBody,
  onChanged,
}: {
  f: Finding;
  isBody: boolean;
  onChanged: () => Promise<void>;
}) {
  const [views, setViews] = useState("");
  const [measure, setMeasure] = useState<Measure>("WARNING");
  const [note, setNote] = useState("");
  const [exclusionMonths, setExclusionMonths] = useState(12);
  const [fineEur, setFineEur] = useState(10000);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const run = async (fn: () => Promise<string>) => {
    setBusy(true);
    setMsg(null);
    try {
      setMsg(await fn());
      await onChanged();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <article
      className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-sm"
      data-testid="finding-card"
      data-finding-id={f.findingId}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="font-semibold text-[var(--text-primary)]">
            {f.partyName ?? f.party}
            {f.permitId ? (
              <span className="font-normal text-[var(--text-secondary)]">
                {" "}
                · {f.permitId}
              </span>
            ) : null}
          </div>
          <div className="text-xs text-[var(--text-secondary)] font-mono">
            {f.findingId}
          </div>
        </div>
        <StatusBadge status={f.status} />
      </div>
      <p className="mt-2">{f.description}</p>
      <dl className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 text-xs">
        <div>
          <dt className="inline text-[var(--text-secondary)]">Notified </dt>
          <dd className="inline">{shortDate(f.notifiedAt)}</dd>
        </div>
        <div data-testid="finding-respond-by">
          <dt className="inline text-[var(--text-secondary)]">
            Views by (Art. 63(2)){" "}
          </dt>
          <dd className="inline">
            {shortDate(f.respondBy)}
            {typeof f.daysToRespond === "number"
              ? ` (${f.daysToRespond} days)`
              : ""}
          </dd>
        </div>
        {f.gdprBreach && (
          <div className="md:col-span-2 text-[var(--danger-text)]">
            Suspected GDPR breach; the supervisory authority has been informed
            (Art. 63).
          </div>
        )}
        {f.views && (
          <div className="md:col-span-2">
            <dt className="inline text-[var(--text-secondary)]">
              Views of the party ({shortDate(f.respondedAt)}){" "}
            </dt>
            <dd className="inline">{f.views}</dd>
          </div>
        )}
        {f.status === "CLOSED" && (
          <div className="md:col-span-2" data-testid="finding-measure">
            <dt className="inline text-[var(--text-secondary)]">
              Measure ({shortDate(f.closedAt)}){" "}
            </dt>
            <dd className="inline">
              {MEASURE_LABELS[(f.measure ?? "NONE") as Measure] ?? f.measure}
              {f.measure === "EXCLUSION" && f.exclusionMonths
                ? `, ${f.exclusionMonths} months`
                : ""}
              {f.measure === "FINE" && f.fineEur
                ? `, ${f.fineEur.toLocaleString("en-GB")} EUR`
                : ""}
              {f.measureNote ? ` · ${f.measureNote}` : ""}
            </dd>
          </div>
        )}
      </dl>

      {!isBody && f.status === "OPEN" && !IS_STATIC && (
        <form
          className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3 space-y-2 text-xs"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await postJson("/api/compliance/findings/respond", {
                findingId: f.findingId,
                views,
              });
              return "Your views are on record (Art. 63(2)).";
            });
          }}
          aria-label="State your views"
        >
          <label className="flex flex-col gap-1">
            <span className="text-[var(--text-secondary)]">
              State your views within four weeks
            </span>
            <textarea
              id={`views-${f.findingId}`}
              rows={2}
              value={views}
              onChange={(e) => setViews(e.target.value)}
              className={inputCls}
            />
          </label>
          <button
            type="submit"
            disabled={busy || !views.trim()}
            className="px-3 py-1.5 rounded font-semibold bg-[var(--accent)] text-white disabled:opacity-60"
          >
            {busy ? "Sending…" : "Send views"}
          </button>
        </form>
      )}

      {isBody && f.status !== "CLOSED" && !IS_STATIC && (
        <form
          className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3 space-y-2 text-xs"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              const r = await postJson("/api/compliance/findings/close", {
                findingId: f.findingId,
                measure,
                note,
                exclusionMonths,
                fineEur,
              });
              return r.permitRevoked
                ? `Closed; data permit ${r.permitId} revoked (Art. 63(3)); published under Art. 57(1)(j)(iv).`
                : measure === "NONE"
                  ? "Closed without a measure."
                  : "Closed; the measure is published under Art. 57(1)(j)(iv).";
            });
          }}
          aria-label="Close the finding"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[var(--text-secondary)]">
                Measure, Art. 63(3)
              </span>
              <select
                id={`measure-${f.findingId}`}
                value={measure}
                onChange={(e) => setMeasure(e.target.value as Measure)}
                className={inputCls}
              >
                {MEASURES.map((m) => (
                  <option key={m} value={m}>
                    {MEASURE_LABELS[m]}
                  </option>
                ))}
              </select>
            </label>
            {measure === "EXCLUSION" && (
              <label className="flex flex-col gap-1">
                <span className="text-[var(--text-secondary)]">
                  Exclusion, months (up to 60)
                </span>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={exclusionMonths}
                  onChange={(e) => setExclusionMonths(Number(e.target.value))}
                  className={inputCls}
                />
              </label>
            )}
            {measure === "FINE" && (
              <label className="flex flex-col gap-1">
                <span className="text-[var(--text-secondary)]">Fine, EUR</span>
                <input
                  type="number"
                  min={0}
                  value={fineEur}
                  onChange={(e) => setFineEur(Number(e.target.value))}
                  className={inputCls}
                />
              </label>
            )}
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-[var(--text-secondary)]">
              Reason (published with the measure, Art. 57(1)(j)(iv))
            </span>
            <textarea
              id={`measure-note-${f.findingId}`}
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className={inputCls}
            />
          </label>
          <button
            type="submit"
            disabled={busy || (measure !== "NONE" && !note.trim())}
            className="px-3 py-1.5 rounded font-semibold border border-[var(--danger-text)] text-[var(--danger-text)] disabled:opacity-50"
          >
            {busy ? "Closing…" : "Close with this measure"}
          </button>
        </form>
      )}
      {msg && (
        <p className="mt-2 text-xs text-[var(--text-primary)]" role="status">
          {msg}
        </p>
      )}
    </article>
  );
}

function InformationRequestCard({
  r,
  isBody,
  onChanged,
}: {
  r: InformationRequest;
  isBody: boolean;
  onChanged: () => Promise<void>;
}) {
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <article
      className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-sm"
      data-testid="information-request-card"
      data-request-id={r.requestId}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="font-semibold text-[var(--text-primary)]">
            {r.partyName ?? r.party}
            {r.permitId ? (
              <span className="font-normal text-[var(--text-secondary)]">
                {" "}
                · {r.permitId}
              </span>
            ) : null}
          </div>
          <div className="text-xs text-[var(--text-secondary)] font-mono">
            {r.requestId}
          </div>
        </div>
        <StatusBadge status={r.status} />
      </div>
      <p className="mt-2">{r.question}</p>
      <p className="mt-1 text-xs text-[var(--text-secondary)]">
        Asked {shortDate(r.requestedAt)} · answer by {shortDate(r.answerBy)}
        {typeof r.daysToAnswer === "number" ? ` (${r.daysToAnswer} days)` : ""}
      </p>
      {r.answer && (
        <p className="mt-2 text-xs" data-testid="information-answer">
          <span className="text-[var(--text-secondary)]">
            Answer ({shortDate(r.answeredAt)}):{" "}
          </span>
          {r.answer}
        </p>
      )}
      {!isBody && r.status === "OPEN" && !IS_STATIC && (
        <form
          className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3 space-y-2 text-xs"
          onSubmit={(e) => {
            e.preventDefault();
            setBusy(true);
            setMsg(null);
            postJson("/api/compliance/information-requests/answer", {
              requestId: r.requestId,
              answer,
            })
              .then(async () => {
                setMsg("Answer on record.");
                await onChanged();
              })
              .catch((err: unknown) =>
                setMsg(err instanceof Error ? err.message : String(err)),
              )
              .finally(() => setBusy(false));
          }}
          aria-label="Answer the request"
        >
          <label className="flex flex-col gap-1">
            <span className="text-[var(--text-secondary)]">Your answer</span>
            <textarea
              id={`answer-${r.requestId}`}
              rows={2}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              className={inputCls}
            />
          </label>
          <button
            type="submit"
            disabled={busy || !answer.trim()}
            className="px-3 py-1.5 rounded font-semibold bg-[var(--accent)] text-white disabled:opacity-60"
          >
            {busy ? "Sending…" : "Send answer"}
          </button>
          {msg && (
            <p className="text-[var(--text-primary)]" role="status">
              {msg}
            </p>
          )}
        </form>
      )}
    </article>
  );
}

export default function SupervisionPage() {
  const { data: session } = useSession();
  const demoPersona = useDemoPersona();
  const roles: readonly string[] = IS_STATIC
    ? demoPersona?.roles ?? []
    : (session as { roles?: string[] } | null)?.roles ?? [];
  const isBody =
    roles.includes("HDAB_AUTHORITY") || roles.includes("EDC_ADMIN");

  const [findings, setFindings] = useState<Finding[]>([]);
  const [requests, setRequests] = useState<InformationRequest[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [permits, setPermits] = useState<Permit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [partyDid, setPartyDid] = useState("did:web:pharmaco.de:research");
  const [permitId, setPermitId] = useState("");
  const [description, setDescription] = useState(
    "Output left the secure processing environment with direct identifiers (Art. 61(2)).",
  );
  const [gdprBreach, setGdprBreach] = useState(true);
  const [question, setQuestion] = useState(
    "Which persons accessed the data under the permit in the last quarter, and which outputs left the environment?",
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [f, r] = await Promise.all([
        fetchApi("/api/compliance/findings").then((x) => x.json()),
        fetchApi("/api/compliance/information-requests").then((x) => x.json()),
      ]);
      if (f?.error) throw new Error(f.detail || f.error);
      if (r?.error) throw new Error(r.detail || r.error);
      setFindings(f.findings ?? []);
      setRequests(r.requests ?? []);
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

  useEffect(() => {
    if (!isBody) return;
    fetchApi("/api/compliance")
      .then((x) => x.json())
      .then((d) =>
        setParties(
          ((d.consumers ?? []) as Party[]).filter(
            (p) => p.type !== "HDAB" && !p.id.includes(":hdab"),
          ),
        ),
      )
      .catch(() => {});
    fetchApi("/api/permits")
      .then((x) => x.json())
      .then((d) =>
        setPermits(
          ((d.entries ?? []) as Permit[]).filter(
            (e) => e.permitId && e.outcome === "permit issued",
          ),
        ),
      )
      .catch(() => {});
  }, [isBody]);

  const submit = async (kind: "finding" | "information") => {
    setBusy(kind);
    setMsg(null);
    try {
      if (kind === "finding") {
        const r = await postJson("/api/compliance/findings", {
          partyDid,
          permitId: permitId || undefined,
          description,
          gdprBreach,
        });
        setMsg(
          `Finding ${r.findingId} recorded; ${
            r.partyName ?? partyDid
          } states its views by ${shortDate(String(r.respondBy))} (Art. 63(2))${
            gdprBreach ? "; the supervisory authority is informed" : ""
          }.`,
        );
      } else {
        const r = await postJson("/api/compliance/information-requests", {
          partyDid,
          permitId: permitId || undefined,
          question,
        });
        setMsg(
          `Information request ${r.requestId} sent; answer by ${shortDate(
            String(r.answerBy),
          )}.`,
        );
      }
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="page-header flex items-center gap-2">
            <Gavel size={28} />
            Supervision
          </h1>
          <p className="text-[var(--text-secondary)] text-lg mt-1">
            Regulation (EU) 2025/327, Art. 63 · findings, views within four
            weeks, measures; requests for information
          </p>
        </div>

        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 mb-8 text-sm text-[var(--text-secondary)] space-y-2">
          <p>
            When a data user or holder fails to comply, the access body records
            a finding and the party has four weeks to state its views (Art.
            63(2)). The body may then warn, revoke the permit, exclude the party
            from access for up to five years (Art. 63(3)) or fine it (Art. 64);
            the measure is published on the{" "}
            <Link
              href="/permits"
              className="font-bold text-[var(--accent)] hover:underline"
            >
              public register
            </Link>{" "}
            (Art. 57(1)(j)(iv)). Where a breach of the GDPR is suspected, the
            supervisory authority is informed. The body may also ask a party for
            information; the request and the answer are on record.
          </p>
        </div>

        {isBody && (
          <section className="mb-10 grid grid-cols-1 lg:grid-cols-2 gap-4">
            <form
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 space-y-3 text-xs"
              onSubmit={(e) => {
                e.preventDefault();
                void submit("finding");
              }}
              aria-label="Record a finding"
            >
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                Record a finding of non-compliance
              </h2>
              <label className="flex flex-col gap-1">
                <span className="text-[var(--text-secondary)]">Party</span>
                <select
                  id="finding-party"
                  value={partyDid}
                  onChange={(e) => setPartyDid(e.target.value)}
                  className={inputCls}
                >
                  {parties.length === 0 && (
                    <option value={partyDid}>{partyDid}</option>
                  )}
                  {parties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[var(--text-secondary)]">
                  Permit concerned, if any
                </span>
                <select
                  id="finding-permit"
                  value={permitId}
                  onChange={(e) => setPermitId(e.target.value)}
                  className={inputCls}
                >
                  <option value="">none</option>
                  {permits
                    .filter((p) => !partyDid || p.applicantDid === partyDid)
                    .map((p) => (
                      <option key={p.permitId ?? ""} value={p.permitId ?? ""}>
                        {p.permitId} · {p.datasetTitle ?? p.datasetId}
                      </option>
                    ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[var(--text-secondary)]">
                  What was not complied with
                </span>
                <textarea
                  id="finding-description"
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className={inputCls}
                />
              </label>
              <label className="flex items-start gap-2">
                <input
                  id="finding-gdpr"
                  type="checkbox"
                  checked={gdprBreach}
                  onChange={(e) => setGdprBreach(e.target.checked)}
                />
                <span>
                  A breach of the GDPR is suspected; inform the supervisory
                  authority
                </span>
              </label>
              <button
                type="submit"
                disabled={busy !== null || IS_STATIC || !description.trim()}
                className="px-3 py-1.5 rounded font-semibold bg-[var(--accent)] text-white disabled:opacity-60"
              >
                {busy === "finding" ? "Recording…" : "Record and notify"}
              </button>
            </form>

            <form
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 space-y-3 text-xs"
              onSubmit={(e) => {
                e.preventDefault();
                void submit("information");
              }}
              aria-label="Request information"
            >
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                Request information from a party
              </h2>
              <p className="text-[var(--text-secondary)]">
                Sent to the party selected on the left
                {permitId ? `, about ${permitId}` : ""}.
              </p>
              <label className="flex flex-col gap-1">
                <span className="text-[var(--text-secondary)]">Question</span>
                <textarea
                  id="information-question"
                  rows={3}
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  className={inputCls}
                />
              </label>
              <button
                type="submit"
                disabled={busy !== null || IS_STATIC || !question.trim()}
                className="px-3 py-1.5 rounded font-semibold border border-[var(--border)] disabled:opacity-50"
              >
                {busy === "information" ? "Sending…" : "Send the request"}
              </button>
            </form>
            {msg && (
              <p
                className="lg:col-span-2 text-xs text-[var(--text-primary)]"
                role="status"
              >
                {msg}
              </p>
            )}
          </section>
        )}

        {loading ? (
          <p className="text-[var(--text-secondary)] text-sm">Loading…</p>
        ) : error ? (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-sm flex items-start gap-2">
            <AlertCircle size={16} className="mt-0.5" />
            <span>{error}</span>
          </div>
        ) : (
          <>
            <section className="mb-10">
              <h2 className="text-sm font-semibold mb-3 text-[var(--text-primary)]">
                {isBody ? "Findings" : "Findings against you"} (
                {findings.length})
              </h2>
              {findings.length === 0 ? (
                <p className="text-[var(--text-secondary)] text-sm">
                  No finding
                </p>
              ) : (
                <div className="space-y-3">
                  {findings.map((f) => (
                    <FindingCard
                      key={f.findingId}
                      f={f}
                      isBody={isBody}
                      onChanged={load}
                    />
                  ))}
                </div>
              )}
            </section>
            <section>
              <h2 className="text-sm font-semibold mb-3 text-[var(--text-primary)]">
                {isBody ? "Requests for information" : "Requests asked of you"}{" "}
                ({requests.length})
              </h2>
              {requests.length === 0 ? (
                <p className="text-[var(--text-secondary)] text-sm">
                  No request
                </p>
              ) : (
                <div className="space-y-3">
                  {requests.map((r) => (
                    <InformationRequestCard
                      key={r.requestId}
                      r={r}
                      isBody={isBody}
                      onChanged={load}
                    />
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
