/**
 * GET /spe/status (#774, ADR-069): the administration's view of the two SPE
 * workspaces and the access body's Trustee, in the contract's shape, built
 * from what each workspace recorded itself (SpeAttestation, SpeEvent). Each
 * event reaches the hub's audit chain `spe` once, with the fields the
 * auditor filters on as node properties; a replaced load is recorded as
 * destroyed. With NEO4J_SPE1_URI set, SPE-1 is the workspace for federated
 * questions, never the hub graph, and k = 5 and the Art. 71 rewrite still
 * hold on every answer.
 */
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

process.env.NEO4J_SPE1_URI = "bolt://spe1:7687";
process.env.NEO4J_SPE2_URI = "bolt://spe2:7687";
process.env.SPE_ENVIRONMENT = "azure";
process.env.TRUSTEE_URL = "https://mvhd-trustee.example.test";
process.env.SPE1_RUNS_ON =
  "ACI confidential container group mvhd-spe-1 (westeurope)";
process.env.SPE2_RUNS_ON =
  "ACI confidential container group mvhd-spe-1 (westeurope)";
process.env.SPE_AUDIT_SYNC_MS = "0";

type Row = Record<string, unknown>;
const record = (row: Row) => ({
  keys: Object.keys(row),
  get: (k: string) => row[k],
});

function workspaceDriver(name: string) {
  const run = vi.fn();
  // The opt-out sync writes through executeWrite; its tx.run is `write`.
  const write = vi.fn();
  return {
    name,
    run,
    write,
    session: vi.fn(() => ({
      run,
      close: vi.fn(),
      executeWrite: (work: (tx: { run: typeof write }) => unknown) =>
        work({ run: write }),
    })),
    getServerInfo: vi.fn().mockResolvedValue({ address: `${name}:7687` }),
    close: vi.fn(),
  };
}

const hub = workspaceDriver("hub");
const spe1 = workspaceDriver("spe1");
const spe2 = workspaceDriver("spe2");
const hubWrite = vi.fn();
hub.session.mockImplementation(() => ({
  run: hub.run,
  close: vi.fn(),
  executeWrite: (work: (tx: { run: typeof hubWrite }) => unknown) =>
    work({ run: hubWrite }),
}));

vi.mock("neo4j-driver", () => ({
  default: {
    driver: vi.fn((uri: string) =>
      uri.includes("spe1") ? spe1 : uri.includes("spe2") ? spe2 : hub,
    ),
    auth: { basic: vi.fn() },
    int: vi.fn((n: number) => n),
    isInt: vi.fn(() => false),
    integer: { toNumber: (n: unknown) => Number(n) },
    session: { READ: "READ", WRITE: "WRITE" },
  },
}));

// The SPE sync appends alone (its own transaction); the queue that /nlq's
// records share is appendAuditEvent, which the sync must never use.
const appendAuditEvent = vi.fn();
const appendQueue = vi.fn();
const appendQueryAudit = vi.fn().mockResolvedValue({});
vi.mock("../src/audit-chain.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/audit-chain.js")>()),
  appendAuditEventAlone: (...a: unknown[]) => appendAuditEvent(...a),
  appendAuditEvent: (...a: unknown[]) => appendQueue(...a),
  appendQueryAudit: (...a: unknown[]) => appendQueryAudit(...a),
}));

const { app, main } = await import("../src/index.js");
const { setSpe2Driver, getSpeDrivers, workspaceDriverOptions } = await import(
  "../src/db.js"
);
const { resetSpeAuditCache, runSpeSync } = await import("../src/spe-status.js");
import supertest from "supertest";

const request = supertest(app);

const ATTESTATION = {
  verifier: "snp",
  result: "pass",
  evidenceDigest: `sha256:${"e".repeat(64)}`,
  tokenIssuedAt: "2026-10-31T07:20:00.000Z",
  tokenExpiresAt: "2026-10-31T07:25:00.000Z",
  policyId: "default",
  claims: {
    tee: "snp",
    measurement: "ab12",
    reportedTcb: "bootloader=3 tee=0 snp=8 microcode=115",
    hostData: "a".repeat(64),
    reportData: "beef",
    pcrs: null,
    vmId: null,
  },
  refusalReason: null,
};

