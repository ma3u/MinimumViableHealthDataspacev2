import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import http from "node:http";
import { edcClient } from "@/lib/edc";
import { runQuery } from "@/lib/neo4j";
import {
  azureResourceGroup,
  azureSubscriptionId,
  getContainerAppMetrics,
  isAzureDeployment,
  listContainerApps,
  parseMemoryToBytes,
} from "@/lib/azure-arm";

import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Docker helpers (local-dev path)
// ---------------------------------------------------------------------------

const DOCKER_SOCKET = "/var/run/docker.sock";

function dockerGet<T>(path: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { socketPath: DOCKER_SOCKET, path, method: "GET" },
      (res) => {
        let data = "";
        res.on("data", (chunk: Buffer) => (data += chunk.toString()));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data) as T);
          } catch {
            reject(new Error(`Docker API parse error: ${data.slice(0, 200)}`));
          }
        });
      },
    );
    req.on("error", reject);
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error("Docker API timeout"));
    });
    req.end();
  });
}

interface DockerContainer {
  Id: string;
  Names: string[];
  State: string;
}

interface DockerStats {
  cpu_stats: {
    cpu_usage: { total_usage: number };
    system_cpu_usage: number;
    online_cpus: number;
  };
  precpu_stats: {
    cpu_usage: { total_usage: number };
    system_cpu_usage: number;
  };
  memory_stats: {
    usage: number;
    limit: number;
    stats?: { cache?: number };
  };
}

interface DockerInspect {
  State: {
    Health?: { Status: string };
    Status: string;
    StartedAt: string;
  };
}

function calcCpuPercent(stats: DockerStats): number {
  const cpuDelta =
    stats.cpu_stats.cpu_usage.total_usage -
    stats.precpu_stats.cpu_usage.total_usage;
  const systemDelta =
    stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
  const numCpus = stats.cpu_stats.online_cpus || 1;
  if (systemDelta > 0 && cpuDelta >= 0) {
    return (cpuDelta / systemDelta) * numCpus * 100;
  }
  return 0;
}

function calcMemMB(stats: DockerStats): number {
  const cache = stats.memory_stats.stats?.cache || 0;
  return (
    Math.round(((stats.memory_stats.usage - cache) / 1024 / 1024) * 10) / 10
  );
}

// ---------------------------------------------------------------------------
// Types returned by this endpoint
// ---------------------------------------------------------------------------

type Severity = "critical" | "warning" | "healthy" | "unknown";
type MetricsSource = "docker" | "azure-monitor" | "none";

interface ParticipantComponent {
  name: string;
  container: string;
  status: string;
  severity: Severity;
  cpu: number;
  memMB: number;
  uptime: string;
}

interface ParticipantTopology {
  id: string;
  displayName: string;
  organization: string;
  role: string;
  did: string;
  state: string;
  health: Severity;
  components: ParticipantComponent[];
}

interface InfraComponent extends ParticipantComponent {
  layer: string;
}

// ---------------------------------------------------------------------------
// Server-side metrics history (in-memory, survives across requests)
// ---------------------------------------------------------------------------

interface MetricsSnapshot {
  ts: number;
  totalCpu: number;
  totalMemMB: number;
}

const metricsHistory: MetricsSnapshot[] = [];
const MAX_HISTORY_AGE_MS = 48 * 60 * 60 * 1000;

function recordMetrics(totalCpu: number, totalMemMB: number) {
  const now = Date.now();
  metricsHistory.push({ ts: now, totalCpu, totalMemMB });
  const cutoff = now - MAX_HISTORY_AGE_MS;
  while (metricsHistory.length > 0 && metricsHistory[0].ts < cutoff) {
    metricsHistory.shift();
  }
}

interface PeakWindow {
  peakCpu: number;
  peakMemMB: number;
  samples: number;
}

function computePeakWindow(fromMs: number, toMs: number): PeakWindow {
  let peakCpu = 0;
  let peakMemMB = 0;
  let samples = 0;
  for (const s of metricsHistory) {
    if (s.ts >= fromMs && s.ts < toMs) {
      peakCpu = Math.max(peakCpu, s.totalCpu);
      peakMemMB = Math.max(peakMemMB, s.totalMemMB);
      samples++;
    }
  }
  return { peakCpu, peakMemMB, samples };
}

