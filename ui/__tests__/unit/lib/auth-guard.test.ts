/**
 * Unit tests for auth-guard.ts (Phase 24)
 *
 * Tests requireAuth() and isAuthError() — the auth helpers
 * used by all API routes.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextResponse } from "next/server";

// We need to control the mocks precisely, so we override the global setup mock
vi.mock("next-auth/next", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  authOptions: {},
  Roles: {
    EDC_ADMIN: "EDC_ADMIN",
    DATA_HOLDER: "DATA_HOLDER",
    DATA_USER: "DATA_USER",
    HDAB_AUTHORITY: "HDAB_AUTHORITY",
    TRUST_CENTER_OPERATOR: "TRUST_CENTER_OPERATOR",
    PATIENT: "PATIENT",
    EDC_USER_PARTICIPANT: "EDC_USER_PARTICIPANT",
  },
}));

// Unmock auth-guard so we test the real implementation
vi.unmock("@/lib/auth-guard");

import { getServerSession } from "next-auth/next";
import { requireAuth, isAuthError } from "@/lib/auth-guard";

const mockGetServerSession = vi.mocked(getServerSession);

describe("auth-guard", () => {
  const originalEnv = process.env.NEXT_PUBLIC_STATIC_EXPORT;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.NEXT_PUBLIC_STATIC_EXPORT;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.NEXT_PUBLIC_STATIC_EXPORT = originalEnv;
    } else {
      delete process.env.NEXT_PUBLIC_STATIC_EXPORT;
    }
  });

  describe("requireAuth()", () => {
    it("should return session for authenticated user", async () => {
      mockGetServerSession.mockResolvedValue({
        user: { id: "u1", name: "Alice", email: "alice@test.com" },
        roles: ["DATA_USER"],
        accessToken: "tok-123",
      });

      const result = await requireAuth();
      expect(isAuthError(result)).toBe(false);
      if (!isAuthError(result)) {
        expect(result.session.user.name).toBe("Alice");
        expect(result.session.roles).toEqual(["DATA_USER"]);
      }
    });

    it("should return 401 when no session", async () => {
      mockGetServerSession.mockResolvedValue(null);

      const result = await requireAuth();
      expect(isAuthError(result)).toBe(true);
      expect(result).toBeInstanceOf(NextResponse);
      const resp = result as NextResponse;
      expect(resp.status).toBe(401);
      const body = await resp.json();
      expect(body.error).toBe("Unauthorized");
    });

    it("should return 403 when role is not in allowedRoles", async () => {
      mockGetServerSession.mockResolvedValue({
        user: { id: "u1", name: "Bob" },
        roles: ["DATA_USER"],
      });

      const result = await requireAuth(["EDC_ADMIN" as any]);
      expect(isAuthError(result)).toBe(true);
      const resp = result as NextResponse;
      expect(resp.status).toBe(403);
      const body = await resp.json();
      expect(body.error).toBe("Forbidden");
    });

    it("should pass when user has one of the allowed roles", async () => {
      mockGetServerSession.mockResolvedValue({
        user: { id: "u1", name: "Carol" },
        roles: ["DATA_HOLDER", "EDC_USER_PARTICIPANT"],
      });

      const result = await requireAuth([
        "DATA_HOLDER" as any,
        "EDC_ADMIN" as any,
      ]);
      expect(isAuthError(result)).toBe(false);
    });

    it("should default roles to empty array when session has no roles", async () => {
      mockGetServerSession.mockResolvedValue({
        user: { id: "u1", name: "Dave" },
      });

      const result = await requireAuth();
      expect(isAuthError(result)).toBe(false);
      if (!isAuthError(result)) {
        expect(result.session.roles).toEqual([]);
      }
    });

    it("should default accessToken to empty string when not present", async () => {
      mockGetServerSession.mockResolvedValue({
        user: { id: "u1", name: "Eve" },
        roles: ["DATA_USER"],
      });

      const result = await requireAuth();
      if (!isAuthError(result)) {
        expect(result.session.accessToken).toBe("");
      }
    });
  });

  describe("isAuthError()", () => {
    it("should return true for NextResponse", () => {
      const resp = NextResponse.json({ error: "test" }, { status: 401 });
      expect(isAuthError(resp)).toBe(true);
    });

    it("should return false for session object", () => {
      const session = {
        session: {
          user: { id: "u1" },
          roles: [],
          accessToken: "",
        },
      };
      expect(isAuthError(session as any)).toBe(false);
    });
  });
});
