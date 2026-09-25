/**
 * GET /api/activity-report: the public activity report (Art. 59). Issue #206, M6.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/neo4j", () => ({
  runQuery: vi.fn(),
}));

import { runQuery } from "@/lib/neo4j";
import { requireAuth } from "@/lib/auth-guard";
import { GET } from "@/app/api/activity-report/route";

const mockRunQuery = vi.mocked(runQuery);

/** Answer each of the route's queries from the label it matches on. */
function graphAnswers() {
  mockRunQuery.mockImplementation(async (cypher: string) => {
    if (cypher.includes("'HDAB'")) {
      return [
        { name: "MedReg DE", did: "did:web:medreg.de:hdab", country: "DE" },
      ];
    }
    if (cypher.includes("AccessApplication")) {
      return [
        {
          applicationId: "app-lmc-irs-2026-001",
          applicant: "Limburg Medical Centre",
          applicantType: "CLINIC",
          purpose: "SCIENTIFIC_RESEARCH",
          submittedAt: "2026-02-01T08:30:00.000000000Z",
          permitId: "hdab-irs-lmc-2026-001",
          permitStatus: "APPROVED",
          decidedAt: "2026-02-20T11:00:00.000000000Z",
          revokedAt: null,
          revocationReason: null,
          datasetId: "dataset:synthea-fhir-r4-mvd",
          datasetTitle: "Synthea Synthetic FHIR R4 Patient Cohort",
          firstAccessAt: "2026-02-15T09:30:00.000000000Z",
        },
        {
          applicationId: "app-pharmaco-medreg-2026-002",
          applicant: "PharmaCo Research AG",
          applicantType: "CRO",
          purpose: "SCIENTIFIC_RESEARCH",
          submittedAt: "2026-09-01T09:00:00.000000000Z",
          permitId: null,
          permitStatus: null,
          decidedAt: null,
          revokedAt: null,
          revocationReason: null,
          datasetId: "dataset:synthea-fhir-r4-mvd",
          datasetTitle: "Synthea Synthetic FHIR R4 Patient Cohort",
          firstAccessAt: null,
        },
      ];
    }
    if (cypher.includes("HealthDataRequest")) {
      return [
        {
          requestId: "req-1",
          status: "PENDING",
          purpose: "STATISTICS",
          submittedAt: "2026-09-01T09:30:00Z",
        },
      ];
    }
    if (cypher.includes("TransferEvent")) {
      return [
        {
          consumer: "did:web:pharmaco.de:research",
          consumerName: "PharmaCo Research AG",
          events: 41,
          underPermit: 7,
          refused: 1,
          permits: 1,
        },
      ];
    }
    if (cypher.includes("DataQualityLabelCredential")) {
      return [
        {
          credentialId: "vc:data-quality-label:clinic-alphaklinik",
          datasetId: "dataset:synthea-fhir-r4-mvd",
          holder: "AlphaKlinik Berlin",
          completeness: 0.95,
          conformance: 0.92,
          timeliness: 0.98,
          coverage: "partial",
          assessmentDate: "2025-07-24",
          status: "active",
        },
      ];
    }
    if (cypher.includes("ResultCommunication")) {
      return [
        {
          resultId: "result-lmc-irs-2026-001-20260901",
          permitId: "hdab-irs-lmc-2026-001",
          applicant: "Limburg Medical Centre",
          kind: "PUBLICATION",
          title: "Readmission after cardiac surgery",
          url: "https://example.org/lmc/readmission",
          communicatedAt: "2026-09-01T10:00:00.000000000Z",
          onTime: true,
        },
      ];
    }
    if (cypher.includes("NonComplianceFinding")) {
      return [
        {
          findingId: "finding-1",
          party: "PharmaCo Research AG",
          measure: "FINE",
          note: "Late reporting",
          fineEur: 25000,
          closedAt: "2026-09-20T10:00:00.000000000Z",
        },
      ];
    }
    throw new Error(`unexpected query: ${cypher.slice(0, 60)}`);
  });
}

function req(query = "") {
  return new NextRequest(`http://localhost:3000/api/activity-report${query}`);
}

describe("GET /api/activity-report", () => {
  beforeEach(() => {
    mockRunQuery.mockReset();
    vi.mocked(requireAuth).mockClear();
  });

  it("needs no session and returns the eleven items with the period", async () => {
    graphAnswers();
    const res = await GET(req());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(requireAuth).not.toHaveBeenCalled();
    expect(Object.keys(body.items)).toEqual([
      "a",
      "b",
      "c",
      "d",
      "e",
      "f",
      "g",
      "h",
      "i",
      "j",
      "k",
    ]);
    expect(body.article).toContain("Art. 59(1)");
    expect(body.period.months).toBe(24);
    expect(body.accessBodies[0].name).toBe("MedReg DE");
    expect(body.items.a.applications).toBe(2);
    expect(body.items.a.permitsIssued).toBe(1);
    expect(body.items.a.pending).toBe(1);
    expect(body.items.a.healthDataRequests).toBe(1);
    expect(body.items.c.accessEvents).toBe(41);
    expect(body.items.h.averageDays).toBe(14);
    expect(body.items.i.total).toBe(1);
    expect(mockRunQuery).toHaveBeenCalledTimes(7);
  });

  it("passes the period to the access-event query and honours ?from and ?to", async () => {
    graphAnswers();
    const res = await GET(req("?from=2026-01-01&to=2026-06-30"));
    const body = await res.json();

    expect(body.period.from).toBe("2026-01-01T00:00:00.000Z");
    expect(body.period.to).toBe("2026-06-30T00:00:00.000Z");
    // The applications query also matches TransferEvent (its first-access
    // lookup, an OPTIONAL MATCH); the access-event query is the one that
    // starts with it.
    const accessCall = mockRunQuery.mock.calls.find(([c]) =>
      c.trimStart().startsWith("MATCH (te:TransferEvent)"),
    );
    expect(accessCall?.[1]).toEqual({
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-06-30T00:00:00.000Z",
    });
    // The PharmaCo application of September falls outside this period.
    expect(body.items.a.applications).toBe(1);
  });

  it("renders Markdown on ?format=md", async () => {
    graphAnswers();
    const res = await GET(req("?format=md"));
    const text = await res.text();

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/markdown");
    expect(text).toContain("# Activity report of the health data access body");
    expect(text).toContain("## (a) ");
    expect(text).toContain("## (k) ");
    expect(text).toContain("- Applications received: 2");
  });

  it("answers 502 with the detail when the graph is unreachable", async () => {
    mockRunQuery.mockRejectedValue(new Error("Bolt down"));
    const res = await GET(req());
    const body = await res.json();

    expect(res.status).toBe(502);
    expect(body.error).toBe("Neo4j unavailable");
    expect(body.detail).toBe("Bolt down");
  });
});
