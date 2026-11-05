/**
 * The hub's own participant provisioning on EDC 1.0 (ADR-078): the seeds'
 * sequence, in order, and undone in reverse when a step fails.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/edc", () => ({
  edcClient: { management: vi.fn(), identity: vi.fn(), issuer: vi.fn() },
  EDC_CONTEXT: "https://w3id.org/edc/connector/management/v2",
}));

import { edcClient } from "@/lib/edc";
import {
  provisionParticipant,
  ProvisioningError,
  identityManifest,
  holdsMembership,
} from "@/lib/edc/provision";

const mgmt = vi.mocked(edcClient.management);
const identity = vi.mocked(edcClient.identity);
const issuer = vi.mocked(edcClient.issuer);

const CTX = "1c5e0f4a-0000-4000-8000-000000000001";
const DEFS = [
  { id: "membership-credential-def", credentialType: "MembershipCredential" },
];

/** Every call to the three APIs, in order, as "api METHOD path". */
function calls() {
  const all = [
    ...mgmt.mock.calls.map((c, i) => ({
      api: "mgmt",
      c,
      o: mgmt.mock.invocationCallOrder[i],
    })),
    ...identity.mock.calls.map((c, i) => ({
      api: "identity",
      c,
      o: identity.mock.invocationCallOrder[i],
    })),
    ...issuer.mock.calls.map((c, i) => ({
      api: "issuer",
      c,
      o: issuer.mock.invocationCallOrder[i],
    })),
  ];
  return all
    .sort((a, b) => a.o - b.o)
    .map(({ api, c }) => `${api} ${c[1] ?? "GET"} ${c[0]}`);
}

function happyPath() {
  mgmt.mockImplementation(async (path: string, method?: string) =>
    path === "/v5/participants" && method === "POST"
      ? { "@id": CTX }
      : undefined,
  );
  identity.mockResolvedValue(undefined);
  issuer.mockImplementation(async (path: string) =>
    path.endsWith("/credentialdefinitions/query") ? DEFS : undefined,
  );
}

const REG = { displayName: "Riverside General", role: "DATA_HOLDER" };

