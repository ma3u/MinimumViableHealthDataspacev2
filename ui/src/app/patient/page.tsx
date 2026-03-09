"use client";

import { useEffect, useState } from "react";

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

const FHIR_COLORS: Record<string, string> = {
  Encounter: "#2471A3",
  Condition: "#148F77",
  Observation: "#1E8449",
  MedicationRequest: "#CA6F1E",
  Procedure: "#7D3C98",
};

function StatBadge({ label, value }: { label: string; value?: number }) {
  return (
    <div className="bg-gray-800 rounded px-3 py-2 text-center">
      <div className="text-lg font-semibold text-white">
        {value != null ? value.toLocaleString() : "—"}
      </div>
      <div className="text-xs text-gray-400 mt-0.5">{label}</div>
    </div>
  );
}

export default function PatientPage() {
  const [patients, setPatients] = useState<PatientListItem[]>([]);
  const [stats, setStats] = useState<CohortStats | null>(null);
  const [selected, setSelected] = useState<string>("");
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Load patient list + cohort stats on mount
  useEffect(() => {
    fetch("/api/patient")
      .then((r) => r.json())
      .then((d) => {
        setPatients(d.patients ?? []);
        setStats(d.stats ?? null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Load timeline when patient changes
  useEffect(() => {
    if (!selected) return;
    setLoading(true);
    fetch(`/api/patient?patientId=${encodeURIComponent(selected)}`)
      .then((r) => r.json())
      .then((d) => {
        setTimeline(d.timeline ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [selected]);

  const selectedPatient = patients.find((p) => p.id === selected);

  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      <h1 className="text-2xl font-bold mb-1">Patient Journey</h1>
      <p className="text-gray-400 text-sm mb-6">
        FHIR R4 clinical events mapped to OMOP CDM
      </p>

      {/* Cohort stats */}
      {stats && (
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-8">
          <StatBadge label="Patients" value={stats.patients} />
          <StatBadge label="Encounters" value={stats.encounters} />
          <StatBadge label="Conditions" value={stats.conditions} />
          <StatBadge label="Observations" value={stats.observations} />
          <StatBadge label="Medications" value={stats.medications} />
          <StatBadge label="Procedures" value={stats.procedures} />
        </div>
      )}

      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        className="mb-4 px-3 py-2 bg-gray-800 border border-gray-600 rounded text-sm outline-none focus:border-layer3 w-full"
      >
        <option value="">— select patient ({patients.length} loaded) —</option>
        {patients.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name ?? p.id}
          </option>
        ))}
      </select>

      {/* Patient demographics */}
      {selectedPatient && (
        <div className="flex gap-4 text-xs text-gray-400 mb-6">
          <span>
            <span className="text-gray-500">Gender:</span>{" "}
            {selectedPatient.gender ?? "—"}
          </span>
          <span>
            <span className="text-gray-500">Born:</span>{" "}
            {selectedPatient.birthDate ?? "—"}
          </span>
          <span>
            <span className="text-gray-500">Events:</span> {timeline.length}
          </span>
        </div>
      )}

      {loading && <p className="text-gray-500">Loading…</p>}

      {!loading && selected && timeline.length === 0 && (
        <p className="text-gray-500">
          No timeline events found for this patient.
        </p>
      )}

      {timeline.length > 0 && (
        <ol className="relative border-l border-gray-700 space-y-6 pl-6">
          {timeline.map((e, i) => (
            <li key={i} className="relative">
              <span
                className="absolute -left-[25px] w-4 h-4 rounded-full border-2 border-gray-950"
                style={{
                  background: FHIR_COLORS[e.fhirType] ?? "#888",
                }}
              />
              <div className="text-xs text-gray-500 mb-0.5">
                {e.date ?? "—"}
              </div>
              <div className="font-medium text-sm">
                <span style={{ color: FHIR_COLORS[e.fhirType] ?? "#888" }}>
                  {e.fhirType}
                </span>{" "}
                {e.display ? (
                  <span className="text-gray-200">{e.display}</span>
                ) : (
                  <span className="text-gray-500 font-mono text-xs">
                    {e.fhirId}
                  </span>
                )}
              </div>
              {e.omopType && (
                <div className="text-xs text-layer4 mt-0.5">
                  ↳ OMOP {e.omopType}: {e.omopId}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
