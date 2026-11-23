/**
 * A push into an SPE inbox (ADR-095). The consumer's data plane opens an
 * inbox with a token it signs (scope inbox:open); the provider's delivers a
 * bundle, a stream of NDJSON chunks or a file with the inbox's own token, and
 * reads the dataset from /dataspace/push-source with a dataset:read token.
 * No inbox for a workspace whose attestation failed, nothing written on a
 * hash that differs, no Patient that says who it is, and every outcome on
 * the audit chain `spe`.
 */
import { createHash, createHmac } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { exportJWK, generateKeyPair, SignJWT } from "jose";

// Every request here comes from one address; the general limit (100 a
// minute) is not what these tests are about. Read when app.ts loads.
process.env.RATE_LIMIT_MAX = "10000";
process.env.RATE_LIMIT_PARTICIPANT_MAX = "10000";
process.env.RATE_LIMIT_HEAVY_MAX = "10000";
process.env.RATE_LIMIT_PARTICIPANT_HEAVY_MAX = "10000";
// Small, so the stream limit is reached in a test, and above the twelve
// records of the Holter stream below. Read when config.ts loads.
process.env.SPE_INBOX_STREAM_MAX_RECORDS = "20";

const speDrivers = vi.fn();
vi.mock("../src/db.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/db.js")>()),
  getSpeDrivers: () => speDrivers(),
}));

// The hub graph, for the dataset route /dataspace/push-source hands on to.
const hubRun = vi.fn().mockResolvedValue({ records: [] });
const hub = {
  session: vi.fn(() => ({ run: hubRun, close: vi.fn() })),
  getServerInfo: vi.fn().mockResolvedValue({ address: "hub:7687" }),
  close: vi.fn(),
};
vi.mock("neo4j-driver", () => ({
  default: {
    driver: vi.fn(() => hub),
    auth: { basic: vi.fn() },
    int: vi.fn((n: number) => n),
    isInt: vi.fn(() => false),
    integer: { toNumber: (n: unknown) => Number(n) },
    session: { READ: "READ", WRITE: "WRITE" },
  },
}));

// Push events go on the `spe` chain in a transaction of their own, as the
// SPE sync's do.
const appendAlone = vi.fn();
vi.mock("../src/audit-chain.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/audit-chain.js")>()),
  appendAuditEventAlone: (...a: unknown[]) => appendAlone(...a),
}));

// The pull's siglet signature is dataspace-token.test.ts's; here one test
// token grants the observation bundle, so the pull can be compared with the
// push source. toGrant stays the real one: push-source uses it.
vi.mock("../src/dataspace-token.js", async (importOriginal) => {
  const real =
    await importOriginal<typeof import("../src/dataspace-token.js")>();
  return {
    ...real,
    verifyDataspaceToken: vi.fn(async (token: string) => {
      if (token === "siglet-ecg-token") {
        return {
          datasetId: "ecg-holter-stream",
          consumer: "did:web:identityhub%3A7083:pharmaco",
          provider: "did:web:identityhub%3A7083:alpha-klinik",
        };
      }
      if (token !== "siglet-test-token") throw new Error("not siglet's");
      return {
        datasetId: "fhir-observation-bundle",
        consumer: "did:web:identityhub%3A7083:pharmaco",
        provider: "did:web:identityhub%3A7083:alpha-klinik",
      };
    }),
  };
});

const { app } = await import("../src/index.js");
const { setDriver } = await import("../src/db.js");
const { resetInboxes, identifyingPatientField } = await import(
  "../src/spe-inbox.js"
);
const { MAX_RECORDS } = await import("../src/spe-import.js");
const neo4j = (await import("neo4j-driver")).default;
setDriver(neo4j.driver("bolt://hub:7687", neo4j.auth.basic("u", "p")));
import supertest from "supertest";
const request = supertest(app);

// ---- the data plane's keys, served as its JWKS ---------------------------------

type Key = Awaited<ReturnType<typeof generateKeyPair>>["privateKey"];
let dataplaneKey: Key;
let strangerKey: Key;
let jwksServer: Server;
let jwksUrl: string;

beforeAll(async () => {
  const pair = await generateKeyPair("RS256", { extractable: true });
  dataplaneKey = pair.privateKey;
  strangerKey = (await generateKeyPair("RS256")).privateKey;
  const jwk = {
    ...(await exportJWK(pair.publicKey)),
    kid: "mvhd-dp-1",
    alg: "RS256",
    use: "sig",
  };
  jwksServer = createServer((_req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ keys: [jwk] }));
  });
  await new Promise<void>((resolve) =>
    jwksServer.listen(0, "127.0.0.1", resolve),
  );
  const { port } = jwksServer.address() as AddressInfo;
  jwksUrl = `http://127.0.0.1:${port}/.well-known/jwks.json`;
  process.env.DATAPLANE_JWKS_URL = jwksUrl;
});

afterAll(async () => {
  delete process.env.DATAPLANE_JWKS_URL;
  await new Promise((resolve) => jwksServer.close(resolve));
});

function dpToken(
  claims: Record<string, unknown>,
  {
    key = dataplaneKey,
    issuer = "mvhd-dataplane",
    lifetime = 120,
  }: { key?: Key; issuer?: string; lifetime?: number } = {},
) {
  const iat = Math.floor(Date.now() / 1000);
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: "mvhd-dp-1" })
    .setIssuer(issuer)
    .setIssuedAt(iat)
    .setExpirationTime(iat + lifetime)
    .sign(key);
}

// ---- the workspaces ------------------------------------------------------------

const row = (o: Record<string, unknown>) => ({ get: (k: string) => o[k] });

const EVIDENCE = `sha256:${"e".repeat(64)}`;
const PASSED = {
  simulated: false,
  attestationScope: "workload",
  teeType: "AMD SEV-SNP",
  attestation: JSON.stringify({
    verifier: "snp",
    result: "pass",
    evidenceDigest: EVIDENCE,
    policyId: "default",
    tokenExpiresAt: "2026-11-19T21:00:00.000Z",
  }),
};
const FAILED = {
  ...PASSED,
  attestation: JSON.stringify({
    verifier: "snp",
    result: "fail",
    evidenceDigest: EVIDENCE,
    policyId: "default",
  }),
};

/**
 * A workspace as the driver answers it: `attestation` is its SpeAttestation
 * node (null: it has none, so it is a simulated one). Reads go to `run`,
 * the write transaction's statements to `write`.
 */
function workspace(attestation: Record<string, unknown> | null) {
  const run = vi.fn(async () => ({
    records: [row({ attestation, patients: 0, events: [] })],
  }));
  const write = vi.fn().mockResolvedValue({ records: [] });
  const executeWrite = vi.fn(
    async (work: (tx: { run: typeof write }) => unknown) =>
      work({ run: write }),
  );
  const session = { run, executeWrite, close: vi.fn() };
  return {
    driver: { session: vi.fn(() => session) },
    run,
    write,
    executeWrite,
  };
}

const PARTIES = {
  agreementId: "agr-7f3c",
  datasetId: "fhir-patient-search",
  consumer: "did:web:identityhub%3A7083:pharmaco",
  provider: "did:web:identityhub%3A7083:alpha-klinik",
};

let flowSeq = 0;
const nextFlow = () => `flow-${Date.now()}-${++flowSeq}`;

async function open(
  flowId: string,
  profile: string,
  speId = "SPE-2",
  tokenClaims: Record<string, unknown> = {},
) {
  const token = await dpToken({
    scope: "inbox:open",
    flowId,
    ...tokenClaims,
  });
  return request
    .post(`/spe/${speId}/inbox`)
    .set("Authorization", `Bearer ${token}`)
    .send({ flowId, profile, ...PARTIES });
}

