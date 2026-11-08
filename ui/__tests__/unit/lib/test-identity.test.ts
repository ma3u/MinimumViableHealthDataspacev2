/**
 * The identity forged test sessions carry (lib/test-identity.ts): the CI
 * smoke and the API collection sign in as <persona>@ci.test, and the hub
 * names them did:web:ci.test:<persona> instead of did:web:unknown:<name>.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/neo4j", () => ({ runQuery: vi.fn() }));
vi.mock("@/lib/permit-gate", () => ({ findPermits: vi.fn() }));

import { isTestIdentity, testIdentityDid } from "@/lib/test-identity";
import { userToParticipantId } from "@/lib/odrl-engine";

describe("testIdentityDid()", () => {
  it.each([
    ["participant@ci.test", "did:web:ci.test:participant"],
    ["edcadmin@CI.TEST", "did:web:ci.test:edcadmin"],
    ["Load User 7@ci.test", "did:web:ci.test:load-user-7"],
  ])("maps %s to %s", (login, did) => {
    expect(testIdentityDid(login)).toBe(did);
  });

  it.each([
    "Demo Participant",
    "researcher@pharmaco.de",
    "someone@ci.test.example",
    "@ci.test",
  ])("leaves %s alone", (login) => {
    expect(testIdentityDid(login)).toBeNull();
  });
});

describe("isTestIdentity()", () => {
  it("knows a test DID from a participant's and an unknown login's", () => {
    expect(isTestIdentity("did:web:ci.test:participant")).toBe(true);
    expect(isTestIdentity("did:web:pharmaco.de:research")).toBe(false);
    expect(isTestIdentity("did:web:unknown:Demo Participant")).toBe(false);
    expect(isTestIdentity(null)).toBe(false);
    expect(isTestIdentity(undefined)).toBe(false);
  });
});

describe("the forged sessions", () => {
  const read = (f: string) => readFileSync(path.resolve(f), "utf8");

  // loginAs() stands in for a Keycloak login where there is none (ADR-079)
  // and takes the realm user's mail; every other forged session is ci.test.
  it("the Playwright helper signs a persona in at ci.test unless it stands in for Keycloak", () => {
    const src = read("__tests__/e2e/helpers/forged-session.ts");
    expect(src).toMatch(/const TEST_MAIL_DOMAIN = "ci\.test"/);
    expect(src).toContain(": `${persona}@${TEST_MAIL_DOMAIN}`");
    expect(src).toContain("realmMail && profile.realmMail");
    const login = read("__tests__/e2e/journeys/helpers.ts");
    expect(login).toContain("signInPage(page, username, { realmMail: true })");
    for (const persona of ["participant", "edcadmin", "researcher"]) {
      expect(userToParticipantId(`${persona}@ci.test`, [])).toBe(
        `did:web:ci.test:${persona}`,
      );
    }
  });

  it("the API collection's personas are tests, the researcher acts for PharmaCo", () => {
    const src = read("scripts/forge-bruno-session.mjs");
    const mails = [...src.matchAll(/email: "([^"]+)"/g)].map((m) => m[1]);
    expect(mails.length).toBe(6);
    const dids = Object.fromEntries(
      mails.map((m) => [m.split("@")[0], userToParticipantId(m, [])]),
    );
    expect(dids).toEqual({
      edcadmin: "did:web:ci.test:edcadmin",
      clinicuser: "did:web:ci.test:clinicuser",
      lmcuser: "did:web:ci.test:lmcuser",
      // The permit journey applies and answers findings as PharmaCo.
      researcher: "did:web:pharmaco.de:research",
      regulator: "did:web:ci.test:regulator",
      patient1: "did:web:ci.test:patient1",
    });
    expect(Object.values(dids).some((d) => d.includes(":unknown:"))).toBe(
      false,
    );
  });

  it("keeps each Bruno persona's roles", () => {
    const src = read("scripts/forge-bruno-session.mjs");
    const roles = [...src.matchAll(/roles: \[([^\]]*)\]/g)].map((m) => m[1]);
    expect(roles).toEqual([
      '"EDC_ADMIN"',
      '"EDC_USER_PARTICIPANT", "DATA_HOLDER"',
      '"EDC_USER_PARTICIPANT", "DATA_HOLDER"',
      '"EDC_USER_PARTICIPANT", "DATA_USER"',
      '"HDAB_AUTHORITY"',
      '"PATIENT"',
    ]);
  });
});