function speAttestation(speId: string, loadId: string, over: Row = {}): Row {
  return {
    speId,
    holder: speId === "SPE-1" ? "AlphaKlinik Berlin" : "Limburg Medical Centre",
    runsOn: "ACI confidential container group mvhd-spe-1 (westeurope)",
    teeType: "AMD SEV-SNP",
    attestationScope: "workload",
    simulated: false,
    label: "Attested: confidential workload",
    attestedAt: "2026-10-31T07:20:00.000Z",
    keyReleasedAt: "2026-10-31T07:20:01.000Z",
    permitId: "hdab-medreg-spe-2026-001",
    policyHash: `sha256:${"a".repeat(64)}`,
    policyCheckedByHardware: true,
    status: "ready",
    loadId,
    attestation: JSON.stringify(ATTESTATION),
    ...over,
  };
}

function speEvent(
  speId: string,
  eventId: string,
  type: string,
  loadId: string,
): Row {
  return {
    eventId,
    type,
    at: "2026-10-31T07:20:01.000Z",
    outcome: "success",
    speId,
    permitId: "hdab-medreg-spe-2026-001",
    policyHash: `sha256:${"a".repeat(64)}`,
    teeType: "AMD SEV-SNP",
    attestationScope: "workload",
    simulated: false,
    loadId,
    detail: JSON.stringify({ earStatus: "affirming" }),
  };
}

function statusResult(
  attestation: Row | null,
  patients: number,
  events: Row[],
) {
  return { records: [record({ attestation, patients, events })] };
}

let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeAll(async () => {
  vi.spyOn(app, "listen").mockImplementation((_p: unknown, cb?: () => void) => {
    if (cb) cb();
    return { close: vi.fn() } as never;
  });
  await main();
});

beforeEach(() => {
  setSpe2Driver(spe2 as never);
  resetSpeAuditCache();
  appendAuditEvent.mockReset();
  appendAuditEvent.mockImplementation(
    async (chain: string, resource: { id: string }) => ({
      chain,
      seq: 1,
      prevHash: "0",
      hash: `h-${resource.id}`,
      resource,
    }),
  );
  hubWrite.mockReset();
  hubWrite.mockResolvedValue({ records: [record({ before: null })] });
  spe1.run.mockReset();
  spe2.run.mockReset();
  hub.run.mockReset();
  // No opt-outs in the hub, nothing to change in a workspace, by default.
  hub.run.mockResolvedValue({ records: [] });
  for (const w of [spe1, spe2]) {
    w.write.mockReset();
    w.write.mockResolvedValue({ records: [record({ c: 0 })] });
  }
  appendQueue.mockReset();
  fetchSpy = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response("", { status: 401 }));
});

afterEach(() => {
  fetchSpy.mockRestore();
});

