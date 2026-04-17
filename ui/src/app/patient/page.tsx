"use client";

import { fetchApi } from "@/lib/api";
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Heart,
  Stethoscope,
  FlaskConical,
  Pill,
  Scissors,
  Users,
} from "lucide-react";
import PageIntro from "@/components/PageIntro";
import { SignInRequired } from "@/components/SignInRequired";

interface PatientListItem {
  id: string;
  name: string;
  gender: string;
  birthDate: string;
}

interface CohortStats {
  patients: number;
  encounters: number;
  conditions: number;
  observations: number;
  medications: number;
  procedures: number;
}

interface TimelineEntry {
  fhirType: string;
  fhirId: string;
  date: string;
  display: string;
  omopType: string;
  omopId: string;
}

/* WCAG-safe FHIR type colours — ≥4.5:1 on white (light) and on #0b1326 (dark) */
const FHIR_TYPE_TOKENS: Record<
  string,
  { text: string; bg: string; icon: React.ReactNode }
> = {
  Encounter: {
    text: "var(--fhir-encounter)",
    bg: "var(--role-holder-bg)",
    icon: <Stethoscope size={12} />,
  },
  Condition: {
    text: "var(--fhir-condition)",
    bg: "var(--role-user-bg)",
    icon: <Activity size={12} />,
  },
  Observation: {
    text: "var(--fhir-observation)",
    bg: "var(--role-user-bg)",
    icon: <FlaskConical size={12} />,
  },
  MedicationRequest: {
    text: "var(--fhir-medication)",
    bg: "var(--role-hdab-bg)",
    icon: <Pill size={12} />,
  },
  Procedure: {
    text: "var(--fhir-procedure)",
    bg: "var(--role-trust-bg)",
    icon: <Scissors size={12} />,
  },
};

/* Metric orb stat card — Stitch patient_dashboard_day pattern */
function MetricCard({
  label,
  value,
  isOrb = false,
  icon,
  sub,
}: {
  label: string;
  value?: number;
  isOrb?: boolean;
  icon: React.ReactNode;
  sub?: string;
}) {
  return (
    <div className="surface-card relative p-5 pr-16 flex flex-col gap-3 border border-[var(--border)]">
      {/* Icon is absolutely pinned to top-right so it never drifts when the
          card stretches (e.g. when only one card has a subtitle like
          "Synthea cohort"). */}
      <div className="absolute top-4 right-4">
        {isOrb ? (
          <div className="metric-orb">{icon}</div>
        ) : (
          <div className="icon-orb">{icon}</div>
        )}
      </div>
      <div>
        <p className="section-label mb-1">{label}</p>
        <p className="text-3xl font-black text-[var(--text-primary)] leading-none tracking-tight">
          {value != null ? value.toLocaleString() : "—"}
        </p>
        {sub && (
          <p className="text-xs text-[var(--text-secondary)] mt-1">{sub}</p>
        )}
      </div>
    </div>
  );
}

