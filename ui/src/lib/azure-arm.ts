/**
 * Azure Resource Manager (ARM) client for Container Apps introspection.
 *
 * Uses system-assigned managed identity on the host Container App to
 * authenticate against Azure Monitor and the ACA management plane without
 * storing credentials.
 *
 * Required environment variables on the UI container app:
 *   DEPLOYMENT_TARGET=azure
 *   AZURE_SUBSCRIPTION_ID=<sub-guid>
 *   AZURE_RESOURCE_GROUP=rg-ehds-mvhd
 *
 * Required IAM:
 *   - System-assigned managed identity enabled on the UI container app
 *   - "Monitoring Reader" role on the resource group scope
 *   - "Reader" role on the resource group scope (to list container apps)
 *   - "Azure Container Instances Contributor Role" on mvhd-spe-1 and
 *     mvhd-spe-2, to start and stop the SPE workspaces (ADR-072); reading
 *     their state needs Reader only
 *
 * When any of the above is missing, callers fall back to the unknown-state
 * component list, matching the Docker-socket-unavailable behaviour.
 */

// ───────────────────────────────────────────────────────────────────────────
// Managed identity token
// ───────────────────────────────────────────────────────────────────────────

interface IdentityTokenResponse {
  access_token: string;
  expires_on: string;
  expires_in?: string;
  resource: string;
  token_type: string;
}

interface CachedToken {
  token: string;
  expiresAt: number; // epoch ms
}

let cachedArmToken: CachedToken | null = null;

// Short enough that a dead managed-identity endpoint or unreachable ARM
// doesn't stall the /admin/components topology route until Next.js gives up
// (which leaves the UI stuck on "Loading EDC components…").
const ARM_FETCH_TIMEOUT_MS = 8_000;

/**
 * Fetch an ARM access token via the ACA managed identity endpoint.
 *
 * ACA injects IDENTITY_ENDPOINT + IDENTITY_HEADER at runtime when a
 * system-assigned identity is enabled. The endpoint follows the App Service
 * protocol (api-version=2019-08-01) rather than the IMDS (169.254.169.254)
 * protocol used on VMs.
 */
async function getArmAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedArmToken && cachedArmToken.expiresAt - 60_000 > now) {
    return cachedArmToken.token;
  }

  const endpoint = process.env.IDENTITY_ENDPOINT;
  const header = process.env.IDENTITY_HEADER;
  if (!endpoint || !header) {
    throw new Error(
      "Managed identity unavailable: IDENTITY_ENDPOINT / IDENTITY_HEADER not set",
    );
  }

  const url = new URL(endpoint);
  url.searchParams.set("resource", "https://management.azure.com/");
  url.searchParams.set("api-version", "2019-08-01");

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { "X-IDENTITY-HEADER": header },
    signal: AbortSignal.timeout(ARM_FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(
      `Managed identity token request failed: ${
        res.status
      } ${await res.text()}`,
    );
  }
  const body = (await res.json()) as IdentityTokenResponse;
  const expiresAt = Number(body.expires_on) * 1000 || now + 3_300_000;
  cachedArmToken = { token: body.access_token, expiresAt };
  return body.access_token;
}

// ───────────────────────────────────────────────────────────────────────────
// ARM REST helpers
// ───────────────────────────────────────────────────────────────────────────

const ARM_BASE = "https://management.azure.com";

/**
 * An ARM answer that was not 2xx, with its status, so a caller can tell a
 * missing role (403) from a missing resource (404) from anything else.
 */
export class ArmError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ArmError";
  }
}

