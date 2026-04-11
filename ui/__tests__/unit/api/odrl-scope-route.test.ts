/**
 * Unit tests for GET /api/odrl/scope (Phase 24)
 *
 * Tests the ODRL scope API endpoint that returns the caller's
 * effective ODRL permissions, prohibitions, and accessible datasets.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/neo4j", () => ({
  runQuery: vi.fn(),
}));

// Override global auth-guard mock to control per-test
vi.mock("@/lib/auth-guard", () => ({
  requireAuth: vi.fn(),
  isAuthError: vi.fn(),
}));

// Mock odrl-engine
vi.mock("@/lib/odrl-engine", () => ({
  resolveOdrlScope: vi.fn(),
  userToParticipantId: vi.fn(),
}));

import { requireAuth, isAuthError } from "@/lib/auth-guard";
import { resolveOdrlScope, userToParticipantId } from "@/lib/odrl-engine";
import { GET } from "@/app/api/odrl/scope/route";
import { NextResponse } from "next/server";

const mockRequireAuth = vi.mocked(requireAuth);
const mockIsAuthError = vi.mocked(isAuthError);
const mockResolveOdrlScope = vi.mocked(resolveOdrlScope);
const mockUserToParticipantId = vi.mocked(userToParticipantId);

describe("GET /api/odrl/scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 401 when not authenticated", async () => {
    const errorResp = NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 },
    );
    mockRequireAuth.mockResolvedValue(errorResp);
    mockIsAuthError.mockReturnValue(true);

    const response = await GET();
    expect(response.status).toBe(401);
  });

  it("should return ODRL scope for authenticated user", async () => {
    const session = {
      session: {
        user: { id: "u1", name: "Researcher", email: "researcher@pharmaco.de" },
        roles: ["DATA_USER"],
        accessToken: "tok",
      },
    };
    mockRequireAuth.mockResolvedValue(session);
    mockIsAuthError.mockReturnValue(false);
    mockUserToParticipantId.mockReturnValue("did:web:pharmaco.de:research");
    mockResolveOdrlScope.mockResolvedValue({
      participantId: "did:web:pharmaco.de:research",
      participantName: "PharmaCo Research AG",
      permissions: ["scientific_research", "statistics"],
      prohibitions: ["re_identification"],
      accessibleDatasets: ["ds-001"],
      temporalLimit: "2027-12-31",
      policyIds: ["policy-1"],
      hasActiveContract: true,
      hdabApproved: true,
    });

    const response = await GET();
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.participantId).toBe("did:web:pharmaco.de:research");
    expect(data.permissions).toContain("scientific_research");
    expect(data.prohibitions).toContain("re_identification");
    expect(data.accessibleDatasets).toContain("ds-001");
    expect(data.hasActiveContract).toBe(true);
    expect(data.hdabApproved).toBe(true);
  });

  it("should use email for participant ID resolution when available", async () => {
    const session = {
      session: {
        user: { id: "u1", name: "Researcher", email: "researcher@pharmaco.de" },
        roles: ["DATA_USER"],
        accessToken: "tok",
      },
    };
    mockRequireAuth.mockResolvedValue(session);
    mockIsAuthError.mockReturnValue(false);
    mockUserToParticipantId.mockReturnValue("did:web:pharmaco.de:research");
    mockResolveOdrlScope.mockResolvedValue({
      participantId: "did:web:pharmaco.de:research",
      participantName: "PharmaCo Research AG",
      permissions: [],
      prohibitions: [],
      accessibleDatasets: [],
      temporalLimit: null,
      policyIds: [],
      hasActiveContract: false,
      hdabApproved: false,
    });

    await GET();

    // Should prefer email over name for participant resolution
    expect(mockUserToParticipantId).toHaveBeenCalledWith(
      "researcher@pharmaco.de",
      ["DATA_USER"],
    );
  });

  it("should fall back to name when email is null", async () => {
    const session = {
      session: {
        user: { id: "u1", name: "Admin User", email: null },
        roles: ["EDC_ADMIN"],
        accessToken: "tok",
      },
    };
    mockRequireAuth.mockResolvedValue(session);
    mockIsAuthError.mockReturnValue(false);
    mockUserToParticipantId.mockReturnValue("did:web:unknown:Admin User");
    mockResolveOdrlScope.mockResolvedValue({
      participantId: "did:web:unknown:Admin User",
      participantName: "Admin User",
      permissions: [],
      prohibitions: [],
      accessibleDatasets: [],
      temporalLimit: null,
      policyIds: [],
      hasActiveContract: false,
      hdabApproved: false,
    });

    await GET();

    expect(mockUserToParticipantId).toHaveBeenCalledWith("Admin User", [
      "EDC_ADMIN",
    ]);
  });

  it("should fall back to user id when both email and name are null", async () => {
    const session = {
      session: {
        user: { id: "user-123", name: null, email: null },
        roles: [],
        accessToken: "tok",
      },
    };
    mockRequireAuth.mockResolvedValue(session);
    mockIsAuthError.mockReturnValue(false);
    mockUserToParticipantId.mockReturnValue("did:web:unknown:user-123");
    mockResolveOdrlScope.mockResolvedValue({
      participantId: "did:web:unknown:user-123",
      participantName: "user-123",
      permissions: [],
      prohibitions: [],
      accessibleDatasets: [],
      temporalLimit: null,
      policyIds: [],
      hasActiveContract: false,
      hdabApproved: false,
    });

    await GET();

    expect(mockUserToParticipantId).toHaveBeenCalledWith("user-123", []);
  });
});
