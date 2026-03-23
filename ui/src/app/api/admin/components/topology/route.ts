import { NextResponse } from "next/server";
import http from "node:http";
import { edcClient } from "@/lib/edc";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Docker helpers (reused from parent route)
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

// ---------------------------------------------------------------------------
// Docker types
// ---------------------------------------------------------------------------

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
// Records aggregate cluster CPU/Memory every time the endpoint is called.
// Used to compute 24h peaks and day-over-day trend arrows.
// ---------------------------------------------------------------------------

interface MetricsSnapshot {
  ts: number; // epoch ms
  totalCpu: number; // sum of all container CPU %
  totalMemMB: number; // sum of all container memory MB
}

const metricsHistory: MetricsSnapshot[] = [];
const MAX_HISTORY_AGE_MS = 48 * 60 * 60 * 1000; // keep 48h for day-over-day

function recordMetrics(totalCpu: number, totalMemMB: number) {
  const now = Date.now();
  metricsHistory.push({ ts: now, totalCpu, totalMemMB });
  // Evict entries older than 48h
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
// Per-participant service template
// In the current demo all participants share the same set of containers.
// In production each participant would have isolated containers.
// We map the shared containers to each participant to visualise the
// conceptual ownership.
// ---------------------------------------------------------------------------

const PARTICIPANT_SERVICES = [
  {
    name: "Control Plane",
    container: "health-dataspace-controlplane",
    core: true,
  },
  {
    name: "Data Plane FHIR",
    container: "health-dataspace-dataplane-fhir",
    core: true,
  },
  {
    name: "Data Plane OMOP",
    container: "health-dataspace-dataplane-omop",
    core: true,
  },
  {
    name: "Identity Hub",
    container: "health-dataspace-identityhub",
    core: true,
  },
  {
    name: "Issuer Service",
    container: "health-dataspace-issuerservice",
    core: false,
  },
  { name: "Keycloak", container: "health-dataspace-keycloak", core: false },
  { name: "Vault", container: "health-dataspace-vault", core: false },
];

const INFRA_SERVICES = [
  {
    name: "PostgreSQL",
    container: "health-dataspace-postgres",
    layer: "infrastructure",
  },
  { name: "NATS", container: "health-dataspace-nats", layer: "infrastructure" },
  {
    name: "Neo4j",
    container: "health-dataspace-neo4j",
    layer: "infrastructure",
  },
  {
    name: "Neo4j Proxy",
    container: "health-dataspace-neo4j-proxy",
    layer: "infrastructure",
  },
  {
    name: "Traefik",
    container: "health-dataspace-traefik",
    layer: "infrastructure",
  },
  {
    name: "Tenant Manager",
    container: "health-dataspace-tenant-manager",
    layer: "cfm",
  },
  {
    name: "Provision Manager",
    container: "health-dataspace-provision-manager",
    layer: "cfm",
  },
  {
    name: "EDC-V Agent",
    container: "health-dataspace-cfm-edcv-agent",
    layer: "cfm",
  },
  {
    name: "Keycloak Agent",
    container: "health-dataspace-cfm-keycloak-agent",
    layer: "cfm",
  },
  {
    name: "Registration Agent",
    container: "health-dataspace-cfm-registration-agent",
    layer: "cfm",
  },
  {
    name: "Onboarding Agent",
    container: "health-dataspace-cfm-onboarding-agent",
    layer: "cfm",
  },
  { name: "UI", container: "health-dataspace-ui", layer: "infrastructure" },
];

// ---------------------------------------------------------------------------
// Severity logic
// ---------------------------------------------------------------------------

function deriveSeverity(
  status: string,
  cpu: number,
  memMB: number,
  limitMB: number,
): Severity {
  if (status === "unhealthy" || status === "stopped" || status === "exited")
    return "critical";
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
// Resolve container metrics
// ---------------------------------------------------------------------------

async function resolveContainer(
  containers: DockerContainer[],
  containerName: string,
): Promise<{
  status: string;
  cpu: number;
  memMB: number;
  memLimitMB: number;
  uptime: string;
}> {
  const c = containers.find((c) =>
    c.Names.some((n) => n === `/${containerName}`),
  );
  if (!c)
    return { status: "stopped", cpu: 0, memMB: 0, memLimitMB: 0, uptime: "—" };

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
// GET /api/admin/components/topology
// ---------------------------------------------------------------------------

export async function GET() {
  let dockerAvailable = false;
  let containers: DockerContainer[] = [];

  try {
    containers = await dockerGet<DockerContainer[]>(
      "/containers/json?all=true&filters=" +
        encodeURIComponent(JSON.stringify({ name: ["health-dataspace"] })),
    );
    dockerAvailable = true;
  } catch {
    /* Docker socket unavailable */
  }

  // ── Fetch participant data from CFM ──
  const participantTopologies: ParticipantTopology[] = [];
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

    // Resolve Docker metrics for participant-owned services once (shared)
    const serviceMetrics = new Map<
      string,
      Awaited<ReturnType<typeof resolveContainer>>
    >();
    if (dockerAvailable) {
      await Promise.all(
        PARTICIPANT_SERVICES.map(async (svc) => {
          const metrics = await resolveContainer(containers, svc.container);
          serviceMetrics.set(svc.container, metrics);
        }),
      );
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

      // Build per-participant component list
      const components: ParticipantComponent[] = PARTICIPANT_SERVICES.map(
        (svc) => {
          const m = serviceMetrics.get(svc.container) || {
            status: "unknown",
            cpu: 0,
            memMB: 0,
            memLimitMB: 0,
            uptime: "—",
          };
          const severity = deriveSeverity(
            m.status,
            m.cpu,
            m.memMB,
            m.memLimitMB,
          );
          return {
            name: svc.name,
            container: svc.container,
            status: m.status,
            severity,
            cpu: m.cpu,
            memMB: m.memMB,
            uptime: m.uptime,
          };
        },
      );

      // Participant-level health = worst of core components
      const coreComponents = components.filter(
        (_, i) => PARTICIPANT_SERVICES[i].core,
      );
      const health = worstSeverity(coreComponents.map((c) => c.severity));

      participantTopologies.push({
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
        health,
        components,
      });
    }
  } catch (err) {
    console.warn("Could not fetch participant data:", err);
  }

  // ── Shared infrastructure components ──
  const infraComponents: InfraComponent[] = [];
  if (dockerAvailable) {
    await Promise.all(
      INFRA_SERVICES.map(async (svc) => {
        const m = await resolveContainer(containers, svc.container);
        const severity = deriveSeverity(m.status, m.cpu, m.memMB, m.memLimitMB);
        infraComponents.push({
          name: svc.name,
          container: svc.container,
          layer: svc.layer,
          status: m.status,
          severity,
          cpu: m.cpu,
          memMB: m.memMB,
          uptime: m.uptime,
        });
      }),
    );
  } else {
    for (const svc of INFRA_SERVICES) {
      infraComponents.push({
        name: svc.name,
        container: svc.container,
        layer: svc.layer,
        status: "unknown",
        severity: "unknown",
        cpu: 0,
        memMB: 0,
        uptime: "—",
      });
    }
  }

  // Sort infra by layer then name
  infraComponents.sort(
    (a, b) => a.layer.localeCompare(b.layer) || a.name.localeCompare(b.name),
  );

  // Sort participants: critical first, then by name
  const severityOrder = { critical: 0, warning: 1, unknown: 2, healthy: 3 };
  participantTopologies.sort(
    (a, b) =>
      severityOrder[a.health] - severityOrder[b.health] ||
      a.displayName.localeCompare(b.displayName),
  );

  // Summary
  const degradedCount = participantTopologies.filter(
    (p) => p.health === "critical" || p.health === "warning",
  ).length;

  // ── Cluster-wide metrics: record + compute peaks ──
  const allComponents = [
    ...participantTopologies.flatMap((p) => p.components),
    ...infraComponents,
  ];
  // Deduplicate by container name (participants share containers)
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

  // Record this snapshot
  recordMetrics(clusterCpu, clusterMemMB);

  // Compute 24h peaks and previous-24h peaks for trend comparison
  const now = Date.now();
  const last24h = computePeakWindow(now - 24 * 3600_000, now);
  const prev24h = computePeakWindow(now - 48 * 3600_000, now - 24 * 3600_000);

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    dockerAvailable,
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
