"use client";

import { fetchApi } from "@/lib/api";
import { useEffect, useState } from "react";
import { FlaskConical, CheckCircle2, XCircle, Shield } from "lucide-react";
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

const DEMO_PATIENT_ID = "demo-patient-1";

export default function ResearchProgramsPage() {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [consents, setConsents] = useState<Consent[]>([]);
  const [loading, setLoading] = useState(true);
  const [donating, setDonating] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

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

  useEffect(() => {
    reload();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
      setMessage(
        "Consent revoked. Your data will no longer be used in this study.",
      );
      reload();
    } finally {
      setRevoking(null);
    }
  };

  const consentedStudyIds = new Set(
    consents.filter((c) => !c.revoked).map((c) => c.studyId),
  );

  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      <PageIntro
        title="Research Programs"
        icon={FlaskConical}
        description="EHDS Art. 10 — Discover research programs and donate your pseudonymised EHR data. Your explicit consent is required for each study. You can revoke at any time (GDPR Art. 17)."
        prevStep={{ href: "/patient/profile", label: "Health Profile" }}
        nextStep={{ href: "/patient/insights", label: "Research Insights" }}
        infoText="Your data is pseudonymised by the Trust Center before reaching researchers. Individual-level data never leaves the Secure Processing Environment (EHDS Art. 50)."
        docLink={{ href: "/docs/user-guide", label: "Patient Rights Guide" }}
      />

      {/* EHDS Art. 10 banner */}
      <div className="mb-6 rounded-lg border border-teal-700 bg-teal-900/20 p-3 flex items-start gap-2">
        <Shield size={16} className="mt-0.5 shrink-0 text-teal-400" />
        <div className="text-xs text-teal-300">
          <strong>EHDS Art. 10:</strong> You have the right to consent to or opt
          out of secondary use of your health data for research. Each consent is
          study-specific and revocable at any time (GDPR Art. 17).
        </div>
      </div>

      {message && (
        <div className="mb-4 rounded-lg bg-green-900/30 border border-green-700 p-3 text-sm text-green-300">
          {message}
        </div>
      )}

      {loading ? (
        <div className="text-gray-500 text-sm">Loading research programs…</div>
      ) : (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">
            Available Research Programs ({programs.length})
          </h2>

          {programs.length === 0 && (
            <div className="text-gray-500 text-sm">
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
                    ? "border-teal-700 bg-teal-900/10"
                    : "border-gray-700 bg-gray-800/50"
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="font-semibold text-sm">
                      {prog.studyName}
                    </div>
                    <div className="text-xs text-gray-400">
                      {prog.institution}
                    </div>
                  </div>
                  {isConsented ? (
                    <span className="flex items-center gap-1 text-xs text-teal-400 font-medium">
                      <CheckCircle2 size={12} /> Donated
                    </span>
                  ) : (
                    <span className="text-xs text-gray-500 border border-gray-600 rounded px-2 py-0.5">
                      {prog.status}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-400 mb-2">{prog.description}</p>
                <div className="text-xs text-gray-500 mb-3">
                  <span className="text-gray-600">Data needed: </span>
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
                    className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 transition-colors disabled:opacity-50"
                  >
                    <XCircle size={12} />
                    {revoking ? "Revoking…" : "Revoke consent (GDPR Art. 17)"}
                  </button>
                ) : (
                  <button
                    onClick={() => donate(prog.studyId)}
                    disabled={donating !== null}
                    className="px-3 py-1.5 rounded bg-teal-700 hover:bg-teal-600 text-white text-xs font-medium transition-colors disabled:opacity-50"
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
                  <tr className="border-b border-gray-700 text-gray-500">
                    <th className="text-left pb-1">Study</th>
                    <th className="text-left pb-1">Granted</th>
                    <th className="text-left pb-1">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {consents.map((c) => (
                    <tr key={c.consentId} className="border-b border-gray-800">
                      <td className="py-1.5 pr-3 font-mono">{c.studyId}</td>
                      <td className="py-1.5 pr-3 text-gray-400">
                        {c.grantedAt?.slice(0, 10) || "—"}
                      </td>
                      <td className="py-1.5">
                        {c.revoked ? (
                          <span className="text-red-400">Revoked</span>
                        ) : (
                          <span className="text-teal-400">Active</span>
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
  );
}
