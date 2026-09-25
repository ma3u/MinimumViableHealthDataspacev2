/**
 * Retention of the SPE logs (Art. 73(1)(e)): at least one year; the purge
 * deletes only what is past its date and nothing without one. Issue #206, M3.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("@/lib/neo4j", () => ({
  runQuery: vi.fn(),
}));

import { runQuery } from "@/lib/neo4j";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import { GET, POST } from "@/app/api/admin/audit/retention/route";
import { RETENTION_MONTHS, retainUntil } from "@/lib/retention";

const mockRunQuery = vi.mocked(runQuery);
const mockRequireAuth = vi.mocked(requireAuth);
vi.mocked(isAuthError).mockImplementation((r) => r instanceof NextResponse);

const COUNTS = {
  total: 110,
  withRetention: 110,
  expired: 0,
  protectedCount: 110,
  oldest: "2026-02-15T09:30:00Z",
  newest: "2026-09-25T08:00:00Z",
};

function post(body?: unknown) {
  return new NextRequest("http://localhost/api/admin/audit/retention", {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("retention (Art. 73(1)(e))", () => {
  beforeEach(() => {
    mockRunQuery.mockReset();
    mockRequireAuth.mockResolvedValue({
      session: {
        user: { id: "regulator" },
        roles: ["HDAB_AUTHORITY"],
        accessToken: "",
      },
    } as never);
  });

  it("keeps records twelve months", () => {
    expect(RETENTION_MONTHS).toBe(12);
    expect(retainUntil(new Date("2026-09-25T10:00:00Z")).toISOString()).toBe(
      "2027-09-25T10:00:00.000Z",
    );
  });

  it("GET reports the policy and the state of the records", async () => {
    mockRunQuery
      .mockResolvedValueOnce([COUNTS])
      .mockResolvedValueOnce([COUNTS]);
    const body = await (await GET()).json();
    expect(body.policy.months).toBe(12);
    expect(body.policy.article).toContain("Art. 73(1)(e)");
    expect(body.events.protectedCount).toBe(110);
    expect(body.events.expired).toBe(0);
  });

  it("POST without confirm is a dry run", async () => {
    mockRunQuery
      .mockResolvedValueOnce([COUNTS])
      .mockResolvedValueOnce([COUNTS]);
    const res = await POST(post({}));
    expect(res.status).toBe(400);
    expect(mockRunQuery).toHaveBeenCalledTimes(2);
    for (const call of mockRunQuery.mock.calls) {
      expect(String(call[0])).not.toContain("DELETE");
    }
  });

  it("POST with confirm deletes only what is past its date", async () => {
    mockRunQuery
      .mockResolvedValueOnce([{ deleted: 0 }])
      .mockResolvedValueOnce([{ deleted: 0 }])
      .mockResolvedValueOnce([COUNTS])
      .mockResolvedValueOnce([COUNTS]);
    const res = await POST(post({ confirm: true }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deleted).toEqual({ events: 0, transfers: 0 });
    expect(body.events.protectedCount).toBe(110);
    const purge = String(mockRunQuery.mock.calls[0][0]);
    expect(purge).toContain("te.retainUntil IS NOT NULL");
    expect(purge).toContain("< datetime()");
  });

  it("is for the access body and the operator only", async () => {
    mockRequireAuth.mockResolvedValueOnce(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );
    expect((await GET()).status).toBe(403);
    expect(mockRequireAuth).toHaveBeenLastCalledWith([
      "HDAB_AUTHORITY",
      "EDC_ADMIN",
    ]);
  });
});
