/**
 * Unit tests for GET /api/admin/components route.
 *
 * Covers: Docker available/unavailable, container status mapping,
 * CPU/memory calculation, uptime calculation, participants from the control
 * plane's contexts (ADR-078) with the Neo4j fallback, sorting by layer, the
 * components left after EDC 0.18 (#927), error handling, response structure.
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

const mockRunQuery = vi.fn();
vi.mock("@/lib/neo4j", () => ({
  runQuery: (...args: unknown[]) => mockRunQuery(...args),
}));

import { GET } from "@/app/api/admin/components/route";
import { __resetCacheForTests } from "@/lib/server-cache";

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

/* ── Control plane contexts ── */

// Two of the seeded five, named by their DID slug (lib/edc/participants.ts),
// and one onboarded through the hub, which carries its own properties.
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
  {
    "@id": "ctx-nord",
    identity: "did:web:identityhub%3A7083:testklinik-nord",
    state: "CREATED",
    properties: {
      displayName: "Testklinik Nord",
      organization: "Testklinik Nord GmbH",
      ehdsParticipantType: "DATA_HOLDER",
    },
  },
];

const RETIRED_CONTAINERS = [
  "health-dataspace-dataplane-fhir",
  "health-dataspace-dataplane-omop",
  "health-dataspace-tenant-manager",
  "health-dataspace-provision-manager",
  "health-dataspace-cfm-edcv-agent",
  "health-dataspace-cfm-keycloak-agent",
  "health-dataspace-cfm-onboarding-agent",
  "health-dataspace-cfm-registration-agent",
];

/* ── Setup ── */

beforeEach(() => {
  vi.clearAllMocks();
  __resetCacheForTests();
  vi.spyOn(Date, "now").mockReturnValue(NOW);
  vi.spyOn(console, "warn").mockImplementation(() => {});

  // Default: no participants
  mockManagement.mockRejectedValue(new Error("unavailable"));
  // Default: Neo4j fallback returns no participants so existing empty-case
  // assertions remain valid. Tests that need seeded fallback override this.
  mockRunQuery.mockResolvedValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
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
    // edc-core < identity < infrastructure
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
    // SERVICE_MAP has 13 entries since the EDC 0.18 apps left (#927)
    expect(data.components.length).toBe(13);
  });
});

// =====================================================================
// The components left after EDC 0.18 (#927)
// =====================================================================
describe("GET /api/admin/components, EDC 1.0 components", () => {
  it("lists siglet as the data plane in the EDC core layer", async () => {
    setupDockerUnavailable();
    const data = await (await GET()).json();
    const siglet = data.components.find(
      (c: { container: string }) => c.container === "health-dataspace-siglet",
    );
    expect(siglet).toMatchObject({
      component: "Data Plane (siglet)",
      layer: "edc-core",
    });
  });

  it("lists no JAD data plane, CFM manager or agent, and no cfm layer", async () => {
    setupDockerUnavailable();
    const data = await (await GET()).json();
    const containers = data.components.map(
      (c: { container: string }) => c.container,
    );
    for (const retired of RETIRED_CONTAINERS) {
      expect(containers).not.toContain(retired);
    }
    const layers = new Set(
      data.components.map((c: { layer: string }) => c.layer),
    );
    expect([...layers].sort()).toEqual([
      "edc-core",
      "identity",
      "infrastructure",
    ]);
  });

  it("reads siglet's container status from Docker", async () => {
    setupDockerAvailable(
      [{ Id: "sig1", Names: ["/health-dataspace-siglet"], State: "running" }],
      { sig1: makeDockerInspect(undefined) },
    );
    const data = await (await GET()).json();
    const siglet = data.components.find(
      (c: { component: string }) => c.component === "Data Plane (siglet)",
    );
    expect(siglet.status).toBe("running");
  });

  it("maps the Container Apps on Azure: mvhd-siglet in, the nine 0.18 apps out", async () => {
    // Azure without a subscription id: no ARM call, so the route falls back
    // to the ACA map with every app unknown.
    vi.stubEnv("DEPLOYMENT_TARGET", "azure");
    vi.stubEnv("AZURE_SUBSCRIPTION_ID", "");
    setupDockerUnavailable();
    const data = await (await GET()).json();
    const containers = data.components.map(
      (c: { container: string }) => c.container,
    );
    expect(containers).toContain("mvhd-siglet");
    for (const retired of [
      "mvhd-dp-fhir",
      "mvhd-dp-omop",
      "mvhd-tenant-mgr",
      "mvhd-provision-mgr",
    ]) {
      expect(containers).not.toContain(retired);
    }
    expect(
      data.components.some((c: { layer: string }) => c.layer === "cfm"),
    ).toBe(false);
  });
});

