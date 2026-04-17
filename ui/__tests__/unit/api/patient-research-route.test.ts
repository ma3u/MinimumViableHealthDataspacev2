/**
 * Tests for /api/patient/research/route.ts
 *
 * EHDS Art. 10 — patient consent management for secondary use of health data.
 *
 *   GET    → list available DataProduct research programs + patient consents
 *   POST   → create a PatientConsent (idempotent MERGE)
 *   DELETE → soft-revoke an existing consent (sets revoked=true)
 *
 * Tests cover auth (401/403), input validation, happy paths, and the
 * not-found branch for DELETE.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { getServerSession } from "next-auth/next";

const mockRunQuery = vi.fn();
vi.mock("@/lib/neo4j", () => ({
  runQuery: (...args: unknown[]) => mockRunQuery(...args),
}));

import { GET, POST, DELETE } from "@/app/api/patient/research/route";

function makeReq(qs = "", init?: RequestInit): Request {
  return new Request(`http://localhost/api/patient/research${qs}`, init);
}

describe("/api/patient/research", () => {
  beforeEach(() => {
    mockRunQuery.mockReset();
    vi.mocked(getServerSession).mockResolvedValue({
      user: { name: "Test Admin", email: "admin@test.example" },
      roles: ["EDC_ADMIN"],
    } as unknown as Awaited<ReturnType<typeof getServerSession>>);
  });

  describe("GET", () => {
    it("returns 401 when unauthenticated", async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(null);
      const res = await GET(makeReq(""));
      expect(res.status).toBe(401);
      expect(mockRunQuery).not.toHaveBeenCalled();
    });

    it("returns 403 for DATA_HOLDER role", async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce({
        user: { name: "Data Holder", email: "dh@test.example" },
        roles: ["DATA_HOLDER"],
      } as unknown as Awaited<ReturnType<typeof getServerSession>>);
      const res = await GET(makeReq(""));
      expect(res.status).toBe(403);
    });

    it("returns programs and skips consent query when no patientId", async () => {
      mockRunQuery.mockResolvedValueOnce([
        {
          studyId: "study-1",
          studyName: "Cardio Study",
          institution: "AlphaKlinik Berlin",
          purpose: "RESEARCH",
          description: "Cardio research",
          dataNeeded: "FHIR",
          status: "active",
        },
      ]);

      const res = await GET(makeReq(""));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.programs).toHaveLength(1);
      expect(data.consents).toEqual([]);
      expect(data.ehdsArticle).toContain("EHDS Art. 10");
      // Only the programs query runs when patientId is absent
      expect(mockRunQuery).toHaveBeenCalledTimes(1);
    });

    it("returns programs + patient consents when patientId given", async () => {
      mockRunQuery
        .mockResolvedValueOnce([
          {
            studyId: "study-1",
            studyName: "Cardio Study",
            institution: "AlphaKlinik Berlin",
            purpose: "RESEARCH",
            description: "Cardio research",
            dataNeeded: "FHIR",
            status: "active",
          },
        ])
        .mockResolvedValueOnce([
          {
            consentId: "c-1",
            studyId: "study-1",
            grantedAt: "2025-01-01T00:00:00Z",
            revoked: false,
            purpose: "RESEARCH",
          },
        ]);

      const res = await GET(makeReq("?patientId=p-1"));
      const data = await res.json();
      expect(data.programs).toHaveLength(1);
      expect(data.consents).toHaveLength(1);
      expect(data.consents[0].consentId).toBe("c-1");
      expect(mockRunQuery).toHaveBeenCalledTimes(2);
    });
  });

  describe("POST", () => {
    it("returns 401 when unauthenticated", async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(null);
      const res = await POST(
        makeReq("", {
          method: "POST",
          body: JSON.stringify({ patientId: "p-1", studyId: "s-1" }),
        }),
      );
      expect(res.status).toBe(401);
    });

    it("returns 400 when patientId is missing", async () => {
      const res = await POST(
        makeReq("", {
          method: "POST",
          body: JSON.stringify({ studyId: "s-1" }),
        }),
      );
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("patientId");
    });

    it("returns 400 when studyId is missing", async () => {
      const res = await POST(
        makeReq("", {
          method: "POST",
          body: JSON.stringify({ patientId: "p-1" }),
        }),
      );
      expect(res.status).toBe(400);
    });

    it("creates consent and returns consentId on happy path", async () => {
      mockRunQuery.mockResolvedValueOnce([{ consentId: "new-uuid-123" }]);

      const res = await POST(
        makeReq("", {
          method: "POST",
          body: JSON.stringify({
            patientId: "p-1",
            studyId: "s-1",
            purpose: "RESEARCH",
          }),
        }),
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.consentId).toBe("new-uuid-123");
      expect(data.patientId).toBe("p-1");
      expect(data.studyId).toBe("s-1");
      expect(data.ehdsArticle).toBe("EHDS Art. 10");
      // grantedAt should be a parseable ISO string close to "now"
      const drift = Math.abs(Date.now() - Date.parse(data.grantedAt));
      expect(drift).toBeLessThan(5_000);
    });

    it("defaults purpose to RESEARCH when not provided", async () => {
      mockRunQuery.mockResolvedValueOnce([{ consentId: "c-default" }]);

      const res = await POST(
        makeReq("", {
          method: "POST",
          body: JSON.stringify({ patientId: "p-1", studyId: "s-1" }),
        }),
      );
      const data = await res.json();
      expect(data.purpose).toBe("RESEARCH");
      // Verify the purpose parameter was passed to Neo4j
      const params = mockRunQuery.mock.calls[0][1] as { purpose: string };
      expect(params.purpose).toBe("RESEARCH");
    });
  });

  describe("DELETE", () => {
    it("returns 401 when unauthenticated", async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(null);
      const res = await DELETE(
        makeReq("?consentId=c-1&patientId=p-1", { method: "DELETE" }),
      );
      expect(res.status).toBe(401);
    });

    it("returns 400 when consentId missing", async () => {
      const res = await DELETE(makeReq("?patientId=p-1", { method: "DELETE" }));
      expect(res.status).toBe(400);
    });

    it("returns 400 when patientId missing", async () => {
      const res = await DELETE(makeReq("?consentId=c-1", { method: "DELETE" }));
      expect(res.status).toBe(400);
    });

    it("returns 404 when consent does not exist", async () => {
      mockRunQuery.mockResolvedValueOnce([]);
      const res = await DELETE(
        makeReq("?consentId=nope&patientId=p-1", { method: "DELETE" }),
      );
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toBe("Consent not found");
    });

    it("soft-revokes consent on happy path", async () => {
      mockRunQuery.mockResolvedValueOnce([{ consentId: "c-1" }]);
      const res = await DELETE(
        makeReq("?consentId=c-1&patientId=p-1", { method: "DELETE" }),
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.revoked).toBe(true);
      expect(data.consentId).toBe("c-1");
      expect(data.gdprArticle).toContain("GDPR Art. 17");
    });
  });
});
