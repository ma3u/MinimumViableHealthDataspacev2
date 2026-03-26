/**
 * API route tests for /api/trust-center/*
 *
 * These routes proxy to the neo4j-proxy trust-center endpoints.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock global fetch for proxy calls
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("/api/trust-center", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("GET should return trust centers from proxy", async () => {
    const mockData = {
      trustCenters: [
        {
          name: "RKI Trust Center DE",
          operatedBy: "Robert Koch Institute",
          country: "DE",
          status: "active",
          protocol: "deterministic-pseudonym-v1",
          hdab: { name: "MedReg DE", did: "did:web:medreg.de:hdab" },
          datasetCount: 3,
        },
        {
          name: "RIVM Trust Center NL",
          operatedBy: "RIVM",
          country: "NL",
          status: "active",
          protocol: "key-managed-v1",
          hdab: { name: "MedReg DE", did: "did:web:medreg.de:hdab" },
          datasetCount: 2,
        },
      ],
    };

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockData,
    });

    const { GET } = await import("@/app/api/trust-center/route");
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.trustCenters).toHaveLength(2);
    expect(data.trustCenters[0].name).toBe("RKI Trust Center DE");
    expect(data.trustCenters[1].protocol).toBe("key-managed-v1");
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/trust-center"),
    );
  });

  it("GET should return 502 when proxy is unavailable", async () => {
    mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));

    const { GET } = await import("@/app/api/trust-center/route");
    const response = await GET();

    expect(response.status).toBe(502);
    const data = await response.json();
    expect(data.error).toBeDefined();
  });
});

describe("/api/trust-center/resolve", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("POST should forward resolve request to proxy", async () => {
    const mockResult = {
      researchPseudonym: "RPSN-A1B2C3D4E5F6",
      mode: "stateless",
      trustCenter: "RKI Trust Center DE",
      linkedPseudonyms: 2,
    };

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResult,
    });

    const { POST } = await import("@/app/api/trust-center/resolve/route");
    const req = new NextRequest(
      "http://localhost:3000/api/trust-center/resolve",
      {
        method: "POST",
        body: JSON.stringify({
          trustCenter: "RKI Trust Center DE",
          providerPseudonyms: ["PSN-AK-00742", "PSN-LMC-09451"],
          mode: "stateless",
        }),
      },
    );
    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.researchPseudonym).toMatch(/^RPSN-/);
    expect(data.linkedPseudonyms).toBe(2);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/trust-center/resolve"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("POST should forward validation errors from proxy", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        error: "Provide 'trustCenter' and 'providerPseudonyms' (array of ≥2 PSNs)",
      }),
    });

    const { POST } = await import("@/app/api/trust-center/resolve/route");
    const req = new NextRequest(
      "http://localhost:3000/api/trust-center/resolve",
      {
        method: "POST",
        body: JSON.stringify({
          trustCenter: "RKI",
          providerPseudonyms: ["only-one"],
        }),
      },
    );
    const response = await POST(req);

    expect(response.status).toBe(400);
  });

  it("POST should return 502 when proxy is down", async () => {
    mockFetch.mockRejectedValue(new Error("Connection refused"));

    const { POST } = await import("@/app/api/trust-center/resolve/route");
    const req = new NextRequest(
      "http://localhost:3000/api/trust-center/resolve",
      {
        method: "POST",
        body: JSON.stringify({
          trustCenter: "RKI",
          providerPseudonyms: ["A", "B"],
        }),
      },
    );
    const response = await POST(req);

    expect(response.status).toBe(502);
  });
});

describe("/api/trust-center/audit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("GET should return audit entries from proxy", async () => {
    const mockData = {
      total: 2,
      entries: [
        {
          rpsn: "RPSN-DE-1138",
          status: "active",
          mode: "stateless",
          createdAt: "2026-03-15T10:00:00Z",
          trustCenter: "RKI Trust Center DE",
          providerPseudonyms: ["PSN-AK-00742", "PSN-LMC-09451"],
        },
        {
          rpsn: "RPSN-NL-0891",
          status: "active",
          mode: "key-managed",
          createdAt: "2026-03-15T10:00:00Z",
          trustCenter: "RIVM Trust Center NL",
          providerPseudonyms: ["PSN-LMC-03221", "PSN-CHL-07744"],
        },
      ],
    };

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockData,
    });

    const { GET } = await import("@/app/api/trust-center/audit/route");
    const req = new Request(
      "http://localhost:3000/api/trust-center/audit?limit=10",
    );
    const response = await GET(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.entries).toHaveLength(2);
    expect(data.entries[0].rpsn).toBe("RPSN-DE-1138");
    expect(data.entries[0].providerPseudonyms).toHaveLength(2);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/trust-center/audit"),
    );
  });

  it("GET should forward query params to proxy", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ total: 0, entries: [] }),
    });

    const { GET } = await import("@/app/api/trust-center/audit/route");
    const req = new Request(
      "http://localhost:3000/api/trust-center/audit?limit=5&trustCenter=RKI",
    );
    await GET(req);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("limit=5"),
    );
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("trustCenter=RKI"),
    );
  });
});

describe("/api/trust-center/spe-sessions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("GET should return SPE sessions from proxy", async () => {
    const mockData = {
      sessions: [
        {
          sessionId: "spe-session-001",
          status: "active",
          approvedCodeHash: "sha256:a1b2c3d4e5f6",
          attestationType: "sgx-v3.1",
          kAnonymityThreshold: 5,
          createdAt: "2026-03-15T10:00:00Z",
          createdBy: "MedReg DE",
          pseudonymCount: 2,
        },
      ],
    };

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockData,
    });

    const { GET } = await import(
      "@/app/api/trust-center/spe-sessions/route"
    );
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.sessions).toHaveLength(1);
    expect(data.sessions[0].sessionId).toBe("spe-session-001");
    expect(data.sessions[0].attestationType).toBe("sgx-v3.1");
    expect(data.sessions[0].kAnonymityThreshold).toBe(5);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/trust-center/spe-sessions"),
    );
  });

  it("GET should return 502 when proxy is unavailable", async () => {
    mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));

    const { GET } = await import(
      "@/app/api/trust-center/spe-sessions/route"
    );
    const response = await GET();

    expect(response.status).toBe(502);
  });
});
