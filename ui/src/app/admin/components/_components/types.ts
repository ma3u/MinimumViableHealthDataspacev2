// ---------------------------------------------------------------------------
// Types — Layer view (existing API)
// ---------------------------------------------------------------------------

interface MemInfo {
  usedMB: number;
  limitMB: number;
  percent: number;
}

export interface ComponentInfo {
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

export interface Snapshot {
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

export interface HistoryEntry {
  ts: number;
  cpu: number;
  mem: number;
}

export interface PeakEntry {
  maxCpu: number;
  maxMemMB: number;
  since: number;
}

export type Severity = "critical" | "warning" | "healthy" | "unknown";

export interface TopoComponent {
  name: string;
  container: string;
  status: string;
  severity: Severity;
  cpu: number;
  memMB: number;
  uptime: string;
}

export interface TopoParticipant {
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

export interface TopologyData {
  timestamp: string;
  dockerAvailable: boolean;
  // True when per-participant CPU/MEM values represent a participant's
  // share of shared infrastructure (ACA case), not an independent
  // per-container reservation. Drives the "shared" annotation.
  metricsShared?: boolean;
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

export type ViewMode = "layer" | "participant";