describe("provisionParticipant", () => {
  beforeEach(() => {
    mgmt.mockReset();
    identity.mockReset();
    issuer.mockReset();
  });

  it("runs the seeds' sequence, in order", async () => {
    happyPath();
    const out = await provisionParticipant(REG);

    expect(out.contextId).toBe(CTX);
    expect(out.did).toMatch(
      /^did:web:identityhub%3A7083:riverside-general-[0-9a-f]{6}$/,
    );
    expect(out.steps.every((s) => s.ok)).toBe(true);
    expect(calls()).toEqual([
      "mgmt POST /v5/participants",
      "identity POST /v1/participants",
      `mgmt PUT /v5/participants/${CTX}/config`,
      `mgmt PUT /v5/participants/${CTX}/profiles`,
      `mgmt PUT /v5/participants/${CTX}/dataplanes`,
      "issuer POST /v1/participants/issuer/holders",
      "issuer POST /v1/participants/issuer/credentialdefinitions/query",
      `identity POST /v1/participants/${CTX}/credentials/request`,
    ]);
  });

  it("keeps the registration on the context and links the DSP profile", async () => {
    happyPath();
    const { did } = await provisionParticipant({
      ...REG,
      organization: "Riverside Health",
    });

    const ctxBody = mgmt.mock.calls[0][2] as Record<string, unknown>;
    expect(ctxBody.identity).toBe(did);
    expect(ctxBody.properties).toMatchObject({
      displayName: "Riverside General",
      organization: "Riverside Health",
      role: "DATA_HOLDER",
      ehdsParticipantType: "DATA_HOLDER",
    });
    const profiles = mgmt.mock.calls.find((c) => c[0].endsWith("/profiles"));
    expect(profiles?.[2]).toMatchObject({
      "@type": "AssociateDataspaceProfile",
      profiles: ["http-dsp-profile-2025-1"],
    });
    const config = mgmt.mock.calls.find((c) => c[0].endsWith("/config"));
    expect(config?.[2]).toMatchObject({
      entries: {
        "edc.participant.id": did,
        "edc.iam.sts.oauth.client.secret.alias": `${CTX}-sts-client-secret`,
      },
    });
  });

  it("keys the holder by context id, so undo can address it", async () => {
    happyPath();
    const { did } = await provisionParticipant(REG);
    const holder = issuer.mock.calls.find((c) => c[0].endsWith("/holders"));
    expect(holder?.[2]).toEqual({
      holderId: CTX,
      did,
      name: "Riverside General",
    });
  });

  it("requests the MembershipCredential by its definition id", async () => {
    happyPath();
    await provisionParticipant(REG);
    const req = identity.mock.calls.find((c) =>
      c[0].endsWith("/credentials/request"),
    );
    expect(req?.[2]).toEqual({
      issuerDid: "did:web:issuerservice%3A10016:issuer",
      credentials: [
        {
          id: "membership-credential-def",
          type: "MembershipCredential",
          format: "VC1_0_JWT",
        },
      ],
    });
  });

  it("takes a request answered with a bare holderPid as accepted", async () => {
    happyPath();
    identity.mockImplementation(async (path: string) => {
      if (path.endsWith("/credentials/request")) {
        throw new SyntaxError(
          "Unexpected token 'a', \"a1b2\" is not valid JSON",
        );
      }
      return undefined;
    });
    await expect(provisionParticipant(REG)).resolves.toMatchObject({
      contextId: CTX,
    });
  });

  it("takes a 2xx with an empty body as done (data plane, holder)", async () => {
    happyPath();
    const empty = () => {
      throw new SyntaxError("Unexpected end of JSON input");
    };
    mgmt.mockImplementation(async (path: string, method?: string) => {
      if (path === "/v5/participants" && method === "POST")
        return { "@id": CTX };
      if (path.endsWith("/dataplanes")) empty();
      return undefined;
    });
    issuer.mockImplementation(async (path: string) => {
      if (path.endsWith("/credentialdefinitions/query")) return DEFS;
      if (path.endsWith("/holders")) empty();
      return undefined;
    });
    const out = await provisionParticipant(REG);
    expect(out.steps.every((s) => s.ok)).toBe(true);
    expect(out.steps).toHaveLength(7);
  });

  it("undoes what it created, in reverse, when a later step fails", async () => {
    happyPath();
    mgmt.mockImplementation(async (path: string, method?: string) => {
      if (path === "/v5/participants" && method === "POST")
        return { "@id": CTX };
      if (path.endsWith("/dataplanes")) {
        throw new Error("EDC API error [management] PUT: 500 Server Error");
      }
      return undefined;
    });

    const err = await provisionParticipant(REG).catch((e) => e);
    expect(err).toBeInstanceOf(ProvisioningError);
    expect(err.unreachable).toBe(false);
    expect(err.message).toContain("data plane (siglet) failed");
    expect(calls().slice(-2)).toEqual([
      `identity DELETE /v1/participants/${CTX}`,
      `mgmt DELETE /v5/participants/${CTX}`,
    ]);
    expect(
      err.steps.map((s: { step: string; ok: boolean }) => `${s.step}:${s.ok}`),
    ).toEqual([
      "control plane context:true",
      "IdentityHub participant:true",
      "context config:true",
      "DSP profile:true",
      "data plane (siglet):false",
      "undo: IdentityHub participant:true",
      "undo: control plane context:true",
    ]);
  });

  it("removes the holder too when the credential request is refused", async () => {
    happyPath();
    identity.mockImplementation(async (path: string) => {
      if (path.endsWith("/credentials/request")) {
        throw new Error("EDC API error [identity] POST: 400 Bad Request");
      }
      return undefined;
    });
    const err = await provisionParticipant(REG).catch((e) => e);
    expect(err).toBeInstanceOf(ProvisioningError);
    expect(calls().slice(-3)).toEqual([
      `issuer DELETE /v1/participants/issuer/holders/${CTX}`,
      `identity DELETE /v1/participants/${CTX}`,
      `mgmt DELETE /v5/participants/${CTX}`,
    ]);
  });

  it("fails, and undoes, when the issuer has no MembershipCredential definition", async () => {
    happyPath();
    issuer.mockImplementation(async (path: string) =>
      path.endsWith("/credentialdefinitions/query") ? [] : undefined,
    );
    const err = await provisionParticipant(REG).catch((e) => e);
    expect(err.message).toContain("no MembershipCredential definition");
    expect(calls()).toContain(`mgmt DELETE /v5/participants/${CTX}`);
  });

  it("calls a control plane that does not answer unreachable, and undoes nothing", async () => {
    mgmt.mockRejectedValue(new TypeError("fetch failed"));
    const err = await provisionParticipant(REG).catch((e) => e);
    expect(err).toBeInstanceOf(ProvisioningError);
    expect(err.unreachable).toBe(true);
    expect(err.steps).toHaveLength(1);
    expect(identity).not.toHaveBeenCalled();
  });

  it("does not call a refusal of the first step unreachable", async () => {
    mgmt.mockRejectedValue(
      new Error("EDC API error [management] POST: 403 Forbidden"),
    );
    const err = await provisionParticipant(REG).catch((e) => e);
    expect(err.unreachable).toBe(false);
  });

  it("reports a step that could not be undone", async () => {
    happyPath();
    mgmt.mockImplementation(async (path: string, method?: string) => {
      if (path === "/v5/participants" && method === "POST")
        return { "@id": CTX };
      if (method === "DELETE") throw new Error("EDC API error: 409 Conflict");
      if (path.endsWith("/config")) throw new Error("EDC API error: 400");
      return undefined;
    });
    const err = await provisionParticipant(REG).catch((e) => e);
    const undoCp = err.steps.find(
      (s: { step: string }) => s.step === "undo: control plane context",
    );
    expect(undoCp).toMatchObject({ ok: false });
    expect(undoCp.detail).toContain("409");
  });
});

