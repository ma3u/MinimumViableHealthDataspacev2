/**
 * Requests for information (Art. 63(1)): asked by the access body, answered
 * by the party, both on record. Issue #206, M4.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("@/lib/neo4j", () => ({
  runQuery: vi.fn(),
}));

import { runQuery } from "@/lib/neo4j";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import { GET, POST } from "@/app/api/compliance/information-requests/route";
import { POST as answer } from "@/app/api/compliance/information-requests/answer/route";

const mockRunQuery = vi.mocked(runQuery);
const mockRequireAuth = vi.mocked(requireAuth);
vi.mocked(isAuthError).mockImplementation((r) => r instanceof NextResponse);

const HDAB = {
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

function post(path: string, body: unknown) {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("/api/compliance/information-requests", () => {
  beforeEach(() => {
    mockRunQuery.mockReset();
  });

  it("the body asks, with four weeks to answer", async () => {
    mockRequireAuth.mockResolvedValue(HDAB as never);
    mockRunQuery.mockResolvedValueOnce([{ partyName: "AlphaKlinik Berlin" }]);
    const res = await POST(
      post("/api/compliance/information-requests", {
        partyDid: "did:web:alpha-klinik.de:participant",
        question: "Which outputs left the environment?",
        permitId: "permit-app-1",
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.requestId).toMatch(/^info-alpha-klinik-/);
    expect(Date.parse(body.answerBy) - Date.parse(body.requestedAt)).toBe(
      28 * 86_400_000,
    );
  });

  it("needs a party and a question", async () => {
    mockRequireAuth.mockResolvedValue(HDAB as never);
    const res = await POST(
      post("/api/compliance/information-requests", { partyDid: "x" }),
    );
    expect(res.status).toBe(400);
  });

  it("a party sees what was asked of it", async () => {
    mockRequireAuth.mockResolvedValue(HOLDER as never);
    mockRunQuery.mockResolvedValueOnce([
      {
        requestId: "info-1",
        status: "OPEN",
        answerBy: new Date(Date.now() + 5 * 86_400_000).toISOString(),
      },
    ]);
    const body = await (await GET()).json();
    expect(body.scope).toBe("own");
    expect(body.requests[0].daysToAnswer).toBe(5);
    const params = mockRunQuery.mock.calls[0][1] as { callerDid: string };
    expect(params.callerDid).toBe("did:web:alpha-klinik.de:participant");
  });

  it("the party answers; nobody else does", async () => {
    mockRequireAuth.mockResolvedValue(HOLDER as never);
    mockRunQuery
      .mockResolvedValueOnce([
        { partyId: "did:web:alpha-klinik.de:participant", status: "OPEN" },
      ])
      .mockResolvedValueOnce([]);
    let res = await answer(
      post("/api/compliance/information-requests/answer", {
        requestId: "info-1",
        answer: "Two aggregate tables, on record.",
      }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("ANSWERED");

    mockRunQuery.mockResolvedValueOnce([
      { partyId: "did:web:pharmaco.de:research", status: "OPEN" },
    ]);
    res = await answer(
      post("/api/compliance/information-requests/answer", {
        requestId: "info-2",
        answer: "x",
      }),
    );
    expect(res.status).toBe(403);
  });
});
