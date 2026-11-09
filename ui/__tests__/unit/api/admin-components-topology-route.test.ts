/**
 * Unit tests for GET /api/admin/components/topology route.
 *
 * Covers: Docker available/unavailable, severity derivation, worst severity
 * aggregation, participant health, infrastructure components, sorting,
 * summary counts, participants from the control plane's contexts (ADR-078)
 * with the Neo4j fallback, siglet as the data plane after EDC 0.18 (#927),
 * the Azure path, error handling.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/* ── Mocks ── */

const mockHttpRequest = vi.fn();
vi.mock("node:http", () => ({
  default: { request: (...args: unknown[]) => mockHttpRequest(...args) },
  request: (...args: unknown[]) => mockHttpRequest(...args),
}));

// The control plane's Management API is the only EDC API the route reads;
// the CFM facades are gone (#927), so the mock has none.
const mockManagement = vi.fn();
vi.mock("@/lib/edc", () => ({
  EDC_CONTEXT: "https://w3id.org/edc/connector/management/v2",
  edcClient: {
    management: (...args: unknown[]) => mockManagement(...args),
  },
}));

// ARM is stubbed; isAzureDeployment() and the env readers stay real, so a
// test turns the Azure path on with vi.stubEnv.
const mockListContainerApps = vi.fn();
const mockAppMetrics = vi.fn();
vi.mock("@/lib/azure-arm", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/azure-arm")>()),
  listContainerApps: (...args: unknown[]) => mockListContainerApps(...args),
  getContainerAppMetrics: (...args: unknown[]) => mockAppMetrics(...args),
}));

const mockRunQuery = vi.fn();
vi.mock("@/lib/neo4j", () => ({
  runQuery: (...args: unknown[]) => mockRunQuery(...args),
}));

import { GET } from "@/app/api/admin/components/topology/route";
import { __resetCacheForTests } from "@/lib/server-cache";

/* ── Docker mock helpers ── */

interface MockContainer {
  Id: string;
  Names: string[];
  State: string;
}

function makeDockerStats(
  cpuPercent: number,
  memUsageMB: number,
  memLimitMB: number,
) {
  return {
    cpu_stats: {
      cpu_usage: { total_usage: 1e8 + cpuPercent * 1e6 },
      system_cpu_usage: 2e8,
      online_cpus: 1,
    },
    precpu_stats: {
      cpu_usage: { total_usage: 1e8 },
      system_cpu_usage: 1e8,
    },
    memory_stats: {
      usage: memUsageMB * 1024 * 1024,
      limit: memLimitMB * 1024 * 1024,
      stats: { cache: 0 },
    },
  };
}

function makeDockerInspect(
  healthStatus?: string,
  startedAt = "2026-03-21T04:30:00Z",
) {
  return {
    State: {
      Health: healthStatus ? { Status: healthStatus } : undefined,
      Status: "running",
      StartedAt: startedAt,
    },
  };
}

function setupDockerAvailable(
  containers: MockContainer[],
  inspects: Record<string, unknown> = {},
  stats: Record<string, unknown> = {},
) {
  mockHttpRequest.mockImplementation(
    (opts: { path: string }, callback: (res: unknown) => void) => {
      let responseData: unknown;

      if (opts.path.startsWith("/containers/json")) {
        responseData = containers;
      } else if (opts.path.includes("/stats")) {
        const id = opts.path.split("/")[2];
        responseData = stats[id] ?? makeDockerStats(1, 100, 1024);
      } else if (opts.path.endsWith("/json")) {
        const id = opts.path.split("/")[2];
        responseData = inspects[id] ?? makeDockerInspect("healthy");
      }

      const dataHandlers: ((chunk: Buffer) => void)[] = [];
      const endHandlers: (() => void)[] = [];
      const res = {
        on(event: string, handler: (...args: unknown[]) => void) {
          if (event === "data")
            dataHandlers.push(handler as (chunk: Buffer) => void);
          else if (event === "end") endHandlers.push(handler as () => void);
          return res;
        },
      };

      callback(res);
      if (responseData !== undefined) {
        const chunk = Buffer.from(JSON.stringify(responseData));
        dataHandlers.forEach((h) => h(chunk));
      }
      endHandlers.forEach((h) => h());

      return {
        on: vi.fn().mockReturnThis(),
        setTimeout: vi.fn().mockReturnThis(),
        end: vi.fn(),
        destroy: vi.fn(),
      };
    },
  );
}