const sha = (data: string | Buffer) =>
  createHash("sha256").update(data).digest("hex");

/** The push events appended, by type, with their detail as a map. */
function pushEvents(type?: string) {
  return appendAlone.mock.calls
    .map(([chain, resource, index]) => {
      const r = resource as {
        subtype: Array<{ code: string }>;
        outcome: string;
        entity: Array<{
          detail?: Array<{ type: string; valueString: string }>;
        }>;
      };
      const detail = Object.fromEntries(
        r.entity
          .flatMap((e) => e.detail ?? [])
          .map((d) => [d.type, d.valueString]),
      );
      return {
        chain,
        type: r.subtype[0].code,
        outcome: r.outcome,
        detail,
        index: index as { properties: Record<string, unknown> },
      };
    })
    .filter((e) => !type || e.type === type);
}

const PSEUDONYMISED_BUNDLE = {
  resourceType: "Bundle",
  type: "searchset",
  entry: [
    {
      resource: {
        resourceType: "Patient",
        id: "p-3f2a9c1d",
        gender: "female",
        birthDate: "1971",
      },
    },
    {
      resource: {
        resourceType: "Condition",
        id: "c1",
        code: { coding: [{ display: "Type 2 diabetes mellitus" }] },
        subject: { reference: "Patient/p-3f2a9c1d" },
      },
    },
    {
      resource: {
        resourceType: "Observation",
        id: "o1",
        code: { text: "HbA1c" },
        subject: { reference: "Patient/p-3f2a9c1d" },
      },
    },
  ],
};

let spe2: ReturnType<typeof workspace>;

beforeEach(() => {
  resetInboxes();
  appendAlone.mockReset();
  appendAlone.mockResolvedValue({ chain: "spe", seq: 1 });
  speDrivers.mockReset();
  spe2 = workspace(PASSED);
  speDrivers.mockReturnValue([{ label: "SPE-2", driver: spe2.driver }]);
});

afterEach(() => {
  vi.useRealTimers();
});

// ---- 1. open an inbox ------------------------------------------------------------

describe("POST /spe/:speId/inbox", () => {
  it("opens an inbox for an attested workspace and records it", async () => {
    const flowId = nextFlow();
    const res = await open(flowId, "HttpData-PUSH");

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      flowId,
      speId: "SPE-2",
      profile: "HttpData-PUSH",
      endpoint: `http://neo4j-proxy:9090/spe/SPE-2/inbox/${flowId}`,
      attestation: {
        scope: "workload",
        result: "pass",
        evidenceDigest: EVIDENCE,
        policyId: "default",
        verifier: "snp",
        tokenExpiresAt: "2026-11-19T21:00:00.000Z",
      },
    });
    expect(res.body.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Date.parse(res.body.expiresAt) - Date.now()).toBeGreaterThan(
      14 * 60 * 1000,
    );

    const [opened] = pushEvents("push-inbox-opened");
    expect(opened.chain).toBe("spe");
    expect(opened.outcome).toBe("0");
    expect(opened.detail).toMatchObject({
      flowId,
      ...PARTIES,
      speId: "SPE-2",
      profile: "HttpData-PUSH",
      evidenceDigest: EVIDENCE,
      policyId: "default",
      attestationScope: "workload",
    });
    expect(opened.index.properties).toMatchObject({ flowId, simulated: false });
    // The token is never kept or shown again.
    const back = await request.get(`/spe/SPE-2/inbox/${flowId}`);
    expect(back.body).toMatchObject({
      state: "open",
      profile: "HttpData-PUSH",
    });
    expect(JSON.stringify(back.body)).not.toContain(res.body.token);
  });

  it("opens one for a simulated workspace and says it is simulated", async () => {
    speDrivers.mockReturnValue([
      { label: "SPE-1", driver: workspace(null).driver },
    ]);
    const res = await open(nextFlow(), "HttpFile-PUSH", "SPE-1");

    expect(res.status).toBe(201);
    expect(res.body.attestation).toMatchObject({
      scope: "simulated",
      result: "pass",
    });
  });

  it("refuses a workspace whose latest attestation failed, with an audit record and no inbox", async () => {
    speDrivers.mockReturnValue([
      { label: "SPE-2", driver: workspace(FAILED).driver },
    ]);
    const flowId = nextFlow();
    const res = await open(flowId, "HttpData-PUSH");

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/did not pass/);
    expect(res.body.attestation).toMatchObject({
      result: "fail",
      evidenceDigest: EVIDENCE,
    });
    const [refused] = pushEvents("push-refused");
    expect(refused.outcome).toBe("4");
    expect(refused.detail).toMatchObject({ flowId, policyId: "default" });
    expect(refused.detail.reason).toMatch(/did not pass/);
    expect(pushEvents("push-inbox-opened")).toHaveLength(0);
    expect((await request.get(`/spe/SPE-2/inbox/${flowId}`)).status).toBe(404);
  });

  it("answers 503 with Retry-After when the workspace is not connected", async () => {
    speDrivers.mockReturnValue([]);
    const res = await open(nextFlow(), "HttpData-PUSH");

    expect(res.status).toBe(503);
    expect(res.headers["retry-after"]).toBeDefined();
    expect(res.body.error).toMatch(/not connected/);
  });

  it("answers 401 to a token it cannot trust", async () => {
    const flowId = nextFlow();
    const send = (token: string) =>
      request
        .post("/spe/SPE-2/inbox")
        .set("Authorization", `Bearer ${token}`)
        .send({ flowId, profile: "HttpData-PUSH", ...PARTIES });
    const claims = { scope: "inbox:open", flowId };

    for (const token of [
      await dpToken(claims, { key: strangerKey }),
      await dpToken(claims, { issuer: "siglet-issuer" }),
      await dpToken(claims, { lifetime: 600 }),
      await dpToken({ ...claims, scope: "dataset:read" }),
      await dpToken({ ...claims, flowId: "another-flow" }),
      "not.a.token",
    ]) {
      const res = await send(token);
      expect(res.status).toBe(401);
      expect(typeof res.body.error).toBe("string");
    }
    const none = await request
      .post("/spe/SPE-2/inbox")
      .send({ flowId, profile: "HttpData-PUSH", ...PARTIES });
    expect(none.status).toBe(401);
    expect(appendAlone).not.toHaveBeenCalled();
  });

  it("answers 400 to a bad SPE, profile or id", async () => {
    const flowId = nextFlow();
    const token = await dpToken({ scope: "inbox:open", flowId });
    const send = (speId: string, body: Record<string, unknown>) =>
      request
        .post(`/spe/${speId}/inbox`)
        .set("Authorization", `Bearer ${token}`)
        .send({ flowId, profile: "HttpData-PUSH", ...PARTIES, ...body });

    expect((await send("SPE-9", {})).status).toBe(400);
    expect((await send("SPE-2", { profile: "HttpData-PULL" })).status).toBe(
      400,
    );
    expect((await send("SPE-2", { datasetId: "a b" })).status).toBe(400);
    expect((await send("SPE-2", { consumer: "" })).status).toBe(400);
  });

  it("answers 409 to a second inbox for the same flow", async () => {
    const flowId = nextFlow();
    expect((await open(flowId, "HttpData-PUSH")).status).toBe(201);
    const second = await open(flowId, "HttpData-PUSH");
    expect(second.status).toBe(409);
    expect(second.body.error).toMatch(/has an inbox already/);
  });

  it("opens no inbox when its audit record cannot be written", async () => {
    appendAlone.mockRejectedValue(new Error("Neo4j unavailable"));
    const flowId = nextFlow();
    const res = await open(flowId, "HttpData-PUSH");

    expect(res.status).toBe(503);
    expect((await request.get(`/spe/SPE-2/inbox/${flowId}`)).status).toBe(404);
  });

  it("answers 503 when no data plane is configured", async () => {
    delete process.env.DATAPLANE_JWKS_URL;
    try {
      const res = await open(nextFlow(), "HttpData-PUSH");
      expect(res.status).toBe(503);
      expect(res.body.error).toBe("no data plane configured");
    } finally {
      process.env.DATAPLANE_JWKS_URL = jwksUrl;
    }
  });
});

