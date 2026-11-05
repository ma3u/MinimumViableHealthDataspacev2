"use client";
import Link from "next/link";

import { fetchApi } from "@/lib/api";
import { didToName } from "@/lib/participant-name";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowRightLeft,
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
import type { RowSource } from "@/lib/row-provenance";
import { T, useT } from "@/lib/i18n/translate";

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

function DspPipeline({ state }: { state: DspState }) {
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

  // Initiate form
  const [initiating, setInitiating] = useState(false);
  const [selectedAgreements, setSelectedAgreements] = useState<Set<string>>(
    preContractId ? new Set([preContractId]) : new Set(),
  );
  const [result, setResult] = useState<string | null>(null);
  const [resultIsError, setResultIsError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Agreement list pagination
  const [showAllAgreements, setShowAllAgreements] = useState(false);
  const AGREEMENTS_PAGE_SIZE = 25;

  // Transfer status filter
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

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
  const [liveData, setLiveData] = useState<
    Record<string, { loading: boolean; error?: string; result?: LiveData }>
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
      fetchApi(`/api/transfers?participantId=${selectedCtx}`)
        .then((r) => (r.ok ? r.json() : []))
        .then((d) => (Array.isArray(d) ? d : d.transfers || []))
        .catch(() => []),
      fetchApi(`/api/negotiations?participantId=${selectedCtx}`)
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
            }));
        })
        .catch(() => []),
    ]).then(([tList, aList]) => {
      setTransfers(tList as Transfer[]);
      setAgreements(aList as Agreement[]);
      setLoading(false);
    });
  }, [selectedCtx]);

  const refreshTransfers = async () => {
    if (!selectedCtx) return;
    setRefreshing(true);
    try {
      const res = await fetchApi(`/api/transfers?participantId=${selectedCtx}`);
      const d = await res.json();
      setTransfers(Array.isArray(d) ? d : d.transfers || []);
    } catch {
      /* ignore */
    }
    setRefreshing(false);
  };

  const handleInitiate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedAgreements.size === 0) return;
    setInitiating(true);
    setResult(null);
    setResultIsError(false);

    const started: string[] = [];
    const errors: string[] = [];
    // A transfer the API recorded rather than sent, because the contract exists
    // only in this demonstrator. Reported separately: "started" would claim a
    // DSP transfer that never happened.
    const demoResults: string[] = [];
    for (const agrId of Array.from(selectedAgreements)) {
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
          const err = await res.json().catch(() => ({}));
          const detail =
            (err as Record<string, string>).detail ||
            (err as Record<string, string>).error ||
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
    setSelectedAgreements(new Set());
    setInitiating(false);
  };

  // Check which agreements already have transfers
  /**
   * What the agreement's transfers have reached. It used to say "transfer in
   * progress" for any transfer at all, a failed one included, and a STARTED
   * PULL transfer stays STARTED while its data is ready (#876).
   */
  const agreementTransferLabel = (agrId: string): string | null => {
    const states = transfers
      .filter((tr) => f(tr as Record<string, unknown>, "contractId") === agrId)
      .map((tr) => f(tr as Record<string, unknown>, "state").toUpperCase());
    if (states.includes("COMPLETED")) return t("(transferred)");
    if (states.includes("STARTED")) return t("(data ready)");
    if (states.some((st) => st !== "TERMINATED" && st !== "SUSPENDED")) {
      return t("(transfer in progress)");
    }
    return null;
  };

  // Multi-select helpers
  const toggleAgreement = (agrId: string) => {
    setSelectedAgreements((prev) => {
      const next = new Set(prev);
      if (next.has(agrId)) next.delete(agrId);
      else next.add(agrId);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedAgreements.size === agreements.length) {
      setSelectedAgreements(new Set());
    } else {
      setSelectedAgreements(new Set(agreements.map((a) => a["@id"])));
    }
  };

  // Agreement pagination
  const visibleAgreements = showAllAgreements
    ? agreements
    : agreements.slice(0, AGREEMENTS_PAGE_SIZE);
  const hasMoreAgreements = agreements.length > AGREEMENTS_PAGE_SIZE;

  // Transfer status filter
  const transferStatuses = useMemo(() => {
    const states = new Set<string>();
    transfers.forEach((t) => {
      const s = f(t as Record<string, unknown>, "state")?.toUpperCase();
      if (s) states.add(s);
    });
    return ["ALL", ...Array.from(states).sort()];
  }, [transfers]);

  // Newest first: what the open transfers give access to.
  const myData = transfers
    .filter(isLiveTransfer)
    .sort(
      (a, b) =>
        ((b.stateTimestamp as number) || 0) -
        ((a.stateTimestamp as number) || 0),
    );

  const providerOfContract = (contractId: string): string => {
    const agr = agreements.find((a) => a["@id"] === contractId);
    const cp = agr ? f(agr as Record<string, unknown>, "counterPartyId") : "";
    return cp ? didToName(cp) : "";
  };

  const filteredTransfers =
    statusFilter === "ALL"
      ? transfers
      : transfers.filter(
          (t) =>
            f(t as Record<string, unknown>, "state")?.toUpperCase() ===
            statusFilter,
        );

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
      };
      if (!res.ok) {
        const error = [body.error, body.detail].filter(Boolean).join(": ");
        setLiveData((m) => ({
          ...m,
          [transferId]: { loading: false, error },
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

        {/* ── Initiate Transfer from Agreement ── */}
        <div className="border border-(--border) rounded-xl p-5 mb-8">
          <div className="flex items-center gap-2 mb-1">
            <Play size={16} className="text-teal-800 dark:text-teal-300" />
            <h2 className="font-semibold text-sm">
              {t("Start Transfer from Agreement")}
            </h2>
          </div>
          <p className="text-xs text-(--text-secondary) mb-4">
            <T
              area="research"
              tags={{ c: <code className="text-(--text-secondary)" /> }}
            >
              {
                "Select a finalized contract agreement to pull data via <c>HttpData-PULL</c>."
              }
            </T>
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

          {agreements.length === 0 && !loading && (
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
          )}

          {agreements.length > 0 && (
            <form onSubmit={handleInitiate} className="space-y-3">
              {/* Select All */}
              <label className="flex items-center gap-2 px-3 py-2 text-xs text-(--text-secondary) cursor-pointer hover:text-(--text-primary)">
                <input
                  type="checkbox"
                  checked={selectedAgreements.size === agreements.length}
                  onChange={toggleAll}
                  className="accent-layer2"
                />
                {t("Select All ({n})", { n: agreements.length })}
              </label>

              <div className="space-y-2">
                {visibleAgreements.map((agr) => {
                  const agrId = agr["@id"];
                  const aId = f(agr as Record<string, unknown>, "assetId");
                  const cp = f(
                    agr as Record<string, unknown>,
                    "counterPartyId",
                  );
                  const transferLabel = agreementTransferLabel(agrId);

                  return (
                    <label
                      key={agrId}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedAgreements.has(agrId)
                          ? "border-layer2 bg-layer2/10"
                          : "border-(--border) hover:border-gray-500 bg-(--surface-2)/50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedAgreements.has(agrId)}
                        onChange={() => toggleAgreement(agrId)}
                        className="accent-layer2"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-(--text-primary)">
                          {aId ? assetLabel(aId as string) : agrId.slice(0, 12)}
                        </p>
                        <p className="text-xs text-(--text-secondary)">
                          {f(agr as Record<string, unknown>, "type") ===
                          "PROVIDER"
                            ? t("Consumer:")
                            : t("Provider:")}{" "}
                          {cp ? didToName(cp as string) : "—"}
                          {transferLabel && (
                            <span className="ml-2 text-yellow-800 dark:text-yellow-400">
                              {transferLabel}
                            </span>
                          )}
                        </p>
                      </div>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-sm bg-(--role-user-bg) text-(--role-user-text) border border-(--role-user-border)">
                        AGREED
                      </span>
                    </label>
                  );
                })}
              </div>

              {/* Show more / Show less */}
              {hasMoreAgreements && (
                <button
                  type="button"
                  onClick={() => setShowAllAgreements(!showAllAgreements)}
                  className="flex items-center gap-1 text-xs text-teal-800 dark:text-teal-300 hover:text-teal-800/80 dark:hover:text-teal-300/80"
                >
                  {showAllAgreements ? (
                    <>
                      <ChevronDown size={12} /> {t("Show less")}
                    </>
                  ) : (
                    <>
                      <ChevronRight size={12} />{" "}
                      {t("Show {n} more", {
                        n: agreements.length - AGREEMENTS_PAGE_SIZE,
                      })}
                    </>
                  )}
                </button>
              )}

              <button
                type="submit"
                disabled={initiating || selectedAgreements.size === 0}
                className="flex items-center gap-2 px-4 py-2 bg-(--accent) text-white dark:text-gray-900 rounded-sm text-sm font-medium hover:bg-(--accent-hover) disabled:opacity-50"
              >
                {initiating ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <ArrowRightLeft size={14} />
                )}
                {selectedAgreements.size > 1
                  ? t("Start {n} Transfers", { n: selectedAgreements.size })
                  : t("Start Transfer")}
              </button>
            </form>
          )}
        </div>

        {/* ── My data: what the open transfers give access to (#876) ── */}
        {myData.length > 0 && (
          <div
            data-testid="my-data"
            className="border border-(--border) rounded-xl p-5 mb-8"
          >
            <h2 className="font-semibold text-sm mb-1">{t("My data")}</h2>
            <p className="text-xs text-(--text-secondary) mb-4">
              {t(
                "The assets you hold an open transfer for. Their data comes from the provider's data plane when you open or download it; patient identities are pseudonymised for data users.",
              )}
            </p>
            <div className="space-y-2">
              {myData.map((tr) => {
                const id = tr["@id"];
                const aId =
                  tr.assetId || f(tr as Record<string, unknown>, "assetId");
                const name = aId ? assetLabel(aId as string) : id.slice(0, 8);
                const provider = providerOfContract(
                  f(tr as Record<string, unknown>, "contractId"),
                );
                const entry = liveData[id];
                return (
                  <div
                    key={id}
                    className="flex flex-wrap items-center gap-3 p-3 rounded-lg border border-(--border) bg-(--surface-2)/50"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-(--text-primary)">
                        {name}
                      </p>
                      <p className="text-xs text-(--text-secondary)">
                        {t("Provider:")} {provider || "—"} ·{" "}
                        {t("Process: {id}…", { id: id.slice(0, 8) })}
                        {entry?.result &&
                          ` · ${Math.max(
                            1,
                            Math.round(entry.result.bytes / 1024),
                          )} KB`}
                      </p>
                      {entry?.error && (
                        <p className="text-xs text-(--badge-inactive-text) mt-1">
                          {t("Could not fetch the data: {detail}", {
                            detail: entry.error,
                          })}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        void openFhirViewer(id);
                        document
                          .getElementById(`transfer-${id}`)
                          // Not every browser engine has it (jsdom has not).
                          ?.scrollIntoView?.({ behavior: "smooth" });
                      }}
                      className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-(--role-user-bg) text-(--role-user-text) hover:opacity-80"
                    >
                      {entry?.loading ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <FileJson2 size={12} />
                      )}
                      {t("Open")}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void downloadLiveData(id, (aId as string) || "data")
                      }
                      className="flex items-center gap-1 text-xs px-2 py-1 rounded border border-(--border) text-(--text-primary) hover:border-gray-500"
                    >
                      <Download size={12} />
                      {t("Download")}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Transfer Processes (DSP State Machine) ── */}
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-sm">
            {t("Transfer Processes")}{" "}
            <span className="font-normal text-(--text-secondary)">
              {t("(DSP Signalling Protocol)")}
            </span>
          </h2>
          <button
            onClick={refreshTransfers}
            disabled={refreshing}
            className="flex items-center gap-1 text-xs text-(--text-secondary) hover:text-(--text-primary) disabled:opacity-50"
          >
            <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} />
            {t("Refresh")}
          </button>
        </div>

        {/* Status filter */}
        {transfers.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {transferStatuses.map((s) => {
              const count =
                s === "ALL"
                  ? transfers.length
                  : transfers.filter(
                      (t) =>
                        f(
                          t as Record<string, unknown>,
                          "state",
                        )?.toUpperCase() === s,
                    ).length;
              return (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
                    statusFilter === s
                      ? "bg-layer2/20 text-teal-800 dark:text-teal-300 border border-layer2/40"
                      : "bg-(--surface-2) text-(--text-secondary) border border-(--border) hover:border-gray-500"
                  }`}
                >
                  {s === "ALL" ? t("ALL") : s} ({count})
                </button>
              );
            })}
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 text-(--text-secondary)">
            <Loader2 size={16} className="animate-spin" />
            {t("Loading transfers…")}
          </div>
        ) : filteredTransfers.length === 0 ? (
          <p className="text-(--text-secondary) text-sm">
            {transfers.length === 0
              ? t(
                  "No transfer processes yet. Start one from an agreed contract above.",
                )
              : t('No transfers matching "{status}".', {
                  status: statusFilter,
                })}
          </p>
        ) : (
          <div className="grid gap-3">
            {filteredTransfers.map((tr) => {
              const state = f(tr as Record<string, unknown>, "state");
              const aId =
                tr.assetId || f(tr as Record<string, unknown>, "assetId");
              const transferType =
                f(tr as Record<string, unknown>, "transferType") ||
                "HttpData-PULL";
              const timestamp =
                (tr.stateTimestamp as number) ||
                (tr["edc:stateTimestamp"] as number) ||
                0;
              const isCompleted = state?.toUpperCase().includes("COMPLETED");
              const isViewing = viewingTransferId === tr["@id"];
              const live = isLiveTransfer(tr) ? liveData[tr["@id"]] : null;
              const liveBundle = live?.result
                ? toBundle(live.result.data)
                : null;
              const bundle = isLiveTransfer(tr)
                ? liveBundle
                : fhirBundles?.[aId as string] ?? null;
              const viewerLoading = isLiveTransfer(tr)
                ? !!live?.loading
                : loadingFhir;

              return (
                <div
                  id={`transfer-${tr["@id"]}`}
                  key={tr["@id"]}
                  className={`p-4 border rounded-xl space-y-3 transition-colors ${
                    isViewing
                      ? "border-layer2/50 bg-(--surface-2)/30"
                      : "border-(--border)"
                  }`}
                >
                  {/* Header row */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ArrowRightLeft size={14} className={stateColor(state)} />
                      <span className="text-sm font-medium text-(--text-primary)">
                        {aId
                          ? assetLabel(aId as string)
                          : tr["@id"].slice(0, 12)}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-sm bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200">
                        {transferType}
                      </span>
                      {/* A demo or sample transfer moved no data and has no
                          record in the control plane. Unmarked, a COMPLETED
                          badge on it claims a transfer that never ran. #358 */}
                      <RowSourceBadge
                        source={
                          (tr.source as RowSource | undefined) ??
                          (tr.demo === true ? "demo" : undefined)
                        }
                        reason={tr.demoReason as string | undefined}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openFhirViewer(tr["@id"])}
                        className={`flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors ${
                          isViewing
                            ? "bg-layer2/20 text-teal-800 dark:text-teal-300"
                            : "bg-(--role-user-bg) text-(--role-user-text) hover:opacity-80"
                        }`}
                      >
                        <FileJson2 size={12} />
                        {isViewing ? t("Hide FHIR") : t("View FHIR")}
                      </button>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${stateBg(
                          state,
                        )}`}
                      >
                        {state || "UNKNOWN"}
                      </span>
                    </div>
                  </div>

                  {/* DSP Pipeline visualization */}
                  <DspPipeline state={state} />

                  {/* Metadata row */}
                  <div className="flex items-center gap-4 text-[11px] text-(--text-secondary)">
                    {timestamp > 0 && (
                      <span>
                        {t("Updated:")}{" "}
                        {new Date(timestamp).toLocaleString(undefined, {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </span>
                    )}
                    <span>
                      {t("Process: {id}…", { id: tr["@id"].slice(0, 8) })}
                    </span>
                    {isCompleted && (tr.dataPayload as DataPayload)?.total && (
                      <span className="text-green-800 dark:text-green-400">
                        {t("{n} resources transferred", {
                          n: (tr.dataPayload as DataPayload).total,
                        })}
                      </span>
                    )}
                  </div>

                  {/* FHIR Viewer panel (expanded) */}
                  {isViewing &&
                    (viewerLoading ? (
                      <div className="flex items-center gap-2 text-(--text-secondary) py-4 justify-center">
                        <Loader2 size={14} className="animate-spin" />
                        {isLiveTransfer(tr)
                          ? t("Fetching the data from the provider…")
                          : t("Loading FHIR data…")}
                      </div>
                    ) : live?.error ? (
                      <p className="text-xs text-(--badge-inactive-text) py-2">
                        {t("Could not fetch the data: {detail}", {
                          detail: live.error,
                        })}
                      </p>
                    ) : live?.result && !liveBundle ? (
                      <div className="font-mono text-xs overflow-x-auto max-h-96 overflow-y-auto p-3 border border-(--border) rounded-lg">
                        <JsonNode data={live.result.data} depth={0} />
                      </div>
                    ) : (
                      <FhirViewerPanel
                        transfer={tr}
                        bundle={bundle}
                        onClose={() => setViewingTransferId(null)}
                      />
                    ))}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