describe("GET /spe/status", () => {
  it("answers in the contract's shape, from what each workspace recorded", async () => {
    spe1.run.mockResolvedValue(
      statusResult(speAttestation("SPE-1", "load-1"), 108, []),
    );
    spe2.run.mockResolvedValue(
      statusResult(speAttestation("SPE-2", "load-2"), 108, []),
    );

    const res = await request.get("/spe/status");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      environment: "azure",
      trustee: {
        url: "https://mvhd-trustee.example.test",
        operator: "MedReg DE (access body)",
        verifier: "snp",
        reachable: true,
      },
      spes: [
        {
          id: "SPE-1",
          holder: "AlphaKlinik Berlin",
          runsOn: "ACI confidential container group mvhd-spe-1 (westeurope)",
          teeType: "AMD SEV-SNP",
          attestationScope: "workload",
          simulated: false,
          label: "Attested: confidential workload",
          attestedAt: "2026-10-31T07:20:00.000Z",
          keyReleasedAt: "2026-10-31T07:20:01.000Z",
          permitId: "hdab-medreg-spe-2026-001",
          policyHash: `sha256:${"a".repeat(64)}`,
          policyCheckedByHardware: true,
          patients: 108,
          status: "ready",
          attestation: ATTESTATION,
        },
        expect.objectContaining({
          id: "SPE-2",
          holder: "Limburg Medical Centre",
          status: "ready",
          patients: 108,
        }),
      ],
      residualTrust: [
        "AMD root of trust",
        "Microsoft utility VM image (measurement endorsed by Microsoft)",
      ],
    });
    // SPE-1 is the workspace: the hub graph was not asked for its patients.
    expect(hub.run).not.toHaveBeenCalled();
    expect(String(fetchSpy.mock.calls[0][0])).toBe(
      "https://mvhd-trustee.example.test/kbs/v0/auth",
    );
  });

  it("shows a workspace that does not answer as unreachable, every field present", async () => {
    spe1.run.mockResolvedValue(
      statusResult(speAttestation("SPE-1", "load-1"), 108, []),
    );
    spe2.run.mockRejectedValue(new Error("ServiceUnavailable"));
    fetchSpy.mockRejectedValue(new Error("ECONNREFUSED"));

    const res = await request.get("/spe/status");

    expect(res.body.trustee.reachable).toBe(false);
    const two = res.body.spes[1];
    expect(two).toMatchObject({
      id: "SPE-2",
      status: "unreachable",
      patients: null,
      attestedAt: null,
      keyReleasedAt: null,
      permitId: null,
      policyHash: null,
      simulated: true,
      label: "Simulated attestation",
    });
    expect(two.attestation).toEqual({
      verifier: null,
      result: null,
      evidenceDigest: null,
      tokenIssuedAt: null,
      tokenExpiresAt: null,
      policyId: null,
      claims: {
        tee: null,
        measurement: null,
        reportedTcb: null,
        hostData: null,
        reportData: null,
        pcrs: null,
        vmId: null,
      },
      refusalReason: null,
    });
  });

  it("shows a refusal with its reason, and no key release", async () => {
    const refused = speAttestation("SPE-2", "load-3", {
      status: "refused",
      keyReleasedAt: null,
      reason:
        "Trustee refused default/spe-2/extract-key: Access denied by policy",
      attestation: JSON.stringify({
        ...ATTESTATION,
        result: "fail",
        refusalReason:
          "Trustee refused default/spe-2/extract-key: Access denied by policy",
      }),
    });
    spe1.run.mockResolvedValue(
      statusResult(speAttestation("SPE-1", "load-1"), 108, []),
    );
    spe2.run.mockResolvedValue(statusResult(refused, 0, []));

    const res = await request.get("/spe/status");

    expect(res.body.spes[1]).toMatchObject({
      status: "refused",
      patients: 0,
      keyReleasedAt: null,
    });
    expect(res.body.spes[1].attestation).toMatchObject({
      result: "fail",
      refusalReason: expect.stringContaining("Access denied"),
    });
  });
});

describe("SPE events on the audit chain", () => {
  it("appends each workspace event once, with the auditor's fields as node properties", async () => {
    spe1.run.mockResolvedValue(
      statusResult(speAttestation("SPE-1", "load-1"), 108, [
        speEvent("SPE-1", "ev-1", "spe.attestation", "load-1"),
        speEvent("SPE-1", "ev-2", "spe.key_release", "load-1"),
      ]),
    );
    spe2.run.mockResolvedValue(
      statusResult(speAttestation("SPE-2", "load-2"), 108, [
        speEvent("SPE-2", "ev-3", "spe.workspace_loaded", "load-2"),
      ]),
    );

    await runSpeSync();
    await runSpeSync();

    expect(appendAuditEvent).toHaveBeenCalledTimes(3);
    expect(appendQueue).not.toHaveBeenCalled();
    const [chain, resource, index] = appendAuditEvent.mock.calls[0];
    expect(chain).toBe("spe");
    expect(resource).toMatchObject({
      resourceType: "AuditEvent",
      id: "ev-1",
      subtype: [{ code: "spe.attestation" }],
    });
    expect(index).toEqual({
      participantId: "SPE-1",
      outcome: "success",
      dedupeKey: "spe:ev-1",
      properties: {
        speId: "SPE-1",
        permitId: "hdab-medreg-spe-2026-001",
        policyHash: `sha256:${"a".repeat(64)}`,
        teeType: "AMD SEV-SNP",
        attestationScope: "workload",
        simulated: false,
      },
    });
    expect(
      appendAuditEvent.mock.calls.map((c) => c[1].subtype[0].code),
    ).toEqual(["spe.attestation", "spe.key_release", "spe.workspace_loaded"]);
  });

  it("records the replaced load as destroyed", async () => {
    hubWrite.mockResolvedValue({
      records: [
        record({
          before: {
            speId: "SPE-2",
            loadId: "load-old",
            permitId: "hdab-medreg-spe-2026-001",
            policyHash: `sha256:${"a".repeat(64)}`,
            teeType: "AMD SEV-SNP",
            attestationScope: "workload",
            simulated: false,
            seenAt: "2026-10-30T18:13:00.000Z",
          },
        }),
      ],
    });
    spe1.run.mockResolvedValue(statusResult(null, 0, []));
    spe2.run.mockResolvedValue(
      statusResult(speAttestation("SPE-2", "load-new"), 108, []),
    );

    await runSpeSync();

    const destroyed = appendAuditEvent.mock.calls.find(
      (c) => c[1].subtype[0].code === "spe.workspace_destroyed",
    );
    expect(destroyed).toBeDefined();
    expect(destroyed![2]).toMatchObject({
      dedupeKey: "spe:destroyed-load-old",
      properties: { speId: "SPE-2" },
    });
  });

  it("GET /spe/status writes nothing: no audit append, no hub write", async () => {
    spe1.run.mockResolvedValue(
      statusResult(speAttestation("SPE-1", "load-1"), 108, [
        speEvent("SPE-1", "ev-7", "spe.attestation", "load-1"),
      ]),
    );
    spe2.run.mockResolvedValue(
      statusResult(speAttestation("SPE-2", "load-2"), 108, []),
    );
    const res = await request.get("/spe/status");
    expect(res.status).toBe(200);
    expect(appendAuditEvent).not.toHaveBeenCalled();
    expect(hubWrite).not.toHaveBeenCalled();
    expect(spe1.write).not.toHaveBeenCalled();
  });

  it("skips a tick while the previous sync still runs", async () => {
    let release: (v: unknown) => void = () => undefined;
    spe1.run.mockReturnValue(new Promise((r) => (release = r)));
    spe2.run.mockResolvedValue(
      statusResult(speAttestation("SPE-2", "load-2"), 108, []),
    );
    const firstRun = runSpeSync();
    const second = await runSpeSync();
    expect(second).toBe(false);
    release(statusResult(speAttestation("SPE-1", "load-1"), 108, []));
    expect(await firstRun).toBe(true);
    // And the next tick runs again.
    spe1.run.mockResolvedValue(
      statusResult(speAttestation("SPE-1", "load-1"), 108, []),
    );
    expect(await runSpeSync()).toBe(true);
  });

  it("still answers when the chain cannot be written", async () => {
    appendAuditEvent.mockRejectedValue(new Error("deadlock"));
    spe1.run.mockResolvedValue(
      statusResult(speAttestation("SPE-1", "load-1"), 108, [
        speEvent("SPE-1", "ev-9", "spe.attestation", "load-1"),
      ]),
    );
    spe2.run.mockResolvedValue(
      statusResult(speAttestation("SPE-2", "load-2"), 108, []),
    );
    await expect(runSpeSync()).resolves.toBe(true);
    const res = await request.get("/spe/status");
    expect(res.status).toBe(200);
  });
});

