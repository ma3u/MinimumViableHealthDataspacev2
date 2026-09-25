/**
 * The simplified procedure for trusted data holders (Art. 72): a trusted
 * holder sees and decides the health data requests on the datasets it
 * offers; the request fee (Art. 62) lands on an approval. Issue #206, M7.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("@/lib/neo4j", () => ({
  runQuery: vi.fn(),
}));

import { runQuery } from "@/lib/neo4j";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import { GET } from "@/app/api/compliance/requests/route";
import { POST as decide } from "@/app/api/compliance/requests/decide/route";

const mockRunQuery = vi.mocked(runQuery);
const mockRequireAuth = vi.mocked(requireAuth);
vi.mocked(isAuthError).mockImplementation((r) => r instanceof NextResponse);

const HOLDER = {
  session: {
    user: {
      id: "clinicuser",
      name: "Clinic",
      email: "clinic@health-dataspace.local",
    },
    roles: ["EDC_USER_PARTICIPANT", "DATA_HOLDER"],
    accessToken: "",
  },
};

function post(body: unknown) {
  return new NextRequest("http://localhost/api/compliance/requests/decide", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("Art. 72 trusted data holder", () => {
  beforeEach(() => {
    mockRunQuery.mockReset();
    mockRequireAuth.mockResolvedValue(HOLDER as never);
  });

  it("GET shows a trusted holder the requests on its datasets, and which it may decide", async () => {
    mockRunQuery
      .mockResolvedValueOnce([{ trusted: true }])
      .mockResolvedValueOnce([
        {
          requestId: "req-1",
          status: "PENDING",
          submittedAt: "2026-09-20T09:00:00Z",
          holder: "did:web:alpha-klinik.de:participant",
          answer: null,
        },
        {
          requestId: "req-2",
          status: "PENDING",
          submittedAt: "2026-09-21T09:00:00Z",
          holder: "did:web:lmc.nl:clinic",
          answer: null,
        },
      ]);
    const body = await (await GET()).json();
    expect(body.scope).toBe("holder");
    expect(body.trustedHolder).toBe(true);
    const byId = Object.fromEntries(
      body.requests.map((r: { requestId: string; canDecide: boolean }) => [
        r.requestId,
        r.canDecide,
      ]),
    );
    expect(byId["req-1"]).toBe(true);
    expect(byId["req-2"]).toBe(false);
    const params = mockRunQuery.mock.calls[1][1] as {
      trustedHolder: boolean;
      callerDid: string;
    };
    expect(params.trustedHolder).toBe(true);
    expect(params.callerDid).toBe("did:web:alpha-klinik.de:participant");
  });

  it("a holder that is not trusted sees only its own requests", async () => {
    mockRunQuery
      .mockResolvedValueOnce([{ trusted: false }])
      .mockResolvedValueOnce([]);
    const body = await (await GET()).json();
    expect(body.scope).toBe("own");
    expect(body.trustedHolder).toBe(false);
  });

  it("refuses a decision by a holder that is not trusted, or on another's dataset", async () => {
    mockRunQuery.mockResolvedValueOnce([{ trusted: false, own: true }]);
    let res = await decide(
      post({ requestId: "req-1", decision: "REJECTED", justification: "x" }),
    );
    expect(res.status).toBe(403);
    expect((await res.json()).error).toContain("Art. 72");
    mockRunQuery.mockResolvedValueOnce([{ trusted: true, own: false }]);
    res = await decide(
      post({ requestId: "req-2", decision: "REJECTED", justification: "x" }),
    );
    expect(res.status).toBe(403);
    expect((await res.json()).error).toContain("datasets it offers");
  });

  it("records a trusted holder's refusal under Art. 72", async () => {
    mockRunQuery
      .mockResolvedValueOnce([{ trusted: true, own: true }])
      .mockResolvedValueOnce([
        {
          requestId: "req-1",
          applicantId: "did:web:pharmaco.de:research",
          question: "q",
          purpose: "STATISTICS",
          datasetId: "d",
        },
      ]);
    const res = await decide(
      post({
        requestId: "req-1",
        decision: "REJECTED",
        justification: "Out of scope",
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.decidedUnder).toBe("Art. 72");
    expect(body.article).toContain("trusted data holder");
    const params = mockRunQuery.mock.calls[1][1] as Record<string, unknown>;
    expect(params.decidedUnder).toBe("Art. 72");
    expect(params.decidedBy).toBe("did:web:alpha-klinik.de:participant");
    expect(params.feeEur).toBe(300);
  });

  it("the access body still decides under Art. 69(3)", async () => {
    mockRequireAuth.mockResolvedValue({
      session: {
        user: { id: "regulator", email: "regulator@health-dataspace.local" },
        roles: ["HDAB_AUTHORITY"],
        accessToken: "",
      },
    } as never);
    mockRunQuery.mockResolvedValueOnce([
      {
        requestId: "req-1",
        applicantId: "x",
        question: "q",
        purpose: "p",
        datasetId: null,
      },
    ]);
    const res = await decide(
      post({ requestId: "req-1", decision: "REJECTED", justification: "x" }),
    );
    expect((await res.json()).decidedUnder).toBe("Art. 69(3)");
    expect(mockRunQuery).toHaveBeenCalledTimes(1);
  });
});
