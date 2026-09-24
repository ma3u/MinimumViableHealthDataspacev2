/**
 * Tests for /api/patient/ehr-sync/route.ts (issue #271): the "Request EHR
 * data" flow stamps the sync on the record the login owns.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { getServerSession } from "next-auth/next";

const mockRunQuery = vi.fn();
vi.mock("@/lib/neo4j", () => ({
  runQuery: (...args: unknown[]) => mockRunQuery(...args),
}));

import { POST } from "@/app/api/patient/ehr-sync/route";

type Session = Awaited<ReturnType<typeof getServerSession>>;

const patientSession = {
  user: { name: "Maria Schmidt", email: "patient1@health-dataspace.local" },
  roles: ["PATIENT"],
  preferredUsername: "patient1",
} as unknown as Session;

describe("POST /api/patient/ehr-sync", () => {
  beforeEach(() => {
    mockRunQuery.mockReset();
  });

  it("stamps the own record and answers with the new sync", async () => {
    vi.mocked(getServerSession).mockResolvedValue(patientSession);
    mockRunQuery.mockResolvedValueOnce([
      {
        ehrSyncedAt: "2026-09-24T09:12:33Z",
        ehrSyncSource: "ePA transfer, GesundheitsID-authenticated",
      },
    ]);
    const res = await POST();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.patientId).toBe("P1");
    expect(data.lastEhrSync).toEqual({
      at: "2026-09-24T09:12:33Z",
      source: "ePA transfer, GesundheitsID-authenticated",
    });
    const [cypher, params] = mockRunQuery.mock.calls[0];
    expect(cypher).toMatch(/SET p\.ehrSyncedAt/);
    expect(params.patientId).toBe("P1");
  });

  it("refuses a login without the PATIENT role", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { name: "Dr. Admin" },
      roles: ["EDC_ADMIN"],
      preferredUsername: "edcadmin",
    } as unknown as Session);
    const res = await POST();
    expect(res.status).toBe(403);
    expect(mockRunQuery).not.toHaveBeenCalled();
  });

  it("answers 404 when the login owns no record", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { name: "Nobody" },
      roles: ["PATIENT"],
      preferredUsername: "patient9",
    } as unknown as Session);
    mockRunQuery.mockResolvedValueOnce([]);
    const res = await POST();
    expect(res.status).toBe(404);
  });

  it("answers 401 without a session", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    expect((await POST()).status).toBe(401);
  });
});