describe("Art. 71 opt-outs reach the workspaces (ADR-062)", () => {
  it("marks the hub's opted-out persons in each workspace and unmarks the rest, counts only on the chain", async () => {
    hub.run.mockResolvedValue({
      records: [
        record({ label: "Patient", key: "p-17" }),
        record({ label: "Condition", key: "c-4" }),
      ],
    });
    // One person newly marked in each workspace, one taken off in SPE-2.
    spe1.write.mockImplementation(async (q: string) =>
      /SET n:OptedOut/.test(q) && /Patient/.test(q)
        ? { records: [record({ c: 1 })] }
        : { records: [record({ c: 0 })] },
    );
    spe2.write.mockImplementation(async (q: string) =>
      /REMOVE n:OptedOut/.test(q) && /`Patient`/.test(q)
        ? { records: [record({ c: 1 })] }
        : { records: [record({ c: 0 })] },
    );
    spe1.run.mockResolvedValue(
      statusResult(speAttestation("SPE-1", "load-1"), 107, []),
    );
    spe2.run.mockResolvedValue(
      statusResult(speAttestation("SPE-2", "load-2"), 108, []),
    );

    await runSpeSync();

    // The hub is read for every person-level label, by parameter.
    const [hubQuery, hubParams] = hub.run.mock.calls[0];
    expect(String(hubQuery)).toContain(":OptedOut");
    expect(hubParams.labels).toContain("Patient");
    // The workspace gets the keys as parameters, per label, and only nodes the
    // loader wrote are unmarked.
    const add = spe1.write.mock.calls.find(
      (c) => /SET n:OptedOut/.test(c[0]) && /`Patient`/.test(c[0]),
    );
    expect(add?.[1]).toEqual({ keys: ["p-17"] });
    const remove = spe1.write.mock.calls.find(
      (c) => /REMOVE n:OptedOut/.test(c[0]) && /`Condition`/.test(c[0]),
    );
    expect(remove?.[0]).toContain("n._speKey IS NOT NULL");
    expect(remove?.[1]).toEqual({ keys: ["c-4"] });

    const synced = appendAuditEvent.mock.calls.filter(
      (c) => c[1].subtype[0].code === "spe.optout_synced",
    );
    expect(synced.map((c) => c[2].participantId)).toEqual(["SPE-1", "SPE-2"]);
    const evidence = (resource: {
      entity: Array<{ detail?: Array<{ type: string; valueString: string }> }>;
    }) =>
      JSON.parse(
        resource.entity
          .flatMap((e) => e.detail ?? [])
          .find((d) => d.type === "evidence")!.valueString,
      );
    expect(evidence(synced[0][1])).toEqual({
      optedOutAdded: 1,
      optedOutRemoved: 0,
      optedOutInHub: 2,
    });
    expect(evidence(synced[1][1])).toEqual({
      optedOutAdded: 0,
      optedOutRemoved: 1,
      optedOutInHub: 2,
    });
    expect(JSON.stringify(synced)).not.toContain("p-17");
  });

  it("records nothing when nothing changed", async () => {
    spe1.run.mockResolvedValue(
      statusResult(speAttestation("SPE-1", "load-1"), 107, []),
    );
    spe2.run.mockResolvedValue(
      statusResult(speAttestation("SPE-2", "load-2"), 108, []),
    );
    await runSpeSync();
    expect(
      appendAuditEvent.mock.calls.filter(
        (c) => c[1].subtype[0].code === "spe.optout_synced",
      ),
    ).toEqual([]);
  });
});