// ---- 2. deliver ----------------------------------------------------------------------

async function openFor(profile: string) {
  const flowId = nextFlow();
  const res = await open(flowId, profile);
  expect(res.status).toBe(201);
  appendAlone.mockClear();
  return { flowId, token: res.body.token as string };
}

function postBundle(
  flowId: string,
  token: string,
  body: string,
  hash: string = sha(body),
) {
  return request
    .post(`/spe/SPE-2/inbox/${flowId}/bundle`)
    .set("Authorization", `Bearer ${token}`)
    .set("Content-Type", "application/fhir+json")
    .set("X-Content-Sha256", hash)
    .send(body);
}

const written = (w: ReturnType<typeof workspace>) =>
  w.write.mock.calls.map(([cypher]) => String(cypher));

describe("POST /spe/:speId/inbox/:flowId/bundle", () => {
  it("writes the bundle as the flow's dataset, records the receipt and closes the inbox", async () => {
    const { flowId, token } = await openFor("HttpData-PUSH");
    const body = JSON.stringify(PSEUDONYMISED_BUNDLE);
    const res = await postBundle(flowId, token, body);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      flowId,
      speId: "SPE-2",
      records: 3,
      relationships: 2,
      sha256: sha(body),
      completed: true,
    });
    expect(spe2.executeWrite).toHaveBeenCalledTimes(1);
    const dataset = spe2.write.mock.calls.find(([c]) =>
      String(c).includes("MERGE (d)-[:LOADED_INTO]->(w)"),
    );
    expect(dataset?.[1]).toMatchObject({
      meta: {
        datasetId: flowId,
        transferId: flowId,
        assetId: "fhir-patient-search",
        agreementId: "agr-7f3c",
        speId: "SPE-2",
        pseudonymised: true,
        importedBy: "mvhd-dataplane",
      },
    });

    const [received] = pushEvents("push-received");
    expect(received.detail).toMatchObject({
      flowId,
      records: "3",
      sha256: sha(body),
      evidenceDigest: EVIDENCE,
      policyId: "default",
      profile: "HttpData-PUSH",
    });
    const back = await request.get(`/spe/SPE-2/inbox/${flowId}`);
    expect(back.body).toMatchObject({
      state: "completed",
      records: 3,
      sha256: sha(body),
    });
    expect(back.body.closedAt).toBeDefined();
  });

  it("refuses a body whose SHA-256 differs, writes nothing and records the refusal", async () => {
    const { flowId, token } = await openFor("HttpData-PUSH");
    const body = JSON.stringify(PSEUDONYMISED_BUNDLE);
    const res = await postBundle(flowId, token, body, sha("something else"));

    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/SHA-256/);
    expect(spe2.executeWrite).not.toHaveBeenCalled();
    const [refused] = pushEvents("push-refused");
    expect(refused.detail.reason).toMatch(/SHA-256/);
    expect(refused.detail).toMatchObject({ flowId, ...PARTIES });
    expect(pushEvents("push-received")).toHaveLength(0);
  });

  it("refuses a Patient with a name or a full birth date: identity never reaches an SPE", async () => {
    for (const patient of [
      { name: [{ family: "Muster", given: ["Erika"] }] },
      { birthDate: "1971-04-12" },
    ]) {
      const { flowId, token } = await openFor("HttpData-PUSH");
      const bundle = structuredClone(PSEUDONYMISED_BUNDLE);
      Object.assign(bundle.entry[0].resource, patient);
      const res = await postBundle(flowId, token, JSON.stringify(bundle));

      expect(res.status).toBe(422);
      expect(res.body.error).toMatch(/pseudonymised data only/);
      expect(spe2.executeWrite).not.toHaveBeenCalled();
      const [refused] = pushEvents("push-refused");
      expect(refused.detail.reason).toMatch(/A Patient in the push carries/);
    }
  });

  it("refuses more records than the workspace takes at once", async () => {
    const { flowId, token } = await openFor("HttpData-PUSH");
    const body = JSON.stringify({
      resourceType: "Bundle",
      type: "collection",
      entry: Array.from({ length: MAX_RECORDS + 1 }, (_, i) => ({
        resource: { resourceType: "Observation", id: `o${i}` },
      })),
    });
    const res = await postBundle(flowId, token, body);

    expect(res.status).toBe(413);
    expect(spe2.executeWrite).not.toHaveBeenCalled();
  });

  it("answers 410 to the token once the inbox has delivered, and 401 to a wrong one", async () => {
    const { flowId, token } = await openFor("HttpData-PUSH");
    const body = JSON.stringify(PSEUDONYMISED_BUNDLE);
    expect((await postBundle(flowId, token, body)).status).toBe(200);

    const again = await postBundle(flowId, token, body);
    expect(again.status).toBe(410);
    expect(again.body.error).toMatch(/completed/);
    expect((await postBundle(flowId, "a-guess", body)).status).toBe(401);
    expect(spe2.executeWrite).toHaveBeenCalledTimes(1);
  });

  it("answers 401 once the inbox has expired, and reads back as expired", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-19T10:00:00Z"));
    const { flowId, token } = await openFor("HttpData-PUSH");

    vi.setSystemTime(new Date("2026-11-19T10:15:01Z"));
    const res = await postBundle(
      flowId,
      token,
      JSON.stringify(PSEUDONYMISED_BUNDLE),
    );

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/expired/);
    expect(spe2.executeWrite).not.toHaveBeenCalled();
    const back = await request.get(`/spe/SPE-2/inbox/${flowId}`);
    expect(back.body.state).toBe("expired");
  });

  it("writes nothing when the receipt cannot be recorded, and the inbox stays open", async () => {
    const { flowId, token } = await openFor("HttpData-PUSH");
    appendAlone.mockRejectedValue(new Error("Neo4j unavailable"));
    const res = await postBundle(
      flowId,
      token,
      JSON.stringify(PSEUDONYMISED_BUNDLE),
    );

    expect(res.status).toBe(503);
    expect(spe2.executeWrite).not.toHaveBeenCalled();
    const back = await request.get(`/spe/SPE-2/inbox/${flowId}`);
    expect(back.body.state).toBe("open");
  });
});

