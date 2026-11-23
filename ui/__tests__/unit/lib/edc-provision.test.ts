/**
 * The hub's own participant provisioning on EDC 1.0 (ADR-078): the seeds'
 * sequence, in order, and undone in reverse when a step fails.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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
    // Without a Vault token the hub cannot make the signing key (#888): the
    // registration stands, and the step says what is missing.
    expect(out.steps.filter((s) => !s.ok)).toEqual([
      {
        step: "siglet signing key",
        ok: false,
        detail: expect.stringContaining("seed-siglet-key-mappings.sh"),
      },
    ]);
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
    // RC6 reads profiles, RC5 transferTypes (Connector #6196): both are sent.
    const dataplane = mgmt.mock.calls.find((c) => c[0].endsWith("/dataplanes"));
    expect(dataplane?.[2]).toMatchObject({
      profiles: ["HttpData-PULL"],
      transferTypes: ["HttpData-PULL"],
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

  it("requests the format the definition issues in (IdentityHub RC6 #1248)", async () => {
    happyPath();
    issuer.mockImplementation(async (path: string) =>
      path.endsWith("/credentialdefinitions/query")
        ? [{ ...DEFS[0], format: "VC2_0_JOSE" }]
        : undefined,
    );
    await provisionParticipant(REG);
    const req = identity.mock.calls.find((c) =>
      c[0].endsWith("/credentials/request"),
    );
    expect(req?.[2]).toMatchObject({
      credentials: [{ id: "membership-credential-def", format: "VC2_0_JOSE" }],
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

  it("registers the push data plane too where the deployment has one (ADR-095)", async () => {
    happyPath();
    vi.stubEnv("PUSH_DATAPLANE_URL", "http://dataplane:8090");
    vi.stubEnv("PUSH_DATAPLANE_CLIENT_SECRET", "local-test-value");
    try {
      const out = await provisionParticipant(REG);
      expect(out.steps.map((s) => s.step)).toContain("data plane (push)");
      const registration = mgmt.mock.calls.find(
        (c) =>
          String(c[0]).endsWith("/dataplanes") &&
          (c[2] as { dataplaneId?: string }).dataplaneId === `mvhd-dp-${CTX}`,
      );
      expect(registration).toBeDefined();
      const body = registration?.[2] as {
        endpoint: string;
        profiles: string[];
        authorization: Record<string, string>;
      };
      expect(body.endpoint).toBe(
        `http://dataplane:8090/api/v1/${CTX}/dataflows`,
      );
      expect(body.profiles).toContain("HttpData-PUSH");
      expect(body.profiles).toContain("Kafka-PULL");
      expect(body.authorization.type).toBe("oauth2_client_credentials");
      expect(body.authorization.jwksUri).toBe(
        "http://dataplane:8090/.well-known/jwks.json",
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("leaves the push data plane out where none is configured", async () => {
    happyPath();
    const out = await provisionParticipant(REG);
    expect(out.steps.map((s) => s.step)).not.toContain("data plane (push)");
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
    expect(out.steps.filter((s) => !s.ok).map((s) => s.step)).toEqual([
      "siglet signing key",
    ]);
    expect(out.steps).toHaveLength(8);
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

/**
 * With a Vault token the hub makes what a token renewal needs (#888): a
 * transit key, its public half in the DID document, siglet's mapping.
 */
