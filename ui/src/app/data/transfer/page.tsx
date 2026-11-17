"use client";
import Link from "next/link";

import { fetchApi } from "@/lib/api";
import { didToName } from "@/lib/participant-name";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowRightLeft,
  Box,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Copy,
  Download,
  FileJson2,
  Loader2,
  Play,
  RefreshCw,
  X,
  XCircle,
  Network,
} from "lucide-react";
import PageIntro from "@/components/PageIntro";
import RowSourceBadge from "@/components/RowSourceBadge";
import TransferDetails from "@/components/TransferDetails";
import SpeImport from "@/components/SpeImport";
import {
  closedAfterImportInto,
  closedAfterImportReason,
  importViewUrl,
  type ExistingImport,
} from "@/lib/spe-import";
import type { RowSource } from "@/lib/row-provenance";
import { T, useT } from "@/lib/i18n/translate";
import { DEFAULT_PAGE_SIZE } from "@/lib/list-page";

/* ── Types ── */

interface Transfer {
  "@id": string;
  state?: string;
  "edc:state"?: string;
  type?: string;
  "edc:type"?: string;
  stateTimestamp?: number;
  "edc:stateTimestamp"?: number;
  contractId?: string;
  "edc:contractId"?: string;
  transferType?: string;
  assetId?: string;
  [key: string]: unknown;
}

interface Agreement {
  "@id": string;
  assetId?: string;
  "edc:assetId"?: string;
  counterPartyId?: string;
  counterPartyAddress?: string;
  [key: string]: unknown;
}

interface ParticipantCtx {
  "@id": string;
  identity: string;
  displayName?: string;
  role?: string;
}

/* ── Helpers ── */

/**
 * Where a contract stands for the data user (#876, #894): one list, one row
 * per agreement, instead of the agreements, My data and the transfer
 * processes as three lists of the same things.
 */
type Stage = "agreed" | "progress" | "ready" | "imported" | "done";

/** The filter chips, in the order a contract goes through. */
const STAGE_ORDER: Stage[] = [
  "agreed",
  "progress",
  "ready",
  "imported",
  "done",
];

const STAGE_LABEL: Record<Stage, string> = {
  agreed: "Ready to transfer",
  progress: "Transfer in progress",
  ready: "Data ready",
  imported: "In an SPE",
  done: "Transfer completed",
};

const STAGE_STYLE: Record<Stage, string> = {
  agreed:
    "bg-(--role-user-bg) text-(--role-user-text) border border-(--role-user-border)",
  progress:
    "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 border border-yellow-400/40",
  ready:
    "bg-teal-100 dark:bg-teal-900/30 text-teal-800 dark:text-teal-300 border border-teal-500/40",
  imported:
    "bg-violet-100 dark:bg-violet-900/30 text-violet-800 dark:text-violet-300 border border-violet-500/40",
  done: "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-(--border)",
};