function setupDockerUnavailable() {
  mockHttpRequest.mockImplementation((_opts: unknown, _callback: unknown) => {
    const errorHandlers: ((err: Error) => void)[] = [];
    const req = {
      on(event: string, handler: (...args: unknown[]) => void) {
        if (event === "error")
          errorHandlers.push(handler as (err: Error) => void);
        return req;
      },
      setTimeout: vi.fn().mockReturnThis(),
      end() {
        errorHandlers.forEach((h) =>
          h(new Error("connect ENOENT /var/run/docker.sock")),
        );
      },
      destroy: vi.fn(),
    };
    return req;
  });
}

/* ── Common containers ── */

const NOW = new Date("2026-03-21T10:00:00Z").getTime();

// The first six are PARTICIPANT_SERVICES, in order: Control Plane, siglet,
// Identity Hub (the core three), Issuer Service, Keycloak, Vault.
const CONTAINERS: MockContainer[] = [
  { Id: "cp1", Names: ["/health-dataspace-controlplane"], State: "running" },
  { Id: "sig1", Names: ["/health-dataspace-siglet"], State: "running" },
  {
    Id: "ih1",
    Names: ["/health-dataspace-identityhub"],
    State: "running",
  },
  {
    Id: "is1",
    Names: ["/health-dataspace-issuerservice"],
    State: "running",
  },
  { Id: "kc1", Names: ["/health-dataspace-keycloak"], State: "running" },
  { Id: "v1", Names: ["/health-dataspace-vault"], State: "running" },
  { Id: "pg1", Names: ["/health-dataspace-postgres"], State: "running" },
  { Id: "nats1", Names: ["/health-dataspace-nats"], State: "running" },
  { Id: "neo4j1", Names: ["/health-dataspace-neo4j"], State: "running" },
  {
    Id: "neo4j-proxy1",
    Names: ["/health-dataspace-neo4j-proxy"],
    State: "running",
  },
  { Id: "traefik1", Names: ["/health-dataspace-traefik"], State: "running" },
  { Id: "ui1", Names: ["/health-dataspace-ui"], State: "running" },
];

const PARTICIPANT_CONTAINERS = CONTAINERS.slice(0, 6);

const RETIRED_CONTAINERS = [
  "health-dataspace-dataplane-fhir",
  "health-dataspace-dataplane-omop",
  "health-dataspace-tenant-manager",
  "health-dataspace-provision-manager",
  "health-dataspace-cfm-edcv-agent",
  "health-dataspace-cfm-keycloak-agent",
  "health-dataspace-cfm-registration-agent",
  "health-dataspace-cfm-onboarding-agent",
];

/* ── Control plane contexts ── */

// Two of the seeded five, named by their DID slug (lib/edc/participants.ts).
const MOCK_CONTEXTS = [
  {
    "@id": "ctx-alpha",
    identity: "did:web:identityhub%3A7083:alpha-klinik",
    state: "CREATED",
  },
  {
    "@id": "ctx-pharmaco",
    identity: "did:web:identityhub%3A7083:pharmaco",
    state: "ACTIVATED",
  },
];

/* ── Setup ── */