describe("SPE-1 as a workspace", () => {
  it("federates over the workspaces, not the hub, with k = 5 and the Art. 71 rewrite", async () => {
    expect(
      getSpeDrivers().map((s) => [
        s.label,
        (s.driver as unknown as { name: string }).name,
      ]),
    ).toEqual([
      ["SPE-1", "spe1"],
      ["SPE-2", "spe2"],
    ]);
    spe1.run.mockResolvedValue({ records: [record({ patients: 108 })] });
    spe2.run.mockResolvedValue({ records: [record({ patients: 3 })] });

    const res = await request
      .post("/nlq")
      .send({ question: "How many SPEs can I access?" });

    expect(res.status).toBe(200);
    expect(res.body.federated).toBe(true);
    expect(res.body.minKApplied).toBe(5);
    // The hub gets the access log, not the question.
    expect(
      hub.run.mock.calls
        .map((c) => String(c[0]))
        .filter((q) => q.includes(":Patient")),
    ).toEqual([]);
    const asked = String(spe1.run.mock.calls[0][0]);
    expect(asked).toContain("OptedOut");
    const two = res.body.results.find(
      (r: { _source: string }) => r._source === "SPE-2",
    );
    expect(two?.patients).not.toBe(3);
  });

  it("answers a question without `federated` from the hub graph, not the workspace", async () => {
    hub.run.mockResolvedValue({ records: [record({ patientCount: 215 })] });
    const res = await request
      .post("/nlq")
      .send({ question: "How many patients are there?" });
    expect(res.status).toBe(200);
    expect(res.body.federated).toBe(false);
    expect(
      hub.run.mock.calls.some((c) => String(c[0]).includes(":(Patient)")),
    ).toBe(true);
    expect(spe1.run).not.toHaveBeenCalled();
    expect(spe2.run).not.toHaveBeenCalled();
  });

  it("leaves a workspace that is down out, rather than asking the hub", async () => {
    const { setSpe1Driver } = await import("../src/db.js");
    setSpe1Driver(null);
    try {
      expect(getSpeDrivers().map((s) => s.label)).toEqual(["SPE-2"]);
    } finally {
      setSpe1Driver(spe1 as never);
    }
  });
});

describe("workspaceDriverOptions", () => {
  it("pins the workspaces' CA and turns bolt+s into an encrypted plain scheme", () => {
    const o = workspaceDriverOptions("bolt+s://20.1.2.3:7687", {
      pem: "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----\n",
    });
    expect(o.uri).toBe("bolt://20.1.2.3:7687");
    expect(o.config).toMatchObject({
      encrypted: "ENCRYPTION_ON",
      trust: "TRUST_CUSTOM_CA_SIGNED_CERTIFICATES",
      trustedCertificates: [expect.stringMatching(/ca\.pem$/)],
    });
  });

  it("uses the URI as given without a CA", () => {
    expect(workspaceDriverOptions("bolt://neo4j-spe2:7687", {})).toEqual({
      uri: "bolt://neo4j-spe2:7687",
      config: {},
    });
  });
});
