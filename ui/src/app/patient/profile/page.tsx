"use client";

import { fetchApi } from "@/lib/api";
import { useEffect, useState } from "react";
import {
  Heart,
  AlertTriangle,
  CheckCircle2,
  Activity,
  Shield,
  User,
} from "lucide-react";
import PageIntro from "@/components/PageIntro";

interface RiskScore {
  score: number;
  level: "low" | "moderate" | "high";
  factors: string[];
}

interface Profile {
  patient: { id: string; name: string; gender: string; birthDate: string };
  conditions: { code: string; display: string; onsetDate: string }[];
  medications: { code: string; display: string }[];
  riskScores: { cardiovascular: RiskScore; diabetes: RiskScore };
  interests: string[];
  gdprRights: Record<string, string>;
  totalConditionCount?: number;
}

interface PatientItem {
  id: string;
  name: string;
  gender: string;
  birthDate: string;
  conditionCount: number;
}

const RISK_COLORS = {
  low: "text-green-800 dark:text-green-300 bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800",
  moderate:
    "text-yellow-800 dark:text-yellow-300 bg-yellow-50 dark:bg-yellow-900/30 border-yellow-300 dark:border-yellow-700",
  high: "text-red-800 dark:text-red-300 bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800",
};

const RISK_ICONS = {
  low: CheckCircle2,
  moderate: AlertTriangle,
  high: AlertTriangle,
};

export default function PatientProfilePage() {
  const [patients, setPatients] = useState<PatientItem[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);

  useEffect(() => {
    fetchApi("/api/patient/profile")
      .then((r) => r.json())
      .then((d) => {
        setPatients(d.patients ?? []);
        if ((d.patients ?? []).length > 0) setSelectedId(d.patients[0].id);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    setProfileLoading(true);
    fetchApi(`/api/patient/profile?patientId=${encodeURIComponent(selectedId)}`)
      .then((r) => r.json())
      .then((d) => setProfile(d))
      .finally(() => setProfileLoading(false));
  }, [selectedId]);

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <div className="max-w-3xl mx-auto px-6 py-10">
        <PageIntro
          title="Health Profile & Risk Assessment"
          icon={Heart}
          description="GDPR Art. 15 / EHDS Art. 3 — Your personal health profile, computed risk scores, and health interests. All data derived from your own FHIR electronic health record."
          prevStep={{ href: "/patient", label: "Health Records" }}
          nextStep={{ href: "/patient/research", label: "Research Programs" }}
          infoText="Risk scores are computed from your clinical conditions and are for informational purposes only. Always consult your physician before making medical decisions."
          docLink={{
            href: "/docs/user-guide",
            label: "Patient Rights Guide",
          }}
        />

        {/* GDPR rights banner */}
        <div className="mb-6 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3 flex items-start gap-2">
          <Shield size={16} className="mt-0.5 shrink-0 text-[var(--accent)]" />
          <div className="text-xs text-[var(--text-secondary)]">
            <strong>Your data rights:</strong> You have the right to access
            (GDPR Art. 15), portability (Art. 20), rectification (Art. 16), and
            erasure (Art. 17) of your health data. Under EHDS Art. 3, you can
            access your EHR through any EU national contact point.
          </div>
        </div>

        {/* Patient selector */}
        {!loading && patients.length > 0 && (
          <div className="mb-6">
            <label className="text-sm text-[var(--text-secondary)]">
              Select patient record
              <select
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="mt-1 w-full px-3 py-2 bg-[var(--surface-2)] border border-[var(--border-ui)] rounded text-sm outline-none focus:border-teal-500 block"
              >
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {p.gender}, born {p.birthDate} (
                    {p.conditionCount} conditions)
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        {profileLoading && (
          <div className="text-[var(--text-secondary)] text-sm">
            Loading health profile…
          </div>
        )}

        {profile && !profileLoading && (
          <div className="space-y-6">
            {/* Patient demographics */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/50 p-4">
              <div className="flex items-center gap-2 mb-3">
                <User size={16} className="text-teal-800 dark:text-teal-400" />
                <h2 className="font-semibold">
                  {profile.patient.name || "Anonymous Patient"}
                </h2>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-[var(--text-secondary)]">
                <div>
                  <span className="text-[var(--text-secondary)]">Gender:</span>{" "}
                  {profile.patient.gender}
                </div>
                <div>
                  <span className="text-[var(--text-secondary)]">
                    Date of birth:
                  </span>{" "}
                  {profile.patient.birthDate || "—"}
                </div>
                <div>
                  <span className="text-[var(--text-secondary)]">
                    Active Conditions:
                  </span>{" "}
                  {profile.totalConditionCount ?? profile.conditions.length}
                </div>
                <div>
                  <span className="text-[var(--text-secondary)]">
                    Medications:
                  </span>{" "}
                  {profile.medications.length}
                </div>
              </div>
            </div>

            {/* Risk scores */}
            <div>
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <Activity
                  size={18}
                  className="text-teal-800 dark:text-teal-400"
                />
                Health Risk Assessment
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {Object.entries(profile.riskScores).map(([key, risk]) => {
                  const Icon = RISK_ICONS[risk.level];
                  return (
                    <div
                      key={key}
                      className={`rounded-xl border p-4 ${
                        RISK_COLORS[risk.level]
                      }`}
                      data-testid={`risk-card-${key}`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-semibold capitalize">
                          {key.replace(/([A-Z])/g, " $1")} Risk
                        </span>
                        <Icon size={16} />
                      </div>
                      <div className="text-2xl font-bold mb-1">
                        {Math.round(risk.score * 100)}%
                      </div>
                      <div className="text-xs capitalize font-medium mb-2">
                        {risk.level} risk
                      </div>
                      {risk.factors.length > 0 && (
                        <ul className="text-xs space-y-0.5 opacity-80">
                          {risk.factors.map((f) => (
                            <li key={f}>• {f}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Interests */}
            {profile.interests.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold mb-2">
                  Health Interests & Goals
                </h2>
                <div className="flex flex-wrap gap-2">
                  {profile.interests.map((i) => (
                    <span
                      key={i}
                      className="text-xs px-3 py-1 rounded-full bg-teal-100 dark:bg-teal-900/40 text-teal-800 dark:text-teal-300 border border-teal-300 dark:border-teal-700 capitalize"
                    >
                      {i.replace(/-/g, " ")}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Conditions */}
            {profile.conditions.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold mb-2">
                  Active Conditions
                </h2>
                <div className="rounded-xl border border-[var(--border)] overflow-hidden">
                  <table className="text-xs w-full border-collapse">
                    <thead>
                      <tr className="border-b border-[var(--border)] text-[var(--text-secondary)]">
                        <th className="text-left p-2">Condition</th>
                        <th className="text-left p-2">ICD-10 / SNOMED</th>
                        <th className="text-left p-2">Onset</th>
                      </tr>
                    </thead>
                    <tbody>
                      {profile.conditions.slice(0, 8).map((c, i) => (
                        <tr key={i} className="border-b border-[var(--border)]">
                          <td className="p-2 text-[var(--text-primary)]">
                            {c.display}
                          </td>
                          <td className="p-2 font-mono text-[var(--text-secondary)]">
                            {c.code}
                          </td>
                          <td className="p-2 text-[var(--text-secondary)]">
                            {c.onsetDate?.slice(0, 10) || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
