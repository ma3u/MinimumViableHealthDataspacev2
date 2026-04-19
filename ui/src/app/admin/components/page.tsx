"use client";

import { fetchApi } from "@/lib/api";
import { COMPONENT_INFO, type ComponentMeta } from "@/lib/edc/component-info";
import {
  AZURE_EGRESS_FREE_GIB,
  AZURE_EGRESS_USD_PER_GIB,
  AZURE_FILES_USD_PER_GIB,
  costForEnvironment,
  formatEur,
  formatUsd,
  USD_TO_EUR,
  type AcaAppSpec,
} from "@/lib/azure-pricing";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart2,
  ChevronDown,
  ChevronRight,
  Cpu,
  HardDrive,
  Info,
  Loader2,
  Network,
  RefreshCw,
  Server,
  Shield,
  Users,
  Workflow,
  X,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types — Layer view (existing API)
// ---------------------------------------------------------------------------

interface MemInfo {
  usedMB: number;
  limitMB: number;
  percent: number;
}

interface ComponentInfo {
  container: string;
  component: string;
  layer: string;
  status: "healthy" | "unhealthy" | "running" | "stopped" | "unknown";
  uptime: string;
  cpu: number;
  mem: MemInfo;
}

interface ParticipantInfo {
  id: string;
  displayName: string;
  organization: string;
  role: string;
  did: string;
  state: string;
  profileCount: number;
}

interface Snapshot {
  timestamp: string;
  dockerAvailable: boolean;
  metricsSource?: "docker" | "azure-monitor" | "none";
  // Set to "azure" when the API server detects DEPLOYMENT_TARGET=azure.
  // This drives the Azure-vs-StackIT cost panel choice independently of
  // whether the live metrics call succeeded.
  deploymentTarget?: "azure" | "docker" | "stackit" | "unknown";
  components: ComponentInfo[];
  participants: ParticipantInfo[];
}

interface HistoryEntry {
  ts: number;
  cpu: number;
  mem: number;
}

interface PeakEntry {
  maxCpu: number;
  maxMemMB: number;
  since: number;
}

// ---------------------------------------------------------------------------
// Types — Topology view (new API)
// ---------------------------------------------------------------------------

type Severity = "critical" | "warning" | "healthy" | "unknown";

interface TopoComponent {
  name: string;
  container: string;
  status: string;
  severity: Severity;
  cpu: number;
  memMB: number;
  uptime: string;
}

interface TopoParticipant {
  id: string;
  displayName: string;
  organization: string;
  role: string;
  did: string;
  state: string;
  health: Severity;
  components: TopoComponent[];
}

interface InfraComponent extends TopoComponent {
  layer: string;
}

interface TopologyData {
  timestamp: string;
  dockerAvailable: boolean;
  participants: TopoParticipant[];
  infrastructure: InfraComponent[];
  summary: {
    totalParticipants: number;
    degradedParticipants: number;
    totalInfra: number;
  };
  clusterMetrics?: {
    currentCpu: number;
    currentMemMB: number;
    last24h: { peakCpu: number; peakMemMB: number; samples: number };
    prev24h: { peakCpu: number; peakMemMB: number; samples: number };
  };
}

type ViewMode = "layer" | "participant";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REFRESH_INTERVAL = 30_000;
const MAX_HISTORY = 2880;

const LAYER_META: Record<
  string,
  { label: string; icon: React.ComponentType<any>; color: string }
> = {
  "edc-core": {
    label: "EDC-V Core",
    icon: Server,
    color: "text-[var(--accent)]",
  },
  identity: {
    label: "Identity & Trust",
    icon: Shield,
    color: "text-[var(--accent)]",
  },
  cfm: {
    label: "Connector Fabric Manager",
    icon: Workflow,
    color: "text-[var(--success-text)]",
  },
  infrastructure: {
    label: "Infrastructure",
    icon: HardDrive,
    color: "text-[var(--warning-text)]",
  },
};

const STATUS_COLORS: Record<string, string> = {
  healthy: "bg-emerald-500",
  running: "bg-blue-500",
  unhealthy: "bg-red-500",
  stopped: "bg-gray-600",
  unknown: "bg-gray-500",
};

const SEVERITY_STYLES: Record<
  Severity,
  { dot: string; border: string; bg: string }
> = {
  critical: {
    dot: "bg-red-500 animate-pulse",
    border: "border-red-500/60",
    bg: "bg-red-900/10",
  },
  warning: {
    dot: "bg-yellow-500",
    border: "border-yellow-500/40",
    bg: "bg-yellow-900/10",
  },
  healthy: {
    dot: "bg-emerald-500",
    border: "border-[var(--border)]",
    bg: "",
  },
  unknown: {
    dot: "bg-gray-500",
    border: "border-[var(--border)]",
    bg: "",
  },
};

const ROLE_COLORS: Record<string, string> = {
  DATA_HOLDER: "bg-blue-500/20 text-[var(--accent)]",
  DATA_USER: "bg-[var(--badge-active-bg)] text-[var(--badge-active-text)]",
  HDAB: "bg-purple-500/20 text-[var(--accent)]",
  "health-data-access-body": "bg-purple-500/20 text-[var(--accent)]",
  "data-holder": "bg-blue-500/20 text-[var(--accent)]",
  "data-user": "bg-[var(--badge-active-bg)] text-[var(--badge-active-text)]",
};

// ---------------------------------------------------------------------------
// Sparkline SVG
// ---------------------------------------------------------------------------

