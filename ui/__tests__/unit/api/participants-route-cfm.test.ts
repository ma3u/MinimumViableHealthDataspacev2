/**
 * GET /api/participants with CFM_TENANT_URL set (ADR-085 step 3): each
 * context says what CFM's Tenant Manager holds for it, null for a context CFM
 * did not provision, and a Tenant Manager that does not answer leaves the
 * list as it is without CFM.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/edc", () => ({
  edcClient: { management: vi.fn(), identity: vi.fn(), issuer: vi.fn() },
  EDC_CONTEXT: "https://w3id.org/edc/connector/management/v2",
}));
vi.mock("@/lib/edc/cfm-provision", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/edc/cfm-provision")>()),
  cfmStatesByDid: vi.fn(),
}));

import { edcClient } from "@/lib/edc";
import { cfmStatesByDid, type CfmState } from "@/lib/edc/cfm-provision";
import { GET } from "@/app/api/participants/route";

const mgmt = vi.mocked(edcClient.management);
const states = vi.mocked(cfmStatesByDid);

const SEEDED = "did:web:identityhub%3A7083:alpha-klinik";
const ONBOARDED = "did:web:identityhub%3A7083:hospital-a1b2c3";
const CONTEXTS = [
  { "@id": "alpha-klinik", identity: SEEDED, state: "ACTIVATED" },
  {
    "@id": "ctx-new",
    identity: ONBOARDED,
    state: "ACTIVATED",
    properties: { displayName: "Limburg Medical Centre", registeredAt: "x" },
  },
];

describe("GET /api/participants with CFM", () => {
  beforeEach(() => {
    mgmt.mockReset();
    states.mockReset();
    mgmt.mockResolvedValue(CONTEXTS);
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("adds each context's CFM state, null for one CFM did not provision", async () => {
    vi.stubEnv("CFM_TENANT_URL", "http://cfm7-tmanager:8080/api");
    const active: CfmState = {
      tenantId: "t-1",
      profileId: "p-1",
      state: "active",
    };
    states.mockResolvedValue(new Map([[ONBOARDED, active]]));

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    const byId = Object.fromEntries(
      body.map((p: { participantId: string; cfm: unknown }) => [
        p.participantId,
        p.cfm,
      ]),
    );
    expect(byId["ctx-new"]).toEqual(active);
    expect(byId["alpha-klinik"]).toBeNull();
  });

  it("lists without CFM's view when the Tenant Manager does not answer", async () => {
    vi.stubEnv("CFM_TENANT_URL", "http://cfm7-tmanager:8080/api");
    states.mockRejectedValue(new TypeError("fetch failed"));

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toHaveLength(2);
    expect(body.every((p: object) => !("cfm" in p))).toBe(true);
  });

  it("does not ask CFM when CFM_TENANT_URL is unset", async () => {
    vi.stubEnv("CFM_TENANT_URL", "");

    const body = await (await GET()).json();

    expect(states).not.toHaveBeenCalled();
    expect(body.every((p: object) => !("cfm" in p))).toBe(true);
  });
});