// =====================================================================
// Participants from the control plane (ADR-078)
// =====================================================================
describe("GET /api/admin/components, participant data", () => {
  beforeEach(() => {
    setupDockerUnavailable(); // Docker is not needed for participant tests
  });

  it("reads the participants from the control plane's contexts", async () => {
    mockManagement.mockResolvedValue(MOCK_CONTEXTS);

    const res = await GET();
    const data = await res.json();
    expect(data.participants).toHaveLength(3);
    // One read of the contexts, and no other EDC call.
    expect(mockManagement.mock.calls.map((c) => c[0])).toEqual([
      "/v5/participants",
    ]);
  });

  it("names a seeded participant by its DID slug", async () => {
    mockManagement.mockResolvedValue(MOCK_CONTEXTS);

    const data = await (await GET()).json();
    const alpha = data.participants.find(
      (p: { id: string }) => p.id === "ctx-alpha",
    );
    expect(alpha).toEqual({
      id: "ctx-alpha",
      displayName: "AlphaKlinik Berlin",
      organization: "AlphaKlinik Berlin",
      role: "DATA_HOLDER",
      did: "did:web:identityhub%3A7083:alpha-klinik",
      state: "CREATED",
      profileCount: 1,
    });
    const pharmaco = data.participants.find(
      (p: { id: string }) => p.id === "ctx-pharmaco",
    );
    expect(pharmaco.role).toBe("DATA_USER");
    expect(pharmaco.state).toBe("ACTIVATED");
  });

  it("takes an onboarded participant's names and role from its context", async () => {
    mockManagement.mockResolvedValue(MOCK_CONTEXTS);

    const data = await (await GET()).json();
    const nord = data.participants.find(
      (p: { id: string }) => p.id === "ctx-nord",
    );
    expect(nord.displayName).toBe("Testklinik Nord");
    expect(nord.organization).toBe("Testklinik Nord GmbH");
    expect(nord.role).toBe("DATA_HOLDER");
  });

  it("falls back to the seeded graph when the control plane is unreachable", async () => {
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
    expect(data.participants).toEqual([
      {
        id: "did:web:lmc.nl:clinic",
        displayName: "Limburg Medical Centre",
        organization: "Limburg Medical Centre",
        role: "DATA_HOLDER",
        did: "did:web:lmc.nl:clinic",
        state: "SEEDED",
        profileCount: 0,
      },
    ]);
  });

  it("falls back to the seeded graph when the control plane has no context", async () => {
    mockManagement.mockResolvedValue([]);
    mockRunQuery.mockResolvedValue([
      {
        id: "did:web:irs.fr:hdab",
        name: "Institut de Recherche Santé",
        type: "HDAB",
        did: "did:web:irs.fr:hdab",
      },
    ]);

    const data = await (await GET()).json();
    expect(data.participants).toHaveLength(1);
    expect(data.participants[0].state).toBe("SEEDED");
  });

  it("returns no participants when the control plane and Neo4j both fail", async () => {
    mockManagement.mockRejectedValue(new Error("connection refused"));
    mockRunQuery.mockRejectedValue(new Error("bolt down"));
    const res = await GET();
    const data = await res.json();
    expect(data.participants).toEqual([]);
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
