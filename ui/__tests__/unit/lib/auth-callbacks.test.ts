/**
 * Tests for auth.ts — JWT & session callbacks coverage
 */
import { describe, it, expect, vi } from "vitest";
import { authOptions, hasRole, Roles } from "@/lib/auth";
import type { Session } from "next-auth";
import type { JWT } from "next-auth/jwt";

describe("authOptions callbacks", () => {
  describe("jwt callback", () => {
    const jwtCallback = authOptions.callbacks!.jwt!;

    it("extracts roles from profile on initial sign-in", async () => {
      const token: JWT = { sub: "user-1" };
      const account = {
        access_token: "at-123",
        refresh_token: "rt-456",
        type: "oauth" as const,
        provider: "keycloak",
        providerAccountId: "user-1",
      };
      const profile = {
        sub: "user-1",
        name: "Test User",
        realm_access: {
          roles: ["EDC_ADMIN", "EDC_USER_PARTICIPANT"],
        },
      };

      const result = await jwtCallback({
        token,
        account,
        profile,
        user: { id: "user-1" },
        trigger: "signIn",
      });

      expect(result.accessToken).toBe("at-123");
      expect(result.refreshToken).toBe("rt-456");
      expect(result.roles).toEqual(["EDC_ADMIN", "EDC_USER_PARTICIPANT"]);
      expect(result.sub).toBe("user-1");
    });

    it("returns token unchanged on subsequent requests", async () => {
      const token: JWT = {
        sub: "user-1",
        roles: ["EDC_ADMIN"],
        accessToken: "existing",
      };

      const result = await jwtCallback({
        token,
        user: { id: "user-1" },
        account: null,
        trigger: "update",
      });

      expect(result).toEqual(token);
    });

    it("handles profile without realm_access", async () => {
      const token: JWT = { sub: "user-2" };
      const account = {
        access_token: "at-789",
        type: "oauth" as const,
        provider: "keycloak",
        providerAccountId: "user-2",
      };
      const profile = {
        sub: "user-2",
        name: "No Roles User",
      };

      const result = await jwtCallback({
        token,
        account,
        profile,
        user: { id: "user-2" },
        trigger: "signIn",
      });

      expect(result.roles).toEqual([]);
    });
  });

  describe("session callback", () => {
    const sessionCallback = authOptions.callbacks!.session!;

    it("adds roles and user id to session", async () => {
      const session = {
        user: { id: "user-1", name: "Test", email: "test@test.com" },
        expires: "2099-01-01",
        roles: [] as string[],
      } as Session;
      const token: JWT = {
        sub: "user-1",
        roles: ["EDC_ADMIN"],
        accessToken: "at-123",
      };

      const result = await sessionCallback({
        session,
        token,
        user: { id: "user-1", email: "test@test.com", emailVerified: null },
        trigger: "update",
        newSession: undefined,
      });

      expect((result as any).roles).toEqual(["EDC_ADMIN"]);
      expect((result as any).accessToken).toBe("at-123");
      expect((result as any).user?.id).toBe("user-1");
    });

    it("handles missing roles in token", async () => {
      const session = {
        user: { id: "user-2", name: "Test" },
        expires: "2099-01-01",
        roles: [] as string[],
      } as Session;
      const token: JWT = { sub: "user-2" };

      const result = await sessionCallback({
        session,
        token,
        user: { id: "user-2", email: "test@test.com", emailVerified: null },
        trigger: "update",
        newSession: undefined,
      });

      expect((result as any).roles).toEqual([]);
    });
  });
});

describe("authOptions configuration", () => {
  it("should have 8-hour session max age", () => {
    expect(authOptions.session?.maxAge).toBe(8 * 60 * 60);
  });

  it("should configure Keycloak provider with PKCE and state checks", () => {
    const provider = authOptions.providers[0] as any;
    expect(provider.checks).toContain("pkce");
    expect(provider.checks).toContain("state");
  });

  it("should have idToken enabled", () => {
    const provider = authOptions.providers[0] as any;
    expect(provider.idToken).toBe(true);
  });

  it("should have profile callback that extracts user info", () => {
    const provider = authOptions.providers[0] as any;
    const user = provider.profile({
      sub: "uid-1",
      name: "Dr. Smith",
      email: "smith@alpha-klinik.de",
      preferred_username: "dr.smith",
    });
    expect(user.id).toBe("uid-1");
    expect(user.name).toBe("Dr. Smith");
    expect(user.email).toBe("smith@alpha-klinik.de");
  });

  it("profile callback falls back to preferred_username", () => {
    const provider = authOptions.providers[0] as any;
    const user = provider.profile({
      sub: "uid-2",
      preferred_username: "clinicuser",
      email: "clinic@alpha-klinik.de",
    });
    expect(user.name).toBe("clinicuser");
  });
});
