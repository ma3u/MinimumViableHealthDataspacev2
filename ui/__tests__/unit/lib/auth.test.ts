/**
 * Tests for /lib/auth.ts — hasRole, Roles, authOptions.
 */
import { describe, it, expect } from "vitest";
import { hasRole, Roles, authOptions } from "@/lib/auth";
import { newSid, putTransaction, updateTransaction } from "@/lib/eudi-store";

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
    it("should have keycloak and eudi-wallet providers configured", () => {
      expect(authOptions.providers).toHaveLength(2);
      // CredentialsProvider stores its configured id under `.options`; NextAuth
      // merges it at runtime, so read the effective id from either place.
      const ids = authOptions.providers.map((p) => {
        const cfg = p as { id?: string; options?: { id?: string } };
        return cfg.options?.id ?? cfg.id;
      });
      expect(ids).toContain("keycloak");
      expect(ids).toContain("eudi-wallet");
    });

    it("should use JWT session strategy", () => {
      expect(authOptions.session?.strategy).toBe("jwt");
    });

    it("should have custom sign-in page", () => {
      expect(authOptions.pages?.signIn).toBe("/auth/signin");
    });

    it("eudi-wallet authorize mints a patient from a completed sid (single-use)", async () => {
      const sid = newSid();
      putTransaction({ sid, transactionId: "t", nonce: "n" });
      updateTransaction(sid, {
        status: "completed",
        verifiedPatient: {
          username: "patient1",
          displayName: "Erika Mustermann",
          roles: ["PATIENT"],
        },
      });
      const provider = authOptions.providers.find(
        (p) =>
          (p as { options?: { id?: string } }).options?.id === "eudi-wallet",
      ) as { options: { authorize: (c: unknown) => Promise<unknown> } };
      const authorize = provider.options.authorize;
      const user = (await authorize({ sid })) as {
        preferredUsername: string;
        roles: string[];
      } | null;
      expect(user?.preferredUsername).toBe("patient1");
      expect(user?.roles).toEqual(["PATIENT"]);
      // single-use: a second call with the same (now consumed) sid is rejected
      expect(await authorize({ sid })).toBeNull();
      // unknown / missing sid
      expect(await authorize({ sid: "nope" })).toBeNull();
      expect(await authorize({})).toBeNull();
    });

    it("jwt callback carries roles for the eudi-wallet credentials user", async () => {
      const jwt = authOptions.callbacks!.jwt!;
      const token = (await jwt({
        token: {},
        user: {
          id: "eudi:patient1",
          roles: ["PATIENT"],
          preferredUsername: "patient1",
        },
      } as never)) as { roles?: string[]; preferredUsername?: string };
      expect(token.roles).toEqual(["PATIENT"]);
      expect(token.preferredUsername).toBe("patient1");
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
