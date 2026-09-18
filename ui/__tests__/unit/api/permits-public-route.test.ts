/**
 * GET /api/permits: the public register (Art. 57(1)(j), Art. 58(1)(f)).
 * Issue #206, M2.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/neo4j", () => ({
  runQuery: vi.fn(),
}));

import { runQuery } from "@/lib/neo4j";
import { requireAuth } from "@/lib/auth-guard";
import { GET } from "@/app/api/permits/route";

const mockRunQuery = vi.mocked(runQuery);

const ROWS = [
  {
    applicationId: "app-lmc-irs-2026-001",
    applicant: "Limburg Medical Centre",
    applicantDid: "did:web:lmc.nl:clinic",
    applicantCountry: "NL",
    accessBody: "Institut de Recherche Santé",
    purpose: "SCIENTIFIC_RESEARCH",
    datasetId: "dataset:synthea-fhir-r4-mvd",
    datasetTitle: "Synthea Synthetic FHIR R4 Patient Cohort",
    submittedAt: "2026-02-01T08:30:00Z",
    applicationStatus: "APPROVED",
    permitId: "hdab-irs-lmc-2026-001",
    decision: "APPROVED",
    decidedAt: "2026-02-20T11:00:00.000000000Z",
    validUntil: "2027-02-20T23:59:59Z",
    conditions: ["SPE aggregate-only output"],
    justification: null,
    publishBy: null,
    revokedAt: null,
    revocationReason: null,
  },
  {
    applicationId: "app-pharmaco-1",
    applicant: "PharmaCo Research AG",
    applicantDid: "did:web:pharmaco.de:research",
    applicantCountry: "DE",
    accessBody: "MedReg DE",
    purpose: "SCIENTIFIC_RESEARCH",
    datasetId: "dataset:journey41-x",
    datasetTitle: null,
    submittedAt: "2026-09-18T05:00:00Z",
    applicationStatus: "REVOKED",
    permitId: "permit-app-pharmaco-1",
    decision: "REVOKED",
    decidedAt: "2026-09-18T05:10:00Z",
    validUntil: "2027-09-18T05:10:00Z",
    conditions: "single condition as a string",
    justification: null,
    publishBy: "2026-10-30",
    revokedAt: "2026-09-18T05:20:00Z",
    revocationReason: "Output left the SPE with direct identifiers.",
  },
  {
    applicationId: "app-alpha-medreg-2026-001",
    applicant: "AlphaKlinik Berlin",
    applicantDid: "did:web:alpha-klinik.de:participant",
    applicantCountry: "DE",
    accessBody: null,
    purpose: "PUBLIC_HEALTH",
    datasetId: "dataset:synthea-fhir-r4-mvd",
    datasetTitle: "Synthea Synthetic FHIR R4 Patient Cohort",
    submittedAt: "2026-03-15T10:00:00Z",
    applicationStatus: "PENDING",
    permitId: null,
    decision: "",
    decidedAt: null,
    validUntil: null,
    conditions: null,
    justification: null,
    publishBy: null,
    revokedAt: null,
    revocationReason: null,
  },
];

const REQUEST_ROWS = [
  {
    requestId: "req-lmc-1",
    applicant: "Limburg Medical Centre",
    applicantDid: "did:web:lmc.nl:clinic",
    applicantCountry: "NL",
    accessBody: "Institut de Recherche Santé",
    purpose: "PUBLIC_HEALTH",
    datasetId: "dataset:synthea-fhir-r4-mvd",
    datasetTitle: "Synthea Synthetic FHIR R4 Patient Cohort",
    submittedAt: "2026-02-10T10:00:00Z",
    status: "ANSWERED",
    decidedAt: "2026-02-24T15:00:00Z",
    justification: null,
    publishBy: "2026-04-07",
    statisticalContent: "Cohort size by gender.",
  },
];

/** The route asks the graph twice: applications, then Art. 69 requests. */
function graphAnswers(
  applications: unknown[],
  requests: unknown[] = REQUEST_ROWS,
) {
  mockRunQuery.mockImplementation(async (cypher: string) =>
    cypher.includes("HealthDataRequest") ? requests : applications,
  );
}

describe("GET /api/permits", () => {
  beforeEach(() => {
    mockRunQuery.mockReset();
    vi.mocked(requireAuth).mockClear();
  });

  it("lists health data requests next to applications, marked as such", async () => {
    graphAnswers(ROWS);
    const body = await (await GET()).json();
    const req = body.entries.find(
      (e: { applicationId: string }) => e.applicationId === "req-lmc-1",
    );
    expect(req.kind).toBe("request");
    expect(req.outcome).toBe("request approved");
    expect(req.conditions).toEqual(["Statistic: Cohort size by gender."]);
    expect(req.publishBy).toBe("2026-04-07");
    expect(
      body.entries.filter((e: { kind: string }) => e.kind === "application"),
    ).toHaveLength(3);
  });

  it("needs no session: the register is public", async () => {
    graphAnswers(ROWS, []);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(requireAuth).not.toHaveBeenCalled();
  });

  it("lists decisions with outcome, deadline and conditions, and pending applications with the clock", async () => {
    graphAnswers(ROWS, []);
    const res = await GET();
    const body = await res.json();
    expect(body.entries).toHaveLength(3);

    const issued = body.entries.find(
      (e: { applicationId: string }) =>
        e.applicationId === "app-lmc-irs-2026-001",
    );
    expect(issued.outcome).toBe("permit issued");
    expect(issued.conditions).toEqual(["SPE aggregate-only output"]);
    // 30 working days after 2026-02-20 (a Friday) is 2026-04-03.
    expect(issued.publishBy).toBe("2026-04-03");
    expect(issued.daysToDecision).toBeNull();

    const revoked = body.entries.find(
      (e: { applicationId: string }) => e.applicationId === "app-pharmaco-1",
    );
    expect(revoked.outcome).toBe("permit revoked");
    expect(revoked.revocationReason).toContain("identifiers");
    expect(revoked.conditions).toEqual(["single condition as a string"]);
    expect(revoked.publishBy).toBe("2026-10-30");

    const pending = body.entries.find(
      (e: { applicationId: string }) =>
        e.applicationId === "app-alpha-medreg-2026-001",
    );
    expect(pending.outcome).toBe("pending");
    expect(pending.decisionDue).toBe("2026-06-15T10:00:00.000Z");
    expect(typeof pending.daysToDecision).toBe("number");
  });

  it("publishes nothing the articles do not ask for", async () => {
    graphAnswers(ROWS, []);
    const res = await GET();
    const body = await res.json();
    const cypher = mockRunQuery.mock.calls[0][0] as string;
    expect(cypher).not.toContain("hdabOfficer");
    expect(cypher).not.toContain("ethicsCommitteeRef");
    for (const e of body.entries) {
      expect(e).not.toHaveProperty("hdabOfficer");
      expect(e).not.toHaveProperty("ethicsCommitteeRef");
    }
  });

  it("answers 502 with the reason when the graph is down", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockRunQuery.mockImplementation(async () => {
      throw new Error("Neo4j unavailable");
    });
    const res = await GET();
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.detail).toContain("Neo4j unavailable");
    vi.mocked(console.error).mockRestore();
  });
});
