/**
 * Unit tests for GET /api/admin/components/topology route.
 *
 * Covers: Docker available/unavailable, severity derivation, worst severity
 * aggregation, participant health, infrastructure components, sorting,
 * summary counts, edcClient integration, error handling.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/* ── Mocks ── */

const mockHttpRequest = vi.fn();
vi.mock("node:http", () => ({
  default: { request: (...args: unknown[]) => mockHttpRequest(...args) },
  request: (...args: unknown[]) => mockHttpRequest(...args),
}));

const mockTenant = vi.fn();
const mockManagement = vi.fn();
vi.mock("@/lib/edc", () => ({
  edcClient: {
    tenant: (...args: unknown[]) => mockTenant(...args),
    management: (...args: unknown[]) => mockManagement(...args),
  },
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

const CONTAINERS: MockContainer[] = [
  { Id: "cp1", Names: ["/health-dataspace-controlplane"], State: "running" },
  {
    Id: "dp-fhir1",
    Names: ["/health-dataspace-dataplane-fhir"],
    State: "running",
  },
  {
    Id: "dp-omop1",
    Names: ["/health-dataspace-dataplane-omop"],
    State: "running",
  },
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
  {
    Id: "tm1",
    Names: ["/health-dataspace-tenant-manager"],
    State: "running",
  },
  {
    Id: "pm1",
    Names: ["/health-dataspace-provision-manager"],
    State: "running",
  },
  {
    Id: "ea1",
    Names: ["/health-dataspace-cfm-edcv-agent"],
    State: "running",
  },
  {
    Id: "ka1",
    Names: ["/health-dataspace-cfm-keycloak-agent"],
    State: "running",
  },
  {
    Id: "ra1",
    Names: ["/health-dataspace-cfm-registration-agent"],
    State: "running",
  },
  {
    Id: "oa1",
    Names: ["/health-dataspace-cfm-onboarding-agent"],
    State: "running",
  },
  { Id: "ui1", Names: ["/health-dataspace-ui"], State: "running" },
];

/* ── Tenants mock data ── */

const MOCK_TENANTS = [
  {
    id: "t1",
    version: 1,
    properties: {
      displayName: "AlphaKlinik Berlin",
      organization: "AlphaKlinik Berlin",
      ehdsParticipantType: "DATA_HOLDER",
      did: "did:web:alpha-klinik.de:participant",
    },
  },
  {
    id: "t2",
    version: 1,
    properties: {
      displayName: "PharmaCo Research AG",
      organization: "PharmaCo Research AG",
      role: "DATA_USER",
    },
  },
];

const MOCK_EDC_PARTICIPANTS = [
  {
    "@id": "ctx-alpha",
    identity: "did:web:alpha-klinik.de:participant",
    state: "CREATED",
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
  mockTenant.mockImplementation((path: string) => {
    if (path === "/v1alpha1/tenants") return Promise.resolve(MOCK_TENANTS);
    if (path.includes("/participant-profiles"))
      return Promise.resolve([
        {
          identifier: "did:web:alpha-klinik.de:participant",
          properties: {
            "cfm.vpa.state": { participantContextId: "ctx-alpha" },
          },
        },
      ]);
    return Promise.resolve([]);
  });
  mockManagement.mockResolvedValue(MOCK_EDC_PARTICIPANTS);
});

afterEach(() => {
  vi.restoreAllMocks();
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
    expect(data.participants[0].components.length).toBe(7); // PARTICIPANT_SERVICES count
  });

  it("maps participant properties from tenant data", async () => {
    setupDockerAvailable(CONTAINERS);
    const res = await GET();
    const data = await res.json();
    const alpha = data.participants.find((p: { id: string }) => p.id === "t1");
    expect(alpha.displayName).toBe("AlphaKlinik Berlin");
    expect(alpha.organization).toBe("AlphaKlinik Berlin");
    expect(alpha.role).toBe("DATA_HOLDER");
    expect(alpha.did).toBe("did:web:alpha-klinik.de:participant");
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
    mockTenant.mockImplementation((path: string) => {
      if (path === "/v1alpha1/tenants")
        return Promise.resolve([MOCK_TENANTS[0]]);
      return Promise.resolve([]);
    });
    mockManagement.mockResolvedValue([]);
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
    mockTenant.mockImplementation((path: string) => {
      if (path === "/v1alpha1/tenants")
        return Promise.resolve([MOCK_TENANTS[0]]);
      return Promise.resolve([]);
    });
    mockManagement.mockResolvedValue([]);
  });

  it("healthy when all core components are healthy", async () => {
    // All participant service containers present and healthy
    const participantContainers = CONTAINERS.slice(0, 7); // first 7 = participant services
    setupDockerAvailable(participantContainers);
    const res = await GET();
    const data = await res.json();
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
    CONTAINERS.slice(0, 7).forEach((c) => {
      allInspects[c.Id] = makeDockerInspect("healthy");
      allStats[c.Id] = makeDockerStats(5, 200, 1024);
    });
    // Override controlplane with high CPU
    allStats["cp1"] = makeDockerStats(85, 200, 1024);

    setupDockerAvailable(CONTAINERS.slice(0, 7), allInspects, allStats);
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
    // INFRA_SERVICES has 12 entries
    expect(data.infrastructure.length).toBe(12);
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
    // Should be sorted: cfm before infrastructure, alphabetically within
    const sorted = [...layerNames].sort();
    expect(layerNames).toEqual(sorted);
  });

  it("sorts participants by severity then name", async () => {
    // Make two participants: one critical, one healthy
    // PharmaCo = DATA_USER (no matching ctx → state "—")
    // AlphaKlinik = DATA_HOLDER (matches ctx → state "CREATED")
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
// Participant data from edcClient
// =====================================================================
describe("participant data from edcClient", () => {
  it("gracefully handles tenant API failure", async () => {
    setupDockerAvailable(CONTAINERS);
    mockTenant.mockRejectedValue(new Error("connection refused"));
    const res = await GET();
    const data = await res.json();
    expect(data.participants).toEqual([]);
  });

  it("gracefully handles management API failure", async () => {
    setupDockerAvailable(CONTAINERS);
    mockManagement.mockRejectedValue(new Error("auth error"));
    const res = await GET();
    const data = await res.json();
    // Participants still returned but with DID from tenant properties
    expect(data.participants.length).toBeGreaterThanOrEqual(1);
    const alpha = data.participants.find((p: { id: string }) => p.id === "t1");
    expect(alpha.did).toBe("did:web:alpha-klinik.de:participant");
  });

  it("handles per-tenant profile fetch failure", async () => {
    mockTenant.mockImplementation((path: string) => {
      if (path === "/v1alpha1/tenants") return Promise.resolve(MOCK_TENANTS);
      if (path.includes("t1/participant-profiles"))
        return Promise.reject(new Error("timeout"));
      if (path.includes("/participant-profiles"))
        return Promise.resolve([
          {
            identifier: "did:web:alpha-klinik.de:participant",
            properties: {
              "cfm.vpa.state": { participantContextId: "ctx-alpha" },
            },
          },
        ]);
      return Promise.resolve([]);
    });
    setupDockerAvailable(CONTAINERS);
    const res = await GET();
    const data = await res.json();
    expect(data.participants).toHaveLength(2);
  });

  it("falls back to role property when ehdsParticipantType missing", async () => {
    setupDockerAvailable(CONTAINERS);
    const res = await GET();
    const data = await res.json();
    const pharmaco = data.participants.find(
      (p: { id: string }) => p.id === "t2",
    );
    expect(pharmaco.role).toBe("DATA_USER");
  });
});

// =====================================================================
// Component metrics
// =====================================================================
describe("component metrics", () => {
  beforeEach(() => {
    mockTenant.mockImplementation((path: string) => {
      if (path === "/v1alpha1/tenants")
        return Promise.resolve([MOCK_TENANTS[0]]);
      return Promise.resolve([]);
    });
    mockManagement.mockResolvedValue([]);
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
      expect(infra).toHaveProperty("layer");
      expect(["infrastructure", "cfm"]).toContain(infra.layer);
    }
  });
});
