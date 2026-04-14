import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import http from "node:http";
import { edcClient } from "@/lib/edc";
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
// Docker Engine API helpers (via Unix socket)
// ---------------------------------------------------------------------------

const DOCKER_SOCKET = "/var/run/docker.sock";

/** Make a GET request to the Docker Engine API. */
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

// Map container names → participant and component role
interface ServiceMapping {
  container: string;
  component: string;
  layer: "edc-core" | "identity" | "cfm" | "infrastructure";
  participant?: string; // undefined = shared
}

const SERVICE_MAP: ServiceMapping[] = [
  {
    container: "health-dataspace-controlplane",
    component: "Control Plane",
    layer: "edc-core",
  },
  {
    container: "health-dataspace-dataplane-fhir",
    component: "Data Plane FHIR",
    layer: "edc-core",
  },
  {
    container: "health-dataspace-dataplane-omop",
    component: "Data Plane OMOP",
    layer: "edc-core",
  },
  {
    container: "health-dataspace-identityhub",
    component: "Identity Hub",
    layer: "identity",
  },
  {
    container: "health-dataspace-issuerservice",
    component: "Issuer Service",
    layer: "identity",
  },
  {
    container: "health-dataspace-keycloak",
    component: "Keycloak",
    layer: "identity",
  },
  {
    container: "health-dataspace-vault",
    component: "Vault",
    layer: "identity",
  },
  {
    container: "health-dataspace-vault-bootstrap",
    component: "Vault Bootstrap",
    layer: "identity",
  },
  {
    container: "health-dataspace-tenant-manager",
    component: "Tenant Manager",
    layer: "cfm",
  },
  {
    container: "health-dataspace-provision-manager",
    component: "Provision Manager",
    layer: "cfm",
  },
  {
    container: "health-dataspace-cfm-edcv-agent",
    component: "EDC-V Agent",
    layer: "cfm",
  },
  {
    container: "health-dataspace-cfm-keycloak-agent",
    component: "Keycloak Agent",
    layer: "cfm",
  },
  {
    container: "health-dataspace-cfm-onboarding-agent",
    component: "Onboarding Agent",
    layer: "cfm",
  },
  {
    container: "health-dataspace-cfm-registration-agent",
    component: "Registration Agent",
    layer: "cfm",
  },
  {
    container: "health-dataspace-postgres",
    component: "PostgreSQL",
    layer: "infrastructure",
  },
  {
    container: "health-dataspace-nats",
    component: "NATS",
    layer: "infrastructure",
  },
  {
    container: "health-dataspace-neo4j",
    component: "Neo4j",
    layer: "infrastructure",
  },
  {
    container: "health-dataspace-neo4j-proxy",
    component: "Neo4j Proxy",
    layer: "infrastructure",
  },
  {
    container: "health-dataspace-traefik",
    component: "Traefik",
    layer: "infrastructure",
  },
  {
    container: "health-dataspace-ui",
    component: "UI",
    layer: "infrastructure",
  },
];

// ---------------------------------------------------------------------------
// Docker container stats parsing
// ---------------------------------------------------------------------------