async function armGet<T>(path: string): Promise<T> {
  const token = await getArmAccessToken();
  const url = path.startsWith("http") ? path : `${ARM_BASE}${path}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    // Disable Next.js caching for live metrics
    cache: "no-store",
    signal: AbortSignal.timeout(ARM_FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new ArmError(
      `ARM ${path} → ${res.status} ${await res.text()}`,
      res.status,
    );
  }
  return (await res.json()) as T;
}

// ───────────────────────────────────────────────────────────────────────────
// Container Apps listing
// ───────────────────────────────────────────────────────────────────────────

interface ContainerAppResourceProperties {
  provisioningState?: string;
  runningStatus?: string;
  latestRevisionName?: string;
  template?: {
    containers?: {
      name?: string;
      image?: string;
      resources?: { cpu?: number; memory?: string };
    }[];
    scale?: { minReplicas?: number; maxReplicas?: number };
  };
  configuration?: {
    ingress?: { external?: boolean; fqdn?: string; targetPort?: number };
  };
}

interface ContainerAppResource {
  id: string;
  name: string;
  location: string;
  properties: ContainerAppResourceProperties;
}

interface ContainerAppListResponse {
  value: ContainerAppResource[];
  nextLink?: string;
}

export async function listContainerApps(
  subscriptionId: string,
  resourceGroup: string,
): Promise<ContainerAppResource[]> {
  const path =
    `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}` +
    `/providers/Microsoft.App/containerApps?api-version=2024-03-01`;
  const result: ContainerAppResource[] = [];
  let next: string | undefined = path;
  while (next) {
    const page: ContainerAppListResponse = await armGet(next);
    result.push(...page.value);
    next = page.nextLink;
  }
  return result;
}

// ───────────────────────────────────────────────────────────────────────────
// Azure Monitor metrics
// ───────────────────────────────────────────────────────────────────────────

interface MetricValue {
  timeStamp: string;
  average?: number;
  maximum?: number;
  total?: number;
  count?: number;
}

interface MetricSeries {
  name: { value: string; localizedValue?: string };
  unit: string;
  timeseries?: { data?: MetricValue[] }[];
}

interface MetricsResponse {
  value: MetricSeries[];
  interval?: string;
}

export interface AppMetricSample {
  cpuPercent: number;
  memPercent: number;
  replicas: number;
  restarts: number;
  hasData: boolean;
}

/**
 * Query CpuPercentage, MemoryPercentage, Replicas and Restarts for a single
 * container app over the last 5 minutes, returning the latest non-null sample.
 */
export async function getContainerAppMetrics(
  subscriptionId: string,
  resourceGroup: string,
  appName: string,
): Promise<AppMetricSample> {
  const resourceId =
    `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}` +
    `/providers/Microsoft.App/containerApps/${appName}`;
  const path =
    `${resourceId}/providers/Microsoft.Insights/metrics` +
    `?api-version=2024-02-01` +
    `&metricnames=${encodeURIComponent(
      "UsageNanoCores,WorkingSetBytes,Replicas,RestartCount",
    )}` +
    `&aggregation=${encodeURIComponent("Average,Maximum")}` +
    `&timespan=PT5M` +
    `&interval=PT1M`;

  const empty: AppMetricSample = {
    cpuPercent: 0,
    memPercent: 0,
    replicas: 0,
    restarts: 0,
    hasData: false,
  };

  let data: MetricsResponse;
  try {
    data = await armGet<MetricsResponse>(path);
  } catch {
    return empty;
  }

  const latestAvg = (metric: string): number | null => {
    const series = data.value.find((m) => m.name.value === metric);
    const points = series?.timeseries?.[0]?.data ?? [];
    for (let i = points.length - 1; i >= 0; i--) {
      const v = points[i].average ?? points[i].maximum;
      if (typeof v === "number" && !Number.isNaN(v)) return v;
    }
    return null;
  };

  const latestMax = (metric: string): number | null => {
    const series = data.value.find((m) => m.name.value === metric);
    const points = series?.timeseries?.[0]?.data ?? [];
    for (let i = points.length - 1; i >= 0; i--) {
      const v = points[i].maximum ?? points[i].average;
      if (typeof v === "number" && !Number.isNaN(v)) return v;
    }
    return null;
  };

  // UsageNanoCores → % of a single vCPU: 1e9 nanoCores = 100%
  const nanoCores = latestAvg("UsageNanoCores");
  const cpuPercent = nanoCores != null ? (nanoCores / 1e9) * 100 : 0;

  // WorkingSetBytes → raw bytes; caller converts against reservation
  const memBytes = latestAvg("WorkingSetBytes") ?? 0;

  const replicas = latestMax("Replicas") ?? 0;
  const restarts = latestMax("RestartCount") ?? 0;

  return {
    cpuPercent: Math.round(cpuPercent * 100) / 100,
    // memPercent is populated by the caller using the reservation
    memPercent: memBytes,
    replicas: Math.round(replicas),
    restarts: Math.round(restarts),
    hasData: nanoCores != null || memBytes > 0,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────

/**
 * ACA memory strings look like "0.5Gi" or "1Gi". Convert to bytes.
 */
export function parseMemoryToBytes(memory: string | undefined): number {
  if (!memory) return 0;
  const match = memory.match(/^([\d.]+)\s*(Gi|Mi|G|M)?$/i);
  if (!match) return 0;
  const value = parseFloat(match[1]);
  const unit = (match[2] || "Gi").toLowerCase();
  switch (unit) {
    case "gi":
      return value * 1024 ** 3;
    case "mi":
      return value * 1024 ** 2;
    case "g":
      return value * 1000 ** 3;
    case "m":
      return value * 1000 ** 2;
    default:
      return value;
  }
}

export function isAzureDeployment(): boolean {
  return process.env.DEPLOYMENT_TARGET === "azure";
}

export function azureSubscriptionId(): string | null {
  return process.env.AZURE_SUBSCRIPTION_ID ?? null;
}

export function azureResourceGroup(): string | null {
  return process.env.AZURE_RESOURCE_GROUP ?? null;
}

// ───────────────────────────────────────────────────────────────────────────
// Container App actions (restart, scale)
// ───────────────────────────────────────────────────────────────────────────

async function armPost<T>(
  path: string,
  body?: unknown,
  timeoutMs: number = ARM_FETCH_TIMEOUT_MS,
): Promise<T | null> {
  const token = await getArmAccessToken();
  const url = path.startsWith("http") ? path : `${ARM_BASE}${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    throw new ArmError(
      `ARM POST ${path} → ${res.status} ${await res.text()}`,
      res.status,
    );
  }
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? (JSON.parse(text) as T) : null;
}