beforeEach(() => {
  vi.clearAllMocks();
  __resetCacheForTests();
  vi.spyOn(Date, "now").mockReturnValue(NOW);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  // Default: Neo4j fallback returns no participants so empty-case assertions
  // remain valid. Tests that need seeded fallback override this.
  mockRunQuery.mockResolvedValue([]);

  // Default: participants available
  mockManagement.mockResolvedValue(MOCK_CONTEXTS);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

// =====================================================================
// Docker available
// =====================================================================
describe("GET /api/admin/components/topology — Docker available", () => {
  it("returns dockerAvailable: true", async () => {
    setupDockerAvailable(CONTAINERS);
    const res = await GET();
    const data = await res.json();
    expect(data.dockerAvailable).toBe(true);
  });

  it("returns participant topology with components", async () => {
    setupDockerAvailable(CONTAINERS);
    const res = await GET();
    const data = await res.json();
    expect(data.participants.length).toBeGreaterThanOrEqual(1);
    expect(data.participants[0].components.length).toBe(6); // PARTICIPANT_SERVICES count
  });

  it("gives every participant siglet as its data plane, and no JAD data plane", async () => {
    setupDockerAvailable(CONTAINERS);
    const data = await (await GET()).json();
    for (const p of data.participants) {
      expect(p.components.map((c: { name: string }) => c.name)).toEqual([
        "Control Plane",
        "Data Plane (siglet)",
        "Identity Hub",
        "Issuer Service",
        "Keycloak",
        "Vault",
      ]);
      const containers = p.components.map(
        (c: { container: string }) => c.container,
      );
      expect(containers).toContain("health-dataspace-siglet");
      for (const retired of RETIRED_CONTAINERS) {
        expect(containers).not.toContain(retired);
      }
    }
  });

  it("maps participant properties from the control plane context", async () => {
    setupDockerAvailable(CONTAINERS);
    const res = await GET();
    const data = await res.json();
    const alpha = data.participants.find(
      (p: { id: string }) => p.id === "ctx-alpha",
    );
    expect(alpha.displayName).toBe("AlphaKlinik Berlin");
    expect(alpha.organization).toBe("AlphaKlinik Berlin");
    expect(alpha.role).toBe("DATA_HOLDER");
    expect(alpha.did).toBe("did:web:identityhub%3A7083:alpha-klinik");
    expect(alpha.state).toBe("CREATED");
  });

  it("returns infrastructure components", async () => {
    setupDockerAvailable(CONTAINERS);
    const res = await GET();
    const data = await res.json();
    expect(data.infrastructure.length).toBeGreaterThanOrEqual(1);
    const infraNames = data.infrastructure.map((c: { name: string }) => c.name);
    expect(infraNames).toContain("PostgreSQL");
    expect(infraNames).toContain("NATS");
    expect(infraNames).toContain("Neo4j");
    expect(infraNames).toContain("Traefik");
  });

  it("returns summary with correct counts", async () => {
    setupDockerAvailable(CONTAINERS);
    const res = await GET();
    const data = await res.json();
    expect(data.summary.totalParticipants).toBe(2);
    expect(data.summary.totalInfra).toBeGreaterThanOrEqual(1);
  });

  it("includes clusterMetrics with peaks and trend data", async () => {
    setupDockerAvailable(CONTAINERS);
    const res = await GET();
    const data = await res.json();
    expect(data.clusterMetrics).toBeDefined();
    expect(data.clusterMetrics.currentCpu).toBeGreaterThanOrEqual(0);
    expect(data.clusterMetrics.currentMemMB).toBeGreaterThanOrEqual(0);
    expect(data.clusterMetrics.last24h).toEqual(
      expect.objectContaining({
        peakCpu: expect.any(Number),
        peakMemMB: expect.any(Number),
        samples: expect.any(Number),
      }),
    );
    expect(data.clusterMetrics.prev24h).toEqual(
      expect.objectContaining({
        peakCpu: expect.any(Number),
        peakMemMB: expect.any(Number),
        samples: expect.any(Number),
      }),
    );
  });

  it("includes a timestamp", async () => {
    setupDockerAvailable(CONTAINERS);
    const res = await GET();
    const data = await res.json();
    expect(new Date(data.timestamp).getTime()).not.toBeNaN();
  });
});

// =====================================================================
// Severity derivation (tested through route output)
// =====================================================================
describe("severity derivation", () => {
  beforeEach(() => {
    // Single participant for focused testing
    mockManagement.mockResolvedValue([MOCK_CONTEXTS[0]]);
  });

  it("assigns healthy severity to healthy container", async () => {
    setupDockerAvailable(
      [CONTAINERS[0]], // controlplane
      { cp1: makeDockerInspect("healthy") },
      { cp1: makeDockerStats(5, 200, 1024) },
    );
    const res = await GET();
    const data = await res.json();
    const comp = data.participants[0]?.components?.find(
      (c: { name: string }) => c.name === "Control Plane",
    );
    expect(comp?.severity).toBe("healthy");
  });

  it("assigns critical severity to unhealthy container", async () => {
    setupDockerAvailable(
      [CONTAINERS[0]],
      { cp1: makeDockerInspect("unhealthy") },
      { cp1: makeDockerStats(5, 200, 1024) },
    );
    const res = await GET();
    const data = await res.json();
    const comp = data.participants[0]?.components?.find(
      (c: { name: string }) => c.name === "Control Plane",
    );
    expect(comp?.severity).toBe("critical");
  });

  it("assigns critical severity to stopped container", async () => {
    setupDockerAvailable([]); // controlplane not in containers → stopped
    const res = await GET();
    const data = await res.json();
    const comp = data.participants[0]?.components?.find(
      (c: { name: string }) => c.name === "Control Plane",
    );
    expect(comp?.severity).toBe("critical");
  });

  it("assigns warning severity when CPU > 80%", async () => {
    setupDockerAvailable(
      [CONTAINERS[0]],
      { cp1: makeDockerInspect("healthy") },
      { cp1: makeDockerStats(85, 200, 1024) },
    );
    const res = await GET();
    const data = await res.json();
    const comp = data.participants[0]?.components?.find(
      (c: { name: string }) => c.name === "Control Plane",
    );
    expect(comp?.severity).toBe("warning");
  });

  it("assigns warning severity when memory > 90% of limit", async () => {
    setupDockerAvailable(
      [CONTAINERS[0]],
      { cp1: makeDockerInspect("healthy") },
      { cp1: makeDockerStats(5, 950, 1024) },
    );
    const res = await GET();
    const data = await res.json();
    const comp = data.participants[0]?.components?.find(
      (c: { name: string }) => c.name === "Control Plane",
    );
    expect(comp?.severity).toBe("warning");
  });

  it("assigns warning severity to starting container", async () => {
    setupDockerAvailable(
      [CONTAINERS[0]],
      { cp1: makeDockerInspect("starting") },
      { cp1: makeDockerStats(5, 200, 1024) },
    );
    const res = await GET();
    const data = await res.json();
    const comp = data.participants[0]?.components?.find(
      (c: { name: string }) => c.name === "Control Plane",
    );
    expect(comp?.severity).toBe("warning");
  });
});

// =====================================================================
// Participant health (worst of core components)
// =====================================================================
describe("participant health aggregation", () => {
  beforeEach(() => {
    mockManagement.mockResolvedValue([MOCK_CONTEXTS[0]]);
  });

  it("healthy when all core components are healthy", async () => {
    // All participant service containers present and healthy
    setupDockerAvailable(PARTICIPANT_CONTAINERS);
    const res = await GET();
    const data = await res.json();
    expect(data.participants[0].health).toBe("healthy");
  });

  it("healthy with no JAD data plane and no CFM container at all", async () => {
    // The EDC 0.18 containers are gone (#927); a participant does not miss them.
    setupDockerAvailable(PARTICIPANT_CONTAINERS);
    const data = await (await GET()).json();
    expect(data.participants[0].health).toBe("healthy");
    expect(data.summary.degradedParticipants).toBe(0);
  });

  it("critical when siglet, the data plane, is down", async () => {
    setupDockerAvailable(
      PARTICIPANT_CONTAINERS.filter((c) => c.Id !== "sig1"), // siglet stopped
    );
    const data = await (await GET()).json();
    const siglet = data.participants[0].components.find(
      (c: { name: string }) => c.name === "Data Plane (siglet)",
    );
    expect(siglet.severity).toBe("critical");
    expect(data.participants[0].health).toBe("critical");
  });

  it("a non-core service down does not change a participant's health", async () => {
    setupDockerAvailable(
      PARTICIPANT_CONTAINERS.filter((c) => c.Id !== "kc1"), // Keycloak stopped
    );
    const data = await (await GET()).json();
    expect(data.participants[0].health).toBe("healthy");
  });

  it("critical when any core component is critical", async () => {
    // controlplane present but unhealthy
    setupDockerAvailable(
      [CONTAINERS[0]], // only controlplane — rest stopped → critical
    );
    const res = await GET();
    const data = await res.json();
    expect(data.participants[0].health).toBe("critical");
  });

  it("warning when worst core component is warning", async () => {
    // All containers present, but controlplane has high CPU
    const allInspects: Record<string, unknown> = {};
    const allStats: Record<string, unknown> = {};
    PARTICIPANT_CONTAINERS.forEach((c) => {
      allInspects[c.Id] = makeDockerInspect("healthy");
      allStats[c.Id] = makeDockerStats(5, 200, 1024);
    });
    // Override controlplane with high CPU
    allStats["cp1"] = makeDockerStats(85, 200, 1024);

    setupDockerAvailable(PARTICIPANT_CONTAINERS, allInspects, allStats);
    const res = await GET();
    const data = await res.json();
    expect(data.participants[0].health).toBe("warning");
  });
});

// =====================================================================
// Docker unavailable
// =====================================================================
describe("GET /api/admin/components/topology — Docker unavailable", () => {
  it("returns dockerAvailable: false", async () => {
    setupDockerUnavailable();
    const res = await GET();
    const data = await res.json();
    expect(data.dockerAvailable).toBe(false);
  });

  it("returns infrastructure with unknown severity", async () => {
    setupDockerUnavailable();
    const res = await GET();
    const data = await res.json();
    for (const infra of data.infrastructure) {
      expect(infra.severity).toBe("unknown");
      expect(infra.status).toBe("unknown");
      expect(infra.cpu).toBe(0);
      expect(infra.memMB).toBe(0);
    }
  });

  it("returns all infra services even without Docker", async () => {
    setupDockerUnavailable();
    const res = await GET();
    const data = await res.json();
    // INFRA_SERVICES has 6 entries since the CFM managers and agents left (#927)
    expect(data.infrastructure.length).toBe(6);
  });

  it("returns participants with unknown component status without Docker", async () => {
    setupDockerUnavailable();
    const res = await GET();
    const data = await res.json();
    for (const participant of data.participants) {
      for (const comp of participant.components) {
        expect(comp.severity).toBe("unknown");
        expect(comp.cpu).toBe(0);
      }
    }
  });
});

// =====================================================================
// Sorting & ordering
// =====================================================================
describe("sorting", () => {
  it("sorts infrastructure by layer then name", async () => {
    setupDockerUnavailable();
    const res = await GET();
    const data = await res.json();
    const layerNames = data.infrastructure.map(
      (c: { layer: string; name: string }) => `${c.layer}:${c.name}`,
    );
    // Should be sorted by layer, alphabetically within
    const sorted = [...layerNames].sort();
    expect(layerNames).toEqual(sorted);
  });

  it("sorts participants by severity then name", async () => {
    // Two participants, AlphaKlinik and PharmaCo
    setupDockerAvailable([]); // all stopped → all critical
    const res = await GET();
    const data = await res.json();
    // Both are critical → sorted alphabetically
    if (data.participants.length >= 2) {
      expect(data.participants[0].displayName).toBe("AlphaKlinik Berlin");
      expect(data.participants[1].displayName).toBe("PharmaCo Research AG");
    }
  });
});

// =====================================================================
// Degraded participant count
// =====================================================================
describe("degraded participant count", () => {
  it("counts degraded participants when some are critical", async () => {
    setupDockerAvailable([]); // all stopped → all critical → all participants degraded
    const res = await GET();
    const data = await res.json();
    expect(data.summary.degradedParticipants).toBe(2);
  });

  it("counts zero degraded when all healthy", async () => {
    setupDockerAvailable(CONTAINERS);
    const res = await GET();
    const data = await res.json();
    expect(data.summary.degradedParticipants).toBe(0);
  });
});

// =====================================================================
// Participants from the control plane (ADR-078)
// =====================================================================
describe("participants from the control plane", () => {
  it("reads the contexts once and calls no other EDC API", async () => {
    setupDockerAvailable(CONTAINERS);
    await GET();
    expect(mockManagement.mock.calls.map((c) => c[0])).toEqual([
      "/v5/participants",
    ]);
  });

  it("takes the role from the seeded slug", async () => {
    setupDockerAvailable(CONTAINERS);
    const res = await GET();
    const data = await res.json();
    const pharmaco = data.participants.find(
      (p: { id: string }) => p.id === "ctx-pharmaco",
    );
    expect(pharmaco.role).toBe("DATA_USER");
    expect(pharmaco.state).toBe("ACTIVATED");
  });

  it("takes an onboarded participant's names and role from its context", async () => {
    setupDockerAvailable(CONTAINERS);
    mockManagement.mockResolvedValue([
      {
        "@id": "ctx-nord",
        identity: "did:web:identityhub%3A7083:testklinik-nord",
        state: "CREATED",
        properties: {
          displayName: "Testklinik Nord",
          organization: "Testklinik Nord GmbH",
          role: "DATA_USER",
        },
      },
    ]);
    const data = await (await GET()).json();
    expect(data.participants[0]).toMatchObject({
      id: "ctx-nord",
      displayName: "Testklinik Nord",
      organization: "Testklinik Nord GmbH",
      role: "DATA_USER",
    });
  });

  it("falls back to the seeded graph when the control plane is unreachable", async () => {
    setupDockerAvailable(CONTAINERS);
    mockManagement.mockRejectedValue(new Error("connection refused"));
    mockRunQuery.mockResolvedValue([
      {
        id: "did:web:lmc.nl:clinic",
        name: "Limburg Medical Centre",
        type: "DATA_HOLDER",
        did: "did:web:lmc.nl:clinic",
      },
    ]);
    const data = await (await GET()).json();
    expect(data.participants).toHaveLength(1);
    expect(data.participants[0]).toMatchObject({
      id: "did:web:lmc.nl:clinic",
      displayName: "Limburg Medical Centre",
      role: "DATA_HOLDER",
      state: "SEEDED",
      health: "healthy",
    });
  });

  it("returns no participants when the control plane and Neo4j have none", async () => {
    setupDockerAvailable(CONTAINERS);
    mockManagement.mockRejectedValue(new Error("connection refused"));
    const res = await GET();
    const data = await res.json();
    expect(data.participants).toEqual([]);
  });
});

// =====================================================================
// Azure Container Apps
// =====================================================================
describe("on Azure Container Apps", () => {
  const app = (name: string, runningStatus = "Running") => ({
    id: `/apps/${name}`,
    name,
    location: "westeurope",
    properties: {
      runningStatus,
      template: { containers: [{ resources: { cpu: 0.5, memory: "1Gi" } }] },
    },
  });

  beforeEach(() => {
    vi.stubEnv("DEPLOYMENT_TARGET", "azure");
    vi.stubEnv("AZURE_SUBSCRIPTION_ID", "sub-123");
    vi.stubEnv("AZURE_RESOURCE_GROUP", "rg-mvhd-dev");
    mockAppMetrics.mockResolvedValue({ cpuPercent: 0.1, memPercent: 1e8 });
    mockManagement.mockResolvedValue([MOCK_CONTEXTS[0]]);
  });

  it("is healthy with the core apps running and none of the nine 0.18 apps deployed", async () => {
    mockListContainerApps.mockResolvedValue([
      app("mvhd-controlplane"),
      app("mvhd-siglet"),
      app("mvhd-identityhub"),
      app("mvhd-issuerservice"),
      app("mvhd-keycloak"),
      app("mvhd-vault"),
      app("mvhd-nats"),
      app("mvhd-neo4j"),
      app("mvhd-neo4j-proxy"),
      app("mvhd-ui"),
    ]);
    const data = await (await GET()).json();
    expect(data.metricsSource).toBe("azure-monitor");
    expect(data.metricsShared).toBe(true);
    const p = data.participants[0];
    expect(p.health).toBe("healthy");
    expect(p.components.map((c: { container: string }) => c.container)).toEqual(
      [
        "mvhd-controlplane",
        "mvhd-siglet",
        "mvhd-identityhub",
        "mvhd-issuerservice",
        "mvhd-keycloak",
        "mvhd-vault",
      ],
    );
    const infra = data.infrastructure.map(
      (c: { container: string }) => c.container,
    );
    for (const retired of ["mvhd-tenant-mgr", "mvhd-provision-mgr"]) {
      expect(infra).not.toContain(retired);
    }
  });

  it("marks a participant critical when mvhd-siglet is stopped", async () => {
    mockListContainerApps.mockResolvedValue([
      app("mvhd-controlplane"),
      app("mvhd-siglet", "Stopped"),
      app("mvhd-identityhub"),
    ]);
    const data = await (await GET()).json();
    expect(data.participants[0].health).toBe("critical");
  });
});

// =====================================================================
// Component metrics
// =====================================================================
describe("component metrics", () => {
  beforeEach(() => {
    mockManagement.mockResolvedValue([MOCK_CONTEXTS[0]]);
  });

  it("resolves CPU percentage for containers", async () => {
    setupDockerAvailable(
      [CONTAINERS[0]],
      { cp1: makeDockerInspect("healthy") },
      { cp1: makeDockerStats(5.25, 256, 1024) },
    );
    const res = await GET();
    const data = await res.json();
    const comp = data.participants[0]?.components?.find(
      (c: { name: string }) => c.name === "Control Plane",
    );
    expect(comp.cpu).toBe(5.25);
  });

  it("resolves memory in MB for containers", async () => {
    setupDockerAvailable(
      [CONTAINERS[0]],
      { cp1: makeDockerInspect("healthy") },
      { cp1: makeDockerStats(1, 256, 1024) },
    );
    const res = await GET();
    const data = await res.json();
    const comp = data.participants[0]?.components?.find(
      (c: { name: string }) => c.name === "Control Plane",
    );
    expect(comp.memMB).toBe(256);
  });

  it("resolves uptime from inspect StartedAt", async () => {
    setupDockerAvailable([CONTAINERS[0]], {
      cp1: makeDockerInspect("healthy", "2026-03-21T04:30:00Z"),
    });
    const res = await GET();
    const data = await res.json();
    const comp = data.participants[0]?.components?.find(
      (c: { name: string }) => c.name === "Control Plane",
    );
    expect(comp.uptime).toBe("5h 30m");
  });
});

// =====================================================================
// Response structure
// =====================================================================
describe("response structure", () => {
  it("has correct top-level shape", async () => {
    setupDockerUnavailable();
    const res = await GET();
    const data = await res.json();
    expect(data).toHaveProperty("timestamp");
    expect(data).toHaveProperty("dockerAvailable");
    expect(data).toHaveProperty("participants");
    expect(data).toHaveProperty("infrastructure");
    expect(data).toHaveProperty("summary");
    expect(data.summary).toHaveProperty("totalParticipants");
    expect(data.summary).toHaveProperty("degradedParticipants");
    expect(data.summary).toHaveProperty("totalInfra");
  });

  it("participant components include required fields", async () => {
    setupDockerAvailable(CONTAINERS);
    const res = await GET();
    const data = await res.json();
    const comp = data.participants[0]?.components?.[0];
    expect(comp).toHaveProperty("name");
    expect(comp).toHaveProperty("container");
    expect(comp).toHaveProperty("status");
    expect(comp).toHaveProperty("severity");
    expect(comp).toHaveProperty("cpu");
    expect(comp).toHaveProperty("memMB");
    expect(comp).toHaveProperty("uptime");
  });

  it("infrastructure components include layer field", async () => {
    setupDockerAvailable(CONTAINERS);
    const res = await GET();
    const data = await res.json();
    for (const infra of data.infrastructure) {
      expect(infra.layer).toBe("infrastructure");
    }
  });
});