// ---------------------------------------------------------------------------
// Service catalogue — same logical components, mapped to either Docker
// container names (local) or ACA app names (Azure). The `container` field on
// the API response is whichever one matches the active deployment, so the UI
// shows the actual workload identifier the operator can grep in their cluster.
// ---------------------------------------------------------------------------

interface ServiceDef {
  name: string;
  docker: string;
  aca: string;
  core?: boolean;
  layer?: string;
}

const PARTICIPANT_SERVICES: ServiceDef[] = [
  {
    name: "Control Plane",
    docker: "health-dataspace-controlplane",
    aca: "mvhd-controlplane",
    core: true,
  },
  {
    name: "Data Plane FHIR",
    docker: "health-dataspace-dataplane-fhir",
    aca: "mvhd-dp-fhir",
    core: true,
  },
  {
    name: "Data Plane OMOP",
    docker: "health-dataspace-dataplane-omop",
    aca: "mvhd-dp-omop",
    core: true,
  },
  {
    name: "Identity Hub",
    docker: "health-dataspace-identityhub",
    aca: "mvhd-identityhub",
    core: true,
  },
  {
    name: "Issuer Service",
    docker: "health-dataspace-issuerservice",
    aca: "mvhd-issuerservice",
    core: false,
  },
  {
    name: "Keycloak",
    docker: "health-dataspace-keycloak",
    aca: "mvhd-keycloak",
    core: false,
  },
  {
    name: "Vault",
    docker: "health-dataspace-vault",
    aca: "mvhd-vault",
    core: false,
  },
];

const INFRA_SERVICES: ServiceDef[] = [
  {
    name: "PostgreSQL",
    docker: "health-dataspace-postgres",
    aca: "mvhd-postgres",
    layer: "infrastructure",
  },
  {
    name: "NATS",
    docker: "health-dataspace-nats",
    aca: "mvhd-nats",
    layer: "infrastructure",
  },
  {
    name: "Neo4j",
    docker: "health-dataspace-neo4j",
    aca: "mvhd-neo4j",
    layer: "infrastructure",
  },
  {
    name: "Neo4j Proxy",
    docker: "health-dataspace-neo4j-proxy",
    aca: "mvhd-neo4j-proxy",
    layer: "infrastructure",
  },
  {
    name: "Traefik",
    docker: "health-dataspace-traefik",
    aca: "", // ACA has its own ingress, no equivalent app
    layer: "infrastructure",
  },
  {
    name: "Tenant Manager",
    docker: "health-dataspace-tenant-manager",
    aca: "mvhd-tenant-mgr",
    layer: "cfm",
  },
  {
    name: "Provision Manager",
    docker: "health-dataspace-provision-manager",
    aca: "mvhd-provision-mgr",
    layer: "cfm",
  },
  {
    name: "EDC-V Agent",
    docker: "health-dataspace-cfm-edcv-agent",
    aca: "",
    layer: "cfm",
  },
  {
    name: "Keycloak Agent",
    docker: "health-dataspace-cfm-keycloak-agent",
    aca: "",
    layer: "cfm",
  },
  {
    name: "Registration Agent",
    docker: "health-dataspace-cfm-registration-agent",
    aca: "",
    layer: "cfm",
  },
  {
    name: "Onboarding Agent",
    docker: "health-dataspace-cfm-onboarding-agent",
    aca: "",
    layer: "cfm",
  },
  {
    name: "UI",
    docker: "health-dataspace-ui",
    aca: "mvhd-ui",
    layer: "infrastructure",
  },
];

interface ResolvedMetrics {
  status: string;
  cpu: number;
  memMB: number;
  memLimitMB: number;
  uptime: string;
}

const UNKNOWN_METRICS: ResolvedMetrics = {
  status: "unknown",
  cpu: 0,
  memMB: 0,
  memLimitMB: 0,
  uptime: "—",
};

// ---------------------------------------------------------------------------
// Severity logic
// ---------------------------------------------------------------------------

function deriveSeverity(
  status: string,
  cpu: number,
  memMB: number,
  limitMB: number,
): Severity {
  if (status === "unhealthy" || status === "stopped" || status === "exited") {
    return "critical";
  }
  if (status === "starting") return "warning";
  if (cpu > 80) return "warning";
  if (limitMB > 0 && memMB / limitMB > 0.9) return "warning";
  if (status === "healthy" || status === "running") return "healthy";
  return "unknown";
}

