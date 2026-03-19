"use client";

import { fetchApi } from "@/lib/api";
import {
  COMPONENT_INFO,
  type ComponentMeta,
} from "@/lib/edc/component-info";
import { useCallback, useEffect, useRef, useState } from "react";
import PageIntro from "@/components/PageIntro";
import {
  Activity,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Cpu,
  HardDrive,
  Info,
  Loader2,
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
  components: ComponentInfo[];
  participants: ParticipantInfo[];
}

interface HistoryEntry {
  ts: number;
  cpu: number;
  mem: number;
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
  "edc-core": { label: "EDC-V Core", icon: Server, color: "text-blue-400" },
  identity: {
    label: "Identity & Trust",
    icon: Shield,
    color: "text-purple-400",
  },
  cfm: {
    label: "Connector Fabric Manager",
    icon: Workflow,
    color: "text-green-400",
  },
  infrastructure: {
    label: "Infrastructure",
    icon: HardDrive,
    color: "text-yellow-400",
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
    border: "border-gray-700",
    bg: "",
  },
  unknown: {
    dot: "bg-gray-500",
    border: "border-gray-700",
    bg: "",
  },
};

const ROLE_COLORS: Record<string, string> = {
  DATA_HOLDER: "bg-blue-500/20 text-blue-400",
  DATA_USER: "bg-green-500/20 text-green-400",
  HDAB: "bg-purple-500/20 text-purple-400",
  "health-data-access-body": "bg-purple-500/20 text-purple-400",
  "data-holder": "bg-blue-500/20 text-blue-400",
  "data-user": "bg-green-500/20 text-green-400",
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
    return <span className="text-[10px] text-gray-600">collecting…</span>;

  const effectiveMax = max > 0 ? max : 1;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y =
      height -
      (Math.min(v, effectiveMax) / effectiveMax) * (height - 2) -
      1;
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
        className={`w-2 h-2 rounded-full ${STATUS_COLORS[status] || STATUS_COLORS.unknown}`}
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
        className="text-gray-500 hover:text-layer2 transition-colors p-0.5"
        title={`Info: ${name}`}
      >
        <Info size={13} />
      </button>
      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          {/* Popover */}
          <div className="absolute z-40 left-6 top-0 w-80 bg-gray-800 border border-gray-600 rounded-xl shadow-2xl p-4 text-xs space-y-2">
            <div className="flex items-center justify-between mb-1">
              <span className="font-semibold text-sm text-gray-200">
                {name}
              </span>
              <button
                onClick={() => setOpen(false)}
                className="text-gray-500 hover:text-gray-300"
              >
                <X size={14} />
              </button>
            </div>
            <p className="text-gray-400 leading-relaxed">{meta.description}</p>
            <div className="grid grid-cols-[80px_1fr] gap-y-1.5 gap-x-2 pt-1 border-t border-gray-700">
              <span className="text-gray-500">Protocol</span>
              <span className="text-gray-300">{meta.protocol}</span>
              <span className="text-gray-500">Ports</span>
              <span className="text-gray-300 font-mono text-[11px]">
                {meta.ports}
              </span>
              <span className="text-gray-500">Depends on</span>
              <span className="text-gray-300">
                {meta.dependsOn.length > 0
                  ? meta.dependsOn.join(", ")
                  : "None"}
              </span>
              <span className="text-gray-500">Health</span>
              <span className="text-gray-300">{meta.healthSource}</span>
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
    <tr className="border-b border-gray-800 hover:bg-gray-800/40 transition-colors">
      <td className="py-2.5 px-3 text-sm font-medium text-gray-200">
        <span className="flex items-center gap-1.5">
          {comp.component}
          <InfoPopover name={comp.component} />
        </span>
      </td>
      <td className="py-2.5 px-3">
        <StatusBadge status={comp.status} />
      </td>
      <td className="py-2.5 px-3 text-xs text-gray-400 tabular-nums">
        {comp.uptime}
      </td>
      <td className="py-2.5 px-3">
        <div className="flex items-center gap-2">
          <span className="text-xs tabular-nums text-gray-300 w-12 text-right">
            {comp.cpu.toFixed(1)}%
          </span>
          <Sparkline data={cpuData} max={maxCpu} color="#60a5fa" />
        </div>
      </td>
      <td className="py-2.5 px-3">
        <div className="flex items-center gap-2">
          <span className="text-xs tabular-nums text-gray-300 w-16 text-right">
            {comp.mem.usedMB < 1 ? "<1" : Math.round(comp.mem.usedMB)} MB
          </span>
          <Sparkline
            data={memData}
            max={comp.mem.limitMB || 100}
            color="#a78bfa"
          />
        </div>
      </td>
      <td className="py-2.5 px-3 text-xs text-gray-500 tabular-nums">
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
        <span className="flex items-center gap-1.5 text-xs font-medium text-gray-200">
          <SeverityDot severity={comp.severity} />
          {comp.name}
          <InfoPopover name={comp.name} />
        </span>
        <span className="text-[10px] text-gray-500 capitalize">
          {comp.status}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-1 text-[10px] text-gray-400">
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

function ParticipantTopologySection({
  participant,
}: {
  participant: TopoParticipant;
}) {
  const [expanded, setExpanded] = useState(
    participant.health === "critical" || participant.health === "warning",
  );
  const sev = SEVERITY_STYLES[participant.health];
  const roleClass =
    ROLE_COLORS[participant.role] || "bg-gray-500/20 text-gray-400";

  return (
    <div
      className={`border rounded-xl ${sev.border} ${sev.bg} overflow-hidden transition-all`}
    >
      {/* Header bar — click to expand/collapse */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-800/40 transition-colors"
      >
        {expanded ? (
          <ChevronDown size={14} className="text-gray-500 shrink-0" />
        ) : (
          <ChevronRight size={14} className="text-gray-500 shrink-0" />
        )}
        <SeverityDot severity={participant.health} />
        <div className="flex-1 min-w-0">
          <span className="font-semibold text-sm text-gray-200">
            {participant.displayName}
          </span>
          <span className="text-xs text-gray-500 ml-2">
            {participant.organization}
          </span>
        </div>
        <span
          className={`text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0 ${roleClass}`}
        >
          {participant.role}
        </span>
        <span className="text-[10px] text-gray-500 shrink-0">
          {participant.components.length} services
        </span>
      </button>

      {/* Expanded: DID + component grid */}
      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-gray-800/60">
          <div className="flex items-center gap-4 text-[11px] text-gray-500 mb-3">
            <span>
              DID:{" "}
              <span className="font-mono text-gray-400">
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
                    ? "text-green-400"
                    : "text-yellow-400"
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
    .filter(
      (p) => p.health === "critical" || p.health === "warning",
    )
    .map((p) => p.displayName);

  return (
    <div className="flex items-center gap-3 border border-red-500/40 bg-red-900/15 rounded-xl px-4 py-3 mb-6">
      <AlertTriangle size={18} className="text-red-400 shrink-0" />
      <div className="text-sm">
        <span className="font-semibold text-red-400">
          {degraded} of {total} participants degraded
        </span>
        <span className="text-gray-400 ml-2">— {names.join(", ")}</span>
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
  const totalCpu =
    snapshot?.components.reduce((s, c) => s + c.cpu, 0) || 0;
  const totalMem =
    snapshot?.components.reduce((s, c) => s + c.mem.usedMB, 0) || 0;

  void historyVersion;

  const dockerAvailable =
    viewMode === "layer"
      ? snapshot?.dockerAvailable
      : topology?.dockerAvailable;
  const timestamp =
    viewMode === "layer" ? snapshot?.timestamp : topology?.timestamp;

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      <PageIntro
        title="EDC Components"
        icon={Activity}
        description="Real-time health, CPU, and memory overview of all EDC-V, DCore, CFM, and infrastructure services. Switch between Layer view (grouped by architecture) and Participant view (per-participant component topology)."
        prevStep={{ href: "/admin", label: "Operator Dashboard" }}
        nextStep={{ href: "/admin/tenants", label: "Manage Tenants" }}
        infoText="Health status is sourced from Docker container health checks. CPU and memory metrics are collected from the Docker Engine API. Click the ⓘ button on any component to see its role, protocol, ports, dependencies and health source. In Participant view, each participant shows their own decentralised connector stack. Critical or degraded participants sort to the top."
        docLink={{ href: "/docs/architecture", label: "Architecture" }}
      />

      {/* Controls bar */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
        <div className="flex items-center gap-4 text-xs text-gray-500">
          {/* View toggle */}
          <div className="flex items-center border border-gray-700 rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode("layer")}
              className={`px-3 py-1.5 text-xs transition-colors ${
                viewMode === "layer"
                  ? "bg-layer2/20 text-layer2"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              Layer View
            </button>
            <button
              onClick={() => setViewMode("participant")}
              className={`px-3 py-1.5 text-xs transition-colors ${
                viewMode === "participant"
                  ? "bg-layer2/20 text-layer2"
                  : "text-gray-400 hover:text-gray-200"
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
              <span className="text-emerald-400">{healthyCount} healthy</span>
              <span className="text-blue-400">{runningCount} running</span>
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
              <span>
                {topology.summary.totalParticipants} participants
              </span>
              <span>·</span>
              <span>{topology.summary.totalInfra} infra services</span>
              {topology.summary.degradedParticipants > 0 && (
                <>
                  <span>·</span>
                  <span className="text-red-400">
                    {topology.summary.degradedParticipants} degraded
                  </span>
                </>
              )}
            </>
          )}
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded border-gray-600 bg-gray-800 text-layer2 focus:ring-layer2 w-3.5 h-3.5"
            />
            Auto-refresh (30s)
          </label>
          <button
            onClick={() => fetchData(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-700 rounded-lg hover:border-layer2 transition-colors disabled:opacity-50"
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
        <div className="flex items-center gap-2 text-gray-500">
          <Loader2 size={16} className="animate-spin" />
          Loading EDC components…
        </div>
      ) : viewMode === "participant" ? (
        /* ═══════════════════════════════════════════════════════════════
           PARTICIPANT VIEW
           ═══════════════════════════════════════════════════════════════ */
        topology && (
          <>
            {/* Critical banner */}
            <CriticalBanner
              degraded={topology.summary.degradedParticipants}
              total={topology.summary.totalParticipants}
              participants={topology.participants}
            />

            {/* Participant topology sections */}
            <div className="space-y-3 mb-8">
              <h2 className="font-semibold text-sm flex items-center gap-2 text-gray-300 mb-3">
                <Users size={16} className="text-layer2" />
                Dataspace Participants
                <span className="text-xs font-normal text-gray-500">
                  ({topology.participants.length})
                </span>
              </h2>
              {topology.participants.map((p) => (
                <ParticipantTopologySection key={p.id} participant={p} />
              ))}
            </div>

            {/* Shared infrastructure */}
            {topology.infrastructure.length > 0 && (
              <div className="mb-8">
                <h2 className="font-semibold text-sm flex items-center gap-2 text-gray-300 mb-3">
                  <HardDrive size={16} className="text-yellow-400" />
                  Shared Infrastructure &amp; CFM
                  <span className="text-xs font-normal text-gray-500">
                    ({topology.infrastructure.length})
                  </span>
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                  {topology.infrastructure.map((c) => (
                    <TopoComponentCard key={c.container} comp={c} />
                  ))}
                </div>
              </div>
            )}

            {/* Docker unavailable */}
            {!topology.dockerAvailable && (
              <div className="border border-yellow-600/40 bg-yellow-900/20 rounded-xl p-4 text-sm text-yellow-400">
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
              <h2 className="font-semibold text-sm mb-4 flex items-center gap-2 text-gray-300">
                <Users size={16} className="text-layer2" />
                Dataspace Participants
                <span className="text-xs font-normal text-gray-500">
                  ({snapshot.participants.length})
                </span>
              </h2>
              <div className="overflow-x-auto border border-gray-700 rounded-xl">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-gray-700 bg-gray-900/60">
                      <th className="py-2 px-3 text-xs font-medium text-gray-500 w-48">
                        Participant
                      </th>
                      <th className="py-2 px-3 text-xs font-medium text-gray-500 w-32">
                        Role
                      </th>
                      <th className="py-2 px-3 text-xs font-medium text-gray-500">
                        DID
                      </th>
                      <th className="py-2 px-3 text-xs font-medium text-gray-500 w-28">
                        State
                      </th>
                      <th className="py-2 px-3 text-xs font-medium text-gray-500 w-20 text-center">
                        Profiles
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.participants.map((p) => (
                      <tr
                        key={p.id}
                        className="border-b border-gray-800 hover:bg-gray-800/40 transition-colors"
                      >
                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-sm text-gray-200">
                            {p.displayName}
                          </div>
                          <div className="text-[11px] text-gray-500">
                            {p.organization}
                          </div>
                        </td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${ROLE_COLORS[p.role] || "bg-gray-500/20 text-gray-400"}`}
                          >
                            {p.role}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[11px] text-gray-400">
                          {p.did}
                        </td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`text-xs font-medium ${p.state === "CREATED" ? "text-green-400" : "text-yellow-400"}`}
                          >
                            {p.state}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-xs text-gray-300 text-center">
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
                <h2 className="font-semibold text-sm mb-3 flex items-center gap-2 text-gray-300">
                  <LayerIcon size={16} className={meta.color} />
                  {meta.label}
                  <span className="text-xs font-normal text-gray-500">
                    ({items.length})
                  </span>
                </h2>
                <div className="overflow-x-auto border border-gray-700 rounded-xl">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-gray-700 bg-gray-900/60">
                        <th className="py-2 px-3 text-xs font-medium text-gray-500 w-48">
                          Component
                        </th>
                        <th className="py-2 px-3 text-xs font-medium text-gray-500 w-28">
                          Health
                        </th>
                        <th className="py-2 px-3 text-xs font-medium text-gray-500 w-24">
                          Uptime
                        </th>
                        <th className="py-2 px-3 text-xs font-medium text-gray-500 w-40">
                          CPU (Last 24h)
                        </th>
                        <th className="py-2 px-3 text-xs font-medium text-gray-500 w-44">
                          Memory (Last 24h)
                        </th>
                        <th className="py-2 px-3 text-xs font-medium text-gray-500 w-16">
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

          {/* Docker unavailable banner */}
          {snapshot && !snapshot.dockerAvailable && (
            <div className="border border-yellow-600/40 bg-yellow-900/20 rounded-xl p-4 text-sm text-yellow-400">
              <strong>Docker socket not available.</strong> CPU and memory
              metrics require the Docker socket to be mounted.
            </div>
          )}
        </>
      )}

      {/* Timestamp */}
      {timestamp && (
        <p className="text-[10px] text-gray-600 mt-4">
          Last updated: {new Date(timestamp).toLocaleString()}
        </p>
      )}
    </div>
  );
}
