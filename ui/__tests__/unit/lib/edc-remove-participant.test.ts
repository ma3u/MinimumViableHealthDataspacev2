/**
 * Removing a participant the hub onboarded (ADR-085 step 3): only one with
 * `registeredAt`, the control plane context last, every step reported.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/edc", () => ({
  edcClient: { management: vi.fn(), identity: vi.fn(), issuer: vi.fn() },
  EDC_CONTEXT: "https://w3id.org/edc/connector/management/v2",
}));

import { edcClient } from "@/lib/edc";
import {
  removeParticipant,
  ParticipantNotFound,
  RemovalRefused,
} from "@/lib/edc/remove-participant";

const mgmt = vi.mocked(edcClient.management);
const identity = vi.mocked(edcClient.identity);
const issuer = vi.mocked(edcClient.issuer);

const CTX = "0951dd2770125b4f8d7bf0c145519105";
const DID = "did:web:identityhub%3A7083:pharmaco-research-ag-test-f17d7f";
const notFound = (what: string) =>
  new Error(`EDC API error [${what}] DELETE /x: 404 Not Found\nno body`);

function onboarded(extra: Record<string, unknown> = {}) {
  return {
    "@id": CTX,
    identity: DID,
    state: "CREATED",
    properties: { displayName: "PharmaCo test", registeredAt: "2026-11-09" },
    ...extra,
  };
}

describe("removeParticipant", () => {
  let order: string[];

  beforeEach(() => {
    order = [];
    mgmt.mockReset();
    identity.mockReset();
    issuer.mockReset();
    vi.stubEnv("CFM_TENANT_URL", "");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        order.push(`siglet ${url.split("/").slice(-2).join("/")}`);
        return new Response(null, { status: 404 });
      }),
    );
    mgmt.mockImplementation(async (path: string, method?: string) => {
      if (!method || method === "GET") return onboarded();
      order.push(`mgmt ${method} ${path}`);
      return undefined;
    });
    identity.mockImplementation(async (path: string, method?: string) => {
      order.push(`identity ${method} ${path}`);
      return undefined;
    });
    issuer.mockImplementation(async (path: string, method?: string) => {
      if (path.endsWith("/holders/query")) return [];
      order.push(`issuer ${method} ${path}`);
      return undefined;
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("removes holder, IdentityHub participant, then the context", async () => {
    const result = await removeParticipant(CTX);

    expect(order).toEqual([
      `issuer DELETE /v1/participants/issuer/holders/${CTX}`,
      `identity DELETE /v1/participants/${CTX}`,
      `mgmt DELETE /v5/participants/${CTX}`,
    ]);
    expect(result).toMatchObject({ contextId: CTX, did: DID });
    expect(result.steps.every((s) => s.ok)).toBe(true);
  });

  it("refuses a seeded participant and touches nothing", async () => {
    mgmt.mockImplementation(async () => ({
      "@id": CTX,
      identity: "did:web:identityhub%3A7083:alpha-klinik",
      properties: {},
    }));

    await expect(removeParticipant(CTX)).rejects.toBeInstanceOf(RemovalRefused);
    expect(order).toEqual([]);
    expect(identity).not.toHaveBeenCalled();
    expect(issuer).not.toHaveBeenCalled();
  });

  it("answers ParticipantNotFound for an unknown context", async () => {
    mgmt.mockRejectedValue(notFound("management"));

    await expect(removeParticipant("nope")).rejects.toBeInstanceOf(
      ParticipantNotFound,
    );
  });

  it("counts a step whose target is already gone as done, and goes on", async () => {
    identity.mockRejectedValue(notFound("identity"));

    const result = await removeParticipant(CTX);

    expect(
      result.steps.find((s) => s.step === "IdentityHub participant"),
    ).toEqual({
      step: "IdentityHub participant",
      ok: true,
      detail: "not there",
    });
    expect(order).toContain(`mgmt DELETE /v5/participants/${CTX}`);
  });

  it("reports a failed step and still removes the context", async () => {
    identity.mockRejectedValue(
      new Error("EDC API error [identity] DELETE: 500 boom"),
    );

    const result = await removeParticipant(CTX);

    const step = result.steps.find((s) => s.step === "IdentityHub participant");
    expect(step?.ok).toBe(false);
    expect(order).toContain(`mgmt DELETE /v5/participants/${CTX}`);
  });

  it("reports a holder keyed by the DID that the API cannot delete", async () => {
    issuer.mockImplementation(async (path: string, method?: string) => {
      if (path.endsWith("/holders/query")) return [{ holderId: DID, did: DID }];
      if (method === "DELETE") throw notFound("issuer");
      return undefined;
    });

    const result = await removeParticipant(CTX);

    expect(
      result.steps.find((s) => s.step === "issuer holder keyed by DID")?.ok,
    ).toBe(false);
  });

  it("with CFM_TENANT_URL set, removes the CFM profile and tenant first", async () => {
    vi.stubEnv("CFM_TENANT_URL", "http://tm:8080/api");
    vi.stubEnv("CFM_CLIENT_SECRET", "test-only");
    const tmCalls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const method = init?.method || "GET";
        if (url.includes("/token"))
          return new Response(JSON.stringify({ access_token: "tok" }));
        if (url.startsWith("http://tm:8080/api")) {
          const path = url.slice("http://tm:8080/api".length);
          tmCalls.push(`${method} ${path}`);
          if (path === "/v1alpha1/tenants")
            return new Response(JSON.stringify([{ id: "t1" }]));
          if (path === "/v1alpha1/tenants/t1/participant-profiles")
            return new Response(
              JSON.stringify([{ id: "p1", identifier: DID }]),
            );
          return new Response(null, {
            status: method === "DELETE" ? 202 : 200,
          });
        }
        return new Response(null, { status: 404 });
      }),
    );

    const result = await removeParticipant(CTX);

    expect(tmCalls).toEqual([
      "GET /v1alpha1/tenants",
      "GET /v1alpha1/tenants/t1/participant-profiles",
      "DELETE /v1alpha1/tenants/t1/participant-profiles/p1",
      "DELETE /v1alpha1/tenants/t1",
    ]);
    expect(result.steps.slice(0, 2).map((s) => s.step)).toEqual([
      "CFM participant profile",
      "CFM tenant",
    ]);
    expect(result.steps.map((s) => s.step)).toContain(
      "siglet transfer type mapping",
    );
    expect(order).toContain(`mgmt DELETE /v5/participants/${CTX}`);
  });
});