function worstSeverity(sevs: Severity[]): Severity {
  if (sevs.includes("critical")) return "critical";
  if (sevs.includes("warning")) return "warning";
  if (sevs.includes("unknown")) return "unknown";
  return "healthy";
}

// ---------------------------------------------------------------------------
// Docker metrics resolver
// ---------------------------------------------------------------------------

async function resolveDockerContainer(
  containers: DockerContainer[],
  containerName: string,
): Promise<ResolvedMetrics> {
  const c = containers.find((c) =>
    c.Names.some((n) => n === `/${containerName}`),
  );
  if (!c) return { ...UNKNOWN_METRICS, status: "stopped" };

  let status = "running";
  let uptime = "—";
  try {
    const inspect = await dockerGet<DockerInspect>(`/containers/${c.Id}/json`);
    if (inspect.State.Health?.Status) status = inspect.State.Health.Status;
    const started = new Date(inspect.State.StartedAt);
    const diffMs = Date.now() - started.getTime();
    const hours = Math.floor(diffMs / 3600000);
    const mins = Math.floor((diffMs % 3600000) / 60000);
    uptime = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  } catch {
    /* ignore */
  }

  let cpu = 0;
  let memMB = 0;
  let memLimitMB = 0;
  try {
    const stats = await dockerGet<DockerStats>(
      `/containers/${c.Id}/stats?stream=false`,
    );
    cpu = Math.round(calcCpuPercent(stats) * 100) / 100;
    memMB = calcMemMB(stats);
    memLimitMB = Math.round((stats.memory_stats.limit / 1024 / 1024) * 10) / 10;
  } catch {
    /* ignore */
  }

  return { status, cpu, memMB, memLimitMB, uptime };
}

// ---------------------------------------------------------------------------
// Azure Container Apps metrics resolver
// ---------------------------------------------------------------------------

async function loadAcaMetrics(): Promise<Map<string, ResolvedMetrics> | null> {
  const subscriptionId = azureSubscriptionId();
  const resourceGroup = azureResourceGroup();
  if (!subscriptionId || !resourceGroup) return null;

  let apps: Awaited<ReturnType<typeof listContainerApps>>;
  try {
    apps = await listContainerApps(subscriptionId, resourceGroup);
  } catch (err) {
    console.warn("ARM listContainerApps failed (topology):", err);
    return null;
  }

  const map = new Map<string, ResolvedMetrics>();
  await Promise.all(
    apps.map(async (app) => {
      const container = app.properties.template?.containers?.[0];
      const cpuReservation = container?.resources?.cpu ?? 0;
      const memReservationBytes = parseMemoryToBytes(
        container?.resources?.memory,
      );

      let sample: Awaited<ReturnType<typeof getContainerAppMetrics>> | null =
        null;
      try {
        sample = await getContainerAppMetrics(
          subscriptionId,
          resourceGroup,
          app.name,
        );
      } catch {
        /* metrics may be missing */
      }

      const runningStatus =
        app.properties.runningStatus ?? app.properties.provisioningState ?? "";
      const status = /running/i.test(runningStatus)
        ? "healthy"
        : /stopped|stop/i.test(runningStatus)
          ? "stopped"
          : "unknown";

      const rawCpuPct = sample?.cpuPercent ?? 0;
      const cpu =
        cpuReservation > 0
          ? Math.round((rawCpuPct / cpuReservation) * 100) / 100
          : Math.round(rawCpuPct * 100) / 100;

      const usedBytes = sample?.memPercent ?? 0;
      const memMB = Math.round((usedBytes / 1024 / 1024) * 10) / 10;
      const memLimitMB =
        Math.round((memReservationBytes / 1024 / 1024) * 10) / 10;

      map.set(app.name, {
        status,
        cpu,
        memMB,
        memLimitMB,
        uptime: "—",
      });
    }),
  );
  return map;
}

// ---------------------------------------------------------------------------
// Neo4j participant fallback (used when CFM tenant-manager is unreachable)
// ---------------------------------------------------------------------------

async function loadParticipantsFromNeo4j(): Promise<
  { id: string; name: string; type: string; did: string }[]
