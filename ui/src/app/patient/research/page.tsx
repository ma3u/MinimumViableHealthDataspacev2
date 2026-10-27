"use client";

import { fetchApi } from "@/lib/api";
import { useEffect, useState } from "react";
import {
  FlaskConical,
  CheckCircle2,
  XCircle,
  Shield,
  ShieldOff,
} from "lucide-react";
import PageIntro from "@/components/PageIntro";

interface Program {
  studyId: string;
  studyName: string;
  institution: string;
  purpose: string;
  description: string;
  dataNeeded: string;
  status: string;
}

interface Consent {
  consentId: string;
  studyId: string;
  grantedAt: string;
  revoked: boolean;
  purpose: string;
}

interface OptOutRecord {
  optOutId: string;
  optedOutAt: string;
  source: string | null;
  reversedAt: string | null;
}

interface OptOutState {
  optedOut: boolean;
  since: string | null;
  history: OptOutRecord[];
}

const DEMO_PATIENT_ID = "demo-patient-1";

const day = (iso: string | null) => (iso ? iso.slice(0, 10) : "");

export default function ResearchProgramsPage() {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [consents, setConsents] = useState<Consent[]>([]);
  const [loading, setLoading] = useState(true);
  const [donating, setDonating] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [optOut, setOptOut] = useState<OptOutState | null>(null);
  const [optOutError, setOptOutError] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);

  const patientId = DEMO_PATIENT_ID;

  const reload = () => {
    fetchApi(`/api/patient/research?patientId=${patientId}`)
      .then((r) => r.json())
      .then((d) => {
        setPrograms(d.programs ?? []);
        setConsents(d.consents ?? []);
      })
      .finally(() => setLoading(false));
  };

  // The opt-out is the signed-in patient's own (Art. 71, ADR-062): the route
  // takes the record from the session, so no patientId is sent.
  const loadOptOut = () => {
    fetchApi("/api/patient/opt-out")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
        setOptOut({
          optedOut: Boolean(d.optedOut),
          since: d.since ?? null,
          history: Array.isArray(d.history) ? d.history : [],
        });
        setOptOutError(null);
      })
      .catch((e: Error) => setOptOutError(e.message));
  };

  useEffect(() => {
    reload();
    loadOptOut();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const switchOptOut = async () => {
    if (!optOut) return;
    setSwitching(true);
    setMessage(null);
    try {
      const r = await fetchApi("/api/patient/opt-out", {
        method: optOut.optedOut ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: optOut.optedOut
          ? undefined
          : JSON.stringify({ source: "patient-portal" }),
      });
      const d = await r.json();
      setMessage(
        d.message ??
          (optOut.optedOut
            ? "Your opt-out is reversed."
            : "You have opted out of secondary use."),
      );
      loadOptOut();
    } finally {
      setSwitching(false);
    }
  };

  const donate = async (studyId: string) => {
    setDonating(studyId);
    setMessage(null);
    try {
      const r = await fetchApi("/api/patient/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId, studyId }),
      });
      const d = await r.json();
      setMessage(d.message ?? "EHR donation registered.");
      reload();
    } finally {
      setDonating(null);
    }
  };

  const revoke = async (consent: Consent) => {
    setRevoking(consent.consentId);
    setMessage(null);
    try {
      await fetchApi(
        `/api/patient/research?consentId=${consent.consentId}&patientId=${patientId}`,
        { method: "DELETE" },
      );
      setMessage("Consent withdrawn. Nothing new of yours reaches this study.");
      reload();
    } finally {
      setRevoking(null);
    }
  };

  const consentedStudyIds = new Set(
    consents.filter((c) => !c.revoked).map((c) => c.studyId),
  );

  return (
    <div className="min-h-screen bg-(--bg)">
      <div className="max-w-3xl mx-auto px-6 py-10">
        <PageIntro
          title="Research Programs"
          icon={FlaskConical}
          description="Decide about the secondary use of your health data (EHDS Art. 71) and, separately, which studies you join. Joining a study is your consent (GDPR Art. 9(2)(a)); you can withdraw it at any time (GDPR Art. 7(3))."
          prevStep={{ href: "/patient/profile", label: "Health Profile" }}
          nextStep={{ href: "/patient/insights", label: "Research Insights" }}
          infoText="Your data is pseudonymised by the Trust Center before reaching researchers. Individual-level data never leaves the Secure Processing Environment (EHDS Art. 73)."
          docLink={{ href: "/docs/user-guide", label: "Patient Rights Guide" }}
        />

        {/* The Art. 71 opt-out from all secondary use (ADR-062) */}
        <section
          data-testid="opt-out-panel"
          aria-labelledby="opt-out-heading"
          className="mb-6 rounded-lg border border-teal-700 bg-teal-900/20 p-4"
        >
          <div className="flex items-start gap-2">
            {optOut?.optedOut ? (
              <ShieldOff
                size={16}
                className="mt-0.5 shrink-0 text-amber-800 dark:text-amber-400"
              />
            ) : (
              <Shield
                size={16}
                className="mt-0.5 shrink-0 text-teal-800 dark:text-teal-400"
              />
            )}
            <div className="text-xs text-teal-900 dark:text-teal-200 space-y-2">
              <h2 id="opt-out-heading" className="text-sm font-semibold">
                Secondary use of your health data (EHDS Art. 71)
              </h2>
              <p>
                Your data may be used for research, innovation, policy and
                statistics, but only under a permit from a health data access
                body, pseudonymised, inside a secure processing environment. You
                can opt out at any time, without giving a reason, and opt back
                in. The opt-out applies to every new extraction; what a permit
                received before it is not recalled.
              </p>
              {optOut ? (
                <>
                  <p data-testid="opt-out-state" className="font-medium">
                    {optOut.optedOut
                      ? `You opted out on ${day(optOut.since)}.`
                      : "You have not opted out: secondary use under a permit applies."}
                  </p>
                  <button
                    type="button"
                    data-testid="opt-out-switch"
                    onClick={switchOptOut}
                    disabled={switching}
                    className={`px-3 py-1.5 rounded-sm text-white text-xs font-medium transition-colors disabled:opacity-50 ${
                      optOut.optedOut
                        ? "bg-teal-700 hover:bg-teal-600"
                        : "bg-amber-700 hover:bg-amber-600"
                    }`}
                  >
                    {switching
                      ? "Saving…"
                      : optOut.optedOut
                        ? "Opt back in"
                        : "Opt out of secondary use"}
                  </button>
                  {optOut.history.length > 0 && (
                    <ul className="list-disc list-inside text-(--text-secondary)">
                      {optOut.history.map((h) => (
                        <li key={h.optOutId}>
                          Opted out {day(h.optedOutAt)}
                          {h.reversedAt
                            ? `, back in ${day(h.reversedAt)}`
                            : ", still in effect"}
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              ) : (
                <p className="text-(--text-secondary)">
                  {optOutError
                    ? `The opt-out is available to a signed-in patient (${optOutError}).`
                    : "Loading your opt-out…"}
                </p>
              )}
              <p className="text-(--text-secondary)">
                Joining a study below is a separate choice: your consent to that
                study (GDPR Art. 9(2)(a)), which you can withdraw at any time
                (GDPR Art. 7(3)).
              </p>
            </div>
          </div>
        </section>

        {message && (
          <div className="mb-4 rounded-lg bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-700 p-3 text-sm text-green-800 dark:text-green-300">
            {message}
          </div>
        )}

        {loading ? (
          <div className="text-(--text-secondary) text-sm">
            Loading research programs…
          </div>
        ) : (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">
              Available Research Programs ({programs.length})
            </h2>

            {programs.length === 0 && (
              <div className="text-(--text-secondary) text-sm">
                No research programs found. Seed the JAD stack to populate.
              </div>
            )}

            {programs.map((prog) => {
              const isConsented = consentedStudyIds.has(prog.studyId);
              return (
                <div
                  key={prog.studyId}
                  data-testid="research-program-card"
                  className={`rounded-xl border p-4 ${
                    isConsented
                      ? "border-teal-300 dark:border-teal-700 bg-teal-50 dark:bg-teal-900/10"
                      : "border-(--border) bg-(--surface-2)/50"
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="font-semibold text-sm">
                        {prog.studyName}
                      </div>
                      <div className="text-xs text-(--text-secondary)">
                        {prog.institution}
                      </div>
                    </div>
                    {isConsented ? (
                      <span className="flex items-center gap-1 text-xs text-teal-800 dark:text-teal-400 font-medium">
                        <CheckCircle2 size={12} /> Donated
                      </span>
                    ) : (
                      <span className="text-xs text-(--text-secondary) border border-gray-600 rounded-sm px-2 py-0.5">
                        {prog.status}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-(--text-secondary) mb-2">
                    {prog.description}
                  </p>
                  <div className="text-xs text-(--text-secondary) mb-3">
                    <span className="text-gray-700 dark:text-gray-400">
                      Data needed:{" "}
                    </span>
                    {prog.dataNeeded}
                  </div>

                  {isConsented ? (
                    <button
                      onClick={() => {
                        const consent = consents.find(
                          (c) => c.studyId === prog.studyId && !c.revoked,
                        );
                        if (consent) revoke(consent);
                      }}
                      disabled={revoking !== null}
                      className="flex items-center gap-1.5 text-xs text-red-800 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300 transition-colors disabled:opacity-50"
                    >
                      <XCircle size={12} />
                      {revoking
                        ? "Withdrawing…"
                        : "Withdraw consent (GDPR Art. 7(3))"}
                    </button>
                  ) : (
                    <button
                      onClick={() => donate(prog.studyId)}
                      disabled={donating !== null}
                      className="px-3 py-1.5 rounded-sm bg-teal-700 hover:bg-teal-600 text-white text-xs font-medium transition-colors disabled:opacity-50"
                    >
                      {donating === prog.studyId
                        ? "Registering…"
                        : "Donate my EHR to this study"}
                    </button>
                  )}
                </div>
              );
            })}

            {/* Consent history */}
            {consents.length > 0 && (
              <div className="mt-8">
                <h2 className="text-lg font-semibold mb-3">Consent History</h2>
                <table className="text-xs w-full border-collapse">
                  <thead>
                    <tr className="border-b border-(--border) text-(--text-secondary)">
                      <th className="text-left pb-1">Study</th>
                      <th className="text-left pb-1">Granted</th>
                      <th className="text-left pb-1">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {consents.map((c) => (
                      <tr
                        key={c.consentId}
                        className="border-b border-(--border)"
                      >
                        <td className="py-1.5 pr-3 font-mono">{c.studyId}</td>
                        <td className="py-1.5 pr-3 text-(--text-secondary)">
                          {c.grantedAt?.slice(0, 10) || "—"}
                        </td>
                        <td className="py-1.5">
                          {c.revoked ? (
                            <span className="text-red-800 dark:text-red-400">
                              Revoked
                            </span>
                          ) : (
                            <span className="text-teal-800 dark:text-teal-400">
                              Active
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