describe("HttpStream-PUSH: chunks, then complete", () => {
  const chunk = (flowId: string, token: string, seq: number, body: string) =>
    request
      .post(`/spe/SPE-2/inbox/${flowId}/chunks/${seq}`)
      .set("Authorization", `Bearer ${token}`)
      .set("Content-Type", "application/x-ndjson")
      .set("X-Content-Sha256", sha(body))
      .send(body);
  const complete = (
    flowId: string,
    token: string,
    body: Record<string, unknown>,
  ) =>
    request
      .post(`/spe/SPE-2/inbox/${flowId}/complete`)
      .set("Authorization", `Bearer ${token}`)
      .send(body);

  const lines = PSEUDONYMISED_BUNDLE.entry.map((e) =>
    JSON.stringify(e.resource),
  );
  const first = `${lines[0]}\n${lines[1]}\n`;
  const second = `${lines[2]}\n`;

  /** Statements of the write transactions, with their parameters. */
  const writes = (w: ReturnType<typeof workspace>) =>
    w.write.mock.calls.map(
      ([cypher, params]) =>
        [String(cypher), params as Record<string, unknown>] as const,
    );

  it("writes each chunk as it arrives and marks the dataset complete on complete", async () => {
    const { flowId, token } = await openFor("HttpStream-PUSH");

    const a = await chunk(flowId, token, 0, first);
    expect(a.status).toBe(202);
    expect(a.body).toEqual({ flowId, seq: 0, records: 2 });
    // Written at once, in its own transaction, the dataset not yet complete.
    expect(spe2.executeWrite).toHaveBeenCalledTimes(1);
    const [append, appendParams] = writes(spe2).find(([c]) =>
      c.includes("d.complete = false"),
    )!;
    expect(append).toContain("ON MATCH SET d.records");
    expect(appendParams.meta).toMatchObject({ datasetId: flowId });
    expect(appendParams.added).toBe(2);
    // The stream went on the chain before its first write.
    expect(pushEvents("push-stream-started")).toHaveLength(1);
    expect(pushEvents("push-stream-started")[0].detail).toMatchObject({
      flowId,
      ...PARTIES,
      profile: "HttpStream-PUSH",
      evidenceDigest: EVIDENCE,
      policyId: "default",
    });
    expect(
      appendAlone.mock.invocationCallOrder[0] <
        spe2.executeWrite.mock.invocationCallOrder[0],
    ).toBe(true);
    expect(
      (await request.get(`/spe/SPE-2/inbox/${flowId}`)).body,
    ).toMatchObject({ state: "open", records: 2 });

    expect((await chunk(flowId, token, 1, second)).status).toBe(202);
    expect(spe2.executeWrite).toHaveBeenCalledTimes(2);
    // The Observation in chunk 1 refers to the Patient that came in chunk 0.
    const refs = writes(spe2)
      .filter(([c]) => c.includes("MERGE (a)-[:REFERS_TO"))
      .flatMap(([, p]) => p.refs as Array<{ from: string; to: string }>);
    expect(refs).toContainEqual({
      from: `${flowId}/Observation/o1`,
      to: `${flowId}/Patient/p-3f2a9c1d`,
      path: "subject",
    });
    expect(pushEvents("push-received")).toHaveLength(0);
    expect(pushEvents("push-stream-started")).toHaveLength(1);

    const res = await complete(flowId, token, {
      chunks: 2,
      records: 3,
      sha256: sha(first + second),
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      flowId,
      records: 3,
      relationships: 2,
      sha256: sha(first + second),
      completed: true,
    });
    const [, mark] = writes(spe2).find(([c]) =>
      c.includes("d.complete = $complete"),
    )!;
    expect(mark).toMatchObject({ complete: true, refused: false });
    const received = pushEvents("push-received");
    expect(received).toHaveLength(1);
    expect(received[0].detail).toMatchObject({
      records: "3",
      profile: "HttpStream-PUSH",
      sha256: sha(first + second),
    });
    expect(
      (await request.get(`/spe/SPE-2/inbox/${flowId}`)).body,
    ).toMatchObject({ state: "completed", records: 3 });
  });

  it("writes nothing when the stream's start cannot be recorded", async () => {
    const { flowId, token } = await openFor("HttpStream-PUSH");
    appendAlone.mockRejectedValueOnce(new Error("Neo4j unavailable"));

    const refused = await chunk(flowId, token, 0, first);
    expect(refused.status).toBe(503);
    expect(spe2.executeWrite).not.toHaveBeenCalled();

    // The same chunk again, once the chain answers.
    expect((await chunk(flowId, token, 0, first)).status).toBe(202);
    expect(spe2.executeWrite).toHaveBeenCalledTimes(1);
    // Asked twice: the first append was refused, the second is the record.
    expect(pushEvents("push-stream-started")).toHaveLength(2);
  });

  it("leaves an expired, incomplete stream on the chain and marked incomplete", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-20T10:00:00Z"));
    const flowId = nextFlow();
    const opened = await open(flowId, "HttpStream-PUSH");
    expect(opened.status).toBe(201);
    const token = opened.body.token as string;
    expect((await chunk(flowId, token, 0, first)).status).toBe(202);

    vi.setSystemTime(new Date("2026-11-20T10:15:01Z"));
    expect(
      (await request.get(`/spe/SPE-2/inbox/${flowId}`)).body,
    ).toMatchObject({ state: "expired", records: 2 });
    expect(pushEvents().map((e) => e.type)).toEqual([
      "push-inbox-opened",
      "push-stream-started",
    ]);
    const [, appended] = writes(spe2).find(([c]) =>
      c.includes("d.complete = false"),
    )!;
    expect(appended.meta).toMatchObject({ datasetId: flowId });
    expect(
      writes(spe2).some(([c]) => c.includes("d.complete = $complete")),
    ).toBe(false);
  });

  it("answers 409 to a chunk out of order", async () => {
    const { flowId, token } = await openFor("HttpStream-PUSH");
    const res = await chunk(flowId, token, 1, second);

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/the next is 0/);
    expect((await chunk(flowId, token, 0, first)).status).toBe(202);
    expect((await chunk(flowId, token, 0, first)).status).toBe(409);
  });

  it("marks the dataset refused when the completion's hash differs, keeps what arrived and says so", async () => {
    const { flowId, token } = await openFor("HttpStream-PUSH");
    await chunk(flowId, token, 0, first);
    await chunk(flowId, token, 1, second);

    const res = await complete(flowId, token, {
      chunks: 2,
      records: 3,
      sha256: sha(second + first),
    });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/SHA-256/);
    expect(res.body.error).toMatch(/3 records that arrived stay in SPE-2/);
    const [, mark] = writes(spe2).find(([c]) =>
      c.includes("d.complete = $complete"),
    )!;
    expect(mark).toMatchObject({ complete: false, refused: true });
    expect(String(mark.reason)).toMatch(/SHA-256/);
    expect(writes(spe2).some(([c]) => c.includes("DELETE"))).toBe(false);

    const [refused] = pushEvents("push-refused");
    expect(refused.detail).toMatchObject({ records: "3" });
    expect(refused.detail.reason).toMatch(/stay in SPE-2, marked refused/);
    expect(pushEvents("push-received")).toHaveLength(0);
    const back = await request.get(`/spe/SPE-2/inbox/${flowId}`);
    expect(back.body).toMatchObject({ state: "refused", records: 3 });
    expect(back.body.reason).toMatch(/marked refused/);
  });

  it("refuses a completion whose counts differ", async () => {
    const { flowId, token } = await openFor("HttpStream-PUSH");
    await chunk(flowId, token, 0, first);
    const res = await complete(flowId, token, {
      chunks: 1,
      records: 3,
      sha256: sha(first),
    });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/1 chunks and 2 records/);
  });

  it("takes Kafka-PUSH and Kafka-PULL as streams, chunk by chunk", async () => {
    for (const profile of ["Kafka-PUSH", "Kafka-PULL"]) {
      const { flowId, token } = await openFor(profile);
      expect((await chunk(flowId, token, 0, first)).status).toBe(202);
      const res = await complete(flowId, token, {
        chunks: 1,
        records: 2,
        sha256: sha(first),
      });
      expect(res.status).toBe(200);
      expect(pushEvents("push-received").at(-1)?.detail.profile).toBe(profile);
    }
  });

  it("keeps a stream open while chunks arrive: each one extends the inbox by the TTL", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-20T10:00:00Z"));
    const { flowId, token } = await openFor("HttpStream-PUSH");

    vi.setSystemTime(new Date("2026-11-20T10:10:00Z"));
    expect((await chunk(flowId, token, 0, first)).status).toBe(202);
    // Fifteen minutes after opening, but five after the last chunk.
    vi.setSystemTime(new Date("2026-11-20T10:20:00Z"));
    expect((await chunk(flowId, token, 1, second)).status).toBe(202);
    vi.setSystemTime(new Date("2026-11-20T10:35:01Z"));
    expect(
      (
        await complete(flowId, token, {
          chunks: 2,
          records: 3,
          sha256: sha(first + second),
        })
      ).status,
    ).toBe(401);
  });

  it("refuses a chunk that would take the stream past SPE_INBOX_STREAM_MAX_RECORDS", async () => {
    const { flowId, token } = await openFor("HttpStream-PUSH");
    // Eight observations a chunk: 8 + 8 fit under 20, a third does not.
    const eight = Array.from(
      { length: 8 },
      (_, i) =>
        `${JSON.stringify({
          resourceType: "Observation",
          id: `o-${i}`,
          status: "final",
        })}\n`,
    ).join("");
    expect((await chunk(flowId, token, 0, eight)).status).toBe(202);
    expect((await chunk(flowId, token, 1, eight)).status).toBe(202);
    const res = await chunk(flowId, token, 2, eight);
    expect(res.status).toBe(413);
    expect(res.body.error).toMatch(/more than 20 records/);
    expect(spe2.executeWrite).toHaveBeenCalledTimes(2);
  });

  it("refuses a chunk larger than 8 MiB", async () => {
    const { flowId, token } = await openFor("HttpStream-PUSH");
    const big = `${"x".repeat(8 * 1024 * 1024)}\n`;
    const res = await chunk(flowId, token, 0, big);
    expect(res.status).toBe(413);
    expect(spe2.executeWrite).not.toHaveBeenCalled();
  });

  it("refuses a chunk with a Patient that says who it is", async () => {
    const { flowId, token } = await openFor("HttpStream-PUSH");
    const named = `${JSON.stringify({
      resourceType: "Patient",
      id: "p1",
      name: "Erika Muster",
    })}\n`;
    const res = await chunk(flowId, token, 0, named);

    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/carries 'name'/);
  });

  it("refuses a bundle sent to a stream inbox", async () => {
    const { flowId, token } = await openFor("HttpStream-PUSH");
    const res = await postBundle(
      flowId,
      token,
      JSON.stringify(PSEUDONYMISED_BUNDLE),
    );
    expect(res.status).toBe(409);
  });
});

