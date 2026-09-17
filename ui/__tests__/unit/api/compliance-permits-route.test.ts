/**
 * POST /api/compliance/permits: the access body's decision (Art. 68).
 * Issue #206, M2.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("@/lib/neo4j", () => ({
  runQuery: vi.fn(),
}));

import { runQuery } from "@/lib/neo4j";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import { POST } from "@/app/api/compliance/permits/route";

const mockRunQuery = vi.mocked(runQuery);
const mockRequireAuth = vi.mocked(requireAuth);
// The global setup stubs isAuthError to false; the 403 case needs the real check.
vi.mocked(isAuthError).mockImplementation((r) => r instanceof NextResponse);

const HDAB_SESSION = {
  session: {
    user: {
      id: "regulator",
      name: "MedReg officer",
      email: "regulator@health-dataspace.local",
    },
    roles: ["HDAB_AUTHORITY"],
    accessToken: "",
  },
};

const DECIDED_ROW = {
  applicant: "did:web:pharmaco.de:research",
  applicantName: "PharmaCo Research AG",
  datasetId: "dataset:synthea-fhir-r4-mvd",
  purpose: "SCIENTIFIC_RESEARCH",
};

function post(body: unknown) {
  return new NextRequest("http://localhost/api/compliance/permits", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/compliance/permits", () => {
  beforeEach(() => {
    mockRunQuery.mockReset();
    mockRequireAuth.mockResolvedValue(HDAB_SESSION as never);
  });

  it("asks the guard for the access body role only", async () => {
    mockRequireAuth.mockResolvedValueOnce(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );
    const res = await POST(
      post({ applicationId: "app-1", decision: "APPROVED" }),
    );
    expect(res.status).toBe(403);
    expect(mockRequireAuth).toHaveBeenCalledWith(["HDAB_AUTHORITY"]);
    expect(mockRunQuery).not.toHaveBeenCalled();
  });

  it("needs an application and a decision", async () => {
    const res = await POST(post({ decision: "APPROVED" }));
    expect(res.status).toBe(400);
    const res2 = await POST(
      post({ applicationId: "app-1", decision: "MAYBE" }),
    );
    expect(res2.status).toBe(400);
  });

  it("refuses to refuse without a written justification", async () => {
    const res = await POST(
      post({ applicationId: "app-1", decision: "REJECTED" }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("justification");
  });

  it("issues a data permit for twelve months by default", async () => {
    mockRunQuery.mockResolvedValue([DECIDED_ROW]);
    const res = await POST(
      post({
        applicationId: "app-pharmaco-1",
        decision: "approved",
        purpose: "SCIENTIFIC_RESEARCH",
        conditions: "SPE only\nAggregate output",
        criteria: {
          a: true,
          b: true,
          c: true,
          d: true,
          e: true,
          f: true,
          g: true,
          h: true,
        },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.permitId).toBe("permit-app-pharmaco-1");
    expect(body.decision).toBe("APPROVED");
    expect(body.applicantName).toBe("PharmaCo Research AG");
    expect(body.publishBy).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(body.decidedBy).toBe("did:web:medreg.de:hdab");

    const [cypher, params] = mockRunQuery.mock.calls[0];
    expect(cypher).toContain(
      "MERGE (permit:HDABApproval {approvalId: $permitId})",
    );
    expect(cypher).toContain("GRANTS_ACCESS_TO");
    expect(params).toMatchObject({
      decision: "APPROVED",
      permitId: "permit-app-pharmaco-1",
      purpose: "SCIENTIFIC_RESEARCH",
      conditions: ["SPE only", "Aggregate output"],
      deciderDid: "did:web:medreg.de:hdab",
    });
    const p = params as {
      validUntil: string;
      decidedAt: string;
      criteria: string;
    };
    expect(Date.parse(p.validUntil) - Date.parse(p.decidedAt)).toBeGreaterThan(
      360 * 86_400_000,
    );
    expect(JSON.parse(p.criteria)).toMatchObject({ a: true, h: true });
  });

  it("records a refusal with its justification and no validity", async () => {
    mockRunQuery.mockResolvedValue([{ ...DECIDED_ROW, purpose: "NONE" }]);
    const res = await POST(
      post({
        applicationId: "app-1",
        decision: "REJECTED",
        justification: "Data minimisation plan insufficient (Art. 66).",
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.decision).toBe("REJECTED");
    expect(body.validUntil).toBeNull();
    const params = mockRunQuery.mock.calls[0][1] as Record<string, unknown>;
    expect(params.validUntil).toBeNull();
    expect(params.justification).toContain("Art. 66");
  });

  it("rejects a validity that has already passed", async () => {
    const res = await POST(
      post({
        applicationId: "app-1",
        decision: "APPROVED",
        validUntil: "2020-01-01",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("answers 404 for an application the graph does not hold", async () => {
    mockRunQuery.mockResolvedValue([]);
    const res = await POST(
      post({ applicationId: "app-nope", decision: "APPROVED" }),
    );
    expect(res.status).toBe(404);
  });
});
