/**
 * Provisioning through CFM 0.0.7's Tenant Manager (ADR-085), behind
 * CFM_TENANT_URL: tenant, participant profile, wait for the agents, then the
 * control plane context by its DID.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/edc", () => ({
  edcClient: { management: vi.fn(), identity: vi.fn(), issuer: vi.fn() },
  EDC_CONTEXT: "https://w3id.org/edc/connector/management/v2",
}));

import { edcClient } from "@/lib/edc";
import { ProvisioningError } from "@/lib/edc/provision";
import {
  cfmProvisioning,
  cfmStatesByDid,
  provisionThroughCfm,
} from "@/lib/edc/cfm-provision";

const mgmt = vi.mocked(edcClient.management);
const TM = "http://cfm7-tmanager:8080/api";

type Answer = { status?: number; body: unknown };

/** A fetch that answers by "METHOD path" and records every request. */
function stubFetch(routes: Record<string, Answer | Answer[]>) {
  const requests: { key: string; body?: unknown }[] = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method || "GET";
    const path = url.startsWith(TM) ? url.slice(TM.length) : url;
    const key = `${method} ${path.includes("/token") ? "token" : path}`;
    requests.push({
      key,
      body:
        typeof init?.body === "string" && init.body.startsWith("{")
          ? JSON.parse(init.body)
          : undefined,
    });
    const route = routes[key];
    const answer = Array.isArray(route)
      ? route.length > 1
        ? route.shift()!
        : route[0]
      : route;
    if (!answer) return new Response("no route " + key, { status: 599 });
    return new Response(JSON.stringify(answer.body), {
      status: answer.status ?? 200,
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return requests;
}

const TENANT = "t-1";
const PROFILE = "p-1";
const PROFILE_PATH = `/v1alpha1/tenants/${TENANT}/participant-profiles/${PROFILE}`;
const vpas = (state: string) => [
  { type: "cfm.connector", state },
  { type: "cfm.credentialservice", state },
];

describe("provisionThroughCfm", () => {
  beforeEach(() => {
    vi.stubEnv("CFM_TENANT_URL", TM);
    vi.stubEnv("CFM_CLIENT_SECRET", "test-only");
    vi.stubEnv("CFM_DEPLOY_POLL_MS", "1");
    vi.stubEnv("CFM_DEPLOY_TIMEOUT_MS", "200");
    mgmt.mockReset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("is on only when CFM_TENANT_URL is set", () => {
    expect(cfmProvisioning()).toBe(true);
    vi.stubEnv("CFM_TENANT_URL", "");
    expect(cfmProvisioning()).toBe(false);
  });

  it("deploys a profile, waits for the agents and returns the context", async () => {
    const requests = stubFetch({
      "POST token": { body: { access_token: "tok" } },
      "GET /v1alpha1/dataspace-profiles": { body: [{ id: "ds-1" }] },
      "POST /v1alpha1/tenants": { body: { id: TENANT } },
      [`POST /v1alpha1/tenants/${TENANT}/participant-profiles`]: {
        body: { id: PROFILE },
      },
      [`GET ${PROFILE_PATH}`]: [
        { body: { id: PROFILE, vpas: vpas("pending") } },
        { body: { id: PROFILE, vpas: vpas("active") } },
      ],
    });
    // the DID is generated; the control plane lists the one it was deployed for
    const written: Record<string, unknown>[] = [];
    mgmt.mockImplementation(
      async (path: string, method?: string, body?: unknown) => {
        const deployed = requests.find((r) =>
          r.key.endsWith("/participant-profiles"),
        )?.body as { identifier: string };
        if (path === "/v5/participants") {
          return [
            { "@id": "other", identity: "did:web:elsewhere" },
            { "@id": "ctx-1", identity: deployed.identifier },
          ];
        }
        if (method === "PUT") {
          written.push(body as Record<string, unknown>);
          return undefined;
        }
        // getContext before the properties are written
        return {
          "@id": "ctx-1",
          identity: deployed.identifier,
          state: "CREATED",
          properties: {},
        };
      },
    );

    const result = await provisionThroughCfm({
      displayName: "Limburg Medical Centre",
      role: "DATA_HOLDER",
    });

    expect(result.contextId).toBe("ctx-1");
    expect(result.did).toMatch(/^did:web:identityhub%3A7083:/);
    expect(result.steps.map((s) => s.step)).toEqual([
      "CFM tenant",
      "CFM participant profile",
      "CFM orchestration",
      "control plane context",
      "context properties",
    ]);
    expect(written[0]?.properties).toMatchObject({
      displayName: "Limburg Medical Centre",
      role: "DATA_HOLDER",
    });
    expect(
      (written[0]?.properties as Record<string, unknown>).registeredAt,
    ).toEqual(expect.any(String));
    const deploy = requests.find((r) => r.key.endsWith("/participant-profiles"))
      ?.body as Record<string, any>;
    expect(deploy.dataspaceProfileIds).toEqual(["ds-1"]);
    expect(deploy.participantRoles).toEqual({ "ds-1": ["participant"] });
    expect(deploy.vpaProperties["cfm.connector"].dataspaceProfiles).toEqual([
      "http-dsp-profile-2025-1",
    ]);
    expect(deploy.vpaProperties["cfm.issuer"].id).toBe(result.did);
    expect(
      deploy.vpaProperties["cfm.dataplane"].transferTypeMappings[
        "HttpData-PULL"
      ],
    ).toMatchObject({ endpointType: "HTTP", tokenSource: "provider" });
  });

  it("fails with the profile's error when an agent fails", async () => {
    stubFetch({
      "POST token": { body: { access_token: "tok" } },
      "GET /v1alpha1/dataspace-profiles": { body: [{ id: "ds-1" }] },
      "POST /v1alpha1/tenants": { body: { id: TENANT } },
      [`POST /v1alpha1/tenants/${TENANT}/participant-profiles`]: {
        body: { id: PROFILE },
      },
      [`GET ${PROFILE_PATH}`]: {
        body: {
          id: PROFILE,
          error: true,
          errorDetail: "siglet refused",
          vpas: vpas("error"),
        },
      },
    });

    const err = await provisionThroughCfm({
      displayName: "AlphaKlinik Berlin",
      role: "DATA_HOLDER",
    }).catch((e) => e);
    expect(err).toBeInstanceOf(ProvisioningError);
    expect(err.message).toContain("siglet refused");
    expect(mgmt).not.toHaveBeenCalled();
  });

  it("calls a Tenant Manager that does not answer unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/token"))
          return new Response(JSON.stringify({ access_token: "tok" }));
        throw new TypeError("fetch failed");
      }),
    );

    const err = await provisionThroughCfm({
      displayName: "PharmaCo Research AG",
      role: "DATA_USER",
    }).catch((e) => e);
    expect(err).toBeInstanceOf(ProvisioningError);
    expect(err.unreachable).toBe(true);
  });
});

