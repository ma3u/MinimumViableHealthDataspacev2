"use client";

import { fetchApi } from "@/lib/api";
import { useEffect, useState } from "react";
import {
  Gift,
  ShieldCheck,
  Lock,
  CheckCircle2,
  XCircle,
  Send,
  Scale,
} from "lucide-react";
import PageIntro from "@/components/PageIntro";
import { useT } from "@/lib/i18n/translate";
import { useOwnRecord } from "@/lib/patient/use-own-record";
import type {
  BonusProgramme,
  ProgrammeConsent,
  YearEvaluation,
} from "@/lib/patient/bonus-programme";

/** Why the programmes did not load: refused (401, 403) or failed (anything else). */
type LoadError =
  | { kind: "refused" }
  | { kind: "failed"; status: number | null };

/**
 * Bonus programmes from other data spaces (#934, step 3). The catalogue
 * crawler finds them as DCAT-AP offerings; this page lists them. A programme
 * receives a yes or no per year, never the data behind it (ADR-080), and it
 * is neither research nor the Art. 71 opt-out, so it has its own page.
 * Joining, seeing and withdrawing are step 4 (ADR-080, decision 6), and so
 * is the person's instruction to send a year's answer, which goes out only
 * under an open consent. Step 6 (ADR-087): before sending, the member sees
 * their own result for the ended year, worked out inside their record.
 */

/** The member's result for a program year, as far as it has loaded. */
type EvaluationState =
  | { kind: "loading" }
  | { kind: "ready"; evaluation: YearEvaluation }
  | { kind: "failed"; status: number | null };

/**
 * The record an operator (EDC_ADMIN) acts on here, as on the research page:
 * P1, which every seed carries. A patient acts on their own.
 */
const DEMO_PATIENT_ID = "P1";

const day = (iso: string | null) => (iso ? iso.slice(0, 10) : "");

/** The year a rule version names (2025.1 is the rule for 2025). */
const ruleYear = (p: BonusProgramme) =>
  Number((p.ruleVersion ?? "").slice(0, 4)) || new Date().getFullYear();