describe("provisionParticipant, the siglet signing key", () => {
  // 32 bytes, as Vault returns an ed25519 public key: standard base64.
  const PUBLIC_KEY = Buffer.alloc(32, 7).toString("base64");
  const X = Buffer.alloc(32, 7).toString("base64url");
  let outside: string[];
  let answer: (url: string, method: string) => Response | undefined;

  beforeEach(() => {
    mgmt.mockReset();
    identity.mockReset();
    issuer.mockReset();
    happyPath();
    outside = [];
    answer = () => undefined;
    vi.stubEnv("VAULT_TOKEN", "test-token");
    vi.stubEnv("VAULT_URL", "http://vault.test:8200");
    vi.stubEnv("SIGLET_MANAGEMENT_URL", "http://siglet.test:8083");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const method = init?.method ?? "GET";
        outside.push(`${method} ${url}`);
        const special = answer(url, method);
        if (special) return special;
        if (method === "GET" && url.includes("/v1/transit/keys/")) {
          return Response.json({
            data: {
              type: "ed25519",
              latest_version: 1,
              keys: { "1": { public_key: PUBLIC_KEY } },
            },
          });
        }
        return new Response(null, { status: 204 });
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("makes the key, publishes it and maps it, before the credential request", async () => {
    const out = await provisionParticipant(REG);

    expect(out.steps.every((s) => s.ok)).toBe(true);
    expect(out.steps.map((s) => s.step)).toEqual([
      "control plane context",
      "IdentityHub participant",
      "context config",
      "DSP profile",
      "data plane (siglet)",
      "siglet signing key (Vault transit)",
      "siglet signing key in the DID document",
      "siglet signing-key mapping",
      "issuer holder",
      "MembershipCredential request",
    ]);
    expect(outside).toEqual([
      `POST http://vault.test:8200/v1/transit/keys/siglet-proof-${CTX}`,
      `GET http://vault.test:8200/v1/transit/keys/siglet-proof-${CTX}`,
      "POST http://siglet.test:8083/key-mappings",
    ]);

    // The key id carries a fingerprint of the public key; the key pair can
    // sign nothing in IdentityHub, which does not hold the private key.
    const keypair = identity.mock.calls.find((c) => c[0].endsWith("/keypairs"));
    expect(keypair?.[1]).toBe("PUT");
    const descriptor = keypair?.[2] as {
      keyId: string;
      usage: string[];
      publicKeyJwk: Record<string, string>;
      keyGeneratorParams?: unknown;
    };
    const [keyDid, fragment] = descriptor.keyId.split("#");
    expect(keyDid).toBe(out.did);
    expect(fragment).toMatch(/^siglet-[0-9a-f]{8}$/);
    expect(descriptor.usage).toEqual(["sign_credentials"]);
    expect(descriptor.publicKeyJwk).toEqual({
      kty: "OKP",
      crv: "Ed25519",
      x: X,
    });
    expect(descriptor.keyGeneratorParams).toBeUndefined();

    const fetchMock = vi.mocked(fetch);
    const mapping = fetchMock.mock.calls.find((c) =>
      String(c[0]).endsWith("/key-mappings"),
    );
    expect(JSON.parse(String(mapping?.[1]?.body))).toEqual({
      participantContextId: CTX,
      keyName: `siglet-proof-${CTX}`,
      kid: descriptor.keyId,
    });
    const create = fetchMock.mock.calls[0];
    expect(create[1]?.headers).toMatchObject({ "X-Vault-Token": "test-token" });
    expect(JSON.parse(String(create[1]?.body))).toEqual({ type: "ed25519" });
  });

  it("replaces a mapping siglet already holds", async () => {
    answer = (url, method) =>
      method === "POST" && url.endsWith("/key-mappings")
        ? new Response(null, { status: 409 })
        : undefined;
    const out = await provisionParticipant(REG);
    expect(out.steps.every((s) => s.ok)).toBe(true);
    expect(outside.at(-1)).toBe(
      `PUT http://siglet.test:8083/key-mappings/${CTX}`,
    );
  });

  it("undoes the key and the participant when siglet refuses the mapping", async () => {
    answer = (url, method) =>
      method === "POST" && url.endsWith("/key-mappings")
        ? new Response(null, { status: 500 })
        : undefined;

    const err = await provisionParticipant(REG).catch((e) => e);

    expect(err).toBeInstanceOf(ProvisioningError);
    expect(err.message).toContain("siglet signing-key mapping failed");
    expect(
      err.steps
        .filter((s: { step: string }) => s.step.startsWith("undo: "))
        .map((s: { step: string; ok: boolean }) => `${s.step}:${s.ok}`),
    ).toEqual([
      "undo: siglet signing key (Vault transit):true",
      "undo: IdentityHub participant:true",
      "undo: control plane context:true",
    ]);
    // Vault deletes a key only after its configuration allows it.
    expect(outside.slice(-2)).toEqual([
      `POST http://vault.test:8200/v1/transit/keys/siglet-proof-${CTX}/config`,
      `DELETE http://vault.test:8200/v1/transit/keys/siglet-proof-${CTX}`,
    ]);
    expect(issuer).not.toHaveBeenCalled();
  });

  it("undoes the participant when Vault refuses the key", async () => {
    answer = (url, method) =>
      method === "POST" && url.includes("/v1/transit/keys/")
        ? new Response(null, { status: 403 })
        : undefined;

    const err = await provisionParticipant(REG).catch((e) => e);

    expect(err.message).toContain(
      "siglet signing key (Vault transit) failed: Vault answered 403",
    );
    expect(calls().slice(-2)).toEqual([
      `identity DELETE /v1/participants/${CTX}`,
      `mgmt DELETE /v5/participants/${CTX}`,
    ]);
    expect(identity.mock.calls.some((c) => c[0].endsWith("/keypairs"))).toBe(
      false,
    );
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