describe("cfmStatesByDid", () => {
  const DID_A = "did:web:identityhub%3A7083:hospital-a";
  const DID_B = "did:web:identityhub%3A7083:research-b";
  const DID_C = "did:web:identityhub%3A7083:hdab-c";

  beforeEach(() => {
    vi.stubEnv("CFM_TENANT_URL", TM);
    vi.stubEnv("CFM_CLIENT_SECRET", "test-only");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("reads every tenant's profiles and keys their state by DID", async () => {
    stubFetch({
      "POST token": { body: { access_token: "tok" } },
      "GET /v1alpha1/tenants": { body: [{ id: "t-1" }, { id: "t-2" }] },
      "GET /v1alpha1/tenants/t-1/participant-profiles": {
        body: [
          { id: "p-old", identifier: DID_A, vpas: vpas("disposed") },
          { id: "p-a", identifier: DID_A, vpas: vpas("active") },
          { id: "p-b", identifier: DID_B, vpas: vpas("pending") },
        ],
      },
      "GET /v1alpha1/tenants/t-2/participant-profiles": {
        body: [
          {
            id: "p-c",
            identifier: DID_C,
            error: true,
            errorDetail: "siglet refused",
            vpas: vpas("error"),
          },
          { id: "p-none", vpas: vpas("active") },
        ],
      },
    });

    const byDid = await cfmStatesByDid();

    expect(byDid.size).toBe(3);
    expect(byDid.get(DID_A)).toEqual({
      tenantId: "t-1",
      profileId: "p-a",
      state: "active",
    });
    expect(byDid.get(DID_B)?.state).toBe("pending");
    expect(byDid.get(DID_C)).toEqual({
      tenantId: "t-2",
      profileId: "p-c",
      state: "error",
      detail: "siglet refused",
    });
  });

  it("reports a disposed profile as disposed when it is the only one", async () => {
    stubFetch({
      "POST token": { body: { access_token: "tok" } },
      "GET /v1alpha1/tenants": { body: [{ id: "t-1" }] },
      "GET /v1alpha1/tenants/t-1/participant-profiles": {
        body: [{ id: "p-a", identifier: DID_A, vpas: vpas("disposed") }],
      },
    });

    expect((await cfmStatesByDid()).get(DID_A)?.state).toBe("disposed");
  });

  it("throws when the Tenant Manager refuses, so the list goes without it", async () => {
    stubFetch({
      "POST token": { body: { access_token: "tok" } },
      "GET /v1alpha1/tenants": { status: 401, body: { error: "unauthorized" } },
    });

    await expect(cfmStatesByDid()).rejects.toThrow("Tenant Manager 401");
  });
});
