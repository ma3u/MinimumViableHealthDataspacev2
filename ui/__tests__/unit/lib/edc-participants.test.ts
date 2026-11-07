/**
 * Participants as control plane contexts (ADR-078), in the tenant shape the
 * onboarding, settings and admin pages read.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/edc", () => ({
  edcClient: { management: vi.fn(), identity: vi.fn(), issuer: vi.fn() },
  EDC_CONTEXT: "https://w3id.org/edc/connector/management/v2",
}));

import { edcClient } from "@/lib/edc";
import {
  contextNames,
  toTenantView,
  updateContextProperties,
  listTenantViews,
} from "@/lib/edc/participants";
import { PROVISIONING_STALL_MS } from "@/lib/provisioning";

const mgmt = vi.mocked(edcClient.management);
const identity = vi.mocked(edcClient.identity);

const NOW = Date.parse("2026-11-05T12:00:00Z");
const onboarded = (registeredAt: string) => ({
  "@id": "ctx-new",
  identity: "did:web:identityhub%3A7083:riverside-general-1a2b3c",
  state: "CREATED",
  properties: {
    displayName: "Riverside General",
    organization: "Riverside Health",
    role: "DATA_HOLDER",
    ehdsParticipantType: "DATA_HOLDER",
    registeredAt,
  },
});
const seeded = {
  "@id": "ctx-lmc",
  identity: "did:web:identityhub%3A7083:lmc",
  state: "CREATED",
  properties: {},
};

describe("contextNames", () => {
  it("reads an onboarded participant's own properties", () => {
    expect(contextNames(onboarded("2026-11-05T11:59:00Z"))).toMatchObject({
      displayName: "Riverside General",
      organization: "Riverside Health",
      role: "DATA_HOLDER",
      slug: "riverside-general-1a2b3c",
    });
  });

  it("names the seeded five, whose contexts carry no properties", () => {
    expect(contextNames(seeded)).toMatchObject({
      displayName: "Limburg Medical Centre",
      role: "DATA_HOLDER",
    });
  });
});

describe("toTenantView", () => {
  it("is complete once the issuer has delivered the credential", () => {
    const v = toTenantView(onboarded("2026-11-05T11:59:00Z"), true, NOW);
    expect(v).toMatchObject({
      id: "ctx-new",
      provisioningComplete: true,
      provisioningStalled: false,
      provisioningFailed: false,
      vpaSummary: { total: 1, pending: 0 },
    });
    expect(v.participantProfiles[0]).toMatchObject({
      participantContextId: "ctx-new",
      identifier: "did:web:identityhub%3A7083:riverside-general-1a2b3c",
    });
  });

  it("is provisioning while a fresh registration waits for its credential", () => {
    const v = toTenantView(onboarded("2026-11-05T11:59:00Z"), false, NOW);
    expect(v.provisioningComplete).toBe(false);
    expect(v.provisioningStalled).toBe(false);
    expect(v.vpaSummary).toMatchObject({
      total: 1,
      pending: 1,
      pendingTypes: ["MembershipCredential"],
      oldestPendingSince: "2026-11-05T11:59:00.000Z",
    });
  });

  it("is stalled, with the reason, when the credential has not come", () => {
    const at = new Date(NOW - PROVISIONING_STALL_MS - 1000).toISOString();
    const v = toTenantView(onboarded(at), false, NOW);
    expect(v.provisioningStalled).toBe(true);
    expect(v.stalledReason).toContain("MembershipCredential");
    expect(v.stalledReason).toContain(at);
  });

  it("calls a seeded context without a credential stalled", () => {
    expect(toTenantView(seeded, false, NOW).provisioningStalled).toBe(true);
  });
});

describe("updateContextProperties", () => {
  beforeEach(() => {
    mgmt.mockReset();
  });

  it("merges over the current properties, which 1.0 replaces on PUT", async () => {
    mgmt.mockResolvedValueOnce(onboarded("2026-11-05T11:59:00Z"));
    mgmt.mockResolvedValueOnce(undefined);
    await updateContextProperties("ctx-new", { organization: "Riverside AG" });

    const [path, method, body] = mgmt.mock.calls[1];
    expect(path).toBe("/v5/participants/ctx-new");
    expect(method).toBe("PUT");
    expect(body).toMatchObject({
      "@id": "ctx-new",
      identity: "did:web:identityhub%3A7083:riverside-general-1a2b3c",
      state: "CREATED",
      properties: {
        displayName: "Riverside General",
        organization: "Riverside AG",
        registeredAt: "2026-11-05T11:59:00Z",
      },
    });
  });
});

describe("listTenantViews", () => {
  it("asks IdentityHub, per context, whether it holds its credential", async () => {
    mgmt.mockReset();
    identity.mockReset();
    mgmt.mockResolvedValue([seeded, onboarded("2026-11-05T11:59:00Z")]);
    identity.mockImplementation(async (path: string) =>
      path.includes("ctx-lmc") ? [{ id: "vc" }] : [],
    );
    const views = await listTenantViews();
    expect(views.map((v) => [v.id, v.provisioningComplete])).toEqual([
      ["ctx-lmc", true],
      ["ctx-new", false],
    ]);
  });
});
