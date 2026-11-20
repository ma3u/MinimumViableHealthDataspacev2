/**
 * The narrow FHIR facade (#1174): read by id over a dataspace pull only,
 * searches that page, errors as OperationOutcome, and $validate forwarded to
 * the validator. The opt-out (Art. 71, ADR-062) and the audit record hold on
 * every new path as on the old ones.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import supertest from "supertest";
import { readFileSync } from "node:fs";
import { ALLOWED_EXTENSION_DOMAINS } from "../src/fhir-extension-domains.js";

const mockRun = vi.fn();
vi.mock("neo4j-driver", () => ({
  default: {
    driver: vi.fn(() => ({
      session: vi.fn(() => ({ run: mockRun, close: vi.fn() })),
      getServerInfo: vi.fn().mockResolvedValue({ address: "mock:7687" }),
      close: vi.fn(),
    })),
    auth: { basic: vi.fn() },
    int: (n: number) => n,
  },
}));

// The signature checks are dataspace-token.test.ts's; here a token's text is
// the dataset it grants.
vi.mock("../src/dataspace-token.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/dataspace-token.js")>()),
  verifyDataspaceToken: vi.fn(async (token: string) => ({
    datasetId: token,
    consumer: "did:web:identityhub%3A7083:pharmaco",
    provider: "did:web:identityhub%3A7083:alpha-klinik",
  })),
}));

const { app } = await import("../src/index.js");
const { setDriver } = await import("../src/db.js");
const neo4j = (await import("neo4j-driver")).default;
setDriver(neo4j.driver("bolt://mock:7687", neo4j.auth.basic("u", "p")));
const request = supertest(app);

const node = (properties: Record<string, unknown>, labels: string[] = []) => ({
  labels,
  properties,
});
const record = (fields: Record<string, unknown>) => ({
  has: (k: string) => k in fields,
  get: (k: string) => fields[k],
});
const queries = () => mockRun.mock.calls.map((c) => c[0] as string);
const auditCalls = () =>
  mockRun.mock.calls.filter((c) => String(c[0]).includes(":TransferEvent"));
const flush = () => new Promise((r) => setImmediate(r));

beforeEach(() => {
  mockRun.mockReset();
  mockRun.mockResolvedValue({ records: [] });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("GET /fhir/{type}/{id}", () => {
  it("refuses a call that did not come through a pull: 401, OperationOutcome", async () => {
    const res = await request.get("/fhir/Observation/obs-1");
    expect(res.status).toBe(401);
    expect(res.headers["content-type"]).toMatch(/fhir\+json/);
    expect(res.body).toMatchObject({
      resourceType: "OperationOutcome",
      issue: [{ severity: "error", code: "login" }],
    });
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("answers a pull of the observation dataset with the resource and its subject", async () => {
    mockRun.mockResolvedValueOnce({
      records: [
        record({
          n: node({ resourceId: "obs-1", code: "4548-4" }, ["Observation"]),
          p: node({ resourceId: "P1" }, ["Patient"]),
        }),
      ],
    });
    const res = await request
      .get("/dataspace/data/obs-1")
      .set("Authorization", "Bearer fhir-observation-bundle");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      resourceType: "Observation",
      id: "obs-1",
      subject: { reference: "Patient/P1" },
    });
    // Secondary use: the query leaves out persons who opted out.
    expect(queries()[0]).toContain("(p:(Patient)&!OptedOut)");
    expect(queries()[0]).toContain("(n:(Observation)&!OptedOut)");
    expect(mockRun.mock.calls[0][1]).toEqual({ id: "obs-1" });
    await flush();
    const audit = auditCalls();
    expect(audit).toHaveLength(1);
    expect(audit[0][1]).toMatchObject({
      endpoint: "/fhir/Observation/obs-1",
      method: "GET",
      participant: "did:web:identityhub%3A7083:pharmaco",
    });
  });

  it("answers a pull of a patient dataset with the Patient", async () => {
    mockRun.mockResolvedValueOnce({
      records: [record({ n: node({ id: "P1" }, ["Patient"]), p: null })],
    });
    const res = await request
      .get("/dataspace/data/P1")
      .set("Authorization", "Bearer fhir-patient-search");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ resourceType: "Patient", id: "P1" });
    expect(res.body.subject).toBeUndefined();
  });

  it("answers a person who opted out like one who is not there", async () => {
    mockRun.mockResolvedValueOnce({
      records: [
        record({
          n: node({ resourceId: "obs-2" }, ["Observation"]),
          p: node({ resourceId: "P2" }, ["Patient", "OptedOut"]),
        }),
      ],
    });
    const res = await request
      .get("/dataspace/data/obs-2")
      .set("Authorization", "Bearer fhir-observation-bundle");
    expect(res.status).toBe(404);
    expect(res.body.issue[0].code).toBe("not-found");
    expect(JSON.stringify(res.body)).not.toContain("P2");
    await flush();
    expect(auditCalls()).toHaveLength(0);
  });

  it("answers an id that is not there with 404, OperationOutcome", async () => {
    const res = await request
      .get("/dataspace/data/nope")
      .set("Authorization", "Bearer fhir-observation-bundle");
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({
      resourceType: "OperationOutcome",
      issue: [{ code: "not-found", diagnostics: "Observation/nope not found" }],
    });
  });

  it("a type it does not read is an OperationOutcome, not { error }", async () => {
    const res = await request.get("/fhir/Condition/c1");
    expect(res.status).toBe(404);
    expect(res.body.resourceType).toBe("OperationOutcome");
  });
});

describe("search paging", () => {
  const obs = (i: number) =>
    record({
      p: node({ resourceId: "P1" }),
      o: node({ resourceId: `O${i}`, code: "4548-4" }),
    });

  it("links the next page when there is one, and counts the total", async () => {
    mockRun
      .mockResolvedValueOnce({ records: [obs(1), obs(2), obs(3)] })
      .mockResolvedValueOnce({ records: [record({ total: 7 })] });
    const res = await request.get(
      "/fhir/Observation?patient=P1&code=http://loinc.org|4548-4&_count=2",
    );
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(7);
    const matches = res.body.entry.filter(
      (e: { search: { mode: string } }) => e.search.mode === "match",
    );
    expect(matches.map((e: any) => e.resource.id)).toEqual(["O1", "O2"]);
    const next = new URL(
      res.body.link.find((l: any) => l.relation === "next").url,
    );
    expect(next.pathname).toBe("/fhir/Observation");
    expect(Object.fromEntries(next.searchParams)).toEqual({
      patient: "P1",
      code: "http://loinc.org|4548-4",
      _count: "2",
      _offset: "2",
    });
    const [page, count] = queries();
    expect(page).toContain("SKIP $skip LIMIT $limit + 1");
    expect(mockRun.mock.calls[0][1]).toMatchObject({ skip: 0, limit: 2 });
    expect(count).toContain("RETURN count(o) AS total");
    // The count runs under the opt-out too.
    expect(count).toContain("(p:(Patient)&!OptedOut)");
  });

  it("reads the total off the last page without a count query", async () => {
    mockRun.mockResolvedValueOnce({ records: [obs(5)] });
    const res = await request.get("/fhir/Observation?_count=2&_offset=4");
    expect(res.body.total).toBe(5);
    expect(res.body.link.map((l: any) => l.relation)).toEqual([
      "self",
      "previous",
    ]);
    expect(queries().filter((q) => q.includes("count("))).toHaveLength(0);
  });

  it("filters by date in the query, as a range", async () => {
    await request.get("/fhir/Observation?date=ge2024-01&date=lt2025");
    const [cypher, params] = mockRun.mock.calls[0];
    expect(cypher).toContain("datetime(effStr)");
    expect(cypher).toContain(
      "all(g IN $date WHERE any(d IN g WHERE CASE d.prefix",
    );
    // The values are parameters; the query text is the same for any search.
    expect(cypher).not.toContain("2024");
    expect(params.date).toEqual([
      [
        {
          prefix: "ge",
          lo: Date.parse("2024-01-01T00:00:00Z"),
          hi: Date.parse("2024-02-01T00:00:00Z"),
        },
      ],
      [
        {
          prefix: "lt",
          lo: Date.parse("2025-01-01T00:00:00Z"),
          hi: Date.parse("2026-01-01T00:00:00Z"),
        },
      ],
    ]);
    expect(typeof params.graphDatePattern).toBe("string");
  });

  it("matches a LOINC system on an Observation coded by a LoincCode node", async () => {
    await request.get("/fhir/Observation?code=http://loinc.org|4548-4");
    expect(queries()[0]).toContain(
      "CASE WHEN EXISTS { MATCH (o)-[:CODED_BY]->(:LoincCode) } THEN 'http://loinc.org' END",
    );
  });

  it("refuses an unknown parameter under Prefer: handling=strict", async () => {
    const res = await request
      .get("/fhir/Patient?birthdate=2000")
      .set("Prefer", "handling=strict");
    expect(res.status).toBe(400);
    expect(res.body.issue[0]).toMatchObject({
      code: "not-supported",
      diagnostics: 'Search parameter "birthdate" is not supported here',
    });
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("refuses a value it cannot read with 400", async () => {
    const res = await request.get("/fhir/Observation?date=last-week");
    expect(res.status).toBe(400);
    expect(res.body.issue[0].code).toBe("value");
  });
});

describe("errors on /fhir are OperationOutcomes", () => {
  it("a database error is 500 without its message", async () => {
    mockRun.mockRejectedValueOnce(new Error("MATCH (secret) failed"));
    const res = await request.get("/fhir/Patient");
    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      resourceType: "OperationOutcome",
      issue: [
        {
          severity: "error",
          code: "exception",
          diagnostics: "Internal Server Error",
        },
      ],
    });
  });

  it("a body that is not JSON is 400", async () => {
    const res = await request
      .post("/fhir/$validate")
      .set("Content-Type", "application/fhir+json")
      .send("{not json");
    expect(res.status).toBe(400);
    expect(res.body.issue[0].code).toBe("structure");
  });

  it("an unknown path is 404", async () => {
    const res = await request.get("/fhir/Basic");
    expect(res.status).toBe(404);
    expect(res.body.resourceType).toBe("OperationOutcome");
  });
});

describe("$validate", () => {
  const invalid = { resourceType: "Observation", status: "final" };
  const verdict = {
    resourceType: "OperationOutcome",
    issue: [
      {
        severity: "error",
        code: "required",
        diagnostics: "Observation.code: minimum required = 1, but only found 0",
      },
    ],
  };

  it("answers 503 when no validator is configured", async () => {
    vi.stubEnv("MATCHBOX_URL", "");
    const res = await request
      .post("/fhir/Observation/$validate")
      .set("Content-Type", "application/fhir+json")
      .send(JSON.stringify(invalid));
    expect(res.status).toBe(503);
    expect(res.body.issue[0].code).toBe("not-supported");
  });

  it("forwards the resource to Matchbox and answers its OperationOutcome", async () => {
    vi.stubEnv("MATCHBOX_URL", "http://matchbox:8080/matchboxv3/fhir/");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(verdict), {
        status: 200,
        headers: { "Content-Type": "application/fhir+json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const res = await request
      .post("/fhir/Observation/$validate")
      .set("Content-Type", "application/fhir+json")
      .send(JSON.stringify(invalid));
    expect(res.status).toBe(200);
    expect(res.body).toEqual(verdict);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "http://matchbox:8080/matchboxv3/fhir/$validate?profile=" +
        encodeURIComponent(
          "http://hl7.org/fhir/StructureDefinition/Observation",
        ) +
        "&extensions=" +
        encodeURIComponent("https://ehds.mabu.red/fhir/") +
        "&extensions=" +
        encodeURIComponent("http://synthetichealth.github.io/synthea/"),
    );
    expect(JSON.parse(init.body)).toEqual(invalid);
    // Nothing was read from the graph.
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("allows the extension domains of profiles.json, and no other, on every call (ADR-097)", async () => {
    // Matchbox v4.1.21 drops the extensions of its application.yaml from a
    // $validate; only the request parameter sets them. The list is generated
    // from the CI validator's allowedExtensionDomains by build.py.
    const profiles = JSON.parse(
      readFileSync(
        new URL("../../../scripts/eehrxf/profiles.json", import.meta.url),
        "utf8",
      ),
    ) as { validator: { allowedExtensionDomains: string[] } };
    expect([...ALLOWED_EXTENSION_DOMAINS]).toEqual(
      profiles.validator.allowedExtensionDomains,
    );

    vi.stubEnv("MATCHBOX_URL", "http://matchbox:8080/matchboxv3/fhir");
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(verdict)));
    vi.stubGlobal("fetch", fetchMock);
    await request
      .post("/fhir/Observation/$validate")
      .set("Content-Type", "application/fhir+json")
      .send(JSON.stringify(invalid));
    const sent = new URL(fetchMock.mock.calls[0][0] as string);
    expect(sent.searchParams.getAll("extensions")).toEqual(
      profiles.validator.allowedExtensionDomains,
    );
    expect(sent.searchParams.get("profile")).toBe(
      "http://hl7.org/fhir/StructureDefinition/Observation",
    );
  });

  it("takes a Parameters body with a profile", async () => {
    vi.stubEnv("MATCHBOX_URL", "http://matchbox:8080/matchboxv3/fhir");
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(verdict)));
    vi.stubGlobal("fetch", fetchMock);
    const profile =
      "http://hl7.eu/fhir/laboratory/StructureDefinition/Observation-resultslab-eu-lab";
    const res = await request
      .post("/fhir/$validate")
      .set("Content-Type", "application/fhir+json")
      .send(
        JSON.stringify({
          resourceType: "Parameters",
          parameter: [
            { name: "resource", resource: invalid },
            { name: "profile", valueUri: profile },
          ],
        }),
      );
    expect(res.status).toBe(200);
    expect(fetchMock.mock.calls[0][0]).toContain(
      `profile=${encodeURIComponent(profile)}`,
    );
  });

  it("refuses a resource of another type than the route's", async () => {
    vi.stubEnv("MATCHBOX_URL", "http://matchbox:8080/matchboxv3/fhir");
    const res = await request
      .post("/fhir/Patient/$validate")
      .set("Content-Type", "application/fhir+json")
      .send(JSON.stringify(invalid));
    expect(res.status).toBe(400);
    expect(res.body.issue[0].code).toBe("invalid");
  });

  it("does not offer a type the statement does not list", async () => {
    vi.stubEnv("MATCHBOX_URL", "http://matchbox:8080/matchboxv3/fhir");
    const res = await request
      .post("/fhir/Basic/$validate")
      .set("Content-Type", "application/fhir+json")
      .send(JSON.stringify({ resourceType: "Basic" }));
    expect(res.status).toBe(404);
  });

  it("answers 503 when the validator does not answer, 502 when it answers nonsense", async () => {
    vi.stubEnv("MATCHBOX_URL", "http://matchbox:8080/matchboxv3/fhir");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("ECONNREFUSED")),
    );
    const down = await request
      .post("/fhir/$validate")
      .set("Content-Type", "application/fhir+json")
      .send(JSON.stringify(invalid));
    expect(down.status).toBe(503);
    expect(down.body.issue[0].code).toBe("transient");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("<html>", { status: 500 })),
    );
    const broken = await request
      .post("/fhir/$validate")
      .set("Content-Type", "application/fhir+json")
      .send(JSON.stringify(invalid));
    expect(broken.status).toBe(502);
  });
});