describe("identityManifest", () => {
  it("generates the key under an alias unique to the context", () => {
    const m = identityManifest(CTX, "did:web:identityhub%3A7083:x");
    expect(m.keys[0].keyId).toBe("did:web:identityhub%3A7083:x#key1");
    expect(m.keys[0].privateKeyAlias).toBe(`${CTX}-key1`);
  });

  it("keeps the alias short for the longest DID a name can make", () => {
    // Vault's file storage fails on an alias of 93 characters or more.
    const did = `did:web:identityhub%3A7083:${"n".repeat(40)}-abcdef`;
    const m = identityManifest("5e4042a5-462a-4b8c-9b26-ac9974d4d704", did);
    expect(m.keys[0].privateKeyAlias.length).toBeLessThan(93);
  });

  it("points the endpoints at the context", () => {
    const m = identityManifest(CTX, "did:web:identityhub%3A7083:x");
    expect(m.serviceEndpoints.map((e) => e.serviceEndpoint)).toEqual([
      `http://identityhub:7082/api/credentials/v1/participants/${CTX}`,
      `http://controlplane:8082/api/dsp/${CTX}/http-dsp-profile-2025-1`,
    ]);
  });
});

describe("holdsMembership", () => {
  beforeEach(() => {
    identity.mockReset();
  });

  it("is true when IdentityHub holds one", async () => {
    identity.mockResolvedValue([{ id: "vc-1" }]);
    await expect(holdsMembership(CTX)).resolves.toBe(true);
    expect(identity).toHaveBeenCalledWith(
      `/v1/participants/${CTX}/credentials?type=MembershipCredential`,
    );
  });

  it("is false when it holds none, or does not answer", async () => {
    identity.mockResolvedValue([]);
    await expect(holdsMembership(CTX)).resolves.toBe(false);
    identity.mockRejectedValue(new Error("down"));
    await expect(holdsMembership(CTX)).resolves.toBe(false);
  });
});
