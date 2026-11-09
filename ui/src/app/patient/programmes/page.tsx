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
} from "lucide-react";
import PageIntro from "@/components/PageIntro";
import { useT } from "@/lib/i18n/translate";
import { useOwnRecord } from "@/lib/patient/use-own-record";
import type {
  BonusProgramme,
  ProgrammeConsent,
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
 * under an open consent.
 */

/**
 * The record an operator (EDC_ADMIN) acts on here, as on the research page:
 * P1, which every seed carries. A patient acts on their own.
 */
const DEMO_PATIENT_ID = "P1";

const day = (iso: string | null) => (iso ? iso.slice(0, 10) : "");

/** The year a rule version names (2027.1 is the rule for 2027). */
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
      if (!r.ok) return failed(p.programmeId, r.status);
      setMessage({
        programmeId: p.programmeId,
        ok: true,
        text: t(
          "Recorded for {year}: {publisher} receives yes or no once the hub has evaluated the year.",
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
  open,
  last,
  busy,
  message,
  onJoin,
  onWithdraw,
  onSend,
}: {
  programme: BonusProgramme;
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
          <div className="flex flex-wrap gap-3">
            <button
              onClick={onSend}
              disabled={busy}
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
