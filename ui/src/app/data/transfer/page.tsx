"use client";

import { fetchApi } from "@/lib/api";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowRightLeft,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Copy,
  ExternalLink,
  FileJson2,
  Loader2,
  Play,
  RefreshCw,
  X,
  XCircle,
  Network,
} from "lucide-react";
import PageIntro from "@/components/PageIntro";

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

/** Resolve a DID to a short human-readable name */
function didToName(did: string): string {
  const slug = decodeURIComponent(did).split(":").pop()?.toLowerCase() ?? "";
  const names: Record<string, string> = {
    "alpha-klinik": "AlphaKlinik Berlin",
    pharmaco: "PharmaCo Research AG",
    medreg: "MedReg DE",
    lmc: "Limburg Medical Centre",
    irs: "Institut de Recherche Santé",
  };
  return names[slug] || slug || did.slice(0, 16);
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
 * @see https://docs.internationaldataspaces.org/ids-knowledgebase/dataspace-protocol/transfer-process
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
  if (s.includes("COMPLETED")) return "text-green-400";
  if (s.includes("TERMINATED") || s.includes("ERROR")) return "text-red-400";
  if (s.includes("STARTED")) return "text-blue-400";
  if (s.includes("SUSPENDED")) return "text-orange-400";
  return "text-yellow-400";
}