describe("PUT /spe/:speId/inbox/:flowId/file", () => {
  const put = (
    flowId: string,
    token: string,
    bytes: Buffer,
    hash = sha(bytes),
  ) =>
    request
      .put(`/spe/SPE-2/inbox/${flowId}/file`)
      .set("Authorization", `Bearer ${token}`)
      .set("Content-Type", "application/octet-stream")
      .set("X-File-Name", "extract-2026-11.bin")
      .set("X-Content-Sha256", hash)
      .send(bytes);

  it("stores the file in the workspace as the flow's dataset", async () => {
    const { flowId, token } = await openFor("HttpFile-PUSH");
    const bytes = Buffer.from([0, 1, 2, 250, 251, 252, 10, 13]);
    const res = await put(flowId, token, bytes);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      flowId,
      speId: "SPE-2",
      bytes: 8,
      sha256: sha(bytes),
      completed: true,
    });
    const [cypher, params] = spe2.write.mock.calls.find(([c]) =>
      String(c).includes(":ImportedFile"),
    ) as [string, Record<string, unknown>];
    expect(cypher).toContain("MERGE (d)-[:CONTAINS]->(f)");
    expect(cypher).not.toMatch(/\bCREATE\s*\(/);
    expect(params.file).toMatchObject({
      sha256: sha(bytes),
      bytes: 8,
      mediaType: "application/octet-stream",
      name: "extract-2026-11.bin",
      content: bytes.toString("base64"),
    });
    const [received] = pushEvents("push-received");
    expect(received.detail).toMatchObject({ bytes: "8", sha256: sha(bytes) });
  });

  it("refuses a file larger than 16 MiB", async () => {
    const { flowId, token } = await openFor("HttpFile-PUSH");
    const res = await put(flowId, token, Buffer.alloc(16 * 1024 * 1024 + 1));

    expect(res.status).toBe(413);
    expect(spe2.executeWrite).not.toHaveBeenCalled();
    expect(pushEvents("push-refused")).toHaveLength(1);
  });
});

describe("POST /spe/:speId/inbox/:flowId/refuse", () => {
  it("closes the inbox with the provider's reason and records it", async () => {
    const { flowId, token } = await openFor("HttpData-PUSH");
    const res = await request
      .post(`/spe/SPE-2/inbox/${flowId}/refuse`)
      .set("Authorization", `Bearer ${token}`)
      .send({ reason: "attestation scope node is below the floor workload" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ flowId, refused: true });
    const [refused] = pushEvents("push-refused");
    expect(refused.detail.reason).toBe(
      "attestation scope node is below the floor workload",
    );
    expect((await request.get(`/spe/SPE-2/inbox/${flowId}`)).body.state).toBe(
      "refused",
    );
    const late = await postBundle(
      flowId,
      token,
      JSON.stringify(PSEUDONYMISED_BUNDLE),
    );
    expect(late.status).toBe(410);
  });
});

// ---- 3. the dataset a push carries --------------------------------------------

describe("GET /dataspace/push-source", () => {
  const readToken = (claims: Record<string, unknown> = {}) =>
    dpToken({
      scope: "dataset:read",
      flowId: "flow-provider-1",
      datasetId: "healthdcatap-catalog",
      sub: PARTIES.consumer,
      aud: PARTIES.provider,
      ...claims,
    });

  it("answers what the dataset's route answers, for a data plane token", async () => {
    const res = await request
      .get("/dataspace/push-source")
      .set("Authorization", `Bearer ${await readToken()}`);
    const direct = await request.get("/catalog/datasets");

    expect(res.status).toBe(200);
    expect(res.body).toEqual(direct.body);
    expect(res.headers["content-type"]).toMatch(/ld\+json/);
  });

  it("answers 401 to no token, a siglet-style issuer or the wrong scope", async () => {
    expect((await request.get("/dataspace/push-source")).status).toBe(401);
    for (const token of [
      await readToken({ scope: "inbox:open" }),
      await dpToken(
        {
          scope: "dataset:read",
          flowId: "f",
          datasetId: "healthdcatap-catalog",
          sub: "a",
          aud: "b",
        },
        { issuer: "siglet-issuer" },
      ),
      await dpToken(
        {
          scope: "dataset:read",
          flowId: "f",
          datasetId: "healthdcatap-catalog",
          sub: "a",
          aud: "b",
        },
        { key: strangerKey },
      ),
    ]) {
      const res = await request
        .get("/dataspace/push-source")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(401);
      expect(res.body.error).toBe("The dataspace access token is not valid");
    }
  });

  it("answers 503 when no data plane is configured", async () => {
    delete process.env.DATAPLANE_JWKS_URL;
    try {
      const res = await request
        .get("/dataspace/push-source")
        .set("Authorization", `Bearer ${await readToken()}`);
      expect(res.status).toBe(503);
      expect(res.body.error).toBe("no data plane configured");
    } finally {
      process.env.DATAPLANE_JWKS_URL = jwksUrl;
    }
  });
});

// ---- push-source pseudonymises (the UI's rule, on the holder's side) -----------