export default function BonusProgrammesPage() {
  const t = useT("patient");
  const tn = useT("nav");
  const [programmes, setProgrammes] = useState<BonusProgramme[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<LoadError | null>(null);
  const [consents, setConsents] = useState<ProgrammeConsent[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [evaluations, setEvaluations] = useState<
    Record<string, EvaluationState>
  >({});
  const [message, setMessage] = useState<{
    programmeId: string;
    text: string;
    ok: boolean;
  } | null>(null);

  const subject = useOwnRecord();
  const patientId =
    subject.kind === "own"
      ? subject.patientId
      : subject.kind === "operator"
        ? DEMO_PATIENT_ID
        : null;
  const query = patientId ? `?patientId=${encodeURIComponent(patientId)}` : "";

  useEffect(() => {
    if (subject.kind === "pending") return;
    fetchApi(`/api/patient/programmes${query}`)
      .then(async (r) => {
        if (!r.ok) {
          setLoadError(
            r.status === 401 || r.status === 403
              ? { kind: "refused" }
              : { kind: "failed", status: r.status },
          );
          return;
        }
        const d = await r.json();
        setProgrammes(Array.isArray(d.programmes) ? d.programmes : []);
        setConsents(Array.isArray(d.consents) ? d.consents : []);
      })
      .catch(() => setLoadError({ kind: "failed", status: null }))
      .finally(() => setLoading(false));
  }, [subject.kind, query]);

  // The member's own result, for each program they joined (ADR-087). Read
  // again after a join, so a new member sees it before sending anything.
  const joined = programmes
    .filter((p) =>
      consents.some((c) => c.programmeId === p.programmeId && !c.withdrawnAt),
    )
    .map((p) => p.programmeId)
    .join(" ");
  useEffect(() => {
    for (const programmeId of joined.split(" ").filter(Boolean)) {
      const qs = new URLSearchParams({ programmeId });
      if (patientId) qs.set("patientId", patientId);
      setEvaluations((e) => ({ ...e, [programmeId]: { kind: "loading" } }));
      fetchApi(`/api/patient/programmes/evaluation?${qs}`)
        .then(async (r) => {
          const d = r.ok ? await r.json() : null;
          setEvaluations((e) => ({
            ...e,
            [programmeId]: d?.evaluation
              ? { kind: "ready", evaluation: d.evaluation }
              : { kind: "failed", status: r.status },
          }));
        })
        .catch(() =>
          setEvaluations((e) => ({
            ...e,
            [programmeId]: { kind: "failed", status: null },
          })),
        );
    }
  }, [joined, patientId]);

  const openFor = (programmeId: string) =>
    consents.find((c) => c.programmeId === programmeId && !c.withdrawnAt) ??
    null;
  const lastFor = (programmeId: string) =>
    consents.find((c) => c.programmeId === programmeId) ?? null;

  const failed = (programmeId: string, status: number) =>
    setMessage({
      programmeId,
      ok: false,
      text: t("That did not work (HTTP {status}). Please try again.", {
        status,
      }),
    });

  const join = async (p: BonusProgramme) => {
    setBusy(p.programmeId);
    setMessage(null);
    try {
      const r = await fetchApi("/api/patient/programmes/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ programmeId: p.programmeId, patientId }),
      });
      if (!r.ok) return failed(p.programmeId, r.status);
      const d = await r.json();
      // The static build answers { ok: true } without a record; the page
      // then shows the consent it asked for.
      const consent: ProgrammeConsent = d.consent ?? {
        consentId: `local-${Date.now()}`,
        programmeId: p.programmeId,
        joinedAt: new Date().toISOString(),
        withdrawnAt: null,
      };
      setConsents((cs) => [
        consent,
        ...cs.filter((c) => c.consentId !== consent.consentId),
      ]);
    } finally {
      setBusy(null);
    }
  };

  const withdraw = async (p: BonusProgramme) => {
    setBusy(p.programmeId);
    setMessage(null);
    try {
      const qs = new URLSearchParams({ programmeId: p.programmeId });
      if (patientId) qs.set("patientId", patientId);
      const r = await fetchApi(`/api/patient/programmes/consent?${qs}`, {
        method: "DELETE",
      });
      if (!r.ok) return failed(p.programmeId, r.status);
      const now = new Date().toISOString();
      setConsents((cs) =>
        cs.map((c) =>
          c.programmeId === p.programmeId && !c.withdrawnAt
            ? { ...c, withdrawnAt: now }
            : c,
        ),
      );
    } finally {
      setBusy(null);
    }
  };

  const send = async (p: BonusProgramme) => {
    const year = ruleYear(p);
    setBusy(p.programmeId);
    setMessage(null);
    try {
      const r = await fetchApi("/api/patient/programmes/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ programmeId: p.programmeId, year, patientId }),
      });
      if (r.status === 409) {
        return setMessage({
          programmeId: p.programmeId,
          ok: false,
          text: t(
            "{year} is not over yet. Nothing was sent; the hub works out the result once the year has ended.",
            { year },
          ),
        });
      }
      if (!r.ok) return failed(p.programmeId, r.status);
      const d = await r.json();
      // The static build answers { ok: true } without a transfer; the page
      // then shows the result it had already shown the member.
      const shown = evaluations[p.programmeId];
      const goalMet: boolean | undefined =
        d.transfer?.goalMet ??
        (shown?.kind === "ready" && shown.evaluation.status === "evaluated"
          ? shown.evaluation.goalMet
          : undefined);
      setMessage({
        programmeId: p.programmeId,
        ok: true,
        text: goalMet
          ? t(
              "Recorded for {year}: goal met, yes. Only this answer goes to {publisher}, once the hub's delivery is connected.",
              { year, publisher: p.publisherName },
            )
          : t(
              "Recorded for {year}: goal met, no. Only this answer goes to {publisher}, once the hub's delivery is connected.",
              { year, publisher: p.publisherName },
            ),
      });
    } finally {
      setBusy(null);
    }
  };

  const dataSpaceName = (id: string | null) =>
    id === "insurance-wellbeing"
      ? t("Insurance and wellbeing data space")
      : t("Another data space");

  return (
    <div className="min-h-screen bg-(--bg)">
      <div className="max-w-3xl mx-auto px-6 py-10">
        <PageIntro
          title={tn("Bonus Programs")}
          icon={Gift}
          description={t(
            "Offers from other data spaces that reward what you do for your health. A program receives a yes or no once a year, never the data behind it. Whether you join is your decision alone (GDPR Art. 9(2)(a)).",
          )}
          prevStep={{
            href: "/patient/research",
            label: tn("Research Programs"),
          }}
          nextStep={{
            href: "/patient/insights",
            label: tn("Research Insights"),
          }}
          infoText={t(
            "A bonus program is not research and not the opt-out. Joining one never enrolls you in a study, and your opt-out from secondary use (EHDS Art. 71) does not stop sharing you start yourself.",
          )}
          docLink={{
            href: "/docs/ehds/bonus-programme-data-flow",
            label: t("Which data goes where"),
          }}
        />

        {loading ? (
          <div className="text-(--text-secondary) text-sm">
            {t("Loading bonus programs…")}
          </div>
        ) : loadError ? (
          <div
            role="alert"
            data-testid="programmes-load-error"
            className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-3 text-sm text-amber-900 dark:text-amber-200"
          >
            {loadError.kind === "refused"
              ? t(
                  "You may not see the bonus programs: they are shown to patients. If your session has ended, sign in again.",
                )
              : loadError.status
                ? t(
                    "The bonus programs could not be loaded (HTTP {status}). Please try again later.",
                    { status: loadError.status },
                  )
                : t(
                    "The bonus programs could not be loaded. Please try again later.",
                  )}
          </div>
        ) : (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">
              {t("Bonus programs on offer ({n})", { n: programmes.length })}
            </h2>

            {programmes.length === 0 && (
              <div className="text-(--text-secondary) text-sm">
                {t(
                  "No bonus program is on offer. The catalogue crawler has not found one in another data space yet.",
                )}
              </div>
            )}

            {programmes.map((p) => (
              <article
                key={p.programmeId}
                data-testid="bonus-programme-card"
                aria-labelledby={`programme-${p.programmeId}`}
                className="rounded-xl border border-(--border) bg-(--surface-2)/50 p-4 space-y-3"
              >
                <header className="flex items-start justify-between gap-3">
                  <div>
                    <h3
                      id={`programme-${p.programmeId}`}
                      className="font-semibold text-sm"
                    >
                      {p.title}
                    </h3>
                    <div className="text-xs text-(--text-secondary)">
                      {p.publisherName}
                    </div>
                  </div>
                  <span className="shrink-0 text-xs text-(--text-secondary) border border-gray-600 rounded-sm px-2 py-0.5">
                    {dataSpaceName(p.dataSpace)}
                  </span>
                </header>

                {p.description && (
                  <p className="text-xs text-(--text-secondary)">
                    {p.description}
                  </p>
                )}

                {p.ruleDescription && (
                  <div className="text-xs">
                    <div className="font-medium">
                      {t("The rule, version {version}", {
                        version: p.ruleVersion ?? "",
                      })}
                    </div>
                    <p className="text-(--text-secondary)">
                      {p.ruleDescription}
                    </p>
                  </div>
                )}

                <div className="grid gap-2 sm:grid-cols-2 text-xs">
                  <div className="rounded-lg border border-teal-700 bg-teal-900/10 p-3">
                    <div className="flex items-center gap-1.5 font-medium text-teal-900 dark:text-teal-200">
                      <ShieldCheck size={14} />
                      {t("What {publisher} receives", {
                        publisher: p.publisherName,
                      })}
                    </div>
                    <p className="text-(--text-secondary) mt-1">
                      {t("The year, and goal met: yes or no.")}
                    </p>
                  </div>
                  <div className="rounded-lg border border-(--border) p-3">
                    <div className="flex items-center gap-1.5 font-medium">
                      <Lock size={14} />
                      {t("What never leaves your record")}
                    </div>
                    <p className="text-(--text-secondary) mt-1">
                      {t(
                        "Steps, heart rate, diagnoses, visit details and any date finer than the year.",
                      )}
                    </p>
                  </div>
                </div>

                <ProgrammeConsentPanel
                  programme={p}
                  evaluation={evaluations[p.programmeId] ?? null}
                  open={openFor(p.programmeId)}
                  last={lastFor(p.programmeId)}
                  busy={busy === p.programmeId}
                  message={
                    message?.programmeId === p.programmeId ? message : null
                  }
                  onJoin={() => join(p)}
                  onWithdraw={() => withdraw(p)}
                  onSend={() => send(p)}
                />
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ProgrammeConsentPanel({
  programme,
  evaluation,
  open,
  last,
  busy,
  message,
  onJoin,
  onWithdraw,
  onSend,
}: {
  programme: BonusProgramme;
  evaluation: EvaluationState | null;
  open: ProgrammeConsent | null;
  last: ProgrammeConsent | null;
  busy: boolean;
  message: { text: string; ok: boolean } | null;
  onJoin: () => void;
  onWithdraw: () => void;
  onSend: () => void;
}) {
  const t = useT("patient");
  const year = ruleYear(programme);
  return (
    <div
      data-testid="bonus-programme-join-state"
      className="border-t border-(--border) pt-3 space-y-2 text-xs"
    >
      <p className="text-(--text-secondary)">
        {t(
          "Joining is your consent to this program alone (GDPR Art. 9(2)(a)). It enrolls you in no study and is separate from your opt-out.",
        )}
      </p>
      {open ? (
        <>
          <p
            data-testid="bonus-programme-joined"
            className="flex items-center gap-1 font-medium text-teal-800 dark:text-teal-400"
          >
            <CheckCircle2 size={12} />
            {t("You joined on {date}.", { date: day(open.joinedAt) })}
          </p>
          <YearResult
            evaluation={evaluation}
            year={year}
            publisher={programme.publisherName}
          />
          <div className="flex flex-wrap gap-3">
            <button
              onClick={onSend}
              disabled={
                busy ||
                evaluation?.kind !== "ready" ||
                evaluation.evaluation.status !== "evaluated"
              }
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-sm bg-teal-700 hover:bg-teal-600 text-white font-medium transition-colors disabled:opacity-50"
            >
              <Send size={12} />
              {busy ? t("Sending…") : t("Send my answer for {year}", { year })}
            </button>
            <button
              onClick={onWithdraw}
              disabled={busy}
              className="flex items-center gap-1.5 text-red-800 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300 transition-colors disabled:opacity-50"
            >
              <XCircle size={12} />
              {busy ? t("Withdrawing…") : t("Withdraw (GDPR Art. 7(3))")}
            </button>
          </div>
        </>
      ) : (
        <>
          {last?.withdrawnAt && (
            <p data-testid="bonus-programme-withdrawn">
              {t("You withdrew on {date}. Nothing is sent any more.", {
                date: day(last.withdrawnAt),
              })}
            </p>
          )}
          <button
            onClick={onJoin}
            disabled={busy}
            className="px-3 py-1.5 rounded-sm bg-teal-700 hover:bg-teal-600 text-white font-medium transition-colors disabled:opacity-50"
          >
            {busy ? t("Joining…") : t("Join this program")}
          </button>
        </>
      )}
      {message && (
        <p
          role={message.ok ? "status" : "alert"}
          className={
            message.ok
              ? "text-teal-800 dark:text-teal-300"
              : "text-amber-900 dark:text-amber-200"
          }
        >
          {message.text}
        </p>
      )}
    </div>
  );
}

/**
 * The member's own result for the program year, before anything is sent
 * (ADR-080, decision 3; ADR-087). The breakdown stays on this screen: what
 * would go out is the year and goal met, yes or no.
 */
function YearResult({
  evaluation,
  year,
  publisher,
}: {
  evaluation: EvaluationState | null;
  year: number;
  publisher: string;
}) {
  const t = useT("patient");
  if (!evaluation || evaluation.kind === "loading") {
    return (
      <p className="text-(--text-secondary)">{t("Working out your result…")}</p>
    );
  }
  if (evaluation.kind === "failed") {
    return (
      <p role="alert" className="text-amber-900 dark:text-amber-200">
        {evaluation.status
          ? t("Your result could not be worked out (HTTP {status}).", {
              status: evaluation.status,
            })
          : t("Your result could not be worked out.")}
      </p>
    );
  }
  const e = evaluation.evaluation;
  if (e.status === "year-not-over") {
    return (
      <p data-testid="bonus-programme-year-not-over">
        {t(
          "{year} is not over. The hub works out your result from {date}; nothing can be sent before.",
          { year: e.year, date: e.evaluableFrom },
        )}
      </p>
    );
  }
  return (
    <div
      data-testid="bonus-programme-result"
      className="rounded-lg border border-(--border) p-3 space-y-1"
    >
      <div className="flex items-center gap-1.5 font-medium">
        <Scale size={14} />
        {t("Your result for {year}", { year })}
      </div>
      <p
        data-testid="bonus-programme-goal"
        className={
          e.goalMet
            ? "font-semibold text-teal-800 dark:text-teal-300"
            : "font-semibold text-amber-900 dark:text-amber-200"
        }
      >
        {e.goalMet ? t("Goal met: yes") : t("Goal met: no")}
      </p>
      <p className="text-(--text-secondary)">
        {t(
          "Exercise: {minutes} minutes a week on average, from {weeks} weeks your tracker shared. The rule asks for {required}.",
          {
            minutes: e.activity.minutesPerWeek,
            weeks: e.activity.weeksWithData,
            required: e.activity.required,
          },
        )}
      </p>
      <p className="text-(--text-secondary)">
        {t("Check-ups in {year}: {count}. The rule asks for one.", {
          year: e.year,
          count: e.checkUp.count,
        })}
      </p>
      <p className="text-(--text-secondary)">
        {t(
          "Only the year and goal met, yes or no, would go to {publisher}. This breakdown stays in your record.",
          { publisher },
        )}
      </p>
    </div>
  );
}
