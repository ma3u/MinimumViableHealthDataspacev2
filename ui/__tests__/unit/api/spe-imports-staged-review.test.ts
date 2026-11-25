/**
 * The access body's review of a staged import (#1236, draft SPE act Art. 4):
 * written on the admin audit chain first, then approved or refused in the
 * workspace through the neo4j-proxy.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
const adminAudit = vi.hoisted(() => ({
  recordAdminEvent: vi.fn(async () => undefined),
  recordAdminEventAfter: vi.fn(async () => undefined),
}));
vi.mock("@/lib/admin-audit", async (orig) => ({
  ...(await orig<typeof import("@/lib/admin-audit")>()),
  ...adminAudit,
}));
import { NextRequest } from "next/server";
import { POST } from "@/app/api/spe-imports/staged/[importId]/review/route";
import { GET } from "@/app/api/spe-imports/staged/route";

const ID = "3c9f2b1e-7d4a-4e21-9b8f-1a2b3c4d5e6f";
const params = { params: Promise.resolve({ importId: ID }) };
const post = (body: unknown) =>
  new NextRequest(`http://localhost/api/spe-imports/staged/${ID}/review`, {
    method: "POST",
    body: JSON.stringify(body),
  });

describe("POST /api/spe-imports/staged/[importId]/review", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    adminAudit.recordAdminEvent.mockReset();
    adminAudit.recordAdminEvent.mockResolvedValue(undefined);
    adminAudit.recordAdminEventAfter.mockClear();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("approves: audited first, then the workspace writes the data", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ approved: true, records: 42 }), {
        status: 200,
      }),
    );
    const res = await POST(
      post({ speId: "SPE-1", decision: "approve" }),
      params,
    );
    expect(res.status).toBe(200);
    expect(adminAudit.recordAdminEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: "import-review", target: ID }),
    );
    expect(String(fetchMock.mock.calls[0][0])).toMatch(
      new RegExp(`/spe/SPE-1/staged/${ID}/approve$`),
    );
  });

  it("records a review that did not take effect as a failure", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "not staged" }), { status: 404 }),
    );
    const res = await POST(
      post({ speId: "SPE-1", decision: "approve" }),
      params,
    );
    expect(res.status).toBe(404);
    expect(adminAudit.recordAdminEventAfter).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "import-review",
        outcome: "failure",
        target: ID,
        reason: "not staged",
      }),
    );
  });

  it("asks a refusal for a reason", async () => {
    const res = await POST(
      post({ speId: "SPE-1", decision: "reject" }),
      params,
    );
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does nothing when the review cannot be audited", async () => {
    adminAudit.recordAdminEvent.mockRejectedValueOnce(new Error("down"));
    const res = await POST(
      post({ speId: "SPE-2", decision: "reject", reason: "Not in the permit" }),
      params,
    );
    expect(res.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses an unknown SPE or decision", async () => {
    expect(
      (await POST(post({ speId: "SPE-9", decision: "approve" }), params))
        .status,
    ).toBe(400);
    expect(
      (await POST(post({ speId: "SPE-1", decision: "maybe" }), params)).status,
    ).toBe(400);
  });
});

describe("GET /api/spe-imports/staged", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  it("passes the workspaces' list on", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ staged: [], unreachable: ["SPE-2"] }), {
            status: 200,
          }),
      ),
    );
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).unreachable).toEqual(["SPE-2"]);
  });
});