/** A date and time in the reader's locale. */
function when(v: number | string): string {
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/** No import known for a transfer: one shared array, so a row does not refetch. */
const NO_IMPORTS: ExistingImport[] = [];

/** Read a transfer/agreement field that may be edc:-prefixed or unprefixed */
function f(obj: Record<string, unknown>, field: string): string {
  return (obj[field] ?? obj[`edc:${field}`] ?? "") as string;
}

/** Pretty-print an asset ID as a title */
function assetLabel(id: string): string {
  return id.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function displayParticipant(p: ParticipantCtx): string {
  if (p.displayName) return p.displayName;
  return didToName(p.identity || p["@id"]);
}

/**
 * DSP Transfer Process state machine (Signalling Protocol).
 * @see https://eclipse-dataspace-protocol-base.github.io/DataspaceProtocol/2025-1/#transfer-protocol
 *
 * Consumer states: REQUESTED → STARTED → SUSPENDED → COMPLETED | TERMINATED
 */
const DSP_STATES = ["REQUESTED", "STARTED", "SUSPENDED", "COMPLETED"] as const;

type DspState = (typeof DSP_STATES)[number] | "TERMINATED" | string;

function stateIndex(state: DspState): number {
  const s = state?.toUpperCase() || "";
  if (s.includes("TERMINATED")) return -1; // error path
  const idx = DSP_STATES.findIndex((ds) => s.includes(ds));
  return idx;
}

function stateColor(state: DspState) {
  const s = state?.toUpperCase() || "";
  if (s.includes("COMPLETED")) return "text-(--role-user-text)";
  if (s.includes("TERMINATED") || s.includes("ERROR"))
    return "text-(--role-admin-text)";
  if (s.includes("STARTED")) return "text-(--role-holder-text)";
  if (s.includes("SUSPENDED")) return "text-(--role-hdab-text)";
  return "text-(--role-hdab-text)";
}

function stateBg(state: DspState) {
  const s = state?.toUpperCase() || "";
  if (s.includes("COMPLETED"))
    return "bg-(--role-user-bg) text-(--role-user-text) border border-(--role-user-border)";
  if (s.includes("TERMINATED") || s.includes("ERROR")) {
    return "bg-(--role-admin-bg) text-(--role-admin-text) border border-(--role-admin-border)";
  }
  if (s.includes("STARTED"))
    return "bg-(--role-holder-bg) text-(--role-holder-text) border border-(--role-holder-border)";
  if (s.includes("SUSPENDED"))
    return "bg-(--role-hdab-bg) text-(--role-hdab-text) border border-(--role-hdab-border)";
  return "bg-(--role-hdab-bg) text-(--role-hdab-text) border border-(--role-hdab-border)";
}

/* ── DSP Pipeline Stepper ── */

function DspPipeline({
  state,
  closedInto = null,
}: {
  state: DspState;
  /** The SPE the hub closed the transfer for, once its data was imported. */
  closedInto?: string | null;
}) {
  const t = useT("research");
  // Terminated by the hub after the import: requested, started, then closed
  // with the data in the SPE. Not a failure, so not drawn as one.
  if (closedInto) {
    return (
      <div
        data-testid="pipeline-closed-after-import"
        className="flex items-center gap-0.5 w-full"
      >
        {["REQUESTED", "STARTED"].map((step) => (
          <div key={step} className="flex items-center flex-1 min-w-0">
            <div className="flex flex-col items-center gap-0.5">
              <CheckCircle2 size={14} className="text-(--role-user-text)" />
              <span className="text-[10px] text-(--role-user-text) whitespace-nowrap">
                {step}
              </span>
            </div>
            <div className="flex-1 h-px mx-1 bg-green-700" />
          </div>
        ))}
        <div className="flex flex-col items-center gap-0.5">
          <CheckCircle2 size={14} className="text-(--role-user-text)" />
          <span className="text-[10px] text-(--role-user-text) whitespace-nowrap">
            {t("CLOSED AFTER IMPORT INTO {spe}", { spe: closedInto })}
          </span>
        </div>
      </div>
    );
  }
  const current = stateIndex(state);
  const isTerminated =
    state?.toUpperCase().includes("TERMINATED") ||
    state?.toUpperCase().includes("ERROR");

  return (
    <div className="flex items-center gap-0.5 w-full">
      {DSP_STATES.map((step, i) => {
        const isActive = i === current;
        const isPast = current >= 0 && i < current;
        const isFuture = current >= 0 && i > current;

        let icon;
        let color = "text-(--text-secondary)";
        if (isTerminated && i === 0) {
          // Show error on first uncompleted step
          icon = <XCircle size={14} className="text-(--role-admin-text)" />;
          color = "text-(--role-admin-text)";
        } else if (isPast) {
          icon = <CheckCircle2 size={14} className="text-(--role-user-text)" />;
          color = "text-(--role-user-text)";
        } else if (isActive) {
          if (step === "COMPLETED") {
            icon = (
              <CheckCircle2 size={14} className="text-(--role-user-text)" />
            );
            color = "text-(--role-user-text)";
          } else {
            icon = (
              <div className="relative">
                <Circle size={14} className={stateColor(state)} />
                <div
                  className={`absolute inset-0 animate-ping rounded-full ${stateColor(
                    state,
                  )} opacity-30`}
                  style={{ width: 14, height: 14 }}
                />
              </div>
            );
            color = stateColor(state);
          }
        } else if (isFuture) {
          icon = <Circle size={14} className="text-gray-600" />;
        } else {
          icon = <Circle size={14} className="text-gray-600" />;
        }

        return (
          <div key={step} className="flex items-center flex-1 min-w-0">
            <div className="flex flex-col items-center gap-0.5">
              {icon}
              <span className={`text-[10px] ${color} whitespace-nowrap`}>
                {step}
              </span>
            </div>
            {i < DSP_STATES.length - 1 && (
              <div
                className={`flex-1 h-px mx-1 ${
                  isPast ? "bg-green-700" : "bg-gray-700"
                }`}
              />
            )}
          </div>
        );
      })}
      {isTerminated && (
        <div className="flex flex-col items-center gap-0.5 ml-1">
          <XCircle size={14} className="text-(--role-admin-text)" />
          <span className="text-[10px] text-(--role-admin-text)">
            TERMINATED
          </span>
        </div>
      )}
    </div>
  );
}

/* ── FHIR Bundle Types ── */

interface FhirBundleEntry {
  fullUrl?: string;
  resource: { resourceType: string; id?: string; [key: string]: unknown };
  search?: { mode?: string };
}

interface FhirBundle {
  resourceType: "Bundle";
  id?: string;
  type: string;
  total: number;
  meta?: { lastUpdated?: string };
  link?: { relation: string; url: string }[];
  entry?: FhirBundleEntry[];
}

/** What GET /api/transfers/[id]/data answers (#876). */
interface LiveData {
  bytes: number;
  truncated: boolean;
  fetchedAt: string;
  data: unknown;
}

/** A transfer whose access is open on the connector: its data can be read. */
function isLiveTransfer(tr: Transfer): boolean {
  return (
    tr.source === "controlplane" &&
    f(tr as Record<string, unknown>, "state").toUpperCase() === "STARTED"
  );
}

/** A transfer the hub terminated once its data was in an SPE. */
function isClosedAfterImport(tr: Transfer): boolean {
  return (
    tr.source === "controlplane" &&
    !!closedAfterImportInto(f(tr as Record<string, unknown>, "errorDetail"))
  );
}

/** States in which a transfer stays until someone acts: nothing to wait for. */
const SETTLED_STATES = [
  "STARTED",
  "SUSPENDED",
  "COMPLETED",
  "TERMINATED",
  "DEPROVISIONED",
];

/**
 * A connector's transfer still on its way, INITIAL or REQUESTED: the page
 * reloads it until it settles, or "Waiting for the provider" stays on a
 * transfer that has long started.
 */
function isSettling(tr: Transfer): boolean {
  return (
    tr.source === "controlplane" &&
    !SETTLED_STATES.includes(
      f(tr as Record<string, unknown>, "state").toUpperCase(),
    )
  );
}

/** How often, and for how long, a settling transfer is reloaded. */
const SETTLING_POLL_MS = 3000;
const SETTLING_POLL_LIMIT = 40;

/** FHIR data as a bundle for the viewer: a Bundle, a list or one resource. */
function toBundle(data: unknown): FhirBundle | null {
  const isResource = (r: unknown) =>
    !!r && typeof r === "object" && "resourceType" in (r as object);
  if (isResource(data) && (data as FhirBundle).resourceType === "Bundle") {
    return data as FhirBundle;
  }
  const list = Array.isArray(data) ? data : isResource(data) ? [data] : null;
  if (!list || !list.every(isResource)) return null;
  return {
    resourceType: "Bundle",
    type: "collection",
    total: list.length,
    entry: list.map((resource) => ({
      resource: resource as FhirBundleEntry["resource"],
    })),
  };
}

interface DataPayload {
  resourceType: string;
  type: string;
  total: number;
  containedResourceTypes?: string[];
  link?: { relation: string; url: string }[];
  provider?: string;
  transferredAt?: string;
  sizeBytes?: number;
}

/* ── FHIR Resource colors ── */
const FHIR_RESOURCE_COLORS: Record<string, string> = {
  Patient:
    "bg-(--role-holder-bg) text-(--role-holder-text) border-(--role-holder-border)",
  Observation:
    "bg-(--role-trust-bg) text-(--role-trust-text) border-(--role-trust-border)",
  Condition:
    "bg-(--role-hdab-bg) text-(--role-hdab-text) border-(--role-hdab-border)",
  Encounter:
    "bg-(--role-user-bg) text-(--role-user-text) border-(--role-user-border)",
  MedicationRequest:
    "bg-(--role-admin-bg) text-(--role-admin-text) border-(--role-admin-border)",
  DiagnosticReport:
    "bg-(--role-trust-bg) text-(--role-trust-text) border-(--role-trust-border)",
  Immunization:
    "bg-(--role-patient-bg) text-(--role-patient-text) border-(--role-patient-border)",
  AllergyIntolerance:
    "bg-(--role-admin-bg) text-(--role-admin-text) border-(--role-admin-border)",
  Procedure:
    "bg-(--role-patient-bg) text-(--role-patient-text) border-(--role-patient-border)",
  CarePlan:
    "bg-(--role-user-bg) text-(--role-user-text) border-(--role-user-border)",
};

function fhirColor(type: string): string {
  return (
    FHIR_RESOURCE_COLORS[type] ||
    "bg-(--surface-2) text-(--text-primary) border-gray-600"
  );
}

/* ── Collapsible JSON Tree ── */

function JsonNode({ data, depth = 0 }: { data: unknown; depth?: number }) {
  const [collapsed, setCollapsed] = useState(depth > 1);

  if (data === null || data === undefined) {
    return <span className="text-(--text-secondary)">null</span>;
  }
  if (typeof data === "boolean") {
    return <span className="text-(--role-hdab-text)">{String(data)}</span>;
  }
  if (typeof data === "number") {
    return <span className="text-(--role-holder-text)">{data}</span>;
  }
  if (typeof data === "string") {
    return <span className="text-(--role-user-text)">&quot;{data}&quot;</span>;
  }

  if (Array.isArray(data)) {
    if (data.length === 0)
      return <span className="text-(--text-secondary)">[]</span>;
    return (
      <span>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="text-(--text-secondary) hover:text-(--text-primary) inline-flex items-center"
        >
          {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
          <span className="text-(--text-secondary) text-xs ml-0.5">
            [{data.length}]
          </span>
        </button>
        {!collapsed && (
          <div className="ml-4 border-l border-(--border) pl-2">
            {data.map((item, i) => (
              <div key={i}>
                <span className="text-gray-600 text-xs mr-1">{i}:</span>
                <JsonNode data={item} depth={depth + 1} />
              </div>
            ))}
          </div>
        )}
      </span>
    );
  }

  if (typeof data === "object") {
    const entries = Object.entries(data as Record<string, unknown>);
    if (entries.length === 0) {
      return <span className="text-(--text-secondary)">{"{}"}</span>;
    }
    return (
      <span>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="text-(--text-secondary) hover:text-(--text-primary) inline-flex items-center"
        >
          {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
          <span className="text-(--text-secondary) text-xs ml-0.5">
            {"{"}
            {entries.length}
            {"}"}
          </span>
        </button>
        {!collapsed && (
          <div className="ml-4 border-l border-(--border) pl-2">
            {entries.map(([key, val]) => (
              <div key={key}>
                <span className="text-(--accent)">{key}</span>
                <span className="text-(--text-secondary)">: </span>
                <JsonNode data={val} depth={depth + 1} />
              </div>
            ))}
          </div>
        )}
      </span>
    );
  }

  return <span>{String(data)}</span>;
}

/* ── FHIR Resource Card ── */

function FhirResourceCard({ entry }: { entry: FhirBundleEntry }) {
  const [expanded, setExpanded] = useState(false);
  const r = entry.resource;
  const type = r.resourceType;

  // Build summary line based on resource type
  let summary = "";
  if (type === "Patient") {
    const name = (r.name as Array<{ given?: string[]; family?: string }>)?.[0];
    summary = name
      ? `${name.given?.[0] || ""} ${name.family || ""}`.trim()
      : r.id || "";
  } else if (type === "Observation") {
    const code = (r.code as { text?: string })?.text || "";
    const val = r.valueQuantity as
      | { value?: number; unit?: string }
      | undefined;
    summary = val ? `${code}: ${val.value} ${val.unit}` : code;
  } else if (type === "Condition") {
    summary = (r.code as { text?: string })?.text || "";
  } else if (type === "MedicationRequest") {
    summary = (r.medicationCodeableConcept as { text?: string })?.text || "";
  } else if (type === "Encounter") {
    const cls = r.class as { display?: string } | undefined;
    summary = `${cls?.display || "visit"} — ${r.status}`;
  } else if (type === "DiagnosticReport") {
    summary = (r.code as { text?: string })?.text || "";
  } else if (type === "CarePlan") {
    summary = (r.title as string) || "";
  } else if (type === "Immunization") {
    summary = (r.vaccineCode as { text?: string })?.text || "";
  } else if (type === "AllergyIntolerance") {
    summary = (r.code as { text?: string })?.text || "";
  } else if (type === "Procedure") {
    summary = (r.code as { text?: string })?.text || "";
  } else {
    summary = r.id || "";
  }

  return (
    <div className="border border-(--border) rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-(--surface-2)/50 transition-colors"
      >
        {expanded ? (
          <ChevronDown size={12} className="text-(--text-secondary)" />
        ) : (
          <ChevronRight size={12} className="text-(--text-secondary)" />
        )}
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded border ${fhirColor(
            type,
          )}`}
        >
          {type}
        </span>
        <span className="text-xs text-(--text-primary) truncate flex-1">
          {summary}
        </span>
        <span className="text-[10px] text-gray-600">{r.id}</span>
      </button>
      {expanded && (
        <div className="px-3 pb-3 pt-1 bg-(--surface)/50 font-mono text-xs overflow-x-auto max-h-64 overflow-y-auto">
          <JsonNode data={r} depth={0} />
        </div>
      )}
    </div>
  );
}

/* ── FHIR Viewer Panel ── */

function FhirViewerPanel({
  transfer,
  bundle,
  onClose,
}: {
  transfer: Transfer;
  bundle: FhirBundle | null;
  onClose: () => void;
}) {
  const t = useT("research");
  const tc = useT("common");
  const [viewMode, setViewMode] = useState<"resources" | "json">("resources");
  const [copied, setCopied] = useState(false);
  const payload = transfer.dataPayload as DataPayload | undefined;
  const aId =
    transfer.assetId || f(transfer as Record<string, unknown>, "assetId");

  const resourceCounts = useMemo(() => {
    if (!bundle?.entry) return {};
    const counts: Record<string, number> = {};
    bundle.entry.forEach((e) => {
      const rt = e.resource.resourceType;
      counts[rt] = (counts[rt] || 0) + 1;
    });
    return counts;
  }, [bundle]);

  const copyJson = useCallback(() => {
    const data = bundle || payload;
    if (data) {
      navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [bundle, payload]);

  return (
    <div className="border border-layer2/50 rounded-xl overflow-hidden bg-(--surface)/80 mt-3">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-layer2/10 border-b border-layer2/30">
        <div className="flex items-center gap-2">
          <FileJson2 size={16} className="text-teal-800 dark:text-teal-300" />
          <span className="text-sm font-medium text-(--text-primary)">
            {t("FHIR Data: {name}", {
              name: aId ? assetLabel(aId as string) : "Bundle",
            })}
          </span>
          {payload?.provider && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-sm bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200">
              {t("from {provider}", { provider: payload.provider })}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/graph?highlight=${encodeURIComponent(
              aId ? assetLabel(aId as string) : "FHIR",
            )}`}
            className="flex items-center gap-1 text-[11px] text-(--accent) hover:underline transition-colors"
          >
            {t("View in Graph")} <Network size={10} />
          </Link>
          <button
            onClick={onClose}
            aria-label={tc("Close")}
            className="text-(--text-secondary) hover:text-(--text-primary)"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Summary stats */}
      <div className="px-4 py-3 border-b border-(--border) grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <div className="text-[10px] text-(--text-secondary) uppercase tracking-wide">
            {t("Total Resources")}
          </div>
          <div className="text-lg font-semibold text-(--text-primary)">
            {bundle?.entry?.length ?? payload?.total ?? "—"}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-(--text-secondary) uppercase tracking-wide">
            {t("Resource Types")}
          </div>
          <div className="text-lg font-semibold text-(--text-primary)">
            {Object.keys(resourceCounts).length ||
              payload?.containedResourceTypes?.length ||
              "—"}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-(--text-secondary) uppercase tracking-wide">
            {t("Transferred")}
          </div>
          <div className="text-sm text-(--text-primary)">
            {payload?.transferredAt
              ? new Date(payload.transferredAt).toLocaleString(undefined, {
                  dateStyle: "short",
                  timeStyle: "short",
                })
              : "—"}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-(--text-secondary) uppercase tracking-wide">
            {t("Size")}
          </div>
          <div className="text-sm text-(--text-primary)">
            {payload?.sizeBytes
              ? `${(payload.sizeBytes / 1024).toFixed(0)} KB`
              : "—"}
          </div>
        </div>
      </div>

      {/* Resource type pills */}
      {(Object.keys(resourceCounts).length > 0 ||
        (payload?.containedResourceTypes?.length ?? 0) > 0) && (
        <div className="px-4 py-2 border-b border-(--border) flex flex-wrap gap-1.5">
          {Object.keys(resourceCounts).length > 0
            ? Object.entries(resourceCounts).map(([type, count]) => (
                <span
                  key={type}
                  className={`text-[10px] px-2 py-0.5 rounded-full border ${fhirColor(
                    type,
                  )}`}
                >
                  {type} ({count})
                </span>
              ))
            : payload?.containedResourceTypes?.map((type) => (
                <span
                  key={type}
                  className={`text-[10px] px-2 py-0.5 rounded-full border ${fhirColor(
                    type,
                  )}`}
                >
                  {type}
                </span>
              ))}
        </div>
      )}

      {/* View mode tabs & actions */}
      <div className="px-4 py-2 border-b border-(--border) flex items-center justify-between">
        <div className="flex gap-1">
          <button
            onClick={() => setViewMode("resources")}
            className={`text-xs px-2.5 py-1 rounded ${
              viewMode === "resources"
                ? "bg-layer2/20 text-teal-800 dark:text-teal-300"
                : "text-(--text-secondary) hover:text-(--text-primary)"
            }`}
          >
            {t("Resources")}
          </button>
          <button
            onClick={() => setViewMode("json")}
            className={`text-xs px-2.5 py-1 rounded ${
              viewMode === "json"
                ? "bg-layer2/20 text-teal-800 dark:text-teal-300"
                : "text-(--text-secondary) hover:text-(--text-primary)"
            }`}
          >
            {t("Raw JSON")}
          </button>
        </div>
        <button
          onClick={copyJson}
          className="flex items-center gap-1 text-[11px] text-(--text-secondary) hover:text-(--text-primary)"
        >
          <Copy size={10} />
          {copied ? t("Copied!") : t("Copy")}
        </button>
      </div>

      {/* Content */}
      <div className="max-h-[500px] overflow-y-auto">
        {viewMode === "resources" && bundle?.entry ? (
          <div className="p-3 space-y-1.5">
            {bundle.entry.map((entry, i) => (
              <FhirResourceCard key={entry.resource.id || i} entry={entry} />
            ))}
          </div>
        ) : viewMode === "resources" && !bundle?.entry ? (
          <div className="p-6 text-center text-sm text-(--text-secondary)">
            <FileJson2 size={24} className="mx-auto mb-2 text-gray-600" />
            <p>{t("Full FHIR Bundle data not available for this transfer.")}</p>
            <p className="text-xs mt-1">
              {t("Transfer metadata: {n} resources ({types})", {
                n: payload?.total ?? 0,
                types:
                  payload?.containedResourceTypes?.join(", ") || t("unknown"),
              })}
            </p>
          </div>
        ) : (
          <pre className="p-4 font-mono text-xs text-(--text-primary) overflow-x-auto">
            {JSON.stringify(bundle || payload, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}

/* ── Main Page ── */

export default function DataTransferPage() {
  const tc = useT("common");
  return (
    <Suspense
      fallback={
        <div className="flex items-center gap-2 text-(--text-secondary) p-10">
          <Loader2 size={16} className="animate-spin" />
          {tc("Loading…")}
        </div>
      }
    >
      <DataTransferContent />
    </Suspense>
  );
}

function DataTransferContent() {
  const t = useT("research");
  const tn = useT("nav");
  const searchParams = useSearchParams();
  const preselectedCtx = searchParams.get("participantId") || "";
  const preContractId = searchParams.get("contractId") || "";

  const [participants, setParticipants] = useState<ParticipantCtx[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCtx, setSelectedCtx] = useState(preselectedCtx);

  // Starting a transfer: the agreement it runs under, while it is sent.
  const [initiating, setInitiating] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [resultIsError, setResultIsError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // The one list: its filter, search and length (#894).
  const [stageFilter, setStageFilter] = useState<Stage | "all">("all");
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);
  const PAGE_SIZE = 25;
  // Which SPE holds which open transfer, from the duplicate check.
  const [imports, setImports] = useState<Record<string, ExistingImport[]>>({});

  // FHIR viewer
  const [viewingTransferId, setViewingTransferId] = useState<string | null>(
    null,
  );
  const [fhirBundles, setFhirBundles] = useState<Record<
    string,
    FhirBundle
  > | null>(null);
  const [loadingFhir, setLoadingFhir] = useState(false);
  // The real data of a STARTED connector transfer, fetched through the
  // consumer's siglet (api/transfers/[id]/data). Before #876 "View FHIR"
  // showed the bundled sample file for every row, real ones included.
  // Which My data rows show their details (#876).
  const [detailsOpen, setDetailsOpen] = useState<Set<string>>(new Set());
  const toggleDetails = (id: string) =>
    setDetailsOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const [liveData, setLiveData] = useState<
    Record<
      string,
      { loading: boolean; error?: string; expired?: boolean; result?: LiveData }
    >
  >({});

  useEffect(() => {
    fetchApi("/api/participants")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        const list: ParticipantCtx[] = Array.isArray(d)
          ? d
          : d.participants || [];
        setParticipants(list);
        if (!selectedCtx && list.length > 0) {
          // The data user transfers; a data holder is the other side. As on
          // /negotiate (#876).
          setSelectedCtx(
            (list.find((p) => p.role === "DATA_USER") ?? list[0])["@id"],
          );
        } else if (list.length === 0) {
          setLoading(false);
        }
      })
      .catch(() => {
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load transfers + agreements when participant changes
  useEffect(() => {
    if (!selectedCtx) return;
    setLoading(true);
    Promise.all([
      fetchApi(
        `/api/transfers?participantId=${selectedCtx}&limit=${DEFAULT_PAGE_SIZE}`,
      )
        .then((r) => (r.ok ? r.json() : []))
        .then((d) => (Array.isArray(d) ? d : d.transfers || []))
        .catch(() => []),
      fetchApi(
        `/api/negotiations?participantId=${selectedCtx}&limit=${DEFAULT_PAGE_SIZE}`,
      )
        .then((r) => (r.ok ? r.json() : []))
        .then((d) => {
          const negs = Array.isArray(d) ? d : d.negotiations || [];
          // Extract agreements from FINALIZED negotiations
          return negs
            .filter(
              (n: Record<string, unknown>) =>
                f(n, "state") === "FINALIZED" && f(n, "contractAgreementId"),
            )
            .map((n: Record<string, unknown>) => ({
              "@id": f(n, "contractAgreementId"),
              assetId: f(n, "assetId") || n.assetId,
              counterPartyId: f(n, "counterPartyId"),
              counterPartyAddress: f(n, "counterPartyAddress"),
              type: f(n, "type"),
              // Only a connector's agreement can be read back for Details.
              source: n.source,
              // When it was negotiated: the list is ordered by it (#894).
              agreedAt: Number(n.createdAt ?? n["edc:createdAt"]) || 0,
            }));
        })
        .catch(() => []),
    ]).then(([tList, aList]) => {
      setTransfers(tList as Transfer[]);
      setAgreements(aList as Agreement[]);
      setLoading(false);
    });
  }, [selectedCtx]);

  // Follow a transfer the connector is still working on (INITIAL, REQUESTED)
  // until it settles; give up after two minutes and leave it to Refresh.
  const settling = useMemo(() => transfers.some(isSettling), [transfers]);
  useEffect(() => {
    if (!selectedCtx || !settling) return;
    let polls = 0;
    const timer = setInterval(() => {
      polls += 1;
      if (polls > SETTLING_POLL_LIMIT) {
        clearInterval(timer);
        return;
      }
      fetchApi(
        `/api/transfers?participantId=${selectedCtx}&limit=${DEFAULT_PAGE_SIZE}`,
      )
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d) setTransfers(Array.isArray(d) ? d : d.transfers || []);
        })
        .catch(() => {
          /* the next poll tries again */
        });
    }, SETTLING_POLL_MS);
    return () => clearInterval(timer);
  }, [selectedCtx, settling]);

  const refreshTransfers = async () => {
    if (!selectedCtx) return;
    setRefreshing(true);
    try {
      const res = await fetchApi(
        `/api/transfers?participantId=${selectedCtx}&limit=${DEFAULT_PAGE_SIZE}`,
      );
      const d = await res.json();
      setTransfers(Array.isArray(d) ? d : d.transfers || []);
    } catch {
      /* ignore */
    }
    setRefreshing(false);
  };

  const startTransfers = async (ids: string[]) => {
    if (ids.length === 0) return;
    setInitiating(ids[0]);
    setResult(null);
    setResultIsError(false);

    const started: string[] = [];
    const errors: string[] = [];
    // A transfer the API recorded rather than sent, because the contract exists
    // only in this demonstrator. Reported separately: "started" would claim a
    // DSP transfer that never happened.
    const demoResults: string[] = [];
    for (const agrId of ids) {
      const agr = agreements.find((a) => a["@id"] === agrId);
      const assetId = agr ? f(agr as Record<string, unknown>, "assetId") : "";
      const counterPartyAddress =
        (agr as Record<string, unknown>)?.counterPartyAddress ||
        "http://controlplane:8082/api/dsp";

      try {
        const res = await fetchApi("/api/transfers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            participantId: selectedCtx,
            contractId: agrId,
            assetId,
            counterPartyAddress,
          }),
        });

        if (res.ok) {
          const data = (await res.json().catch(() => ({}))) as Record<
            string,
            unknown
          >;
          const label = assetLabel(assetId || agrId.slice(0, 12));
          if (data.demo === true) {
            demoResults.push(label);
          } else {
            started.push(label);
          }
        } else {
          const err = (await res.json().catch(() => ({}))) as Record<
            string,
            string
          >;
          // A permit refusal says why (Art. 61(1)): whose permit was missing,
          // revoked or expired. The bare "No data permit covers this
          // transfer" left the user guessing.
          const detail =
            err.detail ||
            [err.error, err.reason].filter(Boolean).join(": ") ||
            `HTTP ${res.status}`;
          errors.push(
            t("Error: {name}: {detail}", {
              name: assetLabel(assetId || agrId.slice(0, 12)),
              detail,
            }),
          );
        }
      } catch {
        errors.push(
          t("Error: {name}: {detail}", {
            name: assetLabel(assetId || agrId.slice(0, 12)),
            detail: t("Network error"),
          }),
        );
      }
    }

    if (errors.length === 0) {
      const lines: string[] = [];
      if (started.length === 1) {
        lines.push(t("Transfer started for {name}", { name: started[0] }));
      } else if (started.length > 1) {
        lines.push(
          t("{n} transfers started successfully", { n: started.length }),
        );
      }
      if (demoResults.length > 0) {
        lines.push(
          t(
            "Demo transfer recorded for {names}: the contract exists only in this demonstrator, so nothing was sent to the connector and the FHIR payload below is the demonstrator's own.",
            { names: demoResults.join(", ") },
          ),
        );
      }
      setResult(lines.join("\n"));
    } else {
      setResultIsError(true);
      setResult(errors.join("\n"));
    }
    await refreshTransfers();
    setInitiating(null);
  };

  // The imports of open transfers and of transfers closed after their import,
  // for the stage and the import status (#876).
  const liveIds = useMemo(
    () =>
      transfers
        .filter((tr) => isLiveTransfer(tr) || isClosedAfterImport(tr))
        .map((tr) => tr["@id"]),
    [transfers],
  );
  const loadImports = useCallback(async () => {
    if (liveIds.length === 0) {
      setImports({});
      return;
    }
    const found: Record<string, ExistingImport[]> = {};
    for (let i = 0; i < liveIds.length; i += 100) {
      const ids = liveIds
        .slice(i, i + 100)
        .map(encodeURIComponent)
        .join(",");
      try {
        const r = await fetchApi(`/api/spe-imports?ids=${ids}`);
        const b = (await r.json()) as { imports?: ExistingImport[] };
        for (const imp of b.imports ?? []) {
          (found[imp.datasetId] ??= []).push(imp);
        }
      } catch {
        /* no import status: the rows still work */
      }
    }
    setImports(found);
  }, [liveIds]);
  useEffect(() => {
    void loadImports();
  }, [loadImports]);

  /** One row per agreement, its transfers newest first, and its stage. */
  const rows = useMemo(() => {
    const ts = (tr: Transfer) =>
      (tr.stateTimestamp as number) ||
      (tr["edc:stateTimestamp"] as number) ||
      0;
    const byContract = new Map<string, Transfer[]>();
    for (const tr of transfers) {
      const cid =
        f(tr as Record<string, unknown>, "contractId") ||
        `transfer:${tr["@id"]}`;
      byContract.set(cid, [...(byContract.get(cid) ?? []), tr]);
    }
    const ids = Array.from(
      new Set([...agreements.map((a) => a["@id"]), ...byContract.keys()]),
    );
    return (
      ids
        .map((id) => {
          const agreement = agreements.find((a) => a["@id"] === id) ?? null;
          const trs = [...(byContract.get(id) ?? [])].sort(
            (a, b) => ts(b) - ts(a),
          );
          const states = trs.map((tr) =>
            f(tr as Record<string, unknown>, "state").toUpperCase(),
          );
          const open = trs.find(isLiveTransfer) ?? null;
          // The latest transfer ended with its import into an SPE.
          const closedImport =
            !open && trs[0] && isClosedAfterImport(trs[0]) ? trs[0] : null;
          const started =
            open ??
            trs.find(
              (tr) =>
                f(tr as Record<string, unknown>, "state").toUpperCase() ===
                "STARTED",
            ) ??
            null;
          const stage: Stage =
            (open && (imports[open["@id"]]?.length ?? 0) > 0) || closedImport
              ? "imported"
              : started
                ? "ready"
                : states.some(
                      (st) =>
                        !["COMPLETED", "TERMINATED", "SUSPENDED"].includes(st),
                    )
                  ? "progress"
                  : states.includes("COMPLETED")
                    ? "done"
                    : "agreed";
          const assetId =
            (agreement && f(agreement as Record<string, unknown>, "assetId")) ||
            (trs[0] &&
              (trs[0].assetId ||
                f(trs[0] as Record<string, unknown>, "assetId")));
          const providerDid = agreement
            ? f(agreement as Record<string, unknown>, "counterPartyId")
            : "";
          return {
            id,
            agreement,
            transfers: trs,
            open,
            started,
            stage,
            name: assetId ? assetLabel(assetId as string) : id.slice(0, 12),
            assetId: (assetId as string) || "",
            providerDid,
            provider: providerDid ? didToName(providerDid) : "",
            isProviderSide:
              !!agreement &&
              f(agreement as Record<string, unknown>, "type") === "PROVIDER",
            sample: agreement
              ? agreement.source !== "controlplane"
              : trs.every((tr) => tr.source !== "controlplane"),
            lastFailed: states[0] === "TERMINATED" && !closedImport,
            closedImport,
            lastAt: trs[0] ? ts(trs[0]) : 0,
            agreedAt: Number(agreement?.agreedAt) || 0,
            importedAt:
              open ?? closedImport
                ? (imports[(open ?? closedImport)!["@id"]] ?? [])
                    .map((i) => i.importedAt)
                    .sort()
                    .pop() ?? ""
                : "",
          };
        })
        // Newest contract first. A row keeps its place when its stage
        // changes, so an import does not move it away (#894).
        .sort((a, b) => (b.agreedAt || b.lastAt) - (a.agreedAt || a.lastAt))
    );
  }, [agreements, transfers, imports]);

  const stageCounts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length };
    for (const r of rows) c[r.stage] = (c[r.stage] ?? 0) + 1;
    return c;
  }, [rows]);

  const shownRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (stageFilter === "all" || r.stage === stageFilter) &&
        (!q ||
          `${r.name} ${r.assetId} ${r.provider} ${r.id}`
            .toLowerCase()
            .includes(q)),
    );
  }, [rows, stageFilter, search]);
  // A link to one agreement (?contractId=) shows it even past the first page.
  const pageRows =
    showAll || shownRows.length <= PAGE_SIZE
      ? shownRows
      : shownRows.slice(0, PAGE_SIZE);
  const linked =
    preContractId && !pageRows.some((r) => r.id === preContractId)
      ? shownRows.find((r) => r.id === preContractId)
      : undefined;
  const visibleRows = linked ? [linked, ...pageRows] : pageRows;

  // The linked agreement opens with its details and is scrolled to.
  useEffect(() => {
    if (!preContractId || loading) return;
    setDetailsOpen((prev) => new Set(prev).add(`agr:${preContractId}`));
    document
      .getElementById(`contract-${preContractId}`)
      ?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }, [preContractId, loading]);

  const loadLiveData = async (
    transferId: string,
  ): Promise<LiveData | undefined> => {
    const known = liveData[transferId];
    if (known?.result) return known.result;
    setLiveData((m) => ({ ...m, [transferId]: { loading: true } }));
    try {
      const res = await fetchApi(
        `/api/transfers/${encodeURIComponent(
          transferId,
        )}/data?participantId=${encodeURIComponent(selectedCtx)}`,
      );
      const body = (await res.json()) as LiveData & {
        error?: string;
        detail?: string;
        expired?: boolean;
      };
      if (!res.ok) {
        const error = [body.error, body.detail].filter(Boolean).join(": ");
        setLiveData((m) => ({
          ...m,
          [transferId]: { loading: false, error, expired: !!body.expired },
        }));
        return undefined;
      }
      setLiveData((m) => ({
        ...m,
        [transferId]: { loading: false, result: body },
      }));
      return body;
    } catch (err) {
      setLiveData((m) => ({
        ...m,
        [transferId]: { loading: false, error: String(err) },
      }));
      return undefined;
    }
  };

  const downloadLiveData = async (transferId: string, name: string) => {
    const result = await loadLiveData(transferId);
    if (!result) return;
    const blob = new Blob([JSON.stringify(result.data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name}-${transferId.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /** When this agreement's newest STARTED transfer opened, or 0. */
  const openedAtOf = (agrId: string): number =>
    transfers
      .filter(
        (tr) =>
          f(tr as Record<string, unknown>, "contractId") === agrId &&
          f(tr as Record<string, unknown>, "state").toUpperCase() === "STARTED",
      )
      .reduce(
        (max, tr) => Math.max(max, (tr.stateTimestamp as number) || 0),
        0,
      );

  // Load FHIR bundles on demand
  const openFhirViewer = async (transferId: string) => {
    if (viewingTransferId === transferId) {
      setViewingTransferId(null);
      return;
    }
    setViewingTransferId(transferId);
    const row = transfers.find((tr) => tr["@id"] === transferId);
    if (row && isLiveTransfer(row)) {
      await loadLiveData(transferId);
      return;
    }
    if (!fhirBundles) {
      setLoadingFhir(true);
      try {
        const basePath =
          process.env.NEXT_PUBLIC_STATIC_EXPORT === "true"
            ? process.env.NEXT_PUBLIC_BASE_PATH ||
              "/MinimumViableHealthDataspacev2"
            : "";
        const res = await fetch(`${basePath}/mock/fhir_bundles.json`);
        if (res.ok) {
          setFhirBundles(await res.json());
        }
      } catch {
        /* ignore */
      }
      setLoadingFhir(false);
    }
  };

  /** The data of one transfer, opened in its contract's row. */
  const viewerFor = (tr: Transfer) => {
    const aId = tr.assetId || f(tr as Record<string, unknown>, "assetId");
    const live = isLiveTransfer(tr) ? liveData[tr["@id"]] : null;
    const liveBundle = live?.result ? toBundle(live.result.data) : null;
    const bundle = isLiveTransfer(tr)
      ? liveBundle
      : fhirBundles?.[aId as string] ?? null;
    const viewerLoading = isLiveTransfer(tr) ? !!live?.loading : loadingFhir;
    if (viewerLoading) {
      return (
        <div className="flex items-center gap-2 text-(--text-secondary) py-4 justify-center">
          <Loader2 size={14} className="animate-spin" />
          {isLiveTransfer(tr)
            ? t("Fetching the data from the provider…")
            : t("Loading FHIR data…")}
        </div>
      );
    }
    if (live?.error) return null;
    if (live?.result && !liveBundle) {
      return (
        <div className="mt-3 font-mono text-xs overflow-x-auto max-h-96 overflow-y-auto p-3 border border-(--border) rounded-lg">
          <JsonNode data={live.result.data} depth={0} />
        </div>
      );
    }
    return (
      <FhirViewerPanel
        transfer={tr}
        bundle={bundle}
        onClose={() => setViewingTransferId(null)}
      />
    );
  };

  return (
    <div className="min-h-screen bg-(--bg)">
      <div className="max-w-5xl mx-auto px-6 py-10">
        <PageIntro
          title={t("Data Transfers")}
          icon={ArrowRightLeft}
          description={t(
            "Monitor and initiate EDC-V data transfers via the DSP Transfer Process (Signalling Protocol). Once a contract is agreed, start a transfer to pull FHIR or OMOP data from the provider's data plane.",
          )}
          prevStep={{ href: "/negotiate", label: t("Contract Negotiation") }}
          nextStep={{ href: "/admin", label: tn("Operator Dashboard") }}
          infoText={t(
            "The DSP Signalling Protocol defines the transfer state machine: REQUESTED → STARTED → COMPLETED (or TERMINATED on failure). Each transfer is secured by EDC-V access tokens issued during the STARTED phase.",
          )}
          docLink={{
            href: "https://eclipse-dataspace-protocol-base.github.io/DataspaceProtocol/2025-1/#transfer-protocol",
            label: t("DSP Transfer Process Spec"),
            external: true,
          }}
        />

        {/* Participant selector */}
        <div className="mb-6">
          <label className="text-xs text-(--text-secondary) mb-1 block">
            {t("Requesting as (your participant)")}
          </label>
          <select
            aria-label={t("Requesting as (your participant)")}
            value={selectedCtx}
            onChange={(e) => setSelectedCtx(e.target.value)}
            className="w-full max-w-md px-3 py-2 bg-(--surface-2) border border-gray-600 rounded-sm text-sm"
          >
            {participants.map((p) => (
              <option key={p["@id"]} value={p["@id"]}>
                {displayParticipant(p)}
                {p.role ? ` [${p.role}]` : ""}
              </option>
            ))}
          </select>
        </div>

        {/* ── My contracts and data: one list, one row per agreement (#894) ── */}
        <section
          data-testid="contracts-list"
          className="border border-(--border) rounded-xl p-5 mb-8"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
            <h2 className="flex items-center gap-2 font-semibold text-sm">
              <Play size={16} className="text-teal-800 dark:text-teal-300" />
              {t("My contracts and data")}
            </h2>
            <button
              type="button"
              onClick={() => {
                void refreshTransfers();
                void loadImports();
              }}
              disabled={refreshing}
              className="flex items-center gap-1 text-xs text-(--text-secondary) hover:text-(--text-primary) disabled:opacity-50"
            >
              <RefreshCw
                size={12}
                className={refreshing ? "animate-spin" : ""}
              />
              {t("Refresh")}
            </button>
          </div>
          <p className="text-xs text-(--text-secondary) mb-4">
            {t(
              "Each agreed contract once, with where it stands: start the transfer, open or download the data, import it into an SPE. Its transfer history is under Details.",
            )}
          </p>

          {result && (
            <div
              className={`mb-4 p-3 rounded text-sm whitespace-pre-line ${
                resultIsError
                  ? "bg-(--role-admin-bg) border border-(--role-admin-border) text-(--role-admin-text)"
                  : "bg-(--role-user-bg) border border-(--role-user-border) text-(--role-user-text)"
              }`}
            >
              {result}
            </div>
          )}

          {loading ? (
            <div className="flex items-center gap-2 text-(--text-secondary)">
              <Loader2 size={16} className="animate-spin" />
              {t("Loading transfers…")}
            </div>
          ) : rows.length === 0 ? (
            <p className="text-xs text-(--text-secondary)">
              <T
                area="research"
                tags={{
                  a: (
                    <Link
                      href="/negotiate"
                      className="text-teal-800 dark:text-teal-300 hover:underline"
                    />
                  ),
                }}
              >
                {
                  "No finalized agreements found. Complete a <a>contract negotiation</a> first."
                }
              </T>
            </p>
          ) : (
            <>
              {/* Filter and search */}
              <div className="flex flex-wrap items-center gap-1.5 mb-3">
                {(["all", ...STAGE_ORDER] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    data-testid={`stage-filter-${st}`}
                    aria-pressed={stageFilter === st}
                    onClick={() => {
                      setStageFilter(st);
                      setShowAll(false);
                    }}
                    className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
                      stageFilter === st
                        ? "bg-layer2/20 text-teal-800 dark:text-teal-300 border border-layer2/40"
                        : "bg-(--surface-2) text-(--text-secondary) border border-(--border) hover:border-gray-500"
                    }`}
                  >
                    {st === "all" ? t("All") : t(STAGE_LABEL[st])} (
                    {stageCounts[st] ?? 0})
                  </button>
                ))}
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t("Search dataset, provider or contract")}
                  aria-label={t("Search dataset, provider or contract")}
                  className="ml-auto min-w-[14rem] px-2 py-1 text-xs bg-(--surface-2) border border-(--border) rounded"
                />
              </div>

              {shownRows.length === 0 && (
                <p className="text-sm text-(--text-secondary)">
                  {t("No contract matches.")}
                </p>
              )}

              <div className="space-y-2">
                {visibleRows.map((row) => {
                  const live = row.open;
                  const entry = live ? liveData[live["@id"]] : undefined;
                  const detailsKey = `agr:${row.id}`;
                  const viewing = row.transfers.find(
                    (tr) => tr["@id"] === viewingTransferId,
                  );
                  return (
                    <div
                      key={row.id}
                      id={`contract-${row.id}`}
                      data-testid="contract-row"
                      data-stage={row.stage}
                      className={`p-3 rounded-lg border bg-(--surface-2)/50 ${
                        row.id === preContractId
                          ? "border-layer2"
                          : "border-(--border)"
                      }`}
                    >
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-(--text-primary)">
                            {row.name}
                            <span
                              data-testid="contract-stage"
                              className={`text-[10px] px-1.5 py-0.5 rounded-sm ${
                                STAGE_STYLE[row.stage]
                              }`}
                            >
                              {t(STAGE_LABEL[row.stage])}
                            </span>
                            {row.sample && (
                              <RowSourceBadge
                                source={
                                  (row.agreement?.source as
                                    | RowSource
                                    | undefined) ??
                                  (row.transfers[0]?.source as
                                    | RowSource
                                    | undefined) ??
                                  "mock"
                                }
                              />
                            )}
                          </p>
                          <p className="text-xs text-(--text-secondary)">
                            {row.isProviderSide
                              ? t("Consumer:")
                              : t("Provider:")}{" "}
                            {row.provider || "—"}
                            {row.agreedAt > 0 && (
                              <span data-testid="contract-agreed">
                                {" · "}
                                {t("agreed {date}", {
                                  date: when(row.agreedAt),
                                })}
                              </span>
                            )}
                            {row.importedAt && (
                              <span data-testid="contract-imported">
                                {" · "}
                                {t("imported {date}", {
                                  date: when(row.importedAt),
                                })}
                              </span>
                            )}
                            {row.lastFailed && row.stage === "agreed" && (
                              <span className="ml-2 text-(--badge-inactive-text)">
                                {t("the last transfer failed")}
                              </span>
                            )}
                            {entry?.result &&
                              ` · ${Math.max(
                                1,
                                Math.round(entry.result.bytes / 1024),
                              )} KB`}
                          </p>
                          {entry?.error &&
                            (entry.expired ? (
                              <p
                                data-testid="transfer-expired"
                                className="text-xs text-(--badge-inactive-text) mt-1"
                              >
                                {t(
                                  "The access to this transfer has expired. Start a new transfer to get the data again.",
                                )}
                              </p>
                            ) : (
                              <p className="text-xs text-(--badge-inactive-text) mt-1">
                                {t("Could not fetch the data: {detail}", {
                                  detail: entry.error,
                                })}
                              </p>
                            ))}
                        </div>

                        {/* The one next action for this stage */}
                        {(row.stage === "agreed" ||
                          row.stage === "done" ||
                          row.closedImport) &&
                          row.agreement &&
                          !row.isProviderSide && (
                            <button
                              type="button"
                              data-testid="start-transfer"
                              disabled={initiating !== null}
                              onClick={() => void startTransfers([row.id])}
                              className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-(--accent) text-white dark:text-gray-900 hover:bg-(--accent-hover) disabled:opacity-50"
                            >
                              {initiating === row.id ? (
                                <Loader2 size={12} className="animate-spin" />
                              ) : (
                                <ArrowRightLeft size={12} />
                              )}
                              {row.stage === "done" || row.closedImport
                                ? t("Transfer again")
                                : t("Start Transfer")}
                            </button>
                          )}
                        {entry?.expired &&
                          row.agreement &&
                          !row.isProviderSide && (
                            <button
                              type="button"
                              data-testid="restart-transfer"
                              disabled={initiating !== null}
                              onClick={() => void startTransfers([row.id])}
                              className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-(--accent) text-white dark:text-gray-900 hover:bg-(--accent-hover) disabled:opacity-50"
                            >
                              <ArrowRightLeft size={12} />
                              {t("Start a new transfer")}
                            </button>
                          )}
                        {row.stage === "progress" && (
                          <span className="flex items-center gap-1 text-xs text-(--text-secondary)">
                            <Loader2 size={12} className="animate-spin" />
                            {t("Waiting for the provider")}
                          </span>
                        )}
                        {live && (
                          <>
                            <button
                              type="button"
                              onClick={() => void openFhirViewer(live["@id"])}
                              className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-(--role-user-bg) text-(--role-user-text) hover:opacity-80"
                            >
                              {entry?.loading ? (
                                <Loader2 size={12} className="animate-spin" />
                              ) : (
                                <FileJson2 size={12} />
                              )}
                              {viewing === live ? t("Close") : t("Open")}
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                void downloadLiveData(
                                  live["@id"],
                                  row.assetId || "data",
                                )
                              }
                              className="flex items-center gap-1 text-xs px-2 py-1 rounded border border-(--border) text-(--text-primary) hover:border-gray-500"
                            >
                              <Download size={12} />
                              {t("Download")}
                            </button>
                          </>
                        )}
                        {!live && row.transfers.length > 0 && (
                          <button
                            type="button"
                            onClick={() =>
                              void openFhirViewer(
                                (row.started ?? row.transfers[0])["@id"],
                              )
                            }
                            className={`flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors ${
                              viewing
                                ? "bg-layer2/20 text-teal-800 dark:text-teal-300"
                                : "bg-(--role-user-bg) text-(--role-user-text) hover:opacity-80"
                            }`}
                          >
                            <FileJson2 size={12} />
                            {viewing ? t("Hide FHIR") : t("View FHIR")}
                          </button>
                        )}
                        <button
                          type="button"
                          aria-expanded={detailsOpen.has(detailsKey)}
                          onClick={() => toggleDetails(detailsKey)}
                          className="flex items-center gap-1 text-xs px-2 py-1 rounded border border-(--border) text-(--text-primary) hover:border-gray-500"
                        >
                          {detailsOpen.has(detailsKey) ? (
                            <ChevronDown size={12} />
                          ) : (
                            <ChevronRight size={12} />
                          )}
                          {t("Details")}
                        </button>
                      </div>

                      {live && (
                        <SpeImport
                          transferId={live["@id"]}
                          participantId={selectedCtx}
                          known={imports[live["@id"]] ?? NO_IMPORTS}
                          onImported={() => {
                            void loadImports();
                            // The import closed the transfer: follow it.
                            void refreshTransfers();
                          }}
                          onRestart={
                            row.agreement && !row.isProviderSide
                              ? () => void startTransfers([row.id])
                              : undefined
                          }
                        />
                      )}

                      {row.closedImport &&
                        (() => {
                          const closed = row.closedImport;
                          const spe =
                            closedAfterImportInto(
                              f(
                                closed as Record<string, unknown>,
                                "errorDetail",
                              ),
                            ) ?? "";
                          const records = (imports[closed["@id"]] ?? []).find(
                            (i) => i.speId === spe,
                          )?.records;
                          return (
                            <div
                              data-testid="closed-after-import"
                              className="mt-2 flex flex-wrap items-center gap-2 rounded border border-green-700/50 bg-green-900/20 px-2 py-1.5 text-xs text-(--text-primary)"
                            >
                              <CheckCircle2
                                size={14}
                                className="text-green-500"
                              />
                              <span>
                                {records !== undefined
                                  ? t(
                                      "{records} records are in {spe}. The transfer is closed: the access to the provider's data has ended. Start a new transfer to import it again.",
                                      { records: String(records), spe },
                                    )
                                  : t(
                                      "The data is in {spe}. The transfer is closed: the access to the provider's data has ended. Start a new transfer to import it again.",
                                      { spe },
                                    )}
                              </span>
                              <Link
                                href={importViewUrl(closed["@id"], spe)}
                                className="flex items-center gap-1 underline text-(--accent)"
                              >
                                <Box size={12} />
                                {t("Show in 3D")}
                              </Link>
                            </div>
                          );
                        })()}

                      {viewing && viewerFor(viewing)}

                      {detailsOpen.has(detailsKey) && (
                        <div className="mt-3 space-y-3">
                          {row.agreement && (
                            <TransferDetails
                              participantId={selectedCtx}
                              contractId={row.id}
                              openedAt={openedAtOf(row.id)}
                              providerDid={row.providerDid}
                              providerName={row.provider || "—"}
                              consumerName={
                                participants.find(
                                  (p) => p["@id"] === selectedCtx,
                                )?.displayName ?? ""
                              }
                              sample={row.sample}
                            />
                          )}
                          <div data-testid="contract-history">
                            <p className="text-[10px] uppercase tracking-wide text-(--text-secondary) mb-1">
                              {t("Transfers under this contract ({n})", {
                                n: row.transfers.length,
                              })}
                            </p>
                            {row.transfers.length === 0 ? (
                              <p className="text-xs text-(--text-secondary)">
                                {t("No transfer yet.")}
                              </p>
                            ) : (
                              <div className="space-y-2">
                                {row.transfers.map((tr) => {
                                  const state = f(
                                    tr as Record<string, unknown>,
                                    "state",
                                  );
                                  const transferType =
                                    f(
                                      tr as Record<string, unknown>,
                                      "transferType",
                                    ) || "HttpData-PULL";
                                  const timestamp =
                                    (tr.stateTimestamp as number) ||
                                    (tr["edc:stateTimestamp"] as number) ||
                                    0;
                                  // The hub ends a transfer once its data is
                                  // in an SPE; that TERMINATED is the success.
                                  const closedInto = closedAfterImportInto(
                                    f(
                                      tr as Record<string, unknown>,
                                      "errorDetail",
                                    ),
                                  );
                                  return (
                                    <div
                                      key={tr["@id"]}
                                      id={`transfer-${tr["@id"]}`}
                                      className="p-2 rounded border border-(--border) space-y-2"
                                    >
                                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-(--text-secondary)">
                                        <span
                                          data-testid="transfer-state"
                                          title={
                                            closedInto
                                              ? closedAfterImportReason(
                                                  closedInto,
                                                )
                                              : undefined
                                          }
                                          className={`text-xs px-2 py-0.5 rounded-full ${stateBg(
                                            closedInto ? "COMPLETED" : state,
                                          )}`}
                                        >
                                          {state || "UNKNOWN"}
                                        </span>
                                        <span className="px-1.5 py-0.5 rounded-sm bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200">
                                          {transferType}
                                        </span>
                                        {timestamp > 0 && (
                                          <span>
                                            {t("Updated:")}{" "}
                                            {new Date(timestamp).toLocaleString(
                                              undefined,
                                              {
                                                dateStyle: "short",
                                                timeStyle: "short",
                                              },
                                            )}
                                          </span>
                                        )}
                                        <span>
                                          {t("Process: {id}…", {
                                            id: tr["@id"].slice(0, 8),
                                          })}
                                        </span>
                                        {state
                                          ?.toUpperCase()
                                          .includes("COMPLETED") &&
                                          (tr.dataPayload as DataPayload)
                                            ?.total && (
                                            <span className="text-green-800 dark:text-green-400">
                                              {t("{n} resources transferred", {
                                                n: (
                                                  tr.dataPayload as DataPayload
                                                ).total,
                                              })}
                                            </span>
                                          )}
                                      </div>
                                      <DspPipeline
                                        state={state}
                                        closedInto={closedInto}
                                      />
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {shownRows.length > PAGE_SIZE && (
                <button
                  type="button"
                  onClick={() => setShowAll(!showAll)}
                  className="mt-3 flex items-center gap-1 text-xs text-teal-800 dark:text-teal-300 hover:text-teal-800/80 dark:hover:text-teal-300/80"
                >
                  {showAll ? (
                    <>
                      <ChevronDown size={12} /> {t("Show less")}
                    </>
                  ) : (
                    <>
                      <ChevronRight size={12} />{" "}
                      {t("Show {n} more", {
                        n: shownRows.length - PAGE_SIZE,
                      })}
                    </>
                  )}
                </button>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
