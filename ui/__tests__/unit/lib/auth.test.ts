/**
 * Tests for /lib/auth.ts — hasRole, Roles, authOptions.
 */
import { describe, it, expect } from "vitest";
import { hasRole, Roles, authOptions } from "@/lib/auth";

describe("lib/auth", () => {
  describe("hasRole", () => {
    it("should return true when role is present", () => {
      expect(
        hasRole(["EDC_ADMIN", "EDC_USER_PARTICIPANT"], Roles.EDC_ADMIN),
      ).toBe(true);
    });

    it("should return false when role is absent", () => {
      expect(hasRole(["EDC_USER_PARTICIPANT"], Roles.EDC_ADMIN)).toBe(false);
    });

    it("should return false when roles is undefined", () => {
      expect(hasRole(undefined, Roles.EDC_ADMIN)).toBe(false);
    });

    it("should return false when roles is empty array", () => {
      expect(hasRole([], Roles.HDAB_AUTHORITY)).toBe(false);
    });
  });

  describe("Roles constant", () => {
    it("should define all expected health dataspace roles", () => {
      expect(Roles.EDC_ADMIN).toBe("EDC_ADMIN");
      expect(Roles.EDC_USER_PARTICIPANT).toBe("EDC_USER_PARTICIPANT");
      expect(Roles.HDAB_AUTHORITY).toBe("HDAB_AUTHORITY");
    });
  });

  describe("authOptions", () => {
    it("should have keycloak provider configured", () => {
      expect(authOptions.providers).toHaveLength(1);
      expect((authOptions.providers[0] as { id: string }).id).toBe("keycloak");
    });

    it("should use JWT session strategy", () => {
      expect(authOptions.session?.strategy).toBe("jwt");
    });

    it("should have custom sign-in page", () => {
      expect(authOptions.pages?.signIn).toBe("/auth/signin");
    });

    it("should have jwt and session callbacks", () => {
      expect(authOptions.callbacks?.jwt).toBeDefined();
      expect(authOptions.callbacks?.session).toBeDefined();
    });

    it("should have issuer set to Keycloak public URL", () => {
      const provider = authOptions.providers[0] as unknown as Record<
        string,
        unknown
      >;
      expect(provider.issuer).toBeDefined();
      expect(typeof provider.issuer).toBe("string");
    });

    it("should have idToken enabled", () => {
      const provider = authOptions.providers[0] as unknown as Record<
        string,
        unknown
      >;
      expect(provider.idToken).toBe(true);
    });

    it("should have explicit OIDC endpoints (no wellKnown auto-discovery)", () => {
      const provider = authOptions.providers[0] as unknown as Record<
        string,
        unknown
      >;
      expect(provider.authorization).toBeDefined();
      expect(provider.token).toBeDefined();
      expect(provider.userinfo).toBeDefined();
      expect(provider.jwks_endpoint).toBeDefined();
      expect(provider.wellKnown).toBeUndefined();
    });

    it("should use PKCE and state checks", () => {
      const provider = authOptions.providers[0] as unknown as Record<
        string,
        unknown
      >;
      expect(provider.checks).toContain("pkce");
      expect(provider.checks).toContain("state");
    });

    it("should set session maxAge to 8 hours", () => {
      expect(authOptions.session?.maxAge).toBe(8 * 60 * 60);
    });
  });
});