describe("GET /dataspace/push-source pseudonymises what it serves", () => {
  // A hub patient as the graph holds it: named, a full birth date, a city.
  const PATIENT_NODE = {
    labels: ["Patient"],
    properties: {
      resourceId: "pt-1001",
      name: "Erika Muster",
      birthDate: "1965-04-12",
      gender: "female",
      city: "Berlin",
    },
  };
  const OBSERVATION_NODE = {
    labels: ["Observation"],
    properties: { resourceId: "obs-1", code: "4548-4", display: "HbA1c" },
  };

  /** What the UI's patientPseudonym gives the same id with the same key. */
  const uiPseudonym = (id: string, key: string) =>
    `p-${createHmac("sha256", key)
      .update(`patient-display:${id}`)
      .digest("hex")
      .slice(0, 8)}`;

  const readObservations = () =>
    dpToken({
      scope: "dataset:read",
      flowId: "flow-provider-2",
      datasetId: "fhir-observation-bundle",
      sub: PARTIES.consumer,
      aud: PARTIES.provider,
    });
  const pushSource = async () =>
    request
      .get("/dataspace/push-source")
      .set("Authorization", `Bearer ${await readObservations()}`);

  beforeEach(() => {
    hubRun.mockImplementation(async (cypher: string) =>
      String(cypher).includes("HAS_OBSERVATION")
        ? {
            records: [row({ p: PATIENT_NODE, o: OBSERVATION_NODE })],
          }
        : { records: [] },
    );
  });
  afterEach(() => {
    hubRun.mockReset();
    hubRun.mockResolvedValue({ records: [] });
    delete process.env.PATIENT_PSEUDONYM_KEY;
  });

  it("answers a Patient with only its type, the pseudonym, gender and birth year, and rewrites every reference to it", async () => {
    const res = await pushSource();
    const id = uiPseudonym("pt-1001", "local-development-only");

    expect(res.status).toBe(200);
    const patient = res.body.entry.find(
      (e: { resource: { resourceType: string } }) =>
        e.resource.resourceType === "Patient",
    );
    expect(patient.resource).toEqual({
      resourceType: "Patient",
      id,
      gender: "female",
      birthDate: "1965",
    });
    // The facade writes absolute fullUrls (#1174); the id in it is the pseudonym.
    expect(patient.fullUrl).toMatch(
      new RegExp(`^http://[^/]+/fhir/Patient/${id}$`),
    );
    const observation = res.body.entry.find(
      (e: { resource: { resourceType: string } }) =>
        e.resource.resourceType === "Observation",
    );
    expect(observation.resource.subject).toEqual({
      reference: `Patient/${id}`,
    });
    expect(res.text).not.toContain("Erika");
    expect(res.text).not.toContain("pt-1001");
    expect(res.text).not.toContain("Berlin");
  });

  it("gives the pseudonym the UI gives for the same id and key", async () => {
    process.env.PATIENT_PSEUDONYM_KEY = "shared-with-the-ui";
    const res = await pushSource();

    expect(res.status).toBe(200);
    expect(res.text).toContain(uiPseudonym("pt-1001", "shared-with-the-ui"));
    expect(res.text).not.toContain(
      uiPseudonym("pt-1001", "local-development-only"),
    );
  });

  it("serves nothing in production without a pseudonym key", async () => {
    const before = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const res = await pushSource();
      expect(res.status).toBe(503);
      expect(res.body).toEqual({ error: "no pseudonym key configured" });
    } finally {
      process.env.NODE_ENV = before;
    }
  });

  it("leaves the pull through /dataspace/data as the route answers it, its links leading back through the pull", async () => {
    const pulled = await request
      .get("/dataspace/data")
      .set("Authorization", "Bearer siglet-test-token");
    const direct = await request.get("/fhir/Observation");

    expect(pulled.status).toBe(200);
    // Not pseudonymised here: the UI does that for a pull, by role. Each
    // request reaches its own test server, so the fullUrls' ports differ.
    const portless = (b: { entry: Array<{ fullUrl?: string }> }) =>
      b.entry.map((e) => ({
        ...e,
        fullUrl: e.fullUrl && new URL(e.fullUrl).pathname,
      }));
    expect(portless(pulled.body)).toEqual(portless(direct.body));
    expect(pulled.body.total).toBe(direct.body.total);
    expect(pulled.text).toContain("Erika Muster");
    // The facade writes each link at the path the caller asked on (#1174).
    for (const l of pulled.body.link as Array<{ url: string }>) {
      expect(new URL(l.url).pathname).toBe("/dataspace/data");
    }
    for (const l of direct.body.link as Array<{ url: string }>) {
      expect(new URL(l.url).pathname).toBe("/fhir/Observation");
    }
  });

  it("serves a bundle the SPE inbox accepts", async () => {
    const source = await pushSource();
    const { flowId, token } = await openFor("HttpData-PUSH");
    const res = await postBundle(flowId, token, source.text);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ records: 2, relationships: 1 });
  });

  it("lets a pseudonymised Patient through the inbox's identity rule", () => {
    expect(
      identifyingPatientField({
        resourceType: "Patient",
        id: "p-1a2b3c4d",
        gender: "female",
        birthDate: "1965",
      }),
    ).toBeNull();
  });
});

// ---- the consumer has started; the provider waits for it -----------------------
//
// EDC's consumer control plane refuses a completion it receives before it has
// processed the start, so the provider's data plane delivers only once the
// consumer's has said "started" to the inbox.

describe("POST .../started and GET .../ready", () => {
  const started = (flowId: string, token?: string, speId = "SPE-2") => {
    const req = request.post(`/spe/${speId}/inbox/${flowId}/started`);
    return token ? req.set("Authorization", `Bearer ${token}`) : req;
  };
  const ready = (flowId: string, token: string) =>
    request
      .get(`/spe/SPE-2/inbox/${flowId}/ready`)
      .set("Authorization", `Bearer ${token}`);

  it("is not ready after open, and ready once the consumer has started", async () => {
    const { flowId, token } = await openFor("HttpData-PUSH");

    const before = await ready(flowId, token);
    expect(before.status).toBe(200);
    expect(before.body).toEqual({ flowId, consumerStarted: false });
    expect(
      (await request.get(`/spe/SPE-2/inbox/${flowId}`)).body.consumerStarted,
    ).toBe(false);

    const res = await started(
      flowId,
      await dpToken({ scope: "inbox:open", flowId }),
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ flowId, consumerStarted: true });

    expect((await ready(flowId, token)).body).toEqual({
      flowId,
      consumerStarted: true,
    });
    expect(
      (await request.get(`/spe/SPE-2/inbox/${flowId}`)).body.consumerStarted,
    ).toBe(true);
  });

  it("answers 404 to a token for another flow, an unknown inbox or another SPE", async () => {
    const { flowId } = await openFor("HttpData-PUSH");
    const other = await started(
      flowId,
      await dpToken({ scope: "inbox:open", flowId: "another-flow" }),
    );
    expect(other.status).toBe(404);
    expect(other.body.error).toBe("Not found");

    const unknown = nextFlow();
    expect(
      (
        await started(
          unknown,
          await dpToken({ scope: "inbox:open", flowId: unknown }),
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await started(
          flowId,
          await dpToken({ scope: "inbox:open", flowId }),
          "SPE-1",
        )
      ).status,
    ).toBe(404);
    expect(
      (await request.get(`/spe/SPE-2/inbox/${flowId}`)).body.consumerStarted,
    ).toBe(false);
  });

  it("answers 401 to started without a token or with one it cannot trust", async () => {
    const { flowId } = await openFor("HttpData-PUSH");

    const none = await started(flowId);
    expect(none.status).toBe(401);
    expect(typeof none.body.error).toBe("string");
    expect(
      (
        await started(
          flowId,
          await dpToken({ scope: "inbox:open", flowId }, { key: strangerKey }),
        )
      ).status,
    ).toBe(401);
    expect(
      (await started(flowId, await dpToken({ scope: "dataset:read", flowId })))
        .status,
    ).toBe(401);
  });

  it("answers 503 to started when no data plane is configured", async () => {
    const { flowId } = await openFor("HttpData-PUSH");
    delete process.env.DATAPLANE_JWKS_URL;
    try {
      const res = await started(flowId, "any");
      expect(res.status).toBe(503);
      expect(res.body.error).toBe("no data plane configured");
    } finally {
      process.env.DATAPLANE_JWKS_URL = jwksUrl;
    }
  });

  it("answers 401 to ready with a wrong inbox token, and 410 once the inbox has delivered", async () => {
    const { flowId, token } = await openFor("HttpData-PUSH");

    const wrong = await ready(flowId, "a-guess");
    expect(wrong.status).toBe(401);
    expect(wrong.body.error).toBe("The inbox token is not valid");

    expect(
      (await postBundle(flowId, token, JSON.stringify(PSEUDONYMISED_BUNDLE)))
        .status,
    ).toBe(200);
    const done = await ready(flowId, token);
    expect(done.status).toBe(410);
    expect(done.body.error).toMatch(/completed/);
  });
});

