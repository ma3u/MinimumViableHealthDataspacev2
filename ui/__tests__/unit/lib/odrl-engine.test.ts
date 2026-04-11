/**
 * Unit tests for odrl-engine.ts (Phase 24)
 *
 * Tests userToParticipantId() and resolveOdrlScope() — the ODRL
 * policy evaluation engine.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/neo4j", () => ({
  runQuery: vi.fn(),
}));

// Unmock odrl-engine to test the real implementation
vi.unmock("@/lib/odrl-engine");

import { runQuery } from "@/lib/neo4j";
import { userToParticipantId, resolveOdrlScope } from "@/lib/odrl-engine";

const mockRunQuery = vi.mocked(runQuery);

describe("odrl-engine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("userToParticipantId()", () => {
    it("should map known admin username to AlphaKlinik DID", () => {
      const did = userToParticipantId("admin@edc.demo", ["EDC_ADMIN"]);
      expect(did).toBe("did:web:alpha-klinik.de:participant");
    });

    it("should map researcher username to PharmaCo DID", () => {
      const did = userToParticipantId("researcher@pharmaco.de", ["DATA_USER"]);
      expect(did).toBe("did:web:pharmaco.de:research");
    });

    it("should map HDAB officer to MedReg DID", () => {
      const did = userToParticipantId("hdab.officer@medreg.de", [
        "HDAB_AUTHORITY",
      ]);
      expect(did).toBe("did:web:medreg.de:hdab");
    });

    it("should map Dutch clinician to LMC DID", () => {
      const did = userToParticipantId("dr.janssen@lmc.nl", ["DATA_HOLDER"]);
      expect(did).toBe("did:web:lmc.nl:clinic");
    });

    it("should map patient to AlphaKlinik DID", () => {
      const did = userToParticipantId("patient.mueller@demo.ehds", ["PATIENT"]);
      expect(did).toBe("did:web:alpha-klinik.de:participant");
    });

    it("should return generic DID for unknown username", () => {
      const did = userToParticipantId("unknown@example.com", ["DATA_USER"]);
      expect(did).toBe("did:web:unknown:unknown@example.com");
    });

    it("should ignore roles parameter (uses username only)", () => {
      const did1 = userToParticipantId("researcher@pharmaco.de", ["EDC_ADMIN"]);
      const did2 = userToParticipantId("researcher@pharmaco.de", ["PATIENT"]);
      expect(did1).toBe(did2);
    });
  });

  describe("resolveOdrlScope()", () => {
    it("should return empty scope when participant not found in Neo4j", async () => {
      mockRunQuery.mockResolvedValue([]);

      const scope = await resolveOdrlScope("did:web:unknown:user");
      expect(scope.participantId).toBe("did:web:unknown:user");
      expect(scope.participantName).toBe("did:web:unknown:user");
      expect(scope.permissions).toEqual([]);
      expect(scope.prohibitions).toEqual([]);
      expect(scope.accessibleDatasets).toEqual([]);
      expect(scope.temporalLimit).toBeNull();
      expect(scope.policyIds).toEqual([]);
      expect(scope.hasActiveContract).toBe(false);
      expect(scope.hdabApproved).toBe(false);
    });

    it("should aggregate permissions and prohibitions from ODRL policies", async () => {
      mockRunQuery.mockResolvedValue([
        {
          participantName: "PharmaCo Research AG",
          policyId: "policy-1",
          permissions: ["scientific_research", "statistics"],
          prohibitions: ["re_identification"],
          temporalLimit: "2027-12-31",
          datasetId: "ds-001",
          contractStatus: "ACTIVE",
          approvalStatus: "approved",
        },
        {
          participantName: "PharmaCo Research AG",
          policyId: "policy-2",
          permissions: ["education"],
          prohibitions: ["commercial_exploitation"],
          temporalLimit: null,
          datasetId: "ds-002",
          contractStatus: "ACTIVE",
          approvalStatus: null,
        },
      ]);

      const scope = await resolveOdrlScope("did:web:pharmaco.de:research");

      expect(scope.participantId).toBe("did:web:pharmaco.de:research");
      expect(scope.participantName).toBe("PharmaCo Research AG");
      expect(scope.permissions).toContain("scientific_research");
      expect(scope.permissions).toContain("statistics");
      expect(scope.permissions).toContain("education");
      expect(scope.prohibitions).toContain("re_identification");
      expect(scope.prohibitions).toContain("commercial_exploitation");
      expect(scope.accessibleDatasets).toContain("ds-001");
      expect(scope.accessibleDatasets).toContain("ds-002");
      expect(scope.temporalLimit).toBe("2027-12-31");
      expect(scope.policyIds).toContain("policy-1");
      expect(scope.policyIds).toContain("policy-2");
      expect(scope.hasActiveContract).toBe(true);
      expect(scope.hdabApproved).toBe(true);
    });

    it("should deduplicate permissions across multiple policies", async () => {
      mockRunQuery.mockResolvedValue([
        {
          participantName: "Test Org",
          policyId: "policy-1",
          permissions: ["scientific_research"],
          prohibitions: [],
          temporalLimit: null,
          datasetId: "ds-001",
          contractStatus: null,
          approvalStatus: null,
        },
        {
          participantName: "Test Org",
          policyId: "policy-1",
          permissions: ["scientific_research"],
          prohibitions: [],
          temporalLimit: null,
          datasetId: "ds-001",
          contractStatus: null,
          approvalStatus: null,
        },
      ]);

      const scope = await resolveOdrlScope("did:web:test:org");
      expect(scope.permissions).toHaveLength(1);
      expect(scope.accessibleDatasets).toHaveLength(1);
      expect(scope.policyIds).toHaveLength(1);
    });

    it("should set hasActiveContract only when status is ACTIVE", async () => {
      mockRunQuery.mockResolvedValue([
        {
          participantName: "Test Org",
          policyId: null,
          permissions: [],
          prohibitions: [],
          temporalLimit: null,
          datasetId: null,
          contractStatus: "PENDING",
          approvalStatus: null,
        },
      ]);

      const scope = await resolveOdrlScope("did:web:test:org");
      expect(scope.hasActiveContract).toBe(false);
    });

    it("should set hdabApproved only when approval status is 'approved'", async () => {
      mockRunQuery.mockResolvedValue([
        {
          participantName: "Test Org",
          policyId: null,
          permissions: [],
          prohibitions: [],
          temporalLimit: null,
          datasetId: null,
          contractStatus: null,
          approvalStatus: "pending",
        },
      ]);

      const scope = await resolveOdrlScope("did:web:test:org");
      expect(scope.hdabApproved).toBe(false);
    });

    it("should handle null datasetId and policyId rows gracefully", async () => {
      mockRunQuery.mockResolvedValue([
        {
          participantName: "Test Org",
          policyId: null,
          permissions: [],
          prohibitions: [],
          temporalLimit: null,
          datasetId: null,
          contractStatus: null,
          approvalStatus: null,
        },
      ]);

      const scope = await resolveOdrlScope("did:web:test:org");
      expect(scope.policyIds).toEqual([]);
      expect(scope.accessibleDatasets).toEqual([]);
      expect(scope.participantName).toBe("Test Org");
    });

    it("should return empty scope on Neo4j query error", async () => {
      mockRunQuery.mockRejectedValue(new Error("Connection refused"));

      const scope = await resolveOdrlScope("did:web:test:org");
      expect(scope.participantId).toBe("did:web:test:org");
      expect(scope.permissions).toEqual([]);
      expect(scope.hasActiveContract).toBe(false);
    });

    it("should use the last non-null temporalLimit from rows", async () => {
      mockRunQuery.mockResolvedValue([
        {
          participantName: "Test Org",
          policyId: "p1",
          permissions: [],
          prohibitions: [],
          temporalLimit: "2026-06-01",
          datasetId: null,
          contractStatus: null,
          approvalStatus: null,
        },
        {
          participantName: "Test Org",
          policyId: "p2",
          permissions: [],
          prohibitions: [],
          temporalLimit: "2027-12-31",
          datasetId: null,
          contractStatus: null,
          approvalStatus: null,
        },
      ]);

      const scope = await resolveOdrlScope("did:web:test:org");
      // Last non-null temporal limit wins
      expect(scope.temporalLimit).toBe("2027-12-31");
    });
  });
});