interface DockerContainer {
  Id: string;
  Names: string[];
  State: string;
  Status: string;
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
    Health?: {
      Status: string;
      Log?: { Output: string; ExitCode: number; End: string }[];
    };
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

function calcMemUsage(stats: DockerStats): {
  usedMB: number;
  limitMB: number;
  percent: number;
} {
  const cache = stats.memory_stats.stats?.cache || 0;
  const used = stats.memory_stats.usage - cache;
  const limit = stats.memory_stats.limit;
  return {
    usedMB: Math.round((used / 1024 / 1024) * 10) / 10,
    limitMB: Math.round((limit / 1024 / 1024) * 10) / 10,
    percent: limit > 0 ? Math.round((used / limit) * 1000) / 10 : 0,
  };
}

// ---------------------------------------------------------------------------
// Component info result type
// ---------------------------------------------------------------------------

interface ComponentInfo {
  container: string;
  component: string;
  layer: string;
  status: "healthy" | "unhealthy" | "running" | "stopped" | "unknown";
  uptime: string;
  cpu: number;
  mem: { usedMB: number; limitMB: number; percent: number };
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

// ---------------------------------------------------------------------------
// ACA topology mapping (subset of the full Docker SERVICE_MAP — only the apps
// actually deployed on Azure Container Apps via scripts/azure/*.sh)
// ---------------------------------------------------------------------------

interface AcaMapping {
  component: string;
  layer: "edc-core" | "identity" | "cfm" | "infrastructure";
}

const ACA_SERVICE_MAP: Record<string, AcaMapping> = {
  "mvhd-controlplane": { component: "Control Plane", layer: "edc-core" },
  "mvhd-dp-fhir": { component: "Data Plane FHIR", layer: "edc-core" },
  "mvhd-dp-omop": { component: "Data Plane OMOP", layer: "edc-core" },
  "mvhd-identityhub": { component: "Identity Hub", layer: "identity" },
  "mvhd-issuerservice": { component: "Issuer Service", layer: "identity" },
  "mvhd-keycloak": { component: "Keycloak", layer: "identity" },
  "mvhd-vault": { component: "Vault", layer: "identity" },
  "mvhd-tenant-mgr": { component: "Tenant Manager", layer: "cfm" },
  "mvhd-provision-mgr": { component: "Provision Manager", layer: "cfm" },
  "mvhd-postgres": { component: "PostgreSQL", layer: "infrastructure" },
  "mvhd-nats": { component: "NATS", layer: "infrastructure" },
  "mvhd-neo4j": { component: "Neo4j", layer: "infrastructure" },
  "mvhd-neo4j-proxy": { component: "Neo4j Proxy", layer: "infrastructure" },
  "mvhd-ui": { component: "UI", layer: "infrastructure" },
};

/**
 * Enumerate Container Apps in the configured resource group and populate the
 * `components` array with the same shape Docker would produce, using Azure
 * Monitor metrics instead of Docker stats.
 */
async function loadAcaComponents(
  components: ComponentInfo[],
): Promise<boolean> {
  const subscriptionId = azureSubscriptionId();
  const resourceGroup = azureResourceGroup();
  if (!subscriptionId || !resourceGroup) return false;

  let apps: Awaited<ReturnType<typeof listContainerApps>>;
  try {
    apps = await listContainerApps(subscriptionId, resourceGroup);
  } catch (err) {
    console.warn("ARM listContainerApps failed:", err);
    return false;
  }

  await Promise.all(
    apps.map(async (app) => {
      const mapping = ACA_SERVICE_MAP[app.name];
      if (!mapping) return;

      const container = app.properties.template?.containers?.[0];
      const cpuReservation = container?.resources?.cpu ?? 0;
      const memReservationBytes = parseMemoryToBytes(
        container?.resources?.memory,
      );

      let sample;
      try {
        sample = await getContainerAppMetrics(
          subscriptionId,
          resourceGroup,
          app.name,
        );
      } catch {
        sample = null;
      }

      const runningStatus =
        app.properties.runningStatus ?? app.properties.provisioningState ?? "";
      const status: ComponentInfo["status"] = /running/i.test(runningStatus)
        ? "running"
        : /stopped|stop/i.test(runningStatus)
          ? "stopped"
          : "unknown";

      // CPU %: Azure gives UsageNanoCores; divide by cpuReservation (vCPUs).
      // If reservation is present, rescale to "% of reservation"; else keep raw.
      const rawCpuPct = sample?.cpuPercent ?? 0;
      const cpu =
        cpuReservation > 0
          ? Math.round((rawCpuPct / cpuReservation) * 100) / 100
          : rawCpuPct;

      // memPercent field from azure-arm is actually bytes; convert.
      const usedBytes = sample?.memPercent ?? 0;
      const usedMB = Math.round((usedBytes / 1024 / 1024) * 10) / 10;
      const limitMB = Math.round((memReservationBytes / 1024 / 1024) * 10) / 10;
      const memPct =
        limitMB > 0 ? Math.round((usedMB / limitMB) * 1000) / 10 : 0;

      components.push({
        container: app.name,
        component: mapping.component,
        layer: mapping.layer,
        status,
        uptime: "—",
        cpu,
        mem: { usedMB, limitMB, percent: memPct },
      });
    }),
  );

  return true;
}

// ---------------------------------------------------------------------------
// GET /api/admin/components
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

  const components: ComponentInfo[] = [];
  const participants: ParticipantInfo[] = [];
  let dockerAvailable = false;
  let metricsSource: "docker" | "azure-monitor" | "none" = "none";