// ---- a paged dataset through push-source, and on into a stream -----------------

describe("the Holter ECG through /dataspace/push-source", () => {
  const ecgToken = () =>
    dpToken({
      scope: "dataset:read",
      flowId: "flow-ecg-1",
      datasetId: "ecg-holter-stream",
      sub: PARTIES.consumer,
      aud: PARTIES.provider,
    });
  // The 24 hour dataset fixes ten-minute pages (seconds=600); a short
  // recording in one-minute strips keeps this to two pages.
  const QUERY =
    "offsetSeconds=0&seconds=600&durationSeconds=660&stripSeconds=60";
  const pseudonym = `p-${createHmac("sha256", "local-development-only")
    .update("patient-display:holter-demo-1")
    .digest("hex")
    .slice(0, 8)}`;

  interface Page {
    entry: Array<{ resource: Record<string, unknown> }>;
    link: Array<{ relation: string; url: string }>;
  }
  const next = (b: Page) => b.link.find((l) => l.relation === "next")?.url;

  it("passes the query on, turns the paging links to push-source and pseudonymises every window", async () => {
    const first = await request
      .get(`/dataspace/push-source?${QUERY}`)
      .set("Authorization", `Bearer ${await ecgToken()}`);
    expect(first.status).toBe(200);
    expect(first.body.link).toEqual([
      { relation: "self", url: `/dataspace/push-source?${QUERY}` },
      {
        relation: "next",
        url: "/dataspace/push-source?offsetSeconds=600&seconds=600&durationSeconds=660&stripSeconds=60",
      },
    ]);
    expect(first.body.entry[0].resource).toEqual({
      resourceType: "Patient",
      id: pseudonym,
      gender: "male",
      birthDate: "1961",
    });

    // The data plane follows `next` with a fresh token. This window holds
    // no Patient, and its references still leave pseudonymised.
    const second = await request
      .get(next(first.body)!)
      .set("Authorization", `Bearer ${await ecgToken()}`);
    expect(second.status).toBe(200);
    expect(
      second.body.entry.map((e: { resource: { id: string } }) => e.resource.id),
    ).toEqual(["holter-strip-10"]);
    expect(second.body.entry[0].resource.subject).toEqual({
      reference: `Patient/${pseudonym}`,
    });
    expect(next(second.body)).toBeUndefined();
    expect(first.text + second.text).not.toMatch(/Patient\/holter-demo-1"/);
    expect(first.text).not.toContain("Holter Demo");
  });

  it("leaves the pull through /dataspace/data as the route answers it, its links leading back through the pull", async () => {
    const pulled = await request
      .get(`/dataspace/data?${QUERY}`)
      .set("Authorization", "Bearer siglet-ecg-token");
    const direct = await request.get(`/synthetic/ecg-holter?${QUERY}`);
    expect(pulled.status).toBe(200);
    expect(pulled.body.entry).toEqual(direct.body.entry);
    expect(pulled.body.total).toBe(direct.body.total);
    expect(pulled.body.link[1].url).toBe(
      "/dataspace/data?offsetSeconds=600&seconds=600&durationSeconds=660&stripSeconds=60",
    );
    expect(direct.body.link[1].url).toBe(
      "/synthetic/ecg-holter?offsetSeconds=600&seconds=600&durationSeconds=660&stripSeconds=60",
    );
  });

  it("streams window by window into an SPE inbox as Kafka-PUSH chunks", async () => {
    const { flowId, token } = await openFor("Kafka-PUSH");
    let url: string | undefined = `/dataspace/push-source?${QUERY}`;
    let seq = 0;
    let lines = 0;
    let all = "";
    while (url) {
      const page = await request
        .get(url)
        .set("Authorization", `Bearer ${await ecgToken()}`);
      const ndjson = (page.body as Page).entry
        .map((e) => `${JSON.stringify(e.resource)}\n`)
        .join("");
      lines += (page.body as Page).entry.length;
      all += ndjson;
      const res = await request
        .post(`/spe/SPE-2/inbox/${flowId}/chunks/${seq}`)
        .set("Authorization", `Bearer ${token}`)
        .set("Content-Type", "application/x-ndjson")
        .set("X-Content-Sha256", sha(ndjson))
        .send(ndjson);
      expect(res.status).toBe(202);
      seq++;
      url = next(page.body as Page);
    }
    const done = await request
      .post(`/spe/SPE-2/inbox/${flowId}/complete`)
      .set("Authorization", `Bearer ${token}`)
      .send({ chunks: seq, records: lines, sha256: sha(all) });
    expect(done.status).toBe(200);
    // The Patient and eleven strips; every strip refers to the Patient, the
    // one in the second window across the chunk boundary.
    expect(seq).toBe(2);
    expect(done.body).toMatchObject({ records: 12, relationships: 11 });
    expect(spe2.executeWrite).toHaveBeenCalledTimes(seq + 1);
  });
});

describe("the one hour Holter dataset (ecg-holter-hour)", () => {
  const hourToken = () =>
    dpToken({
      scope: "dataset:read",
      flowId: "flow-ecg-hour",
      datasetId: "ecg-holter-hour",
      sub: PARTIES.consumer,
      aud: PARTIES.provider,
    });
  const get = async (url: string) =>
    request.get(url).set("Authorization", `Bearer ${await hourToken()}`);

  it("serves an hour from a request without a query, and its next links stay on push-source", async () => {
    const first = await get("/dataspace/push-source");
    expect(first.status).toBe(200);
    expect(first.body.total).toBe(120);
    const next = first.body.link.find(
      (l: { relation: string }) => l.relation === "next",
    ).url as string;
    expect(next).toBe(
      "/dataspace/push-source?offsetSeconds=600&seconds=600&durationSeconds=3600&stripSeconds=30",
    );
    const second = await get(next);
    expect(second.status).toBe(200);
    expect(second.body.entry[0].resource.id).toBe("holter-strip-20");

    // The last window of the hour has no next.
    const last = await get("/dataspace/push-source?offsetSeconds=3000");
    expect(last.status).toBe(200);
    expect(
      last.body.link.some((l: { relation: string }) => l.relation === "next"),
    ).toBe(false);
  });

  it("refuses a caller that asks the hour dataset for a longer recording", async () => {
    const res = await get("/dataspace/push-source?durationSeconds=86400");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe(
      "Dataset ecg-holter-hour is read with durationSeconds=3600",
    );
    const past = await get("/dataspace/push-source?offsetSeconds=3600");
    expect(past.status).toBe(400);
    // The page size is fixed too: an hour is six requests.
    const small = await get("/dataspace/push-source?seconds=60");
    expect(small.status).toBe(400);
    expect(small.body.error).toBe(
      "Dataset ecg-holter-hour is read with seconds=600",
    );
  });

  it("leaves the 24 hour dataset at 24 hours", async () => {
    const res = await request.get("/dataspace/push-source").set(
      "Authorization",
      `Bearer ${await dpToken({
        scope: "dataset:read",
        flowId: "flow-ecg-day",
        datasetId: "ecg-holter-stream",
        sub: PARTIES.consumer,
        aud: PARTIES.provider,
      })}`,
    );
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2880);
  });
});