async function armPatch<T>(path: string, body: unknown): Promise<T> {
  const token = await getArmAccessToken();
  const url = path.startsWith("http") ? path : `${ARM_BASE}${path}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(ARM_FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`ARM PATCH ${path} → ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as T;
}

/**
 * Restart all replicas of the latest revision. If the app is currently scaled
 * to zero (min-replicas=0 with no traffic), this is a no-op — caller should
 * bump min-replicas first via setContainerAppMinReplicas().
 */
export async function restartContainerApp(
  subscriptionId: string,
  resourceGroup: string,
  appName: string,
): Promise<void> {
  const path =
    `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}` +
    `/providers/Microsoft.App/containerApps/${appName}/restart` +
    `?api-version=2024-03-01`;
  await armPost(path);
}

/**
 * Patch min/max replicas without rewriting the rest of the spec. Used by the
 * Restart action to wake up scale-to-zero apps.
 */
export async function setContainerAppMinReplicas(
  subscriptionId: string,
  resourceGroup: string,
  appName: string,
  minReplicas: number,
): Promise<void> {
  const path =
    `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}` +
    `/providers/Microsoft.App/containerApps/${appName}` +
    `?api-version=2024-03-01`;
  await armPatch(path, {
    properties: { template: { scale: { minReplicas } } },
  });
}

// ───────────────────────────────────────────────────────────────────────────
// ACI container groups: the SPE workspaces (ADR-069, ADR-072)
// ───────────────────────────────────────────────────────────────────────────

const ACI_API_VERSION = "2023-05-01";

/**
 * ARM answers an ACI start only once the resource provider has accepted it:
 * 15 to 23 s on 2026-11-06, and once its own gateway gave up after 40 s
 * (GatewayTimeout) while the group started anyway. With the 8 s of every
 * other call the hub gave up first and called a starting workspace stopped.
 */
const ARM_POWER_TIMEOUT_MS = 60_000;

function containerGroupPath(
  subscriptionId: string,
  resourceGroup: string,
  groupName: string,
  action?: "start" | "stop",
): string {
  return (
    `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}` +
    `/providers/Microsoft.ContainerInstance/containerGroups/` +
    `${encodeURIComponent(groupName)}${action ? `/${action}` : ""}` +
    `?api-version=${ACI_API_VERSION}`
  );
}

interface ContainerGroupResource {
  name?: string;
  properties?: {
    provisioningState?: string;
    instanceView?: { state?: string };
    containers?: {
      name?: string;
      properties?: {
        instanceView?: {
          currentState?: { state?: string; startTime?: string };
        };
      };
    }[];
  };
}

/** What ARM says about a container group, as far as power goes. */
export interface ContainerGroupState {
  name: string;
  /** provisioningState: Succeeded, Pending, Creating, Updating, Failed... */
  provisioningState: string | null;
  /** instanceView.state: Running, Pending, Stopped, Succeeded, Failed... */
  state: string | null;
  /** When the group's first running container started, ISO-8601. */
  startedAt: string | null;
}

export async function getContainerGroupState(
  subscriptionId: string,
  resourceGroup: string,
  groupName: string,
): Promise<ContainerGroupState> {
  const g = await armGet<ContainerGroupResource>(
    containerGroupPath(subscriptionId, resourceGroup, groupName),
  );
  const starts = (g.properties?.containers ?? [])
    .map((c) => c.properties?.instanceView?.currentState)
    .filter((cs) => cs?.state === "Running" && cs.startTime)
    .map((cs) => cs!.startTime as string)
    .sort();
  return {
    name: g.name ?? groupName,
    provisioningState: g.properties?.provisioningState ?? null,
    state: g.properties?.instanceView?.state ?? null,
    startedAt: starts[0] ?? null,
  };
}

/**
 * Starts a stopped container group. ARM answers 202 once it has accepted the
 * start, which takes seconds (ARM_POWER_TIMEOUT_MS), and runs it in the
 * background; the group then pulls, attests and loads (ADR-069).
 * Needs Microsoft.ContainerInstance/containerGroups/start/action.
 */
export async function startContainerGroup(
  subscriptionId: string,
  resourceGroup: string,
  groupName: string,
): Promise<void> {
  await armPost(
    containerGroupPath(subscriptionId, resourceGroup, groupName, "start"),
    undefined,
    ARM_POWER_TIMEOUT_MS,
  );
}

/**
 * Stops a container group: its containers end, its memory-backed store goes
 * with them, and it bills nothing until started again.
 * Needs Microsoft.ContainerInstance/containerGroups/stop/action.
 */
export async function stopContainerGroup(
  subscriptionId: string,
  resourceGroup: string,
  groupName: string,
): Promise<void> {
  await armPost(
    containerGroupPath(subscriptionId, resourceGroup, groupName, "stop"),
    undefined,
    ARM_POWER_TIMEOUT_MS,
  );
}
