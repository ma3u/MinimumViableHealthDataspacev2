/**
 * Tests for Keycloak realm configuration — client scopes, users, and OAuth flow.
 *
 * Validates the keycloak-realm.json configuration matches what the auth.ts
 * provider expects:
 *   - Client "health-dataspace-ui" is confidential (client secret + PKCE S256)
 *   - Default client scopes include "profile" and "email"
 *   - Three health dataspace users exist with correct roles
 *   - Redirect URIs match the NEXTAUTH_URL callback path
 *   - realm-roles protocol mapper exposes roles in tokens
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

// Load the Keycloak realm JSON
const realmPath = path.resolve(
  __dirname,
  "../../../../jad/keycloak-realm.json",
);
const realm = JSON.parse(fs.readFileSync(realmPath, "utf-8"));

describe("Keycloak realm configuration", () => {
  describe("realm basics", () => {
    it("should use 'edcv' realm name", () => {
      expect(realm.realm).toBe("edcv");
    });

    it("should be enabled", () => {
      expect(realm.enabled).toBe(true);
    });

    it("should have SSL set to none for dev", () => {
      expect(realm.sslRequired).toBe("none");
    });
  });

  describe("health dataspace roles", () => {
    const roleNames = realm.roles.realm.map((r: { name: string }) => r.name);

    it("should define EDC_ADMIN role", () => {
      expect(roleNames).toContain("EDC_ADMIN");
    });

    it("should define EDC_USER_PARTICIPANT role", () => {
      expect(roleNames).toContain("EDC_USER_PARTICIPANT");
    });

    it("should define HDAB_AUTHORITY role", () => {
      expect(roleNames).toContain("HDAB_AUTHORITY");
    });

    it("should define DATA_HOLDER role", () => {
      expect(roleNames).toContain("DATA_HOLDER");
    });

    it("should define DATA_USER role", () => {
      expect(roleNames).toContain("DATA_USER");
    });

    it("should define PATIENT role", () => {
      expect(roleNames).toContain("PATIENT");
    });

    it("should define TRUST_CENTER_OPERATOR role", () => {
      expect(roleNames).toContain("TRUST_CENTER_OPERATOR");
    });

    it("should define admin, provisioner, and participant base roles", () => {
      expect(roleNames).toContain("admin");
      expect(roleNames).toContain("provisioner");
      expect(roleNames).toContain("participant");
    });
  });

  describe("client scopes", () => {
    const scopeNames = realm.clientScopes.map((s: { name: string }) => s.name);

    it("should define 'profile' scope", () => {
      expect(scopeNames).toContain("profile");
    });

    it("should define 'email' scope", () => {
      expect(scopeNames).toContain("email");
    });

    it("should define EDC-V and CFM API scopes", () => {
      expect(scopeNames).toContain("management-api:read");
      expect(scopeNames).toContain("management-api:write");
      expect(scopeNames).toContain("identity-api:read");
      expect(scopeNames).toContain("identity-api:write");
      expect(scopeNames).toContain("issuer-admin-api:read");
      expect(scopeNames).toContain("issuer-admin-api:write");
    });

    it("profile scope should have username and full name mappers", () => {
      const profileScope = realm.clientScopes.find(
        (s: { name: string }) => s.name === "profile",
      );
      expect(profileScope).toBeDefined();
      const mapperNames = profileScope.protocolMappers.map(
        (m: { name: string }) => m.name,
      );
      expect(mapperNames).toContain("username");
      expect(mapperNames).toContain("full name");
    });

    it("email scope should have email mapper", () => {
      const emailScope = realm.clientScopes.find(
        (s: { name: string }) => s.name === "email",
      );
      expect(emailScope).toBeDefined();
      const mapperNames = emailScope.protocolMappers.map(
        (m: { name: string }) => m.name,
      );
      expect(mapperNames).toContain("email");
    });
  });

  describe("health-dataspace-ui client", () => {
    const client = realm.clients.find(
      (c: { clientId: string }) => c.clientId === "health-dataspace-ui",
    );

    it("should exist", () => {
      expect(client).toBeDefined();
    });

    it("should be a confidential client (client secret, not public)", () => {
      expect(client.publicClient).toBe(false);
    });

    it("should have a client secret configured", () => {
      expect(client.secret).toBe("health-dataspace-ui-secret");
    });

    it("should have standard flow enabled (authorization code)", () => {
      expect(client.standardFlowEnabled).toBe(true);
    });

    it("should have direct access grants enabled (for testing)", () => {
      expect(client.directAccessGrantsEnabled).toBe(true);
    });

    it("should have PKCE S256 configured (confidential + PKCE for defense-in-depth)", () => {
      expect(client.attributes?.["pkce.code.challenge.method"]).toBe("S256");
    });

    it("should have correct redirect URIs for NextAuth callback", () => {
      expect(client.redirectUris).toContain(
        "http://localhost:3000/api/auth/callback/keycloak",
      );
      expect(client.redirectUris).toContain("http://localhost:3000/*");
    });

    it("should have web origins configured for CORS", () => {
      expect(client.webOrigins).toContain("http://localhost:3000");
      expect(client.webOrigins).toContain("+");
    });

    it("should have profile and email as default client scopes", () => {
      expect(client.defaultClientScopes).toContain("profile");
      expect(client.defaultClientScopes).toContain("email");
    });

    it("should NOT include 'openid' in defaultClientScopes (implicit in OIDC)", () => {
      // 'openid' is always implicitly granted for OIDC protocol clients
      // listing it explicitly causes errors in some Keycloak versions
      expect(client.defaultClientScopes).not.toContain("openid");
    });

    it("should have realm-roles protocol mapper for JWT role claims", () => {
      const roleMapper = client.protocolMappers?.find(
        (m: { name: string }) => m.name === "realm-roles",
      );
      expect(roleMapper).toBeDefined();
      expect(roleMapper.protocolMapper).toBe(
        "oidc-usermodel-realm-role-mapper",
      );
      expect(roleMapper.config["claim.name"]).toBe("realm_access.roles");
      expect(roleMapper.config["access.token.claim"]).toBe("true");
      expect(roleMapper.config["userinfo.token.claim"]).toBe("true");
    });
  });

  describe("users", () => {
    const users = realm.users;

    it("should have all 7 demo personas", () => {
      expect(users).toHaveLength(7);
    });

    it("edcadmin user should have EDC_ADMIN role", () => {
      const user = users.find(
        (u: { username: string }) => u.username === "edcadmin",
      );
      expect(user).toBeDefined();
      expect(user.enabled).toBe(true);
      expect(user.email).toBe("admin@health-dataspace.local");
      expect(user.realmRoles).toContain("EDC_ADMIN");
      expect(user.credentials).toHaveLength(1);
      expect(user.credentials[0].temporary).toBe(false);
    });

    it("clinicuser should have EDC_USER_PARTICIPANT and DATA_HOLDER roles", () => {
      const user = users.find(
        (u: { username: string }) => u.username === "clinicuser",
      );
      expect(user).toBeDefined();
      expect(user.enabled).toBe(true);
      expect(user.email).toBe("clinic@health-dataspace.local");
      expect(user.realmRoles).toContain("EDC_USER_PARTICIPANT");
      expect(user.realmRoles).toContain("DATA_HOLDER");
    });

    it("researcher should have EDC_USER_PARTICIPANT and DATA_USER roles", () => {
      const user = users.find(
        (u: { username: string }) => u.username === "researcher",
      );
      expect(user).toBeDefined();
      expect(user.enabled).toBe(true);
      expect(user.email).toBe("researcher@pharmaco.de");
      expect(user.realmRoles).toContain("EDC_USER_PARTICIPANT");
      expect(user.realmRoles).toContain("DATA_USER");
    });

    it("regulator should have HDAB_AUTHORITY role", () => {
      const user = users.find(
        (u: { username: string }) => u.username === "regulator",
      );
      expect(user).toBeDefined();
      expect(user.enabled).toBe(true);
      expect(user.email).toBe("regulator@health-dataspace.local");
      expect(user.realmRoles).toContain("HDAB_AUTHORITY");
    });

    it("lmcuser should have EDC_USER_PARTICIPANT and DATA_HOLDER roles", () => {
      const user = users.find(
        (u: { username: string }) => u.username === "lmcuser",
      );
      expect(user).toBeDefined();
      expect(user.enabled).toBe(true);
      expect(user.realmRoles).toContain("EDC_USER_PARTICIPANT");
      expect(user.realmRoles).toContain("DATA_HOLDER");
    });

    it("patient1 should have PATIENT role", () => {
      const user = users.find(
        (u: { username: string }) => u.username === "patient1",
      );
      expect(user).toBeDefined();
      expect(user.enabled).toBe(true);
      expect(user.realmRoles).toContain("PATIENT");
    });

    it("patient2 should have PATIENT role", () => {
      const user = users.find(
        (u: { username: string }) => u.username === "patient2",
      );
      expect(user).toBeDefined();
      expect(user.enabled).toBe(true);
      expect(user.realmRoles).toContain("PATIENT");
    });

    it("all users should have non-temporary passwords", () => {
      for (const user of users) {
        expect(user.credentials[0].temporary).toBe(false);
      }
    });
  });

  describe("admin client", () => {
    const admin = realm.clients.find(
      (c: { clientId: string }) => c.clientId === "admin",
    );

    it("should exist as a confidential service-account client", () => {
      expect(admin).toBeDefined();
      expect(admin.publicClient).toBe(false);
      expect(admin.serviceAccountsEnabled).toBe(true);
    });

    it("should have management and identity API scopes", () => {
      expect(admin.defaultClientScopes).toContain("management-api:read");
      expect(admin.defaultClientScopes).toContain("management-api:write");
    });
  });
});