  // 1a) Azure Container Apps path — use Azure Monitor via managed identity.
  //     Skips the Docker socket entirely (not available on ACA).
  if (isAzureDeployment()) {
    const ok = await loadAcaComponents(components);
    if (ok && components.length > 0) {
      dockerAvailable = true; // UI flag: "metrics are available"
      metricsSource = "azure-monitor";
    }
  }

  // 1b) Docker Engine API fallback (local dev / single-VM deployment)
  if (metricsSource === "none") {
    try {
      const containers = await dockerGet<DockerContainer[]>(
        "/containers/json?all=true&filters=" +
          encodeURIComponent(JSON.stringify({ name: ["health-dataspace"] })),
      );
      dockerAvailable = true;

      await Promise.all(
        SERVICE_MAP.map(async (svc) => {
          const container = containers.find((c) =>
            c.Names.some((n) => n === `/${svc.container}`),
          );
          if (!container) {
            components.push({
              ...svc,
              status: "stopped",
              uptime: "—",
              cpu: 0,
              mem: { usedMB: 0, limitMB: 0, percent: 0 },
            });
            return;
          }

          // Get inspect for health + uptime
          let healthStatus: ComponentInfo["status"] = "running";
          let uptime = "—";
          try {
            const inspect = await dockerGet<DockerInspect>(
              `/containers/${container.Id}/json`,
            );
            if (inspect.State.Health?.Status) {
              healthStatus = inspect.State.Health
                .Status as ComponentInfo["status"];
            }
            const started = new Date(inspect.State.StartedAt);
            const diffMs = Date.now() - started.getTime();
            const hours = Math.floor(diffMs / 3600000);
            const mins = Math.floor((diffMs % 3600000) / 60000);
            uptime = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
          } catch {
            /* ignore inspect failures */
          }

          // Get stats (one-shot, non-streaming)
          let cpu = 0;
          let mem = { usedMB: 0, limitMB: 0, percent: 0 };
          try {
            const stats = await dockerGet<DockerStats>(
              `/containers/${container.Id}/stats?stream=false`,
            );
            cpu = Math.round(calcCpuPercent(stats) * 100) / 100;
            mem = calcMemUsage(stats);
          } catch {
            /* ignore stats failures */
          }

          components.push({ ...svc, status: healthStatus, uptime, cpu, mem });
        }),
      );
    } catch {
      // Docker socket not available — fall back to unknown topology
      const fallbackMap = isAzureDeployment()
        ? Object.entries(ACA_SERVICE_MAP).map(([container, m]) => ({
            container,
            component: m.component,
            layer: m.layer,
          }))
        : SERVICE_MAP;
      for (const svc of fallbackMap) {
        components.push({
          ...svc,
          status: "unknown",
          uptime: "—",
          cpu: 0,
          mem: { usedMB: 0, limitMB: 0, percent: 0 },
        });
      }
    }
  }

  // 2) Fetch participant data from CFM
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
      let profiles: unknown[] = [];
      try {
        profiles = await edcClient.tenant<unknown[]>(
          `/v1alpha1/tenants/${t.id}/participant-profiles`,
        );
      } catch {
        /* no profiles */
      }

      // Find matching EDC participant context
      const ctxId = (profiles as { participantContextId?: string }[])?.[0]
        ?.participantContextId;
      const ctx = edcParticipants.find((p) => p["@id"] === ctxId);

      // Extract DID from profile identifier (URL-encoded), EDC identity, or tenant property
      const profileDid = (profiles as { identifier?: string }[])?.[0]
        ?.identifier;
      const decodedDid = profileDid
        ? decodeURIComponent(profileDid)
        : undefined;

      participants.push({
        id: t.id,
        displayName: t.properties?.displayName || t.id,
        organization: t.properties?.organization || "—",
        role: t.properties?.ehdsParticipantType || t.properties?.role || "—",
        did: ctx?.identity || decodedDid || t.properties?.did || "—",
        state: ctx?.state || "—",
        profileCount: profiles.length,
      });
    }
  } catch (err) {
    console.warn("Could not fetch participant data:", err);
  }

  // Sort components by layer order then name
  const layerOrder = { "edc-core": 0, identity: 1, cfm: 2, infrastructure: 3 };
  components.sort(
    (a, b) =>
      (layerOrder[a.layer as keyof typeof layerOrder] ?? 9) -
        (layerOrder[b.layer as keyof typeof layerOrder] ?? 9) ||
      a.component.localeCompare(b.component),
  );

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    dockerAvailable,
    metricsSource,
    components,
    participants,
  });
}
