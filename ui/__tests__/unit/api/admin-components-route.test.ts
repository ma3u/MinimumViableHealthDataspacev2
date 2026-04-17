/**
 * Unit tests for GET /api/admin/components route.
 *
 * Covers: Docker available/unavailable, container status mapping,
 * CPU/memory calculation, uptime calculation, participant data
 * from edcClient, sorting by layer, error handling, response structure.
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

import { GET } from "@/app/api/admin/components/route";

/* ── Docker mock helpers ── */

interface MockContainer {
  Id: string;
  Names: string[];
  State: string;
  Status?: string;
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

/* ── Sample containers ── */

const NOW = new Date("2026-03-21T10:00:00Z").getTime();

const CONTROL_PLANE: MockContainer = {
  Id: "abc123",
  Names: ["/health-dataspace-controlplane"],
  State: "running",
};

const POSTGRES: MockContainer = {
  Id: "def456",
  Names: ["/health-dataspace-postgres"],
  State: "running",
};

const KEYCLOAK: MockContainer = {
  Id: "ghi789",
  Names: ["/health-dataspace-keycloak"],
  State: "running",
};

/* ── Tenants/participants mock data ── */

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

const MOCK_PROFILES = [{ participantContextId: "ctx-alpha" }];

/* ── Setup ── */

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(Date, "now").mockReturnValue(NOW);
  vi.spyOn(console, "warn").mockImplementation(() => {});