export default function PatientPage() {
  const [patients, setPatients] = useState<PatientListItem[]>([]);
  const [stats, setStats] = useState<CohortStats | null>(null);
  const [selected, setSelected] = useState<string>("");
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [restricted, setRestricted] = useState(false);
  const [unauthenticated, setUnauthenticated] = useState(false);

  useEffect(() => {
    fetchApi("/api/patient")
      .then(async (r) => {
        if (r.status === 401) throw new Error("UNAUTHENTICATED");
        return r.json();
      })
      .then((d) => {
        setPatients(d.patients ?? []);
        setStats(d.stats ?? null);
        setRestricted(d.restricted === true);
        if (d.restricted && d.patients?.length === 1) {
          setSelected(d.patients[0].id);
        }
        setLoading(false);
      })
      .catch((e: Error) => {
        if (e.message === "UNAUTHENTICATED") setUnauthenticated(true);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!selected) return;
    setLoading(true);
    fetchApi(`/api/patient?patientId=${encodeURIComponent(selected)}`)
      .then(async (r) => {
        if (r.status === 401) throw new Error("UNAUTHENTICATED");
        return r.json();
      })
      .then((d) => {
        setTimeline(d.timeline ?? []);
        setLoading(false);
      })
      .catch((e: Error) => {
        if (e.message === "UNAUTHENTICATED") setUnauthenticated(true);
        setLoading(false);
      });
  }, [selected]);

  const selectedPatient = patients.find((p) => p.id === selected);

  /* Group timeline entries by year+month, newest first. Events within each
     month are also sorted newest first so the reader scans most recent → oldest. */
  const timelineGroups = useMemo(() => {
    const dated = timeline.filter((e) => !!e.date);
    const undated = timeline.filter((e) => !e.date);
    dated.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

    const groups: { key: string; label: string; items: TimelineEntry[] }[] = [];
    for (const entry of dated) {
      const d = new Date(entry.date);
      if (Number.isNaN(d.getTime())) continue;
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(
        2,
        "0",
      )}`;
      const existing = groups.find((g) => g.key === key);
      if (existing) {
        existing.items.push(entry);
      } else {
        groups.push({
          key,
          label: d.toLocaleString("en-US", {
            month: "long",
            year: "numeric",
            timeZone: "UTC",
          }),
          items: [entry],
        });
      }
    }
    if (undated.length) {
      groups.push({ key: "undated", label: "Undated", items: undated });
    }
    return groups;
  }, [timeline]);

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <div className="max-w-4xl mx-auto px-6 py-10">
        <PageIntro
          title="Patient Journey"
          icon={Activity}
          description="View individual FHIR R4 clinical events mapped to OMOP CDM concepts. Select a patient to see their encounters, conditions, observations, medications, and procedures in chronological order."
          prevStep={{ href: "/catalog", label: "Dataset Catalog" }}
          nextStep={{ href: "/analytics", label: "OMOP Analytics" }}
          infoText="Patient data is generated by Synthea and loaded into Neo4j as FHIR R4 resources. The OMOP CDM mapping (Layer 4) enables cross-site cohort analysis under EHDS Art. 53."
          docLink={{ href: "/docs/architecture", label: "Architecture Docs" }}
        />

        {unauthenticated ? (
          <SignInRequired description="The Patient Journey view is restricted to authenticated users. Sign in with one of the demo personas to explore FHIR R4 clinical timelines mapped to OMOP CDM concepts." />
        ) : (
          <>
            {/* Cohort metric orb cards — Stitch patient_dashboard_day bento */}
            {stats && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
                <MetricCard
                  label="Patients"
                  value={stats.patients}
                  isOrb
                  icon={<Heart size={20} className="text-white" />}
                  sub="Synthea cohort"
                />
                <MetricCard
                  label="Encounters"
                  value={stats.encounters}
                  icon={<Stethoscope size={18} />}
                />
                <MetricCard
                  label="Conditions"
                  value={stats.conditions}
                  icon={<Activity size={18} />}
                />
                <MetricCard
                  label="Observations"
                  value={stats.observations}
                  icon={<FlaskConical size={18} />}
                />
                <MetricCard
                  label="Medications"
                  value={stats.medications}
                  icon={<Pill size={18} />}
                />
                <MetricCard
                  label="Procedures"
                  value={stats.procedures}
                  icon={<Scissors size={18} />}
                />
              </div>
            )}

            {/* Patient selector */}
            {restricted ? (
              <div className="mb-4 px-4 py-3 bg-[var(--role-patient-bg)] border border-[var(--role-patient-border)] rounded-xl text-sm text-[var(--role-patient-text)] flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[var(--role-patient-text)] inline-block animate-pulse" />
                Showing your personal health record (EHDS Art. 3 / GDPR Art. 15)
              </div>
            ) : (
              <div className="mb-6">
                <label className="section-label block">
                  Select patient
                  <select
                    value={selected}
                    onChange={(e) => setSelected(e.target.value)}
                    className="mt-1 px-3 py-2.5 bg-[var(--surface-card)] border border-[var(--border-ui)] rounded-xl text-sm outline-none focus:border-[var(--accent)] w-full text-[var(--text-primary)] block"
                  >
                    <option value="">
                      — select patient ({patients.length} loaded) —
                    </option>
                    {patients.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name ?? p.id}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}

            {/* Patient demographics header */}
            {selectedPatient && (
              <div className="surface-card p-4 mb-6 flex items-center gap-6 border border-[var(--border)]">
                <div className="metric-orb shrink-0">
                  <Users size={20} className="text-white" />
                </div>
                <div className="flex gap-6 flex-wrap text-sm">
                  <div>
                    <p className="section-label mb-0.5">Name</p>
                    <p className="font-semibold text-[var(--text-primary)]">
                      {selectedPatient.name ?? selectedPatient.id}
                    </p>
                  </div>
                  <div>
                    <p className="section-label mb-0.5">Gender</p>
                    <p className="font-semibold text-[var(--text-primary)]">
                      {selectedPatient.gender ?? "—"}
                    </p>
                  </div>
                  <div>
                    <p className="section-label mb-0.5">Born</p>
                    <p className="font-semibold text-[var(--text-primary)]">
                      {selectedPatient.birthDate ?? "—"}
                    </p>
                  </div>
                  <div>
                    <p className="section-label mb-0.5">Events</p>
                    <p className="font-semibold text-[var(--text-primary)]">
                      {timeline.length}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {loading && (
              <p className="text-[var(--text-secondary)] text-sm">Loading…</p>
            )}

            {!loading && selected && timeline.length === 0 && (
              <p className="text-[var(--text-secondary)] text-sm">
                No timeline events found for this patient.
              </p>
            )}

            {/* Clinical timeline — grouped by year+month, newest first */}
            {timeline.length > 0 && (
              <div>
                <div className="flex items-baseline justify-between mb-4">
                  <p className="section-label">Clinical timeline</p>
                  <p className="text-xs text-[var(--text-secondary)]">
                    Newest first
                  </p>
                </div>
                {timelineGroups.map((group) => (
                  <section key={group.key} className="mb-6 last:mb-0">
                    <h3 className="text-sm font-bold text-[var(--text-primary)] mb-3 pb-1 border-b border-[var(--border)] uppercase tracking-wider">
                      {group.label}
                      <span className="ml-2 text-xs font-normal text-[var(--text-secondary)] normal-case tracking-normal">
                        {group.items.length}{" "}
                        {group.items.length === 1 ? "event" : "events"}
                      </span>
                    </h3>
                    <ol className="activity-timeline space-y-5 pl-8">
                      {group.items.map((e, i) => {
                        const token = FHIR_TYPE_TOKENS[e.fhirType];
                        return (
                          <li key={`${group.key}-${i}`} className="relative">
                            {/* Timeline dot */}
                            <span
                              className="absolute -left-[1.75rem] top-1 w-3.5 h-3.5 rounded-full border-2 border-[var(--surface-card)] z-10"
                              style={{
                                background:
                                  token?.text ?? "var(--text-secondary)",
                              }}
                            />
                            <div className="surface-card p-4 border border-[var(--border)] hover:shadow-md transition-shadow">
                              <div className="flex items-start justify-between gap-3 mb-1">
                                <div className="flex items-center gap-2">
                                  {/* FHIR type badge */}
                                  <span
                                    className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
                                    style={{
                                      color:
                                        token?.text ?? "var(--text-secondary)",
                                      background:
                                        token?.bg ?? "var(--surface-2)",
                                    }}
                                  >
                                    {token?.icon}
                                    {e.fhirType}
                                  </span>
                                  <span className="text-xs text-[var(--text-secondary)]">
                                    {e.date ?? "—"}
                                  </span>
                                </div>
                              </div>
                              <p className="text-sm font-medium text-[var(--text-primary)]">
                                {e.display || (
                                  <span className="font-mono text-xs text-[var(--text-secondary)]">
                                    {e.fhirId}
                                  </span>
                                )}
                              </p>
                              {e.omopType && (
                                <p className="text-xs text-[var(--layer4-text)] mt-1">
                                  ↳ OMOP {e.omopType}: {e.omopId}
                                </p>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                  </section>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
