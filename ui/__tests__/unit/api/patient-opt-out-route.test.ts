/**
 * /api/patient/opt-out: the Art. 71 opt-out from secondary use (ADR-062).
 *
 * The real requireAuth() runs against the mocked session, so the gate is
 * pinned: a patient acts on their own record only, other roles are refused.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.unmock("@/lib/auth-guard");
import { getServerSession } from "next-auth/next";

const mockRunQuery = vi.fn();
vi.mock("@/lib/neo4j", () => ({
  runQuery: (...args: unknown[]) => mockRunQuery(...args),
}));

import { GET, POST, DELETE } from "@/app/api/patient/opt-out/route";

type Session = Awaited<ReturnType<typeof getServerSession>>;
const asSession = (s: unknown) => s as Session;
const ADMIN = asSession({ user: { name: "Admin" }, roles: ["EDC_ADMIN"] });

function req(qs = "", init?: RequestInit): NextRequest {
  return new NextRequest(`http://localhost/api/patient/opt-out${qs}`, init);
}

const OPEN = {
  optOutId: "o-1",
  optedOutAt: "2026-10-27T10:00:00Z",
  source: "patient-portal",
  reversedAt: null,
  reversalSource: null,
};

describe("/api/patient/opt-out", () => {
  beforeEach(() => {
    mockRunQuery.mockReset();
    vi.mocked(getServerSession).mockResolvedValue(ADMIN);
  });

  it("refuses an anonymous caller", async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null);
    const res = await POST(req("", { method: "POST", body: "{}" }));
    expect(res.status).toBe(401);
    expect(mockRunQuery).not.toHaveBeenCalled();
  });

  it("refuses a data user: nobody opts out in a person's name", async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(
      asSession({ user: { name: "R" }, roles: ["DATA_USER"] }),
    );
    const res = await GET(req("?patientId=P1"));
    expect(res.status).toBe(403);
  });

  it("asks for a record when none is named and the session owns none", async () => {
    const res = await GET(req(""));
    expect(res.status).toBe(400);
  });

  it("GET reports the open opt-out and the history", async () => {
    mockRunQuery.mockResolvedValueOnce([OPEN]);
    const res = await GET(req("?patientId=P1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      patientId: "P1",
      optedOut: true,
      since: OPEN.optedOutAt,
    });
    expect(body.article).toContain("Art. 71");
  });

  it("POST opts out with the person-level labels and the source", async () => {
    mockRunQuery
      .mockResolvedValueOnce([{ optOutId: "o-1", marked: 12 }])
      .mockResolvedValueOnce([OPEN]);
    const res = await POST(
      req("", {
        method: "POST",
        body: JSON.stringify({ patientId: "P1", source: "app" }),
      }),
    );
    expect(res.status).toBe(200);
    const [cypher, params] = mockRunQuery.mock.calls[0];
    expect(cypher).toContain("OptOutRecord");
    expect(cypher).toContain("SET n:OptedOut");
    expect(params).toMatchObject({ patientId: "P1", source: "app" });
    expect(params.personLabels).toContain("OMOPPerson");
    expect((await res.json()).optedOut).toBe(true);
  });

  it("POST answers 404 for a record that does not exist", async () => {
    mockRunQuery.mockResolvedValueOnce([]);
    const res = await POST(
      req("", {
        method: "POST",
        body: JSON.stringify({ patientId: "nobody" }),
      }),
    );
    expect(res.status).toBe(404);
  });

  it("DELETE reverses, keeping the record", async () => {
    mockRunQuery
      .mockResolvedValueOnce([{ optOutId: "o-1" }])
      .mockResolvedValueOnce([{ ...OPEN, reversedAt: "2026-10-28T08:00:00Z" }]);
    const res = await DELETE(req("?patientId=P1", { method: "DELETE" }));
    expect(res.status).toBe(200);
    expect(mockRunQuery.mock.calls[0][0]).toContain("REMOVE n:OptedOut");
    const body = await res.json();
    expect(body.optedOut).toBe(false);
    expect(body.history).toHaveLength(1);
  });

  it("DELETE answers 404 when nothing is open", async () => {
    mockRunQuery.mockResolvedValueOnce([]);
    const res = await DELETE(req("?patientId=P1", { method: "DELETE" }));
    expect(res.status).toBe(404);
  });
});