> {
  try {
    return await runQuery<{
      id: string;
      name: string;
      type: string;
      did: string;
    }>(
      `MATCH (p:Participant)
       WHERE p.name IS NOT NULL AND p.name <> ''
       RETURN coalesce(p.participantId, p.id)      AS id,
              p.name                               AS name,
              coalesce(p.participantType, '—')     AS type,
              coalesce(p.did, p.participantId, '—') AS did
       ORDER BY p.name`,
    );
  } catch (err) {
    console.warn("Neo4j participant fallback failed (topology):", err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// GET /api/admin/components/topology
// ---------------------------------------------------------------------------

export async function GET() {
  const session = await getServerSession(authOptions);
  const roles = (session as { roles?: string[] } | null)?.roles ?? [];
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!roles.includes("EDC_ADMIN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // ── 1. Resolve metrics from whichever runtime is available ──
  let metricsSource: MetricsSource = "none";
  let acaMetrics: Map<string, ResolvedMetrics> | null = null;
  let dockerContainers: DockerContainer[] = [];
  let dockerOk = false;

  if (isAzureDeployment()) {
    acaMetrics = await loadAcaMetrics();
    if (acaMetrics && acaMetrics.size > 0) {
      metricsSource = "azure-monitor";
    }
  }

  if (metricsSource === "none") {
    try {
      dockerContainers = await dockerGet<DockerContainer[]>(
        "/containers/json?all=true&filters=" +
          encodeURIComponent(JSON.stringify({ name: ["health-dataspace"] })),
      );
      dockerOk = true;
      metricsSource = "docker";
    } catch {
      /* socket unavailable */
    }
  }

  const isAzure = metricsSource === "azure-monitor";

  /** Resolve a service to its current metrics from the active runtime. */
  async function resolveService(svc: ServiceDef): Promise<ResolvedMetrics> {
    if (isAzure) {
      if (!svc.aca) return UNKNOWN_METRICS;
      return acaMetrics?.get(svc.aca) ?? UNKNOWN_METRICS;
    }
    if (dockerOk) {
      return resolveDockerContainer(dockerContainers, svc.docker);
    }
    return UNKNOWN_METRICS;
  }

  const containerLabel = (svc: ServiceDef) =>
    isAzure ? svc.aca || svc.docker : svc.docker;

  // ── 2. Pre-resolve metrics for every shared service (one round-trip) ──
  const serviceMetrics = new Map<string, ResolvedMetrics>();
  await Promise.all(
    [...PARTICIPANT_SERVICES, ...INFRA_SERVICES].map(async (svc) => {
      serviceMetrics.set(containerLabel(svc), await resolveService(svc));
    }),
  );

  // ── 3. Resolve participants — CFM first, Neo4j fallback ──
  type RawParticipant = {
    id: string;
    displayName: string;
    organization: string;
    role: string;
    did: string;
    state: string;
  };
  const participantsRaw: RawParticipant[] = [];
  try {
    const tenants =
      await edcClient.tenant<
        { id: string; version: number; properties: Record<string, string> }[]
      >("/v1alpha1/tenants");

    let edcParticipants: { "@id": string; identity: string; state: string }[] =
      [];
    try {
      edcParticipants = await edcClient.management<
        { "@id": string; identity: string; state: string }[]
      >("/v5alpha/participants");
    } catch {
      /* auth may be unavailable */
    }

    for (const t of tenants) {
      let profiles: {
        identifier?: string;
        properties?: {
          "cfm.vpa.state"?: { participantContextId?: string };
          [k: string]: unknown;
        };
      }[] = [];
      try {
        profiles = await edcClient.tenant<typeof profiles>(
          `/v1alpha1/tenants/${t.id}/participant-profiles`,
        );
      } catch {
        /* no profiles */
      }
      const ctxId =
        profiles?.[0]?.properties?.["cfm.vpa.state"]?.participantContextId;
      const ctx = edcParticipants.find((p) => p["@id"] === ctxId);

      participantsRaw.push({
        id: t.id,
        displayName: t.properties?.displayName || t.id,
        organization: t.properties?.organization || "—",
        role: t.properties?.ehdsParticipantType || t.properties?.role || "—",
        did:
          ctx?.identity ||
          profiles?.[0]?.identifier ||
          t.properties?.did ||
          "—",
        state: ctx?.state || "—",
      });
    }
  } catch (err) {
    console.warn("CFM tenant-manager unreachable (topology):", err);
  }

  if (participantsRaw.length === 0) {
    const neo = await loadParticipantsFromNeo4j();
    for (const p of neo) {
      participantsRaw.push({
        id: p.id,
        displayName: p.name,
        organization: p.name,
        role: p.type,
        did: p.did,
        state: "SEEDED",
      });
    }
  }

  // ── 4. Build per-participant topology rows ──
  const participantTopologies: ParticipantTopology[] = participantsRaw.map(
    (p) => {
      const components: ParticipantComponent[] = PARTICIPANT_SERVICES.map(
        (svc) => {
          const m = serviceMetrics.get(containerLabel(svc)) ?? UNKNOWN_METRICS;
          return {
            name: svc.name,
            container: containerLabel(svc),
            status: m.status,
            severity: deriveSeverity(m.status, m.cpu, m.memMB, m.memLimitMB),
            cpu: m.cpu,
            memMB: m.memMB,
            uptime: m.uptime,
          };
        },
      );
      const coreSeverities = components
        .filter((_, i) => PARTICIPANT_SERVICES[i].core)
        .map((c) => c.severity);
      return {
        ...p,
        health: worstSeverity(coreSeverities),
        components,
      };
    },
  );

  // ── 5. Build infrastructure rows (skip services with no equivalent on
  //       the active runtime — e.g. Traefik on ACA) ──
  const infraComponents: InfraComponent[] = INFRA_SERVICES.filter((svc) =>
    isAzure ? svc.aca !== "" : true,
  ).map((svc) => {
    const m = serviceMetrics.get(containerLabel(svc)) ?? UNKNOWN_METRICS;
    return {
      name: svc.name,
      container: containerLabel(svc),
      layer: svc.layer ?? "infrastructure",
      status: m.status,
      severity: deriveSeverity(m.status, m.cpu, m.memMB, m.memLimitMB),
      cpu: m.cpu,
      memMB: m.memMB,
      uptime: m.uptime,
    };
  });

  infraComponents.sort(
    (a, b) => a.layer.localeCompare(b.layer) || a.name.localeCompare(b.name),
  );

  const severityOrder = { critical: 0, warning: 1, unknown: 2, healthy: 3 };
  participantTopologies.sort(
    (a, b) =>
      severityOrder[a.health] - severityOrder[b.health] ||
      a.displayName.localeCompare(b.displayName),
  );

  const degradedCount = participantTopologies.filter(
    (p) => p.health === "critical" || p.health === "warning",
  ).length;

  // ── 6. Cluster-wide metrics ──
  const allComponents = [
    ...participantTopologies.flatMap((p) => p.components),
    ...infraComponents,
  ];
  const uniqueByContainer = new Map<string, { cpu: number; memMB: number }>();
  for (const c of allComponents) {
    if (!uniqueByContainer.has(c.container)) {
      uniqueByContainer.set(c.container, { cpu: c.cpu, memMB: c.memMB });
    }
  }
  const clusterCpu = Array.from(uniqueByContainer.values()).reduce(
    (s, c) => s + c.cpu,
    0,
  );
  const clusterMemMB = Array.from(uniqueByContainer.values()).reduce(
    (s, c) => s + c.memMB,
    0,
  );
  recordMetrics(clusterCpu, clusterMemMB);

  const now = Date.now();
  const last24h = computePeakWindow(now - 24 * 3600_000, now);
  const prev24h = computePeakWindow(now - 48 * 3600_000, now - 24 * 3600_000);

  const deploymentTarget = isAzureDeployment()
    ? "azure"
    : dockerOk
      ? "docker"
      : "unknown";

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    metricsSource,
    deploymentTarget,
    // Backwards-compatible flag — true whenever ANY runtime metrics are
    // available, so the old "Docker socket not available" banner only fires
    // when both Docker and Azure paths failed.
    dockerAvailable: metricsSource !== "none",
    participants: participantTopologies,
    infrastructure: infraComponents,
    summary: {
      totalParticipants: participantTopologies.length,
      degradedParticipants: degradedCount,
      totalInfra: infraComponents.length,
    },
    clusterMetrics: {
      currentCpu: Math.round(clusterCpu * 100) / 100,
      currentMemMB: Math.round(clusterMemMB * 10) / 10,
      last24h: {
        peakCpu: Math.round(last24h.peakCpu * 100) / 100,
        peakMemMB: Math.round(last24h.peakMemMB * 10) / 10,
        samples: last24h.samples,
      },
      prev24h: {
        peakCpu: Math.round(prev24h.peakCpu * 100) / 100,
        peakMemMB: Math.round(prev24h.peakMemMB * 10) / 10,
        samples: prev24h.samples,
      },
    },
  });
}
