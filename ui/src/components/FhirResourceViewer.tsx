"use client";

import { useState, useCallback } from "react";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Activity,
  User,
  Stethoscope,
  FlaskConical,
  Pill,
  Syringe,
  FileText,
  Heart,
  Scissors,
  ClipboardList,
  AlertTriangle,
  X,
} from "lucide-react";

/* ── Types ─────────────────────────────────────── */

interface FhirResource {
  resourceType: string;
  id?: string;
  [key: string]: unknown;
}

interface BundleEntry {
  fullUrl?: string;
  resource: FhirResource;
}

interface FhirBundle {
  resourceType: "Bundle";
  id?: string;
  type?: string;
  total?: number;
  entry?: BundleEntry[];
}

interface FhirResourceViewerProps {
  bundle: FhirBundle;
  title?: string;
  onClose?: () => void;
}

/* ── Resource type icons & colors ─────────────── */

const RESOURCE_META: Record<
  string,
  { icon: typeof Activity; color: string; label: string }
> = {
  Patient: { icon: User, color: "var(--fhir-patient)", label: "Patients" },
  Encounter: {
    icon: Stethoscope,
    color: "var(--fhir-encounter)",
    label: "Encounters",
  },
  Condition: {
    icon: Heart,
    color: "var(--fhir-condition)",
    label: "Conditions",
  },
  Observation: {
    icon: FlaskConical,
    color: "var(--fhir-observation)",
    label: "Observations",
  },
  MedicationRequest: {
    icon: Pill,
    color: "var(--fhir-medication)",
    label: "Medications",
  },
  Procedure: {
    icon: Scissors,
    color: "var(--fhir-procedure)",
    label: "Procedures",
  },
  Immunization: {
    icon: Syringe,
    color: "var(--fhir-immunization)",
    label: "Immunizations",
  },
  DiagnosticReport: {
    icon: FileText,
    color: "var(--fhir-diagnostic)",
    label: "Diagnostic Reports",
  },
  AllergyIntolerance: {
    icon: AlertTriangle,
    color: "var(--fhir-allergy)",
    label: "Allergies",
  },
  CarePlan: {
    icon: ClipboardList,
    color: "var(--fhir-careplan)",
    label: "Care Plans",
  },
};

const DEFAULT_META = {
  icon: Activity,
  color: "var(--text-secondary)",
  label: "Resources",
};

/* ── Helpers ───────────────────────────────────── */

function getResourceDisplayName(r: FhirResource): string {
  const rt = r.resourceType;
  if (rt === "Patient") {
    const names = r.name as Array<{ given?: string[]; family?: string }>;
    if (names?.[0]) {
      return `${(names[0].given ?? []).join(" ")} ${
        names[0].family ?? ""
      }`.trim();
    }
  }
  if (rt === "Condition" || rt === "Procedure") {
    const cc = r.code as {
      text?: string;
      coding?: Array<{ display?: string }>;
    };
    return cc?.text ?? cc?.coding?.[0]?.display ?? r.id ?? "—";
  }
  if (rt === "Observation") {
    const cc = r.code as {
      text?: string;
      coding?: Array<{ display?: string }>;
    };
    return cc?.text ?? cc?.coding?.[0]?.display ?? r.id ?? "—";
  }
  if (rt === "MedicationRequest") {
    const med = r.medicationCodeableConcept as {
      text?: string;
      coding?: Array<{ display?: string }>;
    };
    return med?.text ?? med?.coding?.[0]?.display ?? r.id ?? "—";
  }
  if (rt === "Encounter") {
    const t = r.type as Array<{ text?: string }>;
    return t?.[0]?.text ?? r.id ?? "—";
  }
  if (rt === "Immunization") {
    const vc = r.vaccineCode as {
      text?: string;
      coding?: Array<{ display?: string }>;
    };
    return vc?.text ?? vc?.coding?.[0]?.display ?? r.id ?? "—";
  }
  if (rt === "DiagnosticReport") {
    const cc = r.code as {
      text?: string;
      coding?: Array<{ display?: string }>;
    };
    return cc?.text ?? cc?.coding?.[0]?.display ?? r.id ?? "—";
  }
  if (rt === "AllergyIntolerance") {
    const cc = r.code as {
      text?: string;
      coding?: Array<{ display?: string }>;
    };
    return cc?.text ?? cc?.coding?.[0]?.display ?? r.id ?? "—";
  }
  if (rt === "CarePlan") {
    return (r.title as string) ?? r.id ?? "—";
  }
  return r.id ?? "—";
}

