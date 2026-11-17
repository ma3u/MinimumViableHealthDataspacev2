/**
 * A bonus program's answers leave the hub over a pull only, to the insurer
 * that published the program, as the program, the year, goal met and the
 * member's reference (#934 step 8, ADR-091; ADR-080, decision 2).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import supertest from "supertest";
import vectors from "./fixtures/member-reference-vectors.json";

const run = vi.fn();
vi.mock("neo4j-driver", () => ({
  default: {
    driver: vi.fn(() => ({
      session: vi.fn(() => ({ run, close: vi.fn() })),
      getServerInfo: vi.fn().mockResolvedValue({ address: "mock:7687" }),
      close: vi.fn(),
    })),
    auth: { basic: vi.fn() },
    int: vi.fn((n: number) => n),
  },
}));

const HUB = "did:web:identityhub%3A7083";
// The token's text is "<dataset> <consumer DID>"; the signature checks are
// dataspace-token.test.ts's.
vi.mock("../src/dataspace-token.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/dataspace-token.js")>()),
  verifyDataspaceToken: vi.fn(async (token: string) => {
    const [datasetId, consumer] = token.split(" ");
    return {
      datasetId,
      consumer,
      provider: `${HUB}:alpha-klinik`,
      agreementId: "agr-bonus",
    };
  }),
}));

const { app } = await import("../src/index.js");
const { setDriver } = await import("../src/db.js");
const { memberReference } = await import("../src/member-reference.js");
const { publishedBy, COLLECT_ANSWERS_CYPHER, PROGRAMME_PUBLISHERS_CYPHER } =
  await import("../src/programme-answers.js");
const neo4j = (await import("neo4j-driver")).default;
setDriver(neo4j.driver("bolt://mock:7687", neo4j.auth.basic("u", "p")));
const request = supertest(app);

const PROGRAMME = "urn:mvhd:programme:alphakasse:active-year-2025";
const OTHER = "urn:mvhd:programme:betakasse:steps-2025";
const CONSENT = vectors.vectors[0];

function rows(list: Array<Record<string, unknown>>) {
  return { records: list.map((r) => ({ get: (k: string) => r[k] })) };
}

/** The graph: two programs of two insurers, one answer for AlphaKasse's. */
function graph() {
  run.mockImplementation(async (cypher: string) => {
    if (cypher === PROGRAMME_PUBLISHERS_CYPHER) {
      return rows([
        {
          programmeId: PROGRAMME,
          publisherDid: "did:web:alphakasse.de:insurer",
        },
        { programmeId: OTHER, publisherDid: "did:web:betakasse.de:insurer" },
      ]);
    }
    if (cypher === COLLECT_ANSWERS_CYPHER) {
      return rows([
        {
          programmeId: PROGRAMME,
          consentId: CONSENT.consentId,
          year: { toNumber: () => 2025 },
          goalMet: true,
        },
      ]);
    }
    return rows([]);
  });
}

const pull = (dataset: string, consumer: string) =>
  request
    .get("/dataspace/data")
    .set("Authorization", `Bearer ${dataset} ${consumer}`);

const collected = () =>
  run.mock.calls.filter(([cypher]) => cypher === COLLECT_ANSWERS_CYPHER);

describe("GET /programmes/answers", () => {
  beforeEach(() => {
    run.mockReset();
    graph();
  });

  it("gives the insurer the program, the year, goal met and the reference, and nothing else", async () => {
    const res = await pull("bonus-programme-answer", `${HUB}:alphakasse`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      recipient: `${HUB}:alphakasse`,
      answers: [
        {
          programme: PROGRAMME,
          year: 2025,
          goalMet: true,
          memberReference: CONSENT.memberReference,
        },
      ],
    });
    // The consent id, the record's id and the breakdown stay in the hub.
    expect(JSON.stringify(res.body)).not.toContain(CONSENT.consentId);
  });

  it("asks only for the programs the consumer published, and records who collected", async () => {
    await pull("bonus-programme-answer", `${HUB}:alphakasse`);

    expect(collected()).toHaveLength(1);
    expect(collected()[0][1]).toEqual({
      programmeIds: [PROGRAMME],
      consumer: `${HUB}:alphakasse`,
    });
  });

  it("gives another participant no answers and reads none for it", async () => {
    const res = await pull("bonus-programme-answer", `${HUB}:pharmaco`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ recipient: `${HUB}:pharmaco`, answers: [] });
    expect(collected()).toHaveLength(0);
  });

  it("refuses a direct call, whatever participant it names", async () => {
    const res = await request
      .get("/programmes/answers")
      .set("X-Participant", `${HUB}:alphakasse`);

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/dataspace transfer of the bonus agreement/);
    expect(run).not.toHaveBeenCalled();
  });

  it("refuses a pull whose token is for another dataset", async () => {
    // The catalogue's route answers that token; this one must not.
    const res = await pull("healthdcatap-catalog", `${HUB}:alphakasse`);

    expect(res.status).toBe(200);
    expect(res.body.answers).toBeUndefined();
    expect(collected()).toHaveLength(0);
  });
});

describe("the query that collects answers", () => {
  it("leaves out a withdrawn consent and an answer the hub could not work out", () => {
    expect(COLLECT_ANSWERS_CYPHER).toContain("c.withdrawnAt IS NULL");
    expect(COLLECT_ANSWERS_CYPHER).toContain("t.goalMet IS NOT NULL");
  });

  it("keeps the first collection's date", () => {
    expect(COLLECT_ANSWERS_CYPHER).toContain(
      "t.deliveredAt = coalesce(t.deliveredAt, datetime())",
    );
  });

  it("reads no property of a Patient", () => {
    expect(COLLECT_ANSWERS_CYPHER).not.toMatch(/Patient|patientId|name|birth/);
  });
});

describe("publishedBy", () => {
  const provider = `${HUB}:alpha-klinik`;
  const publisher = "did:web:alphakasse.de:insurer";

  it("accepts the publisher's own DID", () => {
    expect(publishedBy(publisher, provider, publisher)).toBe(true);
  });

  it("accepts the demo's connector DID on the hub's own IdentityHub", () => {
    expect(publishedBy(`${HUB}:alphakasse`, provider, publisher)).toBe(true);
  });

  it("refuses the same slug on another host", () => {
    expect(
      publishedBy("did:web:elsewhere.example:alphakasse", provider, publisher),
    ).toBe(false);
  });

  it("matches a publisher named in the connector's form by equality only", () => {
    const inConnectorForm = `${HUB}:alphakasse`;
    expect(publishedBy(inConnectorForm, provider, inConnectorForm)).toBe(true);
    // Not by the IdentityHub's host name standing in for an organisation.
    expect(publishedBy(`${HUB}:identityhub`, provider, inConnectorForm)).toBe(
      false,
    );
  });

  it("refuses another participant, a longer path and a missing publisher", () => {
    expect(publishedBy(`${HUB}:pharmaco`, provider, publisher)).toBe(false);
    expect(publishedBy(`${HUB}:x:alphakasse`, provider, publisher)).toBe(false);
    expect(publishedBy(`${HUB}:alphakasse`, provider, null)).toBe(false);
    expect(publishedBy("alphakasse", provider, publisher)).toBe(false);
  });
});

describe("memberReference", () => {
  it.each(vectors.vectors)(
    "derives $memberReference from $consentId",
    ({ consentId, memberReference: expected }) => {
      expect(memberReference(consentId)).toBe(expected);
    },
  );

  it("is twelve characters without I, L, O or U, in groups of four", () => {
    expect(memberReference("any consent")).toMatch(
      /^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/,
    );
  });
});