// ---- no Patient id but a pseudonym leaves push-source ----------------------------

describe("push-source answers carry no original Patient id", () => {
  const ERIKA = {
    labels: ["Patient"],
    properties: {
      resourceId: "pt-1001",
      name: "Erika Muster",
      birthDate: "1965-04-12",
      gender: "female",
      city: "Berlin",
    },
  };
  const MAX = {
    labels: ["Patient"],
    properties: {
      fhirId: "8c1f2e4a-7b3d-4e5f-9a6b-1c2d3e4f5a6b",
      firstName: "Max",
      lastName: "Beispiel",
      birthDate: "1972-09-30",
      gender: "male",
    },
  };
  const OBS = (id: string) => ({
    labels: ["Observation"],
    properties: { resourceId: id, code: "4548-4", display: "HbA1c" },
  });
  const COND = {
    labels: ["Condition"],
    properties: { resourceId: "cond-1", code: "44054006", display: "Diabetes" },
  };
  const ORIGINAL = [
    "pt-1001",
    "8c1f2e4a-7b3d-4e5f-9a6b-1c2d3e4f5a6b",
    "Erika",
    "Muster",
    "Beispiel",
    "Berlin",
    "1965-04-12",
    "1972-09-30",
  ];

  beforeEach(() => {
    hubRun.mockImplementation(async (cypher: string) => {
      const c = String(cypher);
      if (c.includes("collect(DISTINCT enc)")) {
        return {
          records: [
            row({
              p: ERIKA,
              encounters: [],
              conditions: [COND],
              observations: [OBS("obs-9")],
              procedures: [],
              medications: [],
              reports: [],
              immunizations: [],
              statements: [],
            }),
          ],
        };
      }
      if (c.includes("HAS_OBSERVATION")) {
        return {
          records: [
            row({ p: ERIKA, o: OBS("obs-1") }),
            row({ p: MAX, o: OBS("obs-2") }),
          ],
        };
      }
      if (c.includes("RETURN p ORDER BY")) {
        return { records: [row({ p: ERIKA }), row({ p: MAX })] };
      }
      return { records: [] };
    });
  });
  afterEach(() => {
    hubRun.mockReset();
    hubRun.mockResolvedValue({ records: [] });
  });

  const read = async (datasetId: string, url: string) =>
    request.get(url).set(
      "Authorization",
      `Bearer ${await dpToken({
        scope: "dataset:read",
        flowId: "flow-scan",
        datasetId,
        sub: PARTIES.consumer,
        aud: PARTIES.provider,
      })}`,
    );

  /** The whole JSON text, as the data plane receives it. */
  function expectNoOriginal(text: string, where: string) {
    for (const original of ORIGINAL) {
      expect(text, `${where} carries ${original}`).not.toContain(original);
    }
  }

  it("for /fhir/Patient", async () => {
    const res = await read("fhir-patient-search", "/dataspace/push-source");
    expect(res.status).toBe(200);
    expect(res.body.entry).toHaveLength(2);
    expectNoOriginal(res.text, "/fhir/Patient");
    expect(res.text).toMatch(/\/fhir\/Patient\/p-[0-9a-f]{8}"/);
  });

  it("for /fhir/Observation, a patient parameter in its links included", async () => {
    for (const query of [
      "",
      "?patient=pt-1001",
      "?patient=Patient%2Fpt-1001",
      "?patient=Patient/pt-1001",
    ]) {
      const res = await read(
        "fhir-observation-bundle",
        `/dataspace/push-source${query}`,
      );
      expect(res.status, query).toBe(200);
      expectNoOriginal(res.text, `/fhir/Observation${query}`);
      if (query) {
        const self = res.body.link.find(
          (l: { relation: string }) => l.relation === "self",
        ).url as string;
        expect(new URL(self).searchParams.get("patient")).toMatch(
          /^(Patient\/)?p-[0-9a-f]{8}$/,
        );
      }
    }
  });

  it("for $everything, and for its not-found outcome", async () => {
    const res = await read(
      "fhir-patient-everything",
      "/dataspace/push-source/pt-1001/$everything",
    );
    expect(res.status).toBe(200);
    expect(res.body.entry.length).toBeGreaterThanOrEqual(3);
    expectNoOriginal(res.text, "$everything");

    hubRun.mockResolvedValue({ records: [] });
    hubRun.mockImplementation(async () => ({ records: [] }));
    const missing = await read(
      "fhir-patient-everything",
      "/dataspace/push-source/pt-1001/$everything",
    );
    expect(missing.status).toBe(404);
    expectNoOriginal(missing.text, "$everything not found");
  });

  it("for every window of the Holter ECG", async () => {
    let url: string | undefined =
      "/dataspace/push-source?offsetSeconds=0&seconds=600&durationSeconds=1260&stripSeconds=60";
    let pages = 0;
    while (url) {
      const res = await read("ecg-holter-stream", url);
      expect(res.status).toBe(200);
      expect(res.text).not.toContain("holter-demo-1");
      expect(res.text).not.toContain("Holter Demo");
      expect(res.text).not.toContain("1961-05-23");
      url = res.body.link.find(
        (l: { relation: string }) => l.relation === "next",
      )?.url;
      pages++;
    }
    expect(pages).toBe(3);
  });
});

describe("pseudonymiseFhir everywhere: the shapes a Patient id takes", () => {
  it("rewrites the id in each shape the facade and the routes emit", async () => {
    const { pseudonymiseFhir, patientPseudonym } = await import(
      "../src/pseudonymise.js"
    );
    const p = patientPseudonym("pt-1001").replace("Patient ", "p-");
    const out = pseudonymiseFhir(
      {
        resourceType: "Bundle",
        link: [
          {
            relation: "self",
            url: "http://h:9090/dataspace/push-source?patient=pt-1001&_count=1",
          },
          {
            relation: "next",
            url: "http://h/x?subject:Patient=pt-1001&_offset=1",
          },
          {
            relation: "other",
            url: "http://h/fhir/Patient/pt-1001/$everything",
          },
        ],
        entry: [
          {
            fullUrl: "http://h:9090/fhir/Observation/o1",
            resource: {
              resourceType: "Observation",
              id: "o1",
              subject: { reference: "Patient/pt-1001" },
              performer: [{ reference: "http://h/fhir/Patient/pt-1001" }],
              focus: [{ reference: "urn:x/Patient/pt-1001" }],
              note: [{ text: "see Patient/pt-1001 for context" }],
            },
          },
          {
            resource: {
              resourceType: "OperationOutcome",
              issue: [{ diagnostics: "Patient/pt-1001 not found" }],
            },
          },
          { fullUrl: "http://h/fhir/Patient%2Fpt-1001", resource: {} },
        ],
      },
      { everywhere: true },
    );
    const text = JSON.stringify(out);
    expect(text).not.toContain("pt-1001");
    expect(text.split(p).length - 1).toBe(9);
    // The rest of a link is left as it was.
    expect(text).toContain("&_count=1");
    expect(text).toContain("/fhir/Observation/o1");
  });
});