function getResourceDate(r: FhirResource): string | null {
  const candidates = [
    r.effectiveDateTime,
    r.recordedDate,
    r.onsetDateTime,
    r.occurrenceDateTime,
    r.authoredOn,
    r.period && (r.period as { start?: string }).start,
    r.birthDate,
  ] as (string | undefined)[];
  const d = candidates.find(Boolean);
  return d ? String(d).slice(0, 10) : null;
}

function getObservationValue(r: FhirResource): string | null {
  if (r.resourceType !== "Observation") return null;
  const vq = r.valueQuantity as { value?: number; unit?: string };
  if (vq?.value != null) {
    return `${Number(vq.value).toFixed(1)} ${vq.unit ?? ""}`.trim();
  }
  const vcc = r.valueCodeableConcept as { text?: string };
  if (vcc?.text) return vcc.text;
  return null;
}

/* ── Sub-components ────────────────────────────── */

function ResourceDetail({ resource }: { resource: FhirResource }) {
  const [copied, setCopied] = useState(false);
  const copyJson = useCallback(() => {
    navigator.clipboard.writeText(JSON.stringify(resource, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [resource]);

  const meta = RESOURCE_META[resource.resourceType] ?? DEFAULT_META;
  const skipKeys = new Set(["resourceType", "id", "meta", "text"]);
  const entries = Object.entries(resource).filter(([k]) => !skipKeys.has(k));

  return (
    <div className="bg-[var(--surface-2)]/50 rounded-lg p-3 space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ background: meta.color }}
          />
          <span className="text-xs font-semibold text-[var(--text-primary)]">
            {resource.resourceType}/{resource.id ?? "?"}
          </span>
        </div>
        <button
          onClick={copyJson}
          className="flex items-center gap-1 text-[10px] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        >
          <Copy size={10} />
          {copied ? "Copied!" : "JSON"}
        </button>
      </div>
      {/* Key-value pairs */}
      <div className="space-y-1">
        {entries.map(([key, val]) => (
          <div key={key} className="flex gap-2 text-xs">
            <span className="text-[var(--layer1-text)] shrink-0 w-40 truncate">
              {key}
            </span>
            <span className="text-[var(--text-primary)] break-all truncate">
              {typeof val === "string"
                ? val
                : typeof val === "number" || typeof val === "boolean"
                  ? String(val)
                  : JSON.stringify(val)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ResourceGroup({
  resourceType,
  resources,
}: {
  resourceType: string;
  resources: FhirResource[];
}) {
  const [expanded, setExpanded] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const meta = RESOURCE_META[resourceType] ?? DEFAULT_META;
  const Icon = meta.icon;

  return (
    <div className="border border-[var(--border)] rounded-lg overflow-hidden">
      <button
        onClick={() => {
          setExpanded(!expanded);
          setSelectedIdx(null);
        }}
        className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-[var(--surface-2)]/50"
      >
        {expanded ? (
          <ChevronDown size={14} className="text-[var(--text-secondary)]" />
        ) : (
          <ChevronRight size={14} className="text-[var(--text-secondary)]" />
        )}
        <Icon size={14} style={{ color: meta.color }} />
        <span className="text-sm font-medium" style={{ color: meta.color }}>
          {meta.label}
        </span>
        <span className="text-xs text-[var(--text-secondary)] ml-auto">
          {resources.length} resource{resources.length !== 1 ? "s" : ""}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-[var(--border)]">
          {/* Resource list */}
          <div className="divide-y divide-gray-800">
            {resources.map((r, i) => {
              const display = getResourceDisplayName(r);
              const date = getResourceDate(r);
              const value = getObservationValue(r);
              const isSelected = selectedIdx === i;

              return (
                <div key={r.id ?? i}>
                  <button
                    onClick={() => setSelectedIdx(isSelected ? null : i)}
                    className={`w-full text-left px-4 py-2 flex items-center gap-3 text-xs transition-colors ${
                      isSelected
                        ? "bg-[var(--surface-2)]"
                        : "hover:bg-[var(--surface-2)]/40"
                    }`}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ background: meta.color }}
                    />
                    <span className="text-[var(--text-primary)] flex-1 truncate">
                      {display}
                    </span>
                    {value && (
                      <span className="text-cyan-400 font-mono shrink-0">
                        {value}
                      </span>
                    )}
                    {date && (
                      <span className="text-[var(--text-secondary)] shrink-0">
                        {date}
                      </span>
                    )}
                    {isSelected ? (
                      <ChevronDown
                        size={12}
                        className="text-[var(--text-secondary)]"
                      />
                    ) : (
                      <ChevronRight
                        size={12}
                        className="text-[var(--text-secondary)]"
                      />
                    )}
                  </button>
                  {isSelected && (
                    <div className="px-4 pb-3">
                      <ResourceDetail resource={r} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Main component ────────────────────────────── */

export default function FhirResourceViewer({
  bundle,
  title,
  onClose,
}: FhirResourceViewerProps) {
  // Group entries by resource type
  const grouped: Record<string, FhirResource[]> = {};
  for (const entry of bundle.entry ?? []) {
    const rt = entry.resource?.resourceType;
    if (!rt) continue;
    if (!grouped[rt]) grouped[rt] = [];
    grouped[rt].push(entry.resource);
  }

  // Ordered resource types
  const typeOrder = [
    "Patient",
    "Encounter",
    "Condition",
    "Observation",
    "MedicationRequest",
    "Procedure",
    "Immunization",
    "DiagnosticReport",
    "AllergyIntolerance",
    "CarePlan",
  ];
  const orderedTypes = [
    ...typeOrder.filter((t) => grouped[t]),
    ...Object.keys(grouped).filter((t) => !typeOrder.includes(t)),
  ];

  const totalResources = bundle.entry?.length ?? 0;

  return (
    <div className="border border-layer3 rounded-xl overflow-hidden bg-[var(--surface)]/80">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-layer3/10 border-b border-layer3/30">
        <div className="flex items-center gap-2">
          <Activity size={14} className="text-green-800 dark:text-green-300" />
          <span className="text-sm font-semibold text-green-800 dark:text-green-300">
            {title ?? "FHIR Resource Viewer"}
          </span>
          <span className="text-xs text-[var(--text-secondary)]">
            {totalResources} resources · {orderedTypes.length} types
          </span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Synthetic data notice */}
      <div className="px-4 py-2 bg-amber-950/60 border-b border-amber-700/50 flex items-center gap-2 text-xs text-amber-300">
        <AlertTriangle size={12} className="shrink-0" />
        <span>
          <strong>Synthea Synthetic Data</strong> — algorithmically generated
          patients, not real individuals. No pseudonymisation required.
        </span>
      </div>

      {/* Bundle info bar */}
      <div className="px-4 py-2 border-b border-[var(--border)] flex flex-wrap gap-4 text-xs text-[var(--text-secondary)]">
        <span>
          Bundle ID:{" "}
          <span className="text-[var(--text-primary)]">{bundle.id ?? "—"}</span>
        </span>
        <span>
          Type:{" "}
          <span className="text-[var(--text-primary)]">
            {bundle.type ?? "—"}
          </span>
        </span>
        <span>
          Total:{" "}
          <span className="text-[var(--text-primary)]">{totalResources}</span>
        </span>
      </div>

      {/* Resource type summary */}
      <div className="px-4 py-3 border-b border-[var(--border)]">
        <div className="flex flex-wrap gap-2">
          {orderedTypes.map((rt) => {
            const meta = RESOURCE_META[rt] ?? DEFAULT_META;
            return (
              <span
                key={rt}
                className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
                style={{
                  background: `${meta.color}20`,
                  color: meta.color,
                }}
              >
                {rt} ({grouped[rt].length})
              </span>
            );
          })}
        </div>
      </div>

      {/* Resource groups */}
      <div className="p-4 space-y-2 max-h-[500px] overflow-y-auto">
        {orderedTypes.map((rt) => (
          <ResourceGroup key={rt} resourceType={rt} resources={grouped[rt]} />
        ))}
      </div>
    </div>
  );
}
