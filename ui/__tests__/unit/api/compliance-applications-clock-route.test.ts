/**
 * POST /api/compliance/applications/clock: the incompleteness notice and
 * the one extension of Art. 68(4). Issue #206, M2.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("@/lib/neo4j", () => ({
  runQuery: vi.fn(),
}));

import { runQuery } from "@/lib/neo4j";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import { POST } from "@/app/api/compliance/applications/clock/route";

const mockRunQuery = vi.mocked(runQuery);
const mockRequireAuth = vi.mocked(requireAuth);
vi.mocked(isAuthError).mockImplementation((r) => r instanceof NextResponse);

const HDAB = {
  session: {
    user: { id: "regulator", name: "MedReg officer", email: "regulator@x" },
    roles: ["HDAB_AUTHORITY"],
    accessToken: "",
  },
};

const PENDING = {
  applicationId: "app-1",
  status: "PENDING",
  decided: false,
  submittedAt: "2026-09-01T09:00:00Z",
  completedAt: null,
  extendedAt: null,
  incompleteNoticeAt: null,
  completeBy: null,
  requestedPurpose: "SCIENTIFIC_RESEARCH",
  processingPeriodMonths: 12,
  ethicsCommitteeRef: "EC-1",
};

function post(body: unknown) {
  return new NextRequest("http://localhost/api/compliance/applications/clock", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/compliance/applications/clock", () => {
  beforeEach(() => {
    mockRunQuery.mockReset();
    mockRequireAuth.mockResolvedValue(HDAB as never);
  });

  it("is the access body's action", async () => {
    mockRequireAuth.mockResolvedValueOnce(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );
    const res = await POST(post({ applicationId: "app-1", action: "EXTEND" }));
    expect(res.status).toBe(403);
  });

  it("needs reasons", async () => {
    const res = await POST(post({ applicationId: "app-1", action: "EXTEND" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("Art. 68(4)");
  });

  it("stops the clock and names the missing items", async () => {
    mockRunQuery.mockResolvedValueOnce([PENDING]).mockResolvedValueOnce([]);
    const res = await POST(
      post({
        applicationId: "app-1",
        action: "INCOMPLETE",
        reason: "Missing (a) and (i)",
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.clockState).toBe("paused");
    expect(body.decisionDue).toBeNull();
    const by = Date.parse(body.completeBy) - Date.now();
    expect(by).toBeGreaterThan(27 * 86_400_000);
    expect(by).toBeLessThanOrEqual(28 * 86_400_000);
    expect(body.missing.map((m: { item: string }) => m.item)).toContain("a");
    const write = mockRunQuery.mock.calls[1][0] as string;
    expect(write).toContain("app.status             = 'INCOMPLETE'");
    expect(write).toContain("app.completeBy");
  });

  it("extends once by three months", async () => {
    mockRunQuery.mockResolvedValueOnce([PENDING]).mockResolvedValueOnce([]);
    const res = await POST(
      post({
        applicationId: "app-1",
        action: "EXTEND",
        reason: "Complex linkage across two holders",
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.clockState).toBe("extended");
    expect(body.extended).toBe(true);
    expect(body.decisionDue).toBe("2027-03-01T09:00:00.000Z");
    const params = mockRunQuery.mock.calls[1][1] as { decisionDue: string };
    expect(params.decisionDue).toBe("2027-03-01T09:00:00.000Z");
  });

  it("refuses a second extension", async () => {
    mockRunQuery.mockResolvedValueOnce([
      { ...PENDING, extendedAt: "2026-09-20T00:00:00Z" },
    ]);
    const res = await POST(
      post({ applicationId: "app-1", action: "EXTEND", reason: "again" }),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("one extension");
  });

  it("refuses to extend a stopped clock", async () => {
    mockRunQuery.mockResolvedValueOnce([
      { ...PENDING, incompleteNoticeAt: "2026-09-15T09:00:00Z" },
    ]);
    const res = await POST(
      post({ applicationId: "app-1", action: "EXTEND", reason: "x" }),
    );
    expect(res.status).toBe(409);
  });

  it("refuses once the application is decided", async () => {
    mockRunQuery.mockResolvedValueOnce([{ ...PENDING, decided: true }]);
    const res = await POST(
      post({ applicationId: "app-1", action: "INCOMPLETE", reason: "x" }),
    );
    expect(res.status).toBe(409);
  });

  it("404s an unknown application", async () => {
    mockRunQuery.mockResolvedValueOnce([]);
    const res = await POST(
      post({ applicationId: "app-x", action: "EXTEND", reason: "x" }),
    );
    expect(res.status).toBe(404);
  });
});