function stateBg(state: DspState) {
  const s = state?.toUpperCase() || "";
  if (s.includes("COMPLETED")) return "bg-green-900/40 text-green-400";
  if (s.includes("TERMINATED") || s.includes("ERROR")) {
    return "bg-red-900/40 text-red-400";
  }
  if (s.includes("STARTED")) return "bg-blue-900/40 text-blue-400";
  if (s.includes("SUSPENDED")) return "bg-orange-900/40 text-orange-400";
  return "bg-yellow-900/40 text-yellow-400";
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
        let color = "text-gray-600";
        if (isTerminated && i === 0) {
          // Show error on first uncompleted step
          icon = <XCircle size={14} className="text-red-400" />;
          color = "text-red-400";
        } else if (isPast) {
          icon = <CheckCircle2 size={14} className="text-green-400" />;
          color = "text-green-400";
        } else if (isActive) {
          if (step === "COMPLETED") {
            icon = <CheckCircle2 size={14} className="text-green-400" />;
            color = "text-green-400";
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
          <XCircle size={14} className="text-red-400" />
          <span className="text-[10px] text-red-400">TERMINATED</span>
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
  Patient: "bg-blue-900/50 text-blue-300 border-blue-700",
  Observation: "bg-purple-900/50 text-purple-300 border-purple-700",
  Condition: "bg-orange-900/50 text-orange-300 border-orange-700",
  Encounter: "bg-emerald-900/50 text-emerald-300 border-emerald-700",
  MedicationRequest: "bg-pink-900/50 text-pink-300 border-pink-700",
  DiagnosticReport: "bg-indigo-900/50 text-indigo-300 border-indigo-700",
  Immunization: "bg-teal-900/50 text-teal-300 border-teal-700",
  AllergyIntolerance: "bg-red-900/50 text-red-300 border-red-700",
  Procedure: "bg-cyan-900/50 text-cyan-300 border-cyan-700",
  CarePlan: "bg-lime-900/50 text-lime-300 border-lime-700",
};

function fhirColor(type: string): string {
  return (
    FHIR_RESOURCE_COLORS[type] || "bg-gray-800 text-gray-300 border-gray-600"
  );
}

/* ── Collapsible JSON Tree ── */

function JsonNode({ data, depth = 0 }: { data: unknown; depth?: number }) {
  const [collapsed, setCollapsed] = useState(depth > 1);

  if (data === null || data === undefined) {
    return <span className="text-gray-500">null</span>;
  }
  if (typeof data === "boolean") {
    return <span className="text-yellow-400">{String(data)}</span>;
  }
  if (typeof data === "number") {
    return <span className="text-cyan-400">{data}</span>;
  }
  if (typeof data === "string") {
    return <span className="text-green-400">&quot;{data}&quot;</span>;
  }

  if (Array.isArray(data)) {
    if (data.length === 0) return <span className="text-gray-500">[]</span>;
    return (
      <span>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="text-gray-400 hover:text-gray-200 inline-flex items-center"
        >
          {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
          <span className="text-gray-500 text-xs ml-0.5">[{data.length}]</span>
        </button>
        {!collapsed && (
          <div className="ml-4 border-l border-gray-700 pl-2">
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
      return <span className="text-gray-500">{"{}"}</span>;
    }
    return (
      <span>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="text-gray-400 hover:text-gray-200 inline-flex items-center"
        >
          {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
          <span className="text-gray-500 text-xs ml-0.5">
            {"{"}
            {entries.length}
            {"}"}
          </span>
        </button>
        {!collapsed && (
          <div className="ml-4 border-l border-gray-700 pl-2">
            {entries.map(([key, val]) => (
              <div key={key}>
                <span className="text-blue-300">{key}</span>
                <span className="text-gray-500">: </span>
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
    <div className="border border-gray-700 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-800/50 transition-colors"
      >
        {expanded ? (
          <ChevronDown size={12} className="text-gray-400" />
        ) : (
          <ChevronRight size={12} className="text-gray-400" />
        )}
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded border ${fhirColor(
            type,
          )}`}
        >
          {type}
        </span>
        <span className="text-xs text-gray-300 truncate flex-1">{summary}</span>
        <span className="text-[10px] text-gray-600">{r.id}</span>
      </button>
      {expanded && (
        <div className="px-3 pb-3 pt-1 bg-gray-900/50 font-mono text-xs overflow-x-auto max-h-64 overflow-y-auto">
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
    <div className="border border-layer2/50 rounded-xl overflow-hidden bg-gray-900/80 mt-3">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-layer2/10 border-b border-layer2/30">
        <div className="flex items-center gap-2">
          <FileJson2 size={16} className="text-layer2" />
          <span className="text-sm font-medium text-gray-200">
            FHIR Data — {aId ? assetLabel(aId as string) : "Bundle"}
          </span>
          {payload?.provider && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-400">
              from {payload.provider}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`/graph?highlight=${encodeURIComponent(
              aId ? assetLabel(aId as string) : "FHIR",
            )}`}
            className="flex items-center gap-1 text-[11px] text-green-400 hover:text-green-300 transition-colors"
          >
            View in Graph <Network size={10} />
          </a>
          <a
            href="https://fire.ly/fhir-tools/fhir-viewer/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[11px] text-layer2 hover:text-layer2/80 transition-colors"
          >
            Open FHIR Viewer <ExternalLink size={10} />
          </a>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Summary stats */}
      <div className="px-4 py-3 border-b border-gray-700 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <div className="text-[10px] text-gray-500 uppercase tracking-wide">
            Total Resources
          </div>
          <div className="text-lg font-semibold text-gray-200">
            {bundle?.entry?.length ?? payload?.total ?? "—"}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-gray-500 uppercase tracking-wide">
            Resource Types
          </div>
          <div className="text-lg font-semibold text-gray-200">
            {Object.keys(resourceCounts).length ||
              payload?.containedResourceTypes?.length ||
              "—"}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-gray-500 uppercase tracking-wide">
            Transferred
          </div>
          <div className="text-sm text-gray-300">
            {payload?.transferredAt
              ? new Date(payload.transferredAt).toLocaleString(undefined, {
                  dateStyle: "short",
                  timeStyle: "short",
                })
              : "—"}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-gray-500 uppercase tracking-wide">
            Size
          </div>
          <div className="text-sm text-gray-300">
            {payload?.sizeBytes
              ? `${(payload.sizeBytes / 1024).toFixed(0)} KB`
              : "—"}
          </div>
        </div>
      </div>

      {/* Resource type pills */}
      {(Object.keys(resourceCounts).length > 0 ||
        (payload?.containedResourceTypes?.length ?? 0) > 0) && (
        <div className="px-4 py-2 border-b border-gray-700 flex flex-wrap gap-1.5">
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
      <div className="px-4 py-2 border-b border-gray-700 flex items-center justify-between">
        <div className="flex gap-1">
          <button
            onClick={() => setViewMode("resources")}
            className={`text-xs px-2.5 py-1 rounded ${
              viewMode === "resources"
                ? "bg-layer2/20 text-layer2"
                : "text-gray-400 hover:text-gray-200"
            }`}
          >
            Resources
          </button>
          <button
            onClick={() => setViewMode("json")}
            className={`text-xs px-2.5 py-1 rounded ${
              viewMode === "json"
                ? "bg-layer2/20 text-layer2"
                : "text-gray-400 hover:text-gray-200"
            }`}
          >
            Raw JSON
          </button>
        </div>
        <button
          onClick={copyJson}
          className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-gray-200"
        >
          <Copy size={10} />
          {copied ? "Copied!" : "Copy"}
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
          <div className="p-6 text-center text-sm text-gray-500">
            <FileJson2 size={24} className="mx-auto mb-2 text-gray-600" />
            <p>Full FHIR Bundle data not available for this transfer.</p>
            <p className="text-xs mt-1">
              Transfer metadata: {payload?.total ?? 0} resources (
              {payload?.containedResourceTypes?.join(", ") || "unknown"})
            </p>
          </div>
        ) : (
          <pre className="p-4 font-mono text-xs text-gray-300 overflow-x-auto">
            {JSON.stringify(bundle || payload, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}

/* ── Main Page ── */

export default function DataTransferPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center gap-2 text-gray-500 p-10">
          <Loader2 size={16} className="animate-spin" />
          Loading…
        </div>
      }
    >
      <DataTransferContent />
    </Suspense>
  );
}

function DataTransferContent() {
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

  useEffect(() => {
    fetchApi("/api/participants")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        const list: ParticipantCtx[] = Array.isArray(d)
          ? d
          : d.participants || [];
        setParticipants(list);
        if (!selectedCtx && list.length > 0) {
          setSelectedCtx(list[0]["@id"]);
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

    const results: string[] = [];
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
          results.push(assetLabel(assetId || agrId.slice(0, 12)));
        } else {
          const err = await res.json().catch(() => ({}));
          const detail =
            (err as Record<string, string>).detail ||
            (err as Record<string, string>).error ||
            `HTTP ${res.status}`;
          results.push(
            `Error: ${assetLabel(assetId || agrId.slice(0, 12))} — ${detail}`,
          );
        }
      } catch {
        results.push(
          `Error: ${assetLabel(assetId || agrId.slice(0, 12))} — Network error`,
        );
      }
    }

    const errors = results.filter((r) => r.startsWith("Error"));
    if (errors.length === 0) {
      setResult(
        results.length === 1
          ? `Transfer started for ${results[0]}`
          : `${results.length} transfers started successfully`,
      );
    } else {
      setResult(errors.join("\n"));
    }
    await refreshTransfers();
    setSelectedAgreements(new Set());
    setInitiating(false);
  };

  // Check which agreements already have transfers
  const agreementHasTransfer = (agrId: string) =>
    transfers.some(
      (t) => f(t as Record<string, unknown>, "contractId") === agrId,
    );

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

  const filteredTransfers =
    statusFilter === "ALL"
      ? transfers
      : transfers.filter(
          (t) =>
            f(t as Record<string, unknown>, "state")?.toUpperCase() ===
            statusFilter,
        );

  // Load FHIR bundles on demand
  const openFhirViewer = async (transferId: string) => {
    if (viewingTransferId === transferId) {
      setViewingTransferId(null);
      return;
    }
    setViewingTransferId(transferId);
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
    <div className="max-w-5xl mx-auto px-6 py-10">
      <PageIntro
        title="Data Transfers"
        icon={ArrowRightLeft}
        description="Monitor and initiate EDC-V data transfers via the DSP Transfer Process (Signalling Protocol). Once a contract is agreed, start a transfer to pull FHIR or OMOP data from the provider's data plane."
        prevStep={{ href: "/negotiate", label: "Contract Negotiation" }}
        nextStep={{ href: "/admin", label: "Operator Dashboard" }}
        infoText="The DSP Signalling Protocol defines the transfer state machine: REQUESTED → STARTED → COMPLETED (or TERMINATED on failure). Each transfer is secured by EDC-V access tokens issued during the STARTED phase."
        docLink={{
          href: "https://docs.internationaldataspaces.org/ids-knowledgebase/dataspace-protocol/transfer-process",
          label: "DSP Transfer Process Spec",
          external: true,
        }}
      />

      {/* Participant selector */}
      <div className="mb-6">
        <label className="text-xs text-gray-500 mb-1 block">
          Requesting as (your participant)
        </label>
        <select
          value={selectedCtx}
          onChange={(e) => setSelectedCtx(e.target.value)}
          className="w-full max-w-md px-3 py-2 bg-gray-800 border border-gray-600 rounded text-sm"
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
      <div className="border border-gray-700 rounded-xl p-5 mb-8">
        <div className="flex items-center gap-2 mb-1">
          <Play size={16} className="text-layer2" />
          <h2 className="font-semibold text-sm">
            Start Transfer from Agreement
          </h2>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          Select a finalized contract agreement to pull data via{" "}
          <code className="text-gray-400">HttpData-PULL</code>.
        </p>

        {result && (
          <div
            className={`mb-4 p-3 rounded text-sm whitespace-pre-line ${
              result.startsWith("Error")
                ? "bg-red-900/40 border border-red-700 text-red-300"
                : "bg-green-900/40 border border-green-700 text-green-300"
            }`}
          >
            {result}
          </div>
        )}

        {agreements.length === 0 && !loading && (
          <p className="text-xs text-gray-500">
            No finalized agreements found. Complete a{" "}
            <a href="/negotiate" className="text-layer2 hover:underline">
              contract negotiation
            </a>{" "}
            first.
          </p>
        )}

        {agreements.length > 0 && (
          <form onSubmit={handleInitiate} className="space-y-3">
            {/* Select All */}
            <label className="flex items-center gap-2 px-3 py-2 text-xs text-gray-400 cursor-pointer hover:text-gray-200">
              <input
                type="checkbox"
                checked={selectedAgreements.size === agreements.length}
                onChange={toggleAll}
                className="accent-layer2"
              />
              Select All ({agreements.length})
            </label>

            <div className="space-y-2">
              {visibleAgreements.map((agr) => {
                const agrId = agr["@id"];
                const aId = f(agr as Record<string, unknown>, "assetId");
                const cp = f(agr as Record<string, unknown>, "counterPartyId");
                const hasTransfer = agreementHasTransfer(agrId);

                return (
                  <label
                    key={agrId}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedAgreements.has(agrId)
                        ? "border-layer2 bg-layer2/10"
                        : "border-gray-700 hover:border-gray-500 bg-gray-800/50"
                    } ${hasTransfer ? "opacity-60" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedAgreements.has(agrId)}
                      onChange={() => toggleAgreement(agrId)}
                      className="accent-layer2"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-200">
                        {aId ? assetLabel(aId as string) : agrId.slice(0, 12)}
                      </p>
                      <p className="text-xs text-gray-500">
                        Provider: {cp ? didToName(cp as string) : "—"}
                        {hasTransfer && (
                          <span className="ml-2 text-yellow-500">
                            (transfer in progress)
                          </span>
                        )}
                      </p>
                    </div>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-900/40 text-green-400">
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
                className="flex items-center gap-1 text-xs text-layer2 hover:text-layer2/80"
              >
                {showAllAgreements ? (
                  <>
                    <ChevronDown size={12} /> Show less
                  </>
                ) : (
                  <>
                    <ChevronRight size={12} /> Show{" "}
                    {agreements.length - AGREEMENTS_PAGE_SIZE} more
                  </>
                )}
              </button>
            )}

            <button
              type="submit"
              disabled={initiating || selectedAgreements.size === 0}
              className="flex items-center gap-2 px-4 py-2 bg-layer2 text-white rounded text-sm font-medium hover:bg-layer2/90 disabled:opacity-50"
            >
              {initiating ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <ArrowRightLeft size={14} />
              )}
              {selectedAgreements.size > 1
                ? `Start ${selectedAgreements.size} Transfers`
                : "Start Transfer"}
            </button>
          </form>
        )}
      </div>

      {/* ── Transfer Processes (DSP State Machine) ── */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-sm">
          Transfer Processes{" "}
          <span className="font-normal text-gray-500">
            (DSP Signalling Protocol)
          </span>
        </h2>
        <button
          onClick={refreshTransfers}
          disabled={refreshing}
          className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-200 disabled:opacity-50"
        >
          <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} />
          Refresh
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
                    ? "bg-layer2/20 text-layer2 border border-layer2/40"
                    : "bg-gray-800 text-gray-400 border border-gray-700 hover:border-gray-500"
                }`}
              >
                {s} ({count})
              </button>
            );
          })}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-gray-500">
          <Loader2 size={16} className="animate-spin" />
          Loading transfers…
        </div>
      ) : filteredTransfers.length === 0 ? (
        <p className="text-gray-500 text-sm">
          {transfers.length === 0
            ? "No transfer processes yet. Start one from an agreed contract above."
            : `No transfers matching "${statusFilter}".`}
        </p>
      ) : (
        <div className="grid gap-3">
          {filteredTransfers.map((t) => {
            const state = f(t as Record<string, unknown>, "state");
            const aId = t.assetId || f(t as Record<string, unknown>, "assetId");
            const transferType =
              f(t as Record<string, unknown>, "transferType") ||
              "HttpData-PULL";
            const timestamp =
              (t.stateTimestamp as number) ||
              (t["edc:stateTimestamp"] as number) ||
              0;
            const isCompleted = state?.toUpperCase().includes("COMPLETED");
            const isViewing = viewingTransferId === t["@id"];
            const bundle = fhirBundles?.[aId as string] ?? null;

            return (
              <div
                key={t["@id"]}
                className={`p-4 border rounded-xl space-y-3 transition-colors ${
                  isViewing
                    ? "border-layer2/50 bg-gray-800/30"
                    : "border-gray-700"
                }`}
              >
                {/* Header row */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ArrowRightLeft size={14} className={stateColor(state)} />
                    <span className="text-sm font-medium text-gray-200">
                      {aId ? assetLabel(aId as string) : t["@id"].slice(0, 12)}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-400">
                      {transferType}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => openFhirViewer(t["@id"])}
                      className={`flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors ${
                        isViewing
                          ? "bg-layer2/20 text-layer2"
                          : "bg-green-900/30 text-green-400 hover:bg-green-900/50"
                      }`}
                    >
                      <FileJson2 size={12} />
                      {isViewing ? "Hide FHIR" : "View FHIR"}
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
                <div className="flex items-center gap-4 text-[11px] text-gray-500">
                  {timestamp > 0 && (
                    <span>
                      Updated:{" "}
                      {new Date(timestamp).toLocaleString(undefined, {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </span>
                  )}
                  <span>Process: {t["@id"].slice(0, 8)}…</span>
                  {isCompleted && (t.dataPayload as DataPayload)?.total && (
                    <span className="text-green-500">
                      {(t.dataPayload as DataPayload).total} resources
                      transferred
                    </span>
                  )}
                </div>

                {/* FHIR Viewer panel (expanded) */}
                {isViewing &&
                  (loadingFhir ? (
                    <div className="flex items-center gap-2 text-gray-500 py-4 justify-center">
                      <Loader2 size={14} className="animate-spin" />
                      Loading FHIR data…
                    </div>
                  ) : (
                    <FhirViewerPanel
                      transfer={t}
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
  );
}
