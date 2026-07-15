import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Regression tests for jad/keycloak-realm.json — the realm definition that
 * scripts/azure/06-post-deploy.sh imports into the live Keycloak.
 *
 * Incident (2026-07-15): a realm re-import overwrote the health-dataspace-ui
 * client with localhost-only redirectUris, so every production login on
 * https://ehds.mabu.red failed with Keycloak's "Invalid parameter:
 * redirect_uri" page before ever reaching the UI. These tests pin the
 * production URIs into the realm file so a re-import can no longer regress
 * the deployed client.
 */

const PROD_ORIGIN = "https://ehds.mabu.red";
const ACA_ORIGIN =
  "https://mvhd-ui.happysand-37f82e30.westeurope.azurecontainerapps.io";
const NEXTAUTH_CALLBACK_PATH = "/api/auth/callback/keycloak";

interface RealmClient {
  clientId: string;
  publicClient?: boolean;
  standardFlowEnabled?: boolean;
  redirectUris?: string[];
  webOrigins?: string[];
  attributes?: Record<string, string>;
}

const realm = JSON.parse(
  readFileSync(join(__dirname, "../../../../jad/keycloak-realm.json"), "utf-8"),
) as { realm: string; clients: RealmClient[] };

const uiClient = realm.clients.find(
  (c) => c.clientId === "health-dataspace-ui",
);

describe("keycloak-realm.json — health-dataspace-ui client", () => {
  it("defines the health-dataspace-ui client in the edcv realm", () => {
    expect(realm.realm).toBe("edcv");
    expect(uiClient).toBeDefined();
    expect(uiClient?.standardFlowEnabled).toBe(true);
  });

  it.each([
    `${PROD_ORIGIN}${NEXTAUTH_CALLBACK_PATH}`,
    `${PROD_ORIGIN}/*`,
    `${ACA_ORIGIN}/*`,
  ])(
    "allows the production redirect URI %s (regression: invalid_redirect_uri on ehds.mabu.red)",
    (uri) => {
      expect(uiClient?.redirectUris).toContain(uri);
    },
  );

  it.each([
    `http://localhost:3000${NEXTAUTH_CALLBACK_PATH}`,
    "http://localhost:3000/*",
    `http://localhost:3003${NEXTAUTH_CALLBACK_PATH}`,
    "http://localhost:3003/*",
  ])("keeps the local-dev redirect URI %s", (uri) => {
    expect(uiClient?.redirectUris).toContain(uri);
  });

  it("lists production and local origins in webOrigins", () => {
    for (const origin of [
      PROD_ORIGIN,
      ACA_ORIGIN,
      "http://localhost:3000",
      "http://localhost:3003",
    ]) {
      expect(uiClient?.webOrigins).toContain(origin);
    }
  });

  it("allows post-logout redirects to the production domain", () => {
    const postLogout =
      uiClient?.attributes?.["post.logout.redirect.uris"] ?? "";
    expect(postLogout.split("##")).toContain(`${PROD_ORIGIN}/*`);
  });

  it("stays a confidential client with PKCE S256 (CLAUDE.md gotcha #6)", () => {
    expect(uiClient?.publicClient).toBe(false);
    expect(uiClient?.attributes?.["pkce.code.challenge.method"]).toBe("S256");
  });
});