function Sparkline({
  data,
  max,
  color,
  width = 80,
  height = 24,
}: {
  data: number[];
  max: number;
  color: string;
  width?: number;
  height?: number;
}) {
  if (data.length < 2)
    return (
      <span className="text-[10px] text-[var(--text-secondary)]">
        collecting…
      </span>
    );

  const effectiveMax = max > 0 ? max : 1;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y =
      height - (Math.min(v, effectiveMax) / effectiveMax) * (height - 2) - 1;
    return `${x},${y}`;
  });

  return (
    <svg width={width} height={height} className="inline-block">
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        points={points.join(" ")}
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className={`w-2 h-2 rounded-full ${
          STATUS_COLORS[status] || STATUS_COLORS.unknown
        }`}
      />
      <span className="text-xs capitalize">{status}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Severity dot
// ---------------------------------------------------------------------------

function SeverityDot({ severity }: { severity: Severity }) {
  return (
    <span
      className={`w-2.5 h-2.5 rounded-full inline-block ${SEVERITY_STYLES[severity].dot}`}
      title={severity}
    />
  );
}

// ---------------------------------------------------------------------------
// Info Popover — ⓘ button that shows component metadata
// ---------------------------------------------------------------------------

function InfoPopover({ name }: { name: string }) {
  const [open, setOpen] = useState(false);
  const meta: ComponentMeta | undefined = COMPONENT_INFO[name];
  if (!meta) return null;

  return (
    <span className="relative inline-block">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        className="text-[var(--text-secondary)] hover:text-teal-800 dark:hover:text-teal-300 transition-colors p-0.5"
        title={`Info: ${name}`}
      >
        <Info size={13} />
      </button>
      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          {/* Popover */}
          <div className="absolute z-40 left-6 top-0 w-80 bg-[var(--surface-2)] border border-[var(--border-ui)] rounded-xl shadow-2xl p-4 text-xs space-y-2">
            <div className="flex items-center justify-between mb-1">
              <span className="font-semibold text-sm text-[var(--text-primary)]">
                {name}
              </span>
              <button
                onClick={() => setOpen(false)}
                className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                <X size={14} />
              </button>
            </div>
            <p className="text-[var(--text-secondary)] leading-relaxed">
              {meta.description}
            </p>
            <div className="grid grid-cols-[80px_1fr] gap-y-1.5 gap-x-2 pt-1 border-t border-[var(--border)]">
              <span className="text-[var(--text-secondary)]">Protocol</span>
              <span className="text-[var(--text-primary)]">
                {meta.protocol}
              </span>
              <span className="text-[var(--text-secondary)]">Ports</span>
              <span className="text-[var(--text-primary)] font-mono text-[11px]">
                {meta.ports}
              </span>
              <span className="text-[var(--text-secondary)]">Depends on</span>
              <span className="text-[var(--text-primary)]">
                {meta.dependsOn.length > 0 ? meta.dependsOn.join(", ") : "None"}
              </span>
              <span className="text-[var(--text-secondary)]">Health</span>
              <span className="text-[var(--text-primary)]">
                {meta.healthSource}
              </span>
            </div>
          </div>
        </>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Component Row (Layer view)
// ---------------------------------------------------------------------------

function ComponentRow({
  comp,
  history,
}: {
  comp: ComponentInfo;
  history: HistoryEntry[];
}) {
  const cpuData = history.map((h) => h.cpu);
  const memData = history.map((h) => h.mem);
  const maxCpu = Math.max(...cpuData, 1);

  return (
    <tr className="border-b border-[var(--border)] hover:bg-[var(--surface-2)]/40 transition-colors">
      <td className="py-2.5 px-3 text-sm font-medium text-[var(--text-primary)]">
        <span className="flex items-center gap-1.5">
          {comp.component}
          <InfoPopover name={comp.component} />
        </span>
      </td>
      <td className="py-2.5 px-3">
        <StatusBadge status={comp.status} />
      </td>
      <td className="py-2.5 px-3 text-xs text-[var(--text-secondary)] tabular-nums">
        {comp.uptime}
      </td>
      <td className="py-2.5 px-3">
        <div className="flex items-center gap-2">
          <span className="text-xs tabular-nums text-[var(--text-primary)] w-12 text-right">
            {comp.cpu.toFixed(1)}%
          </span>
          <Sparkline data={cpuData} max={maxCpu} color="#60a5fa" />
        </div>
      </td>
      <td className="py-2.5 px-3">
        <div className="flex items-center gap-2">
          <span className="text-xs tabular-nums text-[var(--text-primary)] w-16 text-right">
            {comp.mem.usedMB < 1 ? "<1" : Math.round(comp.mem.usedMB)} MB
          </span>
          <Sparkline
            data={memData}
            max={comp.mem.limitMB || 100}
            color="#a78bfa"
          />
        </div>
      </td>
      <td className="py-2.5 px-3 text-xs text-[var(--text-secondary)] tabular-nums">
        {comp.mem.percent.toFixed(1)}%
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Topology Component Card (Participant view)
// ---------------------------------------------------------------------------

function TopoComponentCard({ comp }: { comp: TopoComponent }) {
  const sev = SEVERITY_STYLES[comp.severity];
  return (
    <div
      className={`border rounded-lg p-3 ${sev.border} ${sev.bg} transition-colors`}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-primary)]">
          <SeverityDot severity={comp.severity} />
          {comp.name}
          <InfoPopover name={comp.name} />
        </span>
        <span className="text-[10px] text-[var(--text-secondary)] capitalize">
          {comp.status}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-1 text-[10px] text-[var(--text-secondary)]">
        <span>
          <Cpu size={9} className="inline mr-0.5" />
          {comp.cpu.toFixed(1)}%
        </span>
        <span>
          <HardDrive size={9} className="inline mr-0.5" />
          {comp.memMB < 1 ? "<1" : Math.round(comp.memMB)} MB
        </span>
        <span className="text-right">{comp.uptime}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Participant Topology Section (expandable)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Resource summary helper
// ---------------------------------------------------------------------------

function ResourceSummary({
  components,
  label,
}: {
  components: TopoComponent[];
  peaks?: Map<string, PeakEntry>;
  label?: string;
}) {
  const totalCpu = components.reduce((s, c) => s + c.cpu, 0);
  const totalMem = components.reduce((s, c) => s + c.memMB, 0);
  const fmtMem = (mb: number) =>
    mb > 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`;

  return (
    <div className="flex items-center gap-x-4 text-xs text-[var(--text-secondary)]">
      {label && (
        <span className="text-[var(--text-secondary)] mr-1">{label}</span>
      )}
      <span className="flex items-center gap-1 tabular-nums">
        <Cpu size={10} className="text-[var(--accent)]" />
        <span className="text-[var(--text-primary)] font-medium">
          CPU {totalCpu.toFixed(1)}%
        </span>
      </span>
      <span className="flex items-center gap-1 tabular-nums">
        <HardDrive size={10} className="text-[var(--accent)]" />
        <span className="text-[var(--text-primary)] font-medium">
          MEM {fmtMem(totalMem)}
        </span>
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trend arrow — compares current window to previous window
// ---------------------------------------------------------------------------

function TrendArrow({
  current,
  previous,
  hasPrevData,
}: {
  current: number;
  previous: number;
  hasPrevData: boolean;
}) {
  if (!hasPrevData)
    return <span className="text-[var(--text-secondary)]">—</span>;
  const delta = current - previous;
  const pct =
    previous > 0 ? Math.round((delta / previous) * 100) : delta > 0 ? 100 : 0;
  if (Math.abs(pct) < 3) return <span title="Stable vs yesterday">→</span>;
  if (delta > 0)
    return (
      <span
        className="text-[var(--danger-text)]"
        title={`+${pct}% vs yesterday`}
      >
        ↑
      </span>
    );
  return (
    <span className="text-[var(--success-text)]" title={`${pct}% vs yesterday`}>
      ↓
    </span>
  );
}

// ---------------------------------------------------------------------------
// Cluster Resource Banner — 24h peaks with day-over-day trend
// ---------------------------------------------------------------------------

function ClusterResourceBanner({
  metrics,
}: {
  metrics: NonNullable<TopologyData["clusterMetrics"]>;
}) {
  const fmtMem = (mb: number) =>
    mb > 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`;
  const hasPrev = metrics.prev24h.samples > 0;

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border border-[var(--border)] rounded-xl px-4 py-3 mb-6 bg-[var(--surface)]/40">
      <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
        <Activity
          size={14}
          className="text-teal-800 dark:text-teal-300 shrink-0"
        />
        <span className="font-medium text-[var(--text-primary)]">Cluster</span>
      </div>

      {/* Current */}
      <div className="flex items-center gap-1.5 text-xs">
        <Cpu size={11} className="text-[var(--accent)]" />
        <span className="text-[var(--text-primary)] tabular-nums">
          {metrics.currentCpu.toFixed(1)}%
        </span>
        <span className="text-[var(--text-secondary)]">now</span>
      </div>
      <div className="flex items-center gap-1.5 text-xs">
        <HardDrive size={11} className="text-[var(--accent)]" />
        <span className="text-[var(--text-primary)] tabular-nums">
          {fmtMem(metrics.currentMemMB)}
        </span>
        <span className="text-[var(--text-secondary)]">now</span>
      </div>

      <span className="text-[var(--text-secondary)]">│</span>

      {/* 24h peaks */}
      <div className="flex items-center gap-1 text-xs">
        <TrendArrow
          current={metrics.last24h.peakCpu}
          previous={metrics.prev24h.peakCpu}
          hasPrevData={hasPrev}
        />
        <span className="text-[var(--accent)] tabular-nums font-medium">
          CPU {metrics.last24h.peakCpu.toFixed(1)}%
        </span>
        <span className="text-[var(--text-secondary)]">peak 24h</span>
      </div>
      <div className="flex items-center gap-1 text-xs">
        <TrendArrow
          current={metrics.last24h.peakMemMB}
          previous={metrics.prev24h.peakMemMB}
          hasPrevData={hasPrev}
        />
        <span className="text-[var(--accent)] tabular-nums font-medium">
          MEM {fmtMem(metrics.last24h.peakMemMB)}
        </span>
        <span className="text-[var(--text-secondary)]">peak 24h</span>
      </div>

      {metrics.last24h.samples > 0 && (
        <span
          className="text-[10px] text-[var(--text-secondary)]"
          title="Number of data points collected in the last 24h"
        >
          ({metrics.last24h.samples} samples)
        </span>
      )}
    </div>
  );
}

function ParticipantTopologySection({
  participant,
  peaks,
}: {
  participant: TopoParticipant;
  peaks: Map<string, PeakEntry>;
}) {
  const [expanded, setExpanded] = useState(
    participant.health === "critical" || participant.health === "warning",
  );
  const sev = SEVERITY_STYLES[participant.health];
  const roleClass =
    ROLE_COLORS[participant.role] ||
    "bg-gray-500/20 text-[var(--text-secondary)]";

  return (
    <div
      className={`border rounded-xl ${sev.border} ${sev.bg} overflow-hidden transition-all`}
    >
      {/* Header bar — click to expand/collapse */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[var(--surface-2)]/40 transition-colors"
      >
        {expanded ? (
          <ChevronDown
            size={14}
            className="text-[var(--text-secondary)] shrink-0"
          />
        ) : (
          <ChevronRight
            size={14}
            className="text-[var(--text-secondary)] shrink-0"
          />
        )}
        <SeverityDot severity={participant.health} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm text-[var(--text-primary)]">
              {participant.displayName}
            </span>
            <span className="text-xs text-[var(--text-secondary)]">
              {participant.organization}
            </span>
          </div>
          <ResourceSummary components={participant.components} peaks={peaks} />
        </div>
        <span
          className={`text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0 ${roleClass}`}
        >
          {participant.role}
        </span>
        <span className="text-[10px] text-[var(--text-secondary)] shrink-0">
          {participant.components.length} services
        </span>
      </button>

      {/* Expanded: DID + component grid */}
      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-[var(--border)]/60">
          <div className="flex items-center gap-4 text-[11px] text-[var(--text-secondary)] mb-3">
            <span>
              DID:{" "}
              <span className="font-mono text-[var(--text-secondary)]">
                {participant.did.length > 40
                  ? participant.did.slice(0, 40) + "…"
                  : participant.did}
              </span>
            </span>
            <span>
              State:{" "}
              <span
                className={
                  participant.state === "CREATED"
                    ? "text-[var(--success-text)]"
                    : "text-[var(--warning-text)]"
                }
              >
                {participant.state}
              </span>
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
            {participant.components.map((c) => (
              <TopoComponentCard key={c.container} comp={c} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Critical Banner
// ---------------------------------------------------------------------------

function CriticalBanner({
  degraded,
  total,
  participants,
}: {
  degraded: number;
  total: number;
  participants: TopoParticipant[];
}) {
  if (degraded === 0) return null;
  const names = participants
    .filter((p) => p.health === "critical" || p.health === "warning")
    .map((p) => p.displayName);

  return (
    <div className="flex items-center gap-3 border border-red-500/40 bg-red-900/15 rounded-xl px-4 py-3 mb-6">
      <AlertTriangle size={18} className="text-[var(--danger-text)] shrink-0" />
      <div className="text-sm">
        <span className="font-semibold text-[var(--danger-text)]">
          {degraded} of {total} participants degraded
        </span>
        <span className="text-[var(--text-secondary)] ml-2">
          — {names.join(", ")}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cost Estimator — StackIT server mapping + per-participant breakdown
// ---------------------------------------------------------------------------

// StackIT-equivalent node definitions (STACKIT Compute Engine, Frankfurt DC)
// Prices in EUR/month, based on European sovereign cloud rates (GDPR-ready).
const STACKIT_NODES = [
  {
    id: "neo4j",
    label: "Graph DB (Neo4j)",
    flavor: "4 vCPU / 8 GB RAM",
    eur: 48,
    components: ["Neo4j", "Neo4j Proxy"],
    note: "Handles 5 300+ nodes across FHIR, OMOP, SNOMED, ICD-10, LOINC layers",
  },
  {
    id: "datastore",
    label: "Data Store (PostgreSQL + NATS)",
    flavor: "2 vCPU / 4 GB RAM",
    eur: 28,
    components: ["PostgreSQL", "NATS"],
    note: "Metadata for all 19 JAD services + async event bus",
  },
  {
    id: "identity",
    label: "Identity & Secrets",
    flavor: "2 vCPU / 4 GB RAM",
    eur: 28,
    components: ["Keycloak", "Vault", "Traefik"],
    note: "OIDC/PKCE SSO, secrets management, TLS termination",
  },
  {
    id: "cfm",
    label: "CFM Platform",
    flavor: "2 vCPU / 4 GB RAM",
    eur: 28,
    components: [
      "Tenant Manager",
      "Provision Manager",
      "EDC-V Agent",
      "Keycloak Agent",
      "Onboarding Agent",
      "Registration Agent",
    ],
    note: "Connector Fabric Manager orchestrates participant onboarding & provisioning",
  },
  {
    id: "ui",
    label: "UI / API Gateway",
    flavor: "1 vCPU / 2 GB RAM",
    eur: 14,
    components: ["UI"],
    note: "Next.js frontend + Neo4j proxy API bridge",
  },
];

// Per-participant allocation: 2 GB RAM target (StackIT smallest compute tier)
const PER_PARTICIPANT_COMPUTE_EUR = 13; // 1 vCPU / 2 GB → ~€13/month
const PER_PARTICIPANT_STORAGE_GB = 2; // base allocation per participant
const HEALTH_DATA_STORAGE_GB = 10; // additional for DATA_HOLDER role (avg)
const STORAGE_EUR_PER_GB = 0.08; // StackIT block storage €0.08/GB/month

// Network: Control Plane ↔ Data Plane (DSP negotiation + transfer receipts)
const CP_DP_TRAFFIC_MB = 300; // ~300 MB/month per participant (DSP messages + audit)
const NETWORK_EUR_PER_GB = 0.09; // StackIT egress €0.09/GB

// Log injection: participant audit logs → centralised SIEM/Loki
const LOG_INJECTION_MB = 150; // ~150 MB/month per participant (EHDS Article 50 audit trail)
const LOG_EUR_PER_GB = 0.75; // log ingestion/storage (ELK/Loki service ~€0.75/GB)

const SHARED_EUR = STACKIT_NODES.reduce((s, n) => s + n.eur, 0);

function perParticipantEur(isDataHolder: boolean) {
  const storage =
    (PER_PARTICIPANT_STORAGE_GB + (isDataHolder ? HEALTH_DATA_STORAGE_GB : 0)) *
    STORAGE_EUR_PER_GB;
  const network = (CP_DP_TRAFFIC_MB / 1024) * NETWORK_EUR_PER_GB;
  const logs = (LOG_INJECTION_MB / 1024) * LOG_EUR_PER_GB;
  return PER_PARTICIPANT_COMPUTE_EUR + storage + network + logs;
}

const PER_USER_EUR = Math.round(perParticipantEur(false) * 100) / 100;
const PER_DATA_HOLDER_EUR = Math.round(perParticipantEur(true) * 100) / 100;

function CostEstimatorPanel({
  participantCount,
}: {
  participantCount: number;
}) {
  const [count, setCount] = useState(participantCount);
  // assume 60 % data holders, 40 % data users (typical EHDS mix)
  const dataHolders = Math.round(count * 0.6);
  const dataUsers = count - dataHolders;
  const participantCost =
    dataHolders * PER_DATA_HOLDER_EUR + dataUsers * PER_USER_EUR;
  const total = SHARED_EUR + participantCost;
  const perParticipant = count > 0 ? total / count : 0;

  const networkTotal = (count * CP_DP_TRAFFIC_MB) / 1024; // GB/month total
  const logTotal = (count * LOG_INJECTION_MB) / 1024; // GB/month total

  return (
    <div className="border border-[var(--border)] rounded-xl p-5 mt-10 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="font-semibold text-sm flex items-center gap-2 text-[var(--text-primary)]">
          <BarChart2 size={16} className="text-[var(--success-text)]" />
          Monthly Cost Estimate — STACKIT (Frankfurt)
        </h2>
        <div className="flex items-center gap-3 text-xs text-[var(--text-secondary)]">
          <label className="flex items-center gap-2">
            <Users size={13} />
            Participants:
            <input
              type="range"
              min={1}
              max={200}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              className="w-28 accent-emerald-500"
            />
            <span className="font-mono font-semibold text-[var(--text-primary)] w-6 text-right">
              {count}
            </span>
          </label>
        </div>
      </div>

      {/* StackIT node grid */}
      <div>
        <p className="text-[11px] text-[var(--text-secondary)] mb-2 uppercase tracking-wide">
          Shared Infrastructure (fixed)
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
          {STACKIT_NODES.map((n) => (
            <div
              key={n.id}
              className="border border-[var(--border)] rounded-lg p-3 bg-[var(--surface)]/40"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-[var(--text-primary)]">
                  {n.label}
                </span>
                <span className="text-xs font-mono text-[var(--success-text)]">
                  €{n.eur}/mo
                </span>
              </div>
              <p className="text-[10px] text-[var(--text-secondary)] font-mono mb-1.5">
                {n.flavor}
              </p>
              <div className="flex flex-wrap gap-1">
                {n.components.map((c) => (
                  <span
                    key={c}
                    className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--surface-2)] text-[var(--text-secondary)]"
                  >
                    {c}
                  </span>
                ))}
              </div>
              <p className="text-[9px] text-[var(--text-secondary)] mt-1.5 leading-relaxed">
                {n.note}
              </p>
            </div>
          ))}
        </div>
        <p className="text-xs text-[var(--text-secondary)] mt-2 text-right">
          Shared fixed:{" "}
          <span className="font-mono text-[var(--text-primary)]">
            €{SHARED_EUR}/mo
          </span>
        </p>
      </div>

      {/* Per-participant breakdown */}
      <div>
        <p className="text-[11px] text-[var(--text-secondary)] mb-2 uppercase tracking-wide">
          Per-Participant Cost (2 GB allocation)
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
          <div className="border border-[var(--border)] rounded-lg p-3 bg-[var(--surface)]/40">
            <div className="text-[var(--text-secondary)] mb-0.5">Compute</div>
            <div className="font-mono text-[var(--text-primary)]">
              €{PER_PARTICIPANT_COMPUTE_EUR}/mo
            </div>
            <div className="text-[10px] text-[var(--text-secondary)] mt-1">
              1 vCPU / 2 GB — Control Plane + Identity Hub + Issuer Service
            </div>
          </div>
          <div className="border border-[var(--border)] rounded-lg p-3 bg-[var(--surface)]/40">
            <div className="text-[var(--text-secondary)] mb-0.5">Storage</div>
            <div className="font-mono text-[var(--text-primary)]">
              €{(PER_PARTICIPANT_STORAGE_GB * STORAGE_EUR_PER_GB).toFixed(2)}{" "}
              <span className="text-[var(--text-secondary)] text-[10px]">
                (+€{(HEALTH_DATA_STORAGE_GB * STORAGE_EUR_PER_GB).toFixed(2)}{" "}
                data holders)
              </span>
            </div>
            <div className="text-[10px] text-[var(--text-secondary)] mt-1">
              {PER_PARTICIPANT_STORAGE_GB} GB base · {HEALTH_DATA_STORAGE_GB} GB
              health records · €{STORAGE_EUR_PER_GB}/GB/mo
            </div>
          </div>
          <div className="border border-[var(--border)] rounded-lg p-3 bg-[var(--surface)]/40">
            <div className="flex items-center gap-1 text-[var(--text-secondary)] mb-0.5">
              <Network size={11} />
              CP↔DP Network
            </div>
            <div className="font-mono text-[var(--text-primary)]">
              €{((CP_DP_TRAFFIC_MB / 1024) * NETWORK_EUR_PER_GB).toFixed(3)}/mo
            </div>
            <div className="text-[10px] text-[var(--text-secondary)] mt-1">
              {CP_DP_TRAFFIC_MB} MB/mo per participant (DSP negotiation +
              transfer receipts + audit) · €{NETWORK_EUR_PER_GB}/GB egress
            </div>
          </div>
          <div className="border border-[var(--border)] rounded-lg p-3 bg-[var(--surface)]/40">
            <div className="text-[var(--text-secondary)] mb-0.5">
              Log Injection
            </div>
            <div className="font-mono text-[var(--text-primary)]">
              €{((LOG_INJECTION_MB / 1024) * LOG_EUR_PER_GB).toFixed(3)}/mo
            </div>
            <div className="text-[10px] text-[var(--text-secondary)] mt-1">
              {LOG_INJECTION_MB} MB/mo EHDS Article 50 audit trail → SIEM/Loki ·
              €{LOG_EUR_PER_GB}/GB
            </div>
          </div>
        </div>
      </div>

      {/* Totals */}
      <div className="border border-[var(--border)] rounded-xl p-4 bg-[var(--surface)]/60">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
          <div>
            <div className="text-[10px] text-[var(--text-secondary)] mb-1">
              Shared fixed
            </div>
            <div className="font-mono text-lg font-semibold text-[var(--text-primary)]">
              €{SHARED_EUR}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-[var(--text-secondary)] mb-1">
              {count} × participants
            </div>
            <div className="font-mono text-lg font-semibold text-[var(--text-primary)]">
              €{participantCost.toFixed(0)}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-[var(--text-secondary)] mb-1">
              Network ({(networkTotal + logTotal).toFixed(1)} GB/mo)
            </div>
            <div className="font-mono text-lg font-semibold text-[var(--text-primary)]">
              €
              {(
                networkTotal * NETWORK_EUR_PER_GB +
                logTotal * LOG_EUR_PER_GB
              ).toFixed(1)}
            </div>
          </div>
          <div className="border-l border-[var(--border)]">
            <div className="text-[10px] text-[var(--text-secondary)] mb-1">
              Total / month
            </div>
            <div className="font-mono text-xl font-bold text-[var(--success-text)]">
              €{total.toFixed(0)}
            </div>
            <div className="text-[10px] text-[var(--text-secondary)] mt-0.5">
              €{perParticipant.toFixed(2)}/participant
            </div>
          </div>
        </div>
        <p className="text-[9px] text-[var(--text-secondary)] mt-3 text-center">
          Assumes 60 % DATA_HOLDER / 40 % DATA_USER mix · STACKIT Frankfurt ·
          prices excl. VAT · does not include Kubernetes management fee or
          premium support
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Azure Container Apps Cost Estimator — real reservations from /api/admin/components
// ---------------------------------------------------------------------------

// Hard-coded reservations mirror scripts/azure/*.sh. These are the minReplicas
// defaults under ADR-018 Workaround B (24×7, no scale-down). If Ops bumps a
// reservation, the live panel reflects it via the `snapshot.components` memLimit
// field; we keep this map as the fallback source of truth for names + memory.
const ACA_APP_SPECS: AcaAppSpec[] = [
  { name: "mvhd-controlplane", cpu: 0.5, memGiB: 1.0, minReplicas: 1 },
  { name: "mvhd-dp-fhir", cpu: 0.5, memGiB: 1.0, minReplicas: 1 },
  { name: "mvhd-dp-omop", cpu: 0.5, memGiB: 1.0, minReplicas: 1 },
  { name: "mvhd-identityhub", cpu: 0.5, memGiB: 1.0, minReplicas: 1 },
  { name: "mvhd-issuerservice", cpu: 0.25, memGiB: 0.5, minReplicas: 1 },
  { name: "mvhd-keycloak", cpu: 1.0, memGiB: 2.0, minReplicas: 1 },
  { name: "mvhd-vault", cpu: 0.25, memGiB: 0.5, minReplicas: 1 },
  { name: "mvhd-tenant-mgr", cpu: 0.5, memGiB: 1.0, minReplicas: 1 },
  { name: "mvhd-provision-mgr", cpu: 0.5, memGiB: 1.0, minReplicas: 1 },
  { name: "mvhd-postgres", cpu: 1.0, memGiB: 2.0, minReplicas: 1 },
  { name: "mvhd-nats", cpu: 0.25, memGiB: 0.5, minReplicas: 1 },
  { name: "mvhd-neo4j", cpu: 1.0, memGiB: 4.0, minReplicas: 1 },
  { name: "mvhd-neo4j-proxy", cpu: 0.25, memGiB: 0.5, minReplicas: 1 },
  { name: "mvhd-ui", cpu: 0.5, memGiB: 1.0, minReplicas: 1 },
];

// Default storage: Neo4j 20 GiB + PostgreSQL 10 GiB + Vault 2 GiB (Azure Files Premium ZRS)
const DEFAULT_STORAGE_GIB = 32;
// Default egress: rough estimate — most traffic is internal to the ACA env
const DEFAULT_EGRESS_GIB = 20;

function AzureCostEstimatorPanel({
  liveComponents,
}: {
  liveComponents: ComponentInfo[];
}) {
  const [storageGiB, setStorageGiB] = useState(DEFAULT_STORAGE_GIB);
  const [egressGiB, setEgressGiB] = useState(DEFAULT_EGRESS_GIB);

  // Prefer live memory reservations from the API (more accurate if ops changed them)
  const specs = useMemo<AcaAppSpec[]>(() => {
    return ACA_APP_SPECS.map((fallback) => {
      const live = liveComponents.find((c) => c.container === fallback.name);
      if (!live || live.mem.limitMB <= 0) return fallback;
      return {
        ...fallback,
        memGiB: Math.round((live.mem.limitMB / 1024) * 100) / 100,
      };
    });
  }, [liveComponents]);

  const cost = useMemo(
    () => costForEnvironment(specs, { storageGiB, egressGiB }),
    [specs, storageGiB, egressGiB],
  );

  const totalVcpu = specs.reduce((s, a) => s + a.cpu, 0);
  const totalMemGiB = specs.reduce((s, a) => s + a.memGiB, 0);

  return (
    <div className="border border-[var(--border)] rounded-xl p-5 mt-10 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="font-semibold text-sm flex items-center gap-2 text-[var(--text-primary)]">
          <BarChart2 size={16} className="text-[var(--success-text)]" />
          Monthly Cost Estimate — Azure Container Apps (Consumption, 24×7)
        </h2>
        <div className="flex items-center gap-4 text-xs text-[var(--text-secondary)]">
          <label className="flex items-center gap-2">
            <HardDrive size={13} />
            Storage GiB:
            <input
              type="range"
              min={0}
              max={200}
              value={storageGiB}
              onChange={(e) => setStorageGiB(Number(e.target.value))}
              className="w-24 accent-emerald-500"
            />
            <span className="font-mono font-semibold text-[var(--text-primary)] w-8 text-right">
              {storageGiB}
            </span>
          </label>
          <label className="flex items-center gap-2">
            <Network size={13} />
            Egress GiB:
            <input
              type="range"
              min={0}
              max={500}
              value={egressGiB}
              onChange={(e) => setEgressGiB(Number(e.target.value))}
              className="w-24 accent-emerald-500"
            />
            <span className="font-mono font-semibold text-[var(--text-primary)] w-8 text-right">
              {egressGiB}
            </span>
          </label>
        </div>
      </div>

      {/* App grid — sorted by cost descending */}
      <div>
        <p className="text-[11px] text-[var(--text-secondary)] mb-2 uppercase tracking-wide">
          Container Apps — Compute (vCPU + Memory, 24×7 minReplicas=1)
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
          {[...cost.apps]
            .sort((a, b) => b.totalUsd - a.totalUsd)
            .map((app) => {
              const spec = specs.find((s) => s.name === app.name)!;
              return (
                <div
                  key={app.name}
                  className="border border-[var(--border)] rounded-lg p-3 bg-[var(--surface)]/40"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-[var(--text-primary)] font-mono">
                      {app.name}
                    </span>
                    <span className="text-xs font-mono text-[var(--success-text)]">
                      {formatUsd(app.totalUsd)}/mo
                    </span>
                  </div>
                  <p className="text-[10px] text-[var(--text-secondary)] font-mono mb-1">
                    {spec.cpu} vCPU · {spec.memGiB} GiB RAM
                  </p>
                  <div className="flex gap-3 text-[9px] text-[var(--text-secondary)]">
                    <span>CPU {formatUsd(app.vcpuUsd)}</span>
                    <span>MEM {formatUsd(app.memUsd)}</span>
                  </div>
                </div>
              );
            })}
        </div>
        <p className="text-xs text-[var(--text-secondary)] mt-2 text-right">
          Gross compute:{" "}
          <span className="font-mono text-[var(--text-primary)]">
            {formatUsd(cost.grossVcpuUsd + cost.grossMemUsd)}/mo
          </span>{" "}
          · Free tier credit:{" "}
          <span className="font-mono text-[var(--success-text)]">
            −{formatUsd(cost.freeCreditUsd)}
          </span>
        </p>
      </div>

      {/* Storage + egress breakdown */}
      <div>
        <p className="text-[11px] text-[var(--text-secondary)] mb-2 uppercase tracking-wide">
          Storage & Network
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
          <div className="border border-[var(--border)] rounded-lg p-3 bg-[var(--surface)]/40">
            <div className="text-[var(--text-secondary)] mb-0.5">
              Azure Files (Premium ZRS)
            </div>
            <div className="font-mono text-[var(--text-primary)]">
              {formatUsd(cost.storageUsd)}/mo
            </div>
            <div className="text-[10px] text-[var(--text-secondary)] mt-1">
              {storageGiB} GiB · ${AZURE_FILES_USD_PER_GIB}/GiB·mo · Neo4j + PG
              + Vault volumes
            </div>
          </div>
          <div className="border border-[var(--border)] rounded-lg p-3 bg-[var(--surface)]/40">
            <div className="text-[var(--text-secondary)] mb-0.5">
              Egress (outbound)
            </div>
            <div className="font-mono text-[var(--text-primary)]">
              {formatUsd(cost.egressUsd)}/mo
            </div>
            <div className="text-[10px] text-[var(--text-secondary)] mt-1">
              {egressGiB} GiB · first {AZURE_EGRESS_FREE_GIB} GiB free · then $
              {AZURE_EGRESS_USD_PER_GIB}/GiB
            </div>
          </div>
          <div className="border border-[var(--border)] rounded-lg p-3 bg-[var(--surface)]/40">
            <div className="text-[var(--text-secondary)] mb-0.5">
              Environment totals
            </div>
            <div className="font-mono text-[var(--text-primary)]">
              {totalVcpu.toFixed(2)} vCPU · {totalMemGiB.toFixed(1)} GiB
            </div>
            <div className="text-[10px] text-[var(--text-secondary)] mt-1">
              {specs.length} Container Apps · Workaround B (no Log Analytics)
            </div>
          </div>
        </div>
      </div>

      {/* Totals */}
      <div className="border border-[var(--border)] rounded-xl p-4 bg-[var(--surface)]/60">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
          <div>
            <div className="text-[10px] text-[var(--text-secondary)] mb-1">
              Compute (net)
            </div>
            <div className="font-mono text-lg font-semibold text-[var(--text-primary)]">
              {formatUsd(cost.computeUsd)}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-[var(--text-secondary)] mb-1">
              Storage
            </div>
            <div className="font-mono text-lg font-semibold text-[var(--text-primary)]">
              {formatUsd(cost.storageUsd)}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-[var(--text-secondary)] mb-1">
              Egress
            </div>
            <div className="font-mono text-lg font-semibold text-[var(--text-primary)]">
              {formatUsd(cost.egressUsd)}
            </div>
          </div>
          <div className="border-l border-[var(--border)]">
            <div className="text-[10px] text-[var(--text-secondary)] mb-1">
              Total / month
            </div>
            <div className="font-mono text-xl font-bold text-[var(--success-text)]">
              {formatUsd(cost.totalUsd)}
            </div>
            <div className="text-[10px] text-[var(--text-secondary)] mt-0.5">
              ≈ {formatEur(cost.totalEur)} (@ {USD_TO_EUR} EUR/USD)
            </div>
          </div>
        </div>
        <p className="text-[9px] text-[var(--text-secondary)] mt-3 text-center">
          Azure Container Apps Consumption plan · West Europe list prices · 24×7
          minReplicas=1 · free tier (180 K vCPU-s + 360 K GiB-s) applied ·
          ADR-018 Workaround B (no Log Analytics Workspace)
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function AdminComponentsPage() {
  // Layer view state
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const historyRef = useRef<Map<string, HistoryEntry[]>>(new Map());
  const [historyVersion, setHistoryVersion] = useState(0);

  // Topology view state
  const [topology, setTopology] = useState<TopologyData | null>(null);
  const peaksRef = useRef<Map<string, PeakEntry>>(new Map());
  const [_peakV, setPeakV] = useState(0);

  // Shared state
  const [viewMode, setViewMode] = useState<ViewMode>("participant");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchData = useCallback(
    async (isManual = false) => {
      if (isManual) setRefreshing(true);
      try {
        if (viewMode === "layer") {
          const res = await fetchApi("/api/admin/components");
          if (!res.ok) return;
          const data: Snapshot = await res.json();
          setSnapshot(data);

          const now = Date.now();
          for (const comp of data.components) {
            const key = comp.container;
            const entries = historyRef.current.get(key) || [];
            entries.push({ ts: now, cpu: comp.cpu, mem: comp.mem.usedMB });
            while (entries.length > MAX_HISTORY) entries.shift();
            historyRef.current.set(key, entries);
          }
          setHistoryVersion((v) => v + 1);
        } else {
          const res = await fetchApi("/api/admin/components/topology");
          if (!res.ok) return;
          const data: TopologyData = await res.json();
          setTopology(data);

          // Track peak CPU / Memory per container
          const now = Date.now();
          const cutoff = now - 24 * 60 * 60 * 1000;
          const allComps = [
            ...data.participants.flatMap((p) => p.components),
            ...data.infrastructure,
          ];
          for (const c of allComps) {
            const prev = peaksRef.current.get(c.container);
            if (!prev || prev.since < cutoff) {
              peaksRef.current.set(c.container, {
                maxCpu: c.cpu,
                maxMemMB: c.memMB,
                since: now,
              });
            } else {
              prev.maxCpu = Math.max(prev.maxCpu, c.cpu);
              prev.maxMemMB = Math.max(prev.maxMemMB, c.memMB);
            }
          }
          setPeakV((v) => v + 1);
        }
      } catch (err) {
        console.error("Failed to fetch components:", err);
      } finally {
        setLoading(false);
        if (isManual) setRefreshing(false);
      }
    },
    [viewMode],
  );

  useEffect(() => {
    setLoading(true);
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!autoRefresh) return;
    const timer = setInterval(() => fetchData(), REFRESH_INTERVAL);
    return () => clearInterval(timer);
  }, [autoRefresh, fetchData]);

  // Layer view helpers
  const grouped = (snapshot?.components || []).reduce(
    (acc, c) => {
      (acc[c.layer] ??= []).push(c);
      return acc;
    },
    {} as Record<string, ComponentInfo[]>,
  );
  const totalServices = snapshot?.components.length || 0;
  const healthyCount =
    snapshot?.components.filter((c) => c.status === "healthy").length || 0;
  const runningCount =
    snapshot?.components.filter((c) => c.status === "running").length || 0;
  const totalCpu = snapshot?.components.reduce((s, c) => s + c.cpu, 0) || 0;
  // Match the per-row display so the user's manual count of visible values
  // adds up to the shown total. Per-row shows "<1" for sub-1 MB (contributes
  // 0) and Math.round(usedMB) otherwise — sum the same quantities.
  const totalMem =
    snapshot?.components.reduce(
      (s, c) => s + (c.mem.usedMB < 1 ? 0 : Math.round(c.mem.usedMB)),
      0,
    ) || 0;

  void historyVersion;

  const timestamp =
    viewMode === "layer" ? snapshot?.timestamp : topology?.timestamp;

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <div className="max-w-7xl mx-auto px-8 py-10">
        {/* ── Page header ── */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
          <div>
            <h1 className="page-header">EDC Components</h1>
            <p className="text-[var(--text-secondary)] text-lg mt-1">
              Infrastructure health · CPU &amp; memory per service
            </p>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 bg-[var(--success)]/10 text-[var(--success-text)] rounded-full border border-[var(--success)]/20 text-sm font-bold tracking-tight">
            <span className="w-2 h-2 rounded-full bg-[var(--success)] animate-pulse" />
            LIVE MONITORING
          </div>
        </div>

        {/* Controls bar */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
          <div className="flex items-center gap-4 text-xs text-[var(--text-secondary)]">
            {/* View toggle */}
            <div className="flex bg-[var(--surface)] p-1 rounded-xl border border-[var(--border)]">
              <button
                onClick={() => setViewMode("layer")}
                className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${
                  viewMode === "layer"
                    ? "bg-[var(--surface-card)] shadow-sm text-[var(--accent)]"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                Layer View
              </button>
              <button
                onClick={() => setViewMode("participant")}
                className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${
                  viewMode === "participant"
                    ? "bg-[var(--surface-card)] shadow-sm text-[var(--accent)]"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                Participant View
              </button>
            </div>

            {/* Stats summary for layer view */}
            {viewMode === "layer" && snapshot && (
              <>
                <span>{totalServices} services</span>
                <span>·</span>
                <span className="text-[var(--success-text)]">
                  {healthyCount} healthy
                </span>
                <span className="text-[var(--accent)]">
                  {runningCount} running
                </span>
                <span>·</span>
                <span>
                  <Cpu size={11} className="inline mr-0.5" />
                  {totalCpu.toFixed(1)}% total
                </span>
                <span>·</span>
                <span>
                  <HardDrive size={11} className="inline mr-0.5" />
                  {totalMem > 1024
                    ? `${(totalMem / 1024).toFixed(1)} GB`
                    : `${Math.round(totalMem)} MB`}{" "}
                  total
                </span>
              </>
            )}

            {/* Stats summary for participant view */}
            {viewMode === "participant" && topology && (
              <>
                <span>{topology.summary.totalParticipants} participants</span>
                <span>·</span>
                <span>{topology.summary.totalInfra} infra services</span>
                {topology.summary.degradedParticipants > 0 && (
                  <>
                    <span>·</span>
                    <span className="text-[var(--danger-text)]">
                      {topology.summary.degradedParticipants} degraded
                    </span>
                  </>
                )}
              </>
            )}
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)] cursor-pointer">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded border-[var(--border-ui)] bg-[var(--surface-2)] text-teal-800 dark:text-teal-300 focus:ring-layer2 w-3.5 h-3.5"
              />
              Auto-refresh (30s)
            </label>
            <button
              onClick={() => fetchData(true)}
              disabled={refreshing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-[var(--border)] rounded-lg hover:border-layer2 transition-colors disabled:opacity-50"
            >
              <RefreshCw
                size={12}
                className={refreshing ? "animate-spin" : ""}
              />
              Refresh
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-[var(--text-secondary)]">
            <Loader2 size={16} className="animate-spin" />
            Loading EDC components…
          </div>
        ) : viewMode === "participant" ? (
          /* ═══════════════════════════════════════════════════════════════
           PARTICIPANT VIEW
           ═══════════════════════════════════════════════════════════════ */
          topology && (
            <>
              {/* Cluster resource banner */}
              {topology.clusterMetrics && (
                <ClusterResourceBanner metrics={topology.clusterMetrics} />
              )}

              {/* Critical banner */}
              <CriticalBanner
                degraded={topology.summary.degradedParticipants}
                total={topology.summary.totalParticipants}
                participants={topology.participants}
              />

              {/* Participant topology sections */}
              <div className="space-y-3 mb-8">
                <h2 className="font-semibold text-sm flex items-center gap-2 text-[var(--text-primary)] mb-3">
                  <Users
                    size={16}
                    className="text-teal-800 dark:text-teal-300"
                  />
                  Dataspace Participants
                  <span className="text-xs font-normal text-[var(--text-secondary)]">
                    ({topology.participants.length})
                  </span>
                </h2>
                {topology.participants.map((p) => (
                  <ParticipantTopologySection
                    key={p.id}
                    participant={p}
                    peaks={peaksRef.current}
                  />
                ))}
              </div>

              {/* Shared infrastructure */}
              {topology.infrastructure.length > 0 && (
                <div className="mb-8">
                  <div className="flex items-start justify-between mb-3 flex-wrap gap-2">
                    <h2 className="font-semibold text-sm flex items-center gap-2 text-[var(--text-primary)]">
                      <HardDrive
                        size={16}
                        className="text-[var(--warning-text)]"
                      />
                      Shared Infrastructure &amp; CFM
                      <span className="text-xs font-normal text-[var(--text-secondary)]">
                        ({topology.infrastructure.length})
                      </span>
                    </h2>
                    <ResourceSummary
                      components={topology.infrastructure}
                      peaks={peaksRef.current}
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                    {topology.infrastructure.map((c) => (
                      <TopoComponentCard key={c.container} comp={c} />
                    ))}
                  </div>
                </div>
              )}

              {/* Docker unavailable */}
              {!topology.dockerAvailable && (
                <div className="border border-yellow-600/40 bg-yellow-900/20 rounded-xl p-4 text-sm text-[var(--warning-text)]">
                  <strong>Docker socket not available.</strong> CPU and memory
                  metrics require the Docker socket to be mounted.
                </div>
              )}
            </>
          )
        ) : (
          /* ═══════════════════════════════════════════════════════════════
           LAYER VIEW (original)
           ═══════════════════════════════════════════════════════════════ */
          <>
            {/* Participants */}
            {snapshot && snapshot.participants.length > 0 && (
              <div className="mb-8">
                <h2 className="font-semibold text-sm mb-4 flex items-center gap-2 text-[var(--text-primary)]">
                  <Users
                    size={16}
                    className="text-teal-800 dark:text-teal-300"
                  />
                  Dataspace Participants
                  <span className="text-xs font-normal text-[var(--text-secondary)]">
                    ({snapshot.participants.length})
                  </span>
                </h2>
                <div className="overflow-x-auto border border-[var(--border)] rounded-xl">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-[var(--border)] bg-[var(--surface)]/60">
                        <th className="py-2 px-3 text-xs font-medium text-[var(--text-secondary)] w-48">
                          Participant
                        </th>
                        <th className="py-2 px-3 text-xs font-medium text-[var(--text-secondary)] w-32">
                          Role
                        </th>
                        <th className="py-2 px-3 text-xs font-medium text-[var(--text-secondary)]">
                          DID
                        </th>
                        <th className="py-2 px-3 text-xs font-medium text-[var(--text-secondary)] w-28">
                          State
                        </th>
                        <th className="py-2 px-3 text-xs font-medium text-[var(--text-secondary)] w-20 text-center">
                          Profiles
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {snapshot.participants.map((p) => (
                        <tr
                          key={p.id}
                          className="border-b border-[var(--border)] hover:bg-[var(--surface-2)]/40 transition-colors"
                        >
                          <td className="py-2.5 px-3">
                            <div className="font-semibold text-sm text-[var(--text-primary)]">
                              {p.displayName}
                            </div>
                            <div className="text-[11px] text-[var(--text-secondary)]">
                              {p.organization}
                            </div>
                          </td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                                ROLE_COLORS[p.role] ||
                                "bg-gray-500/20 text-[var(--text-secondary)]"
                              }`}
                            >
                              {p.role}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-mono text-[11px] text-[var(--text-secondary)]">
                            {p.did}
                          </td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`text-xs font-medium ${
                                p.state === "CREATED"
                                  ? "text-[var(--success-text)]"
                                  : "text-[var(--warning-text)]"
                              }`}
                            >
                              {p.state}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-xs text-[var(--text-primary)] text-center">
                            {p.profileCount}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Component tables per layer */}
            {["edc-core", "identity", "cfm", "infrastructure"].map((layer) => {
              const items = grouped[layer];
              if (!items || items.length === 0) return null;
              const meta = LAYER_META[layer];
              const LayerIcon = meta.icon;

              return (
                <div key={layer} className="mb-8">
                  <h2 className="font-semibold text-sm mb-3 flex items-center gap-2 text-[var(--text-primary)]">
                    <LayerIcon size={16} className={meta.color} />
                    {meta.label}
                    <span className="text-xs font-normal text-[var(--text-secondary)]">
                      ({items.length})
                    </span>
                  </h2>
                  <div className="overflow-x-auto border border-[var(--border)] rounded-xl">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="border-b border-[var(--border)] bg-[var(--surface)]/60">
                          <th className="py-2 px-3 text-xs font-medium text-[var(--text-secondary)] w-48">
                            Component
                          </th>
                          <th className="py-2 px-3 text-xs font-medium text-[var(--text-secondary)] w-28">
                            Health
                          </th>
                          <th className="py-2 px-3 text-xs font-medium text-[var(--text-secondary)] w-24">
                            Uptime
                          </th>
                          <th className="py-2 px-3 text-xs font-medium text-[var(--text-secondary)] w-40">
                            CPU (Last 24h)
                          </th>
                          <th className="py-2 px-3 text-xs font-medium text-[var(--text-secondary)] w-44">
                            Memory (Last 24h)
                          </th>
                          <th className="py-2 px-3 text-xs font-medium text-[var(--text-secondary)] w-16">
                            Mem %
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((comp) => (
                          <ComponentRow
                            key={comp.container}
                            comp={comp}
                            history={
                              historyRef.current.get(comp.container) || []
                            }
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}

            {/* Docker unavailable banner — hidden on Azure deployments
                (where Docker socket is genuinely not present and metrics come
                from Azure Monitor instead). */}
            {snapshot &&
              !snapshot.dockerAvailable &&
              snapshot.metricsSource !== "azure-monitor" &&
              snapshot.deploymentTarget !== "azure" && (
                <div className="border border-yellow-600/40 bg-yellow-900/20 rounded-xl p-4 text-sm text-[var(--warning-text)]">
                  <strong>Docker socket not available.</strong> CPU and memory
                  metrics require the Docker socket to be mounted.
                </div>
              )}
          </>
        )}

        {/* Cost estimator — Azure on ACA deployment, StackIT otherwise.
            We use the deploy-target signal from the snapshot rather than only
            metricsSource so the Azure card stays visible even when Azure Monitor
            metrics are momentarily unavailable (e.g. role-assignment lag). */}
        {snapshot?.deploymentTarget === "azure" ||
        snapshot?.metricsSource === "azure-monitor" ? (
          <AzureCostEstimatorPanel
            liveComponents={snapshot?.components ?? []}
          />
        ) : (
          <CostEstimatorPanel
            participantCount={
              viewMode === "participant"
                ? topology?.summary.totalParticipants ?? 5
                : snapshot?.participants.length ?? 5
            }
          />
        )}

        {/* Timestamp */}
        {timestamp && (
          <p className="text-[10px] text-[var(--text-secondary)] mt-4">
            Last updated: {new Date(timestamp).toLocaleString()}
          </p>
        )}
      </div>
    </div>
  );
}
