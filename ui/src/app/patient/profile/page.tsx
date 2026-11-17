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
  Wallet,
} from "lucide-react";
import Link from "next/link";
import PageIntro from "@/components/PageIntro";
import { isSandboxUsername } from "@/lib/sandbox-account";
import ConnectAppCard from "@/components/ConnectAppCard";
import HealthInterests from "@/components/HealthInterests";
import { useSession } from "next-auth/react";
import { T, useT } from "@/lib/i18n/translate";
import { useOwnRecord } from "@/lib/patient/use-own-record";
import { IS_STATIC } from "@/lib/static-export";

interface RiskScore {
  score: number;
  level: "low" | "moderate" | "high";
  factors: string[];
}

interface Profile {
  patient: {
    id: string;
    name: string;
    gender: string;
    birthDate: string;
    age?: number | null;
  };
  conditions: { code: string; display: string; onsetDate: string }[];
  medications: { code: string; display: string }[];
  riskScores: { cardiovascular: RiskScore; diabetes: RiskScore };
  interests: string[];
  interestsChosen?: boolean;
  suggestedInterests?: { id: string; label: string }[];
  gdprRights: Record<string, string>;
  totalConditionCount?: number;
}

interface PatientItem {
  id: string;
  name: string;
  gender: string;
  birthDate: string;
  age?: number | null;
  conditionCount: number;
}

const RISK_COLORS = {
  low: "text-green-800 dark:text-green-300 bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800",
  moderate:
    "text-yellow-800 dark:text-yellow-300 bg-yellow-50 dark:bg-yellow-900/30 border-yellow-300 dark:border-yellow-700",
  high: "text-red-800 dark:text-red-300 bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800",
};

/** Why the profile did not load: refused (401, 403) or failed (anything else). */
type LoadError =
  | { kind: "refused" }
  | { kind: "failed"; status: number | null };

/** The answer's body, or why there is none. A network error is a failure. */
async function readJson<T>(
  request: Promise<Response>,
): Promise<{ data: T } | { error: LoadError }> {
  try {
    const r = await request;
    if (!r.ok) {
      return {
        error:
          r.status === 401 || r.status === 403
            ? { kind: "refused" }
            : { kind: "failed", status: r.status },
      };
    }
    return { data: (await r.json()) as T };
  } catch {
    return { error: { kind: "failed", status: null } };
  }
}

const RISK_ICONS = {
  low: CheckCircle2,
  moderate: AlertTriangle,
  high: AlertTriangle,
};

