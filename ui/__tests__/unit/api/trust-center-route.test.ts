/**
 * Unit tests for /api/trust-center route (Phase 18d).
 *
 * Covers: trust centers returned from Neo4j, SPE sessions, empty states.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────
const mockRunQuery = vi.fn();
vi.mock("@/lib/neo4j", () => ({
  runQuery: (...args: unknown[]) => mockRunQuery(...args),
}));

import { GET } from "@/app/api/trust-center/route";

// ── Helpers ──────────────────────────────────────────────────────────
const TC_RKI = {
  name: "RKI Trust Center DE",
  operatedBy: "Robert Koch Institute",
  country: "DE",
  status: "active",
  protocol: "deterministic-pseudonym-v1",
  did: "did:web:rki.de:trustcenter",
  hdabApprovalId: "hdab-approval-001",
  hdabApprovalStatus: "approved",
  datasetCount: 3,
  recognisedCountries: ["NL"],
  activeRpsnCount: 1,
};

const TC_RIVM = {
  name: "RIVM Trust Center NL",
  operatedBy: "Rijksinstituut voor Volksgezondheid en Milieu",
  country: "NL",
  status: "active",
  protocol: "deterministic-pseudonym-v1",
  did: "did:web:rivm.nl:trustcenter",
  hdabApprovalId: null,
  hdabApprovalStatus: null,
  datasetCount: 1,
  recognisedCountries: ["DE"],
  activeRpsnCount: 0,
};

const SPE_SESSION = {
  sessionId: "spe-session-001",
  studyId: "study-diabetes-de-nl-2025",
  status: "active",
  createdBy: "did:web:medreg.de:hdab",
  createdAt: "2025-03-15T09:00:00Z",
  kAnonymityThreshold: 5,
  outputPolicy: "aggregate-only",
};

beforeEach(() => {
  vi.clearAllMocks();
});

// =====================================================================
describe("GET /api/trust-center", () => {
  it("returns trust centers and SPE sessions from Neo4j", async () => {
    mockRunQuery
      .mockResolvedValueOnce([TC_RKI, TC_RIVM]) // trust centers
      .mockResolvedValueOnce([SPE_SESSION]); // SPE sessions

    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.trustCenters).toHaveLength(2);
    expect(data.trustCenters[0].name).toBe("RKI Trust Center DE");
    expect(data.trustCenters[1].country).toBe("NL");
    expect(data.speSessions).toHaveLength(1);
    expect(data.speSessions[0].sessionId).toBe("spe-session-001");
  });

  it("returns empty arrays when Neo4j has no trust centers", async () => {
    mockRunQuery.mockResolvedValue([]);

    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.trustCenters).toHaveLength(0);
    expect(data.speSessions).toHaveLength(0);
  });

  it("includes HDAB approval info when present", async () => {
    mockRunQuery.mockResolvedValueOnce([TC_RKI]).mockResolvedValueOnce([]);

    const res = await GET();
    const data = await res.json();

    const rki = data.trustCenters[0];
    expect(rki.hdabApprovalId).toBe("hdab-approval-001");
    expect(rki.hdabApprovalStatus).toBe("approved");
  });

  it("includes cross-border mutual recognition countries", async () => {
    mockRunQuery.mockResolvedValueOnce([TC_RKI]).mockResolvedValueOnce([]);

    const res = await GET();
    const data = await res.json();

    expect(data.trustCenters[0].recognisedCountries).toContain("NL");
  });

  it("includes active RPSN count", async () => {
    mockRunQuery.mockResolvedValueOnce([TC_RKI]).mockResolvedValueOnce([]);

    const res = await GET();
    const data = await res.json();

    expect(data.trustCenters[0].activeRpsnCount).toBe(1);
  });

  it("returns SPE sessions with k-anonymity threshold and output policy", async () => {
    mockRunQuery.mockResolvedValueOnce([]).mockResolvedValueOnce([SPE_SESSION]);

    const res = await GET();
    const data = await res.json();

    const session = data.speSessions[0];
    expect(session.kAnonymityThreshold).toBe(5);
    expect(session.outputPolicy).toBe("aggregate-only");
    expect(session.createdBy).toBe("did:web:medreg.de:hdab");
  });
});