  // Default: no participants
  mockTenant.mockRejectedValue(new Error("unavailable"));
  mockManagement.mockRejectedValue(new Error("unavailable"));
  // Default: Neo4j fallback returns no participants so existing empty-case
  // assertions remain valid. Tests that need seeded fallback override this.
  mockRunQuery.mockResolvedValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// =====================================================================
// Docker available
// =====================================================================
describe("GET /api/admin/components — Docker available", () => {
  it("returns dockerAvailable: true", async () => {
    setupDockerAvailable([CONTROL_PLANE]);
    const res = await GET();
    const data = await res.json();
    expect(data.dockerAvailable).toBe(true);
  });

  it("returns components matching Docker containers", async () => {
    setupDockerAvailable([CONTROL_PLANE, POSTGRES]);
    const res = await GET();
    const data = await res.json();
    const names = data.components.map(
      (c: { component: string }) => c.component,
    );
    expect(names).toContain("Control Plane");
    expect(names).toContain("PostgreSQL");
  });

  it("marks containers not found as stopped", async () => {
    setupDockerAvailable([]); // no containers running
    const res = await GET();
    const data = await res.json();
    const cp = data.components.find(
      (c: { component: string }) => c.component === "Control Plane",
    );
    expect(cp.status).toBe("stopped");
    expect(cp.uptime).toBe("—");
    expect(cp.cpu).toBe(0);
  });

  it("reads health status from Docker inspect", async () => {
    setupDockerAvailable([CONTROL_PLANE], {
      abc123: makeDockerInspect("healthy"),
    });
    const res = await GET();
    const data = await res.json();
    const cp = data.components.find(
      (c: { component: string }) => c.component === "Control Plane",
    );
    expect(cp.status).toBe("healthy");
  });

  it("falls back to running when no health check configured", async () => {
    setupDockerAvailable([CONTROL_PLANE], {
      abc123: makeDockerInspect(undefined),
    });
    const res = await GET();
    const data = await res.json();
    const cp = data.components.find(
      (c: { component: string }) => c.component === "Control Plane",
    );
    expect(cp.status).toBe("running");
  });

  it("calculates CPU percentage from stats", async () => {
    setupDockerAvailable(
      [CONTROL_PLANE],
      { abc123: makeDockerInspect("healthy") },
      { abc123: makeDockerStats(5.25, 256, 1024) },
    );
    const res = await GET();
    const data = await res.json();
    const cp = data.components.find(
      (c: { component: string }) => c.component === "Control Plane",
    );
    expect(cp.cpu).toBe(5.25);
  });

  it("calculates memory usage from stats", async () => {
    setupDockerAvailable(
      [CONTROL_PLANE],
      { abc123: makeDockerInspect("healthy") },
      { abc123: makeDockerStats(1, 256, 1024) },
    );
    const res = await GET();
    const data = await res.json();
    const cp = data.components.find(
      (c: { component: string }) => c.component === "Control Plane",
    );
    expect(cp.mem.usedMB).toBe(256);
    expect(cp.mem.limitMB).toBe(1024);
    expect(cp.mem.percent).toBe(25);
  });

  it("calculates uptime from StartedAt", async () => {
    // NOW = 2026-03-21T10:00:00Z, StartedAt = 04:30:00 → 5h 30m
    setupDockerAvailable([CONTROL_PLANE], {
      abc123: makeDockerInspect("healthy", "2026-03-21T04:30:00Z"),
    });
    const res = await GET();
    const data = await res.json();
    const cp = data.components.find(
      (c: { component: string }) => c.component === "Control Plane",
    );
    expect(cp.uptime).toBe("5h 30m");
  });

  it("formats uptime without hours when under 1h", async () => {
    // NOW = 10:00:00, StartedAt = 09:45:00 → 15m
    setupDockerAvailable([CONTROL_PLANE], {
      abc123: makeDockerInspect("healthy", "2026-03-21T09:45:00Z"),
    });
    const res = await GET();
    const data = await res.json();
    const cp = data.components.find(
      (c: { component: string }) => c.component === "Control Plane",
    );
    expect(cp.uptime).toBe("15m");
  });

  it("sorts components by layer order then by name", async () => {
    setupDockerAvailable([CONTROL_PLANE, POSTGRES, KEYCLOAK]);
    const res = await GET();
    const data = await res.json();
    const layers = data.components.map((c: { layer: string }) => c.layer);
    // edc-core < identity < cfm < infrastructure
    const edcIdx = layers.indexOf("edc-core");
    const identityIdx = layers.indexOf("identity");
    const infraIdx = layers.indexOf("infrastructure");
    expect(edcIdx).toBeLessThan(identityIdx);
    expect(identityIdx).toBeLessThan(infraIdx);
  });
});

// =====================================================================
// Docker unavailable
// =====================================================================
describe("GET /api/admin/components — Docker unavailable", () => {
  it("returns dockerAvailable: false", async () => {
    setupDockerUnavailable();
    const res = await GET();
    const data = await res.json();
    expect(data.dockerAvailable).toBe(false);
  });

  it("returns all components with status unknown", async () => {
    setupDockerUnavailable();
    const res = await GET();
    const data = await res.json();
    for (const comp of data.components) {
      expect(comp.status).toBe("unknown");
    }
  });

  it("returns zero CPU and memory for all components", async () => {
    setupDockerUnavailable();
    const res = await GET();
    const data = await res.json();
    for (const comp of data.components) {
      expect(comp.cpu).toBe(0);
      expect(comp.mem.usedMB).toBe(0);
      expect(comp.mem.limitMB).toBe(0);
    }
  });

  it("still includes all SERVICE_MAP components", async () => {
    setupDockerUnavailable();
    const res = await GET();
    const data = await res.json();
    // SERVICE_MAP has 20 entries
    expect(data.components.length).toBe(20);
  });
});

// =====================================================================
// Participant data from edcClient
// =====================================================================
describe("GET /api/admin/components — participant data", () => {
  beforeEach(() => {
    setupDockerUnavailable(); // simplify — Docker not needed for participant tests
  });

  it("fetches participants from tenant API", async () => {
    mockTenant.mockImplementation((path: string) => {
      if (path === "/v1alpha1/tenants") return Promise.resolve(MOCK_TENANTS);
      return Promise.resolve([]);
    });
    mockManagement.mockResolvedValue([]);

    const res = await GET();
    const data = await res.json();
    expect(data.participants).toHaveLength(2);
    expect(data.participants[0].displayName).toBe("AlphaKlinik Berlin");
  });

  it("maps participant properties correctly", async () => {
    mockTenant.mockImplementation((path: string) => {
      if (path === "/v1alpha1/tenants") return Promise.resolve(MOCK_TENANTS);
      return Promise.resolve(MOCK_PROFILES);
    });
    mockManagement.mockResolvedValue(MOCK_EDC_PARTICIPANTS);

    const res = await GET();
    const data = await res.json();
    const alpha = data.participants.find((p: { id: string }) => p.id === "t1");
    expect(alpha.organization).toBe("AlphaKlinik Berlin");
    expect(alpha.role).toBe("DATA_HOLDER");
    expect(alpha.did).toBe("did:web:alpha-klinik.de:participant");
    expect(alpha.state).toBe("CREATED");
  });

  it("uses profileCount from profiles endpoint", async () => {
    mockTenant.mockImplementation((path: string) => {
      if (path === "/v1alpha1/tenants") return Promise.resolve(MOCK_TENANTS);
      if (path.includes("t1/participant-profiles"))
        return Promise.resolve([{ id: "p1" }, { id: "p2" }]);
      return Promise.resolve([]);
    });
    mockManagement.mockResolvedValue([]);

    const res = await GET();
    const data = await res.json();
    const alpha = data.participants.find((p: { id: string }) => p.id === "t1");
    expect(alpha.profileCount).toBe(2);
  });

  it("falls back to role property when ehdsParticipantType missing", async () => {
    mockTenant.mockImplementation((path: string) => {
      if (path === "/v1alpha1/tenants") return Promise.resolve(MOCK_TENANTS);
      return Promise.resolve([]);
    });
    mockManagement.mockResolvedValue([]);

    const res = await GET();
    const data = await res.json();
    const pharmaco = data.participants.find(
      (p: { id: string }) => p.id === "t2",
    );
    expect(pharmaco.role).toBe("DATA_USER");
  });

  it("handles tenant API failure gracefully", async () => {
    mockTenant.mockRejectedValue(new Error("connection refused"));
    const res = await GET();
    const data = await res.json();
    expect(data.participants).toEqual([]);
  });

  it("handles management API failure gracefully", async () => {
    mockTenant.mockImplementation((path: string) => {
      if (path === "/v1alpha1/tenants") return Promise.resolve(MOCK_TENANTS);
      return Promise.resolve([]);
    });
    mockManagement.mockRejectedValue(new Error("auth error"));

    const res = await GET();
    const data = await res.json();
    // Participants still returned, but DID/state come from tenant properties
    expect(data.participants).toHaveLength(2);
    expect(data.participants[0].did).toBe(
      "did:web:alpha-klinik.de:participant",
    );
    expect(data.participants[0].state).toBe("—");
  });

  it("handles per-tenant profile fetch failure", async () => {
    mockTenant.mockImplementation((path: string) => {
      if (path === "/v1alpha1/tenants") return Promise.resolve(MOCK_TENANTS);
      if (path.includes("t1/participant-profiles"))
        return Promise.reject(new Error("timeout"));
      return Promise.resolve([]);
    });
    mockManagement.mockResolvedValue([]);

    const res = await GET();
    const data = await res.json();
    const alpha = data.participants.find((p: { id: string }) => p.id === "t1");
    expect(alpha.profileCount).toBe(0);
  });
});

// =====================================================================
// Response structure
// =====================================================================
describe("GET /api/admin/components — response structure", () => {
  it("includes a timestamp", async () => {
    setupDockerUnavailable();
    const res = await GET();
    const data = await res.json();
    expect(data.timestamp).toBeDefined();
    expect(new Date(data.timestamp).getTime()).not.toBeNaN();
  });

  it("returns valid JSON with all required fields", async () => {
    setupDockerUnavailable();
    const res = await GET();
    const data = await res.json();
    expect(data).toHaveProperty("timestamp");
    expect(data).toHaveProperty("dockerAvailable");
    expect(data).toHaveProperty("components");
    expect(data).toHaveProperty("participants");
    expect(Array.isArray(data.components)).toBe(true);
    expect(Array.isArray(data.participants)).toBe(true);
  });

  it("each component has required fields", async () => {
    setupDockerUnavailable();
    const res = await GET();
    const data = await res.json();
    for (const comp of data.components) {
      expect(comp).toHaveProperty("container");
      expect(comp).toHaveProperty("component");
      expect(comp).toHaveProperty("layer");
      expect(comp).toHaveProperty("status");
      expect(comp).toHaveProperty("uptime");
      expect(comp).toHaveProperty("cpu");
      expect(comp).toHaveProperty("mem");
    }
  });
});