export default function PatientProfilePage() {
  const t = useT("patient");
  const tn = useT("nav");
  // FHIR's administrative gender codes, in the picked language.
  const gender = (g: string | null | undefined) =>
    g === "female"
      ? t("female")
      : g === "male"
        ? t("male")
        : g === "other"
          ? t("other")
          : g === "unknown"
            ? t("unknown")
            : g;
  const riskTitle = (key: string) =>
    key === "cardiovascular"
      ? t("Cardiovascular Risk")
      : key === "diabetes"
        ? t("Diabetes Risk")
        : `${key.replace(/([A-Z])/g, " $1")} Risk`;
  const riskLevel = (level: RiskScore["level"]) =>
    level === "high"
      ? t("high risk")
      : level === "moderate"
        ? t("moderate risk")
        : t("low risk");
  const [patients, setPatients] = useState<PatientItem[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [loadError, setLoadError] = useState<LoadError | null>(null);
  // Only the patient names their own interests; the route refuses others.
  const { data: session } = useSession();
  const roles = (session as { roles?: string[] } | null)?.roles ?? [];
  const canEditInterests = roles.includes("PATIENT");
  const username =
    (session?.user as { preferredUsername?: string } | undefined)
      ?.preferredUsername ?? "";

  // A patient opens their own record. The route lists only that one; the
  // static build's list fixture holds both demo patients, so there the page
  // narrows it the same way (patient2 opens P2, not the first entry).
  const subject = useOwnRecord();
  const ownId = subject.kind === "own" ? subject.patientId : null;

  // A refusal or an error is no profile, and the page says which. Before, the
  // list's failure left an empty page and the profile's error body was stored
  // as the profile, which the page then crashed on.
  useEffect(() => {
    if (subject.kind === "pending") return;
    let cancelled = false;
    readJson<{ patients?: PatientItem[] }>(fetchApi("/api/patient/profile"))
      .then((res) => {
        if (cancelled) return;
        if ("error" in res) {
          setLoadError(res.error);
          return;
        }
        const all = res.data.patients ?? [];
        const list =
          IS_STATIC && subject.kind === "own"
            ? all.filter((p) => p.id === ownId)
            : all;
        setPatients(list);
        if (list.length > 0) setSelectedId(list[0].id);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [subject.kind, ownId]);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    setProfileLoading(true);
    readJson<Profile>(
      fetchApi(
        `/api/patient/profile?patientId=${encodeURIComponent(selectedId)}`,
      ),
    )
      .then((res) => {
        if (cancelled) return;
        if ("error" in res) {
          setProfile(null);
          setLoadError(res.error);
          return;
        }
        setProfile(res.data);
        setLoadError(null);
      })
      .finally(() => {
        if (!cancelled) setProfileLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  return (
    <div className="min-h-screen bg-(--bg)">
      <div className="max-w-3xl mx-auto px-6 py-10">
        <PageIntro
          title={t("Health Profile & Risk Assessment")}
          icon={Heart}
          description={t(
            "GDPR Art. 15 / EHDS Art. 3: your personal health profile, computed risk scores, and health interests. All data derived from your own FHIR electronic health record.",
          )}
          prevStep={{ href: "/patient", label: t("Health Records") }}
          nextStep={{
            href: "/patient/research",
            label: tn("Research Programs"),
          }}
          infoText={t(
            "Risk scores are computed from your clinical conditions and are for informational purposes only. Always consult your physician before making medical decisions.",
          )}
          docLink={{
            href: "/docs/user-guide",
            label: t("Patient Rights Guide"),
          }}
        />

        {/* The Klarbefund app reads this record once connected (#473). */}
        <ConnectAppCard />

        {/* A sandbox account can sign in with the EUDI wallet (ADR-067). */}
        {isSandboxUsername(username) && (
          <Link
            href="/patient/wallet"
            data-testid="connect-wallet-link"
            className="mb-6 flex items-center gap-2 rounded-lg border border-(--border) bg-(--surface) p-4 text-sm hover:bg-(--surface-2)"
          >
            <Wallet size={18} className="text-(--accent)" aria-hidden />
            <span>
              <strong>{t("Connect your EUDI wallet")}</strong>
              <span className="block text-xs text-(--text-secondary)">
                {t(
                  "Sign in to this account with your PID, at assurance level high.",
                )}
              </span>
            </span>
          </Link>
        )}

        {/* GDPR rights banner */}
        <div className="mb-6 rounded-lg border border-(--border) bg-(--surface-2) p-3 flex items-start gap-2">
          <Shield size={16} className="mt-0.5 shrink-0 text-(--accent)" />
          <div className="text-xs text-(--text-secondary)">
            <T area="patient" tags={{ b: <strong /> }}>
              {
                "<b>Your data rights:</b> You have the right to access (GDPR Art. 15), portability (Art. 20), rectification (Art. 16), and erasure (Art. 17) of your health data. Under EHDS Art. 3, you can access your EHR through any EU national contact point."
              }
            </T>
          </div>
        </div>

        {/* Patient selector */}
        {!loading && patients.length > 0 && (
          <div className="mb-6">
            <label className="text-sm text-(--text-secondary)">
              {t("Select patient record")}
              <select
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="mt-1 w-full px-3 py-2 bg-(--surface-2) border border-(--border-ui) rounded-sm text-sm outline-hidden focus:border-teal-500 block"
              >
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {[
                      p.name,
                      p.gender && p.gender !== "unknown"
                        ? gender(p.gender)
                        : null,
                      p.age != null
                        ? t("age {age}", { age: p.age })
                        : p.birthDate
                          ? t("born {date}", { date: p.birthDate })
                          : null,
                    ]
                      .filter(Boolean)
                      .join(", ")}{" "}
                    {t("({n} conditions)", { n: p.conditionCount })}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        {profileLoading && (
          <div className="text-(--text-secondary) text-sm">
            {t("Loading health profile…")}
          </div>
        )}

        {loadError && !profileLoading && (
          <div
            role="alert"
            data-testid="profile-load-error"
            className="mb-6 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-3 text-sm text-amber-900 dark:text-amber-200"
          >
            {loadError.kind === "refused"
              ? t(
                  "You may not see this health profile: a patient sees their own record only. If your session has ended, sign in again.",
                )
              : loadError.status
                ? t(
                    "The health profile could not be loaded (HTTP {status}). Please try again later.",
                    { status: loadError.status },
                  )
                : t(
                    "The health profile could not be loaded. Please try again later.",
                  )}
          </div>
        )}

        {profile && !profileLoading && (
          <div className="space-y-6">
            {/* Patient demographics */}
            <div className="rounded-xl border border-(--border) bg-(--surface-2)/50 p-4">
              <div className="flex items-center gap-2 mb-3">
                <User size={16} className="text-teal-800 dark:text-teal-400" />
                <h2 className="font-semibold">
                  {profile.patient.name || t("Anonymous Patient")}
                </h2>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-(--text-secondary)">
                <div>
                  <span className="text-(--text-secondary)">
                    {t("Gender:")}
                  </span>{" "}
                  {gender(profile.patient.gender)}
                </div>
                <div>
                  <span className="text-(--text-secondary)">
                    {profile.patient.age != null
                      ? t("Age:")
                      : t("Date of birth:")}
                  </span>{" "}
                  {profile.patient.age != null
                    ? profile.patient.age
                    : profile.patient.birthDate || "—"}
                </div>
                <div>
                  <span className="text-(--text-secondary)">
                    {t("Active Conditions:")}
                  </span>{" "}
                  {profile.totalConditionCount ?? profile.conditions.length}
                </div>
                <div>
                  <span className="text-(--text-secondary)">
                    {t("Medications:")}
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
                {t("Health Risk Assessment")}
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
                        <span className="font-semibold first-letter:uppercase">
                          {riskTitle(key)}
                        </span>
                        <Icon size={16} />
                      </div>
                      <div className="text-2xl font-bold mb-1">
                        {Math.round(risk.score * 100)}%
                      </div>
                      <div className="text-xs first-letter:uppercase font-medium mb-2">
                        {riskLevel(risk.level)}
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

            {/* Interests: suggested from the record, editable by the patient */}
            <HealthInterests
              key={profile.patient.id}
              patientId={profile.patient.id}
              interests={profile.interests}
              chosen={profile.interestsChosen ?? false}
              suggested={profile.suggestedInterests ?? []}
              canEdit={canEditInterests}
            />

            {/* Conditions */}
            {profile.conditions.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold mb-2">
                  {t("Active Conditions")}
                </h2>
                <div className="rounded-xl border border-(--border) overflow-hidden">
                  <table className="text-xs w-full border-collapse">
                    <thead>
                      <tr className="border-b border-(--border) text-(--text-secondary)">
                        <th className="text-left p-2">{t("Condition")}</th>
                        <th className="text-left p-2">ICD-10 / SNOMED</th>
                        <th className="text-left p-2">{t("Onset")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {profile.conditions.slice(0, 8).map((c, i) => (
                        <tr key={i} className="border-b border-(--border)">
                          <td className="p-2 text-(--text-primary)">
                            {c.display}
                          </td>
                          <td className="p-2 font-mono text-(--text-secondary)">
                            {c.code}
                          </td>
                          <td className="p-2 text-(--text-secondary)">
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
