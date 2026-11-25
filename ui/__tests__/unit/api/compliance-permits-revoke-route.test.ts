/**
 * POST /api/compliance/permits/revoke: revocation (Art. 63(3)). Issue #206, M4.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
// Admin actions go on the audit chain first (#1236); the chain is not under test here.
const adminAudit = vi.hoisted(() => ({
  recordAdminEvent: vi.fn(async () => undefined),
  recordAdminEventAfter: vi.fn(async () => undefined),
}));
vi.mock("@/lib/admin-audit", async (orig) => ({
  ...(await orig<typeof import("@/lib/admin-audit")>()),
  ...adminAudit,
}));
import { NextRequest, NextResponse } from "next/server";

vi.mock("@/lib/neo4j", () => ({
  runQuery: vi.fn(),
}));

import { runQuery } from "@/lib/neo4j";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import { POST } from "@/app/api/compliance/permits/revoke/route";

const mockRunQuery = vi.mocked(runQuery);
const mockRequireAuth = vi.mocked(requireAuth);
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

function post(body: unknown) {
  return new NextRequest("http://localhost/api/compliance/permits/revoke", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/compliance/permits/revoke", () => {
  beforeEach(() => {
    mockRunQuery.mockReset();
    adminAudit.recordAdminEvent.mockClear();
    adminAudit.recordAdminEventAfter.mockClear();
    mockRequireAuth.mockResolvedValue(HDAB_SESSION as never);
  });

  it("is the access body's measure alone", async () => {
    mockRequireAuth.mockResolvedValueOnce(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );
    const res = await POST(post({ permitId: "permit-x", reason: "r" }));
    expect(res.status).toBe(403);
    expect(mockRequireAuth).toHaveBeenCalledWith(["HDAB_AUTHORITY"]);
  });

  it("needs the permit and a written reason", async () => {
    expect((await POST(post({ permitId: "permit-x" }))).status).toBe(400);
    expect((await POST(post({ reason: "r" }))).status).toBe(400);
  });

  it("revokes an approved permit and records who, when and why", async () => {
    mockRunQuery.mockResolvedValue([
      {
        permitId: "permit-app-1",
        applicationId: "app-1",
        applicant: "did:web:pharmaco.de:research",
        applicantName: "PharmaCo Research AG",
      },
    ]);
    const res = await POST(
      post({
        permitId: "permit-app-1",
        reason: "Output left the SPE with direct identifiers (Art. 61(2)).",
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.decision).toBe("REVOKED");
    expect(body.revokedBy).toBe("did:web:medreg.de:hdab");
    expect(body.article).toContain("Art. 63(3)");

    const [cypher, params] = mockRunQuery.mock.calls[1];
    expect(cypher).toContain("= 'APPROVED'");
    expect(cypher).toContain("permit.status            = 'REVOKED'");
    expect(params).toMatchObject({
      permitId: "permit-app-1",
      revokedBy: "did:web:medreg.de:hdab",
    });
    expect((params as { reason: string }).reason).toContain("Art. 61(2)");
  });

  it("puts the revocation on the admin audit chain before it takes effect (#1236)", async () => {
    mockRunQuery.mockResolvedValue([{ permitId: "permit-app-1" }]);
    await POST(post({ permitId: "permit-app-1", reason: "Breach." }));
    expect(adminAudit.recordAdminEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "permit-revoke",
        target: "permit-app-1",
        actorRole: "HDAB_AUTHORITY",
      }),
    );
  });

  it("revokes nothing when the audit chain cannot record it", async () => {
    adminAudit.recordAdminEvent.mockRejectedValueOnce(new Error("down"));
    mockRunQuery.mockResolvedValue([{ permitId: "permit-app-1" }]);
    const res = await POST(
      post({ permitId: "permit-app-1", reason: "Breach." }),
    );
    expect(res.status).toBe(503);
    // Only the read that checks the permit ran; nothing was written.
    expect(mockRunQuery).toHaveBeenCalledTimes(1);
    expect(String(mockRunQuery.mock.calls[0][0])).not.toContain("REVOKED");
  });

  it("answers 404 when there is no approved permit under that id", async () => {
    mockRunQuery.mockResolvedValue([]);
    const res = await POST(post({ permitId: "permit-gone", reason: "r" }));
    expect(res.status).toBe(404);
  });

  it("never records a revocation of a permit that is not there as a success", async () => {
    mockRunQuery.mockResolvedValue([]);
    await POST(post({ permitId: "permit-gone", reason: "r" }));
    expect(adminAudit.recordAdminEvent).not.toHaveBeenCalled();
    expect(adminAudit.recordAdminEventAfter).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "permit-revoke",
        outcome: "failure",
        target: "permit-gone",
      }),
    );
    // Nothing but the check ran: no write was attempted.
    expect(mockRunQuery).toHaveBeenCalledTimes(1);
  });
});
