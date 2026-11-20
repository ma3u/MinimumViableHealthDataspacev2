/**
 * GET /fhir/metadata tells the truth (#1174): the CapabilityStatement lists
 * exactly the /fhir routes Express holds, and every search parameter it
 * lists is applied by its route. A route or a parameter added on one side
 * only fails here.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import supertest from "supertest";

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

const { app } = await import("../src/index.js");
const { setDriver } = await import("../src/db.js");
const neo4j = (await import("neo4j-driver")).default;
setDriver(neo4j.driver("bolt://mock:7687", neo4j.auth.basic("u", "p")));
const { capabilityStatement, expectedRoutes, FHIR_RESOURCES, NON_FHIR_ROUTES } =
  await import("../src/fhir-capability.js");
const request = supertest(app);

interface Layer {
  route?: { path: string; methods: Record<string, boolean> };
}

/** The /fhir routes Express actually holds, as `method path`. */
function registeredFhirRoutes(): string[] {
  const stack = (app as unknown as { router: { stack: Layer[] } }).router.stack;
  const out: string[] = [];
  for (const layer of stack) {
    const path = layer.route?.path;
    if (typeof path !== "string" || !path.startsWith("/fhir")) continue;
    for (const [method, on] of Object.entries(layer.route!.methods)) {
      if (on) out.push(`${method} ${path.replace(/\\/g, "")}`);
    }
  }
  return out.sort();
}

type Statement = ReturnType<typeof capabilityStatement>;

/** The routes a CapabilityStatement promises, as `method path`. */
function routesOf(statement: Statement): string[] {
  const rest = statement.rest[0];
  const out = ["get /fhir/metadata"];
  if (rest.operation?.some((o) => o.name === "validate")) {
    out.push("post /fhir/$validate");
  }
  let typeValidate = false;
  for (const r of rest.resource) {
    for (const i of r.interaction ?? []) {
      if (i.code === "read") out.push(`get /fhir/${r.type}/:id`);
      if (i.code === "search-type") out.push(`get /fhir/${r.type}`);
    }
    for (const o of r.operation ?? []) {
      if (o.name === "everything") {
        out.push(`get /fhir/${r.type}/:id/$everything`);
      }
      if (o.name === "validate") typeValidate = true;
    }
  }
  if (typeValidate) out.push("post /fhir/:type/$validate");
  return out.sort();
}

const nonFhir = NON_FHIR_ROUTES.map((r) => `${r.method} ${r.path}`);

beforeEach(() => {
  mockRun.mockReset();
  mockRun.mockResolvedValue({ records: [] });
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the CapabilityStatement and the routes", () => {
  it("the table stands for exactly the routes Express holds", () => {
    expect(registeredFhirRoutes()).toEqual(expectedRoutes());
  });

  it("with a validator, the statement lists every FHIR route and no other", () => {
    const fhir = registeredFhirRoutes().filter((r) => !nonFhir.includes(r));
    expect(routesOf(capabilityStatement({ validator: true }))).toEqual(fhir);
  });

  it("without a validator, it leaves out $validate, which then answers 503", async () => {
    const fhir = registeredFhirRoutes().filter(
      (r) => !nonFhir.includes(r) && !r.endsWith("$validate"),
    );
    expect(routesOf(capabilityStatement({ validator: false }))).toEqual(fhir);
  });

  it("GET /fhir/metadata answers the statement for this configuration", async () => {
    vi.stubEnv("MATCHBOX_URL", "");
    const without = await request.get("/fhir/metadata");
    expect(without.status).toBe(200);
    expect(without.headers["content-type"]).toMatch(/fhir\+json/);
    expect(without.body.resourceType).toBe("CapabilityStatement");
    expect(without.body.fhirVersion).toBe("4.0.1");
    expect(JSON.stringify(without.body)).not.toContain('"validate"');

    vi.stubEnv("MATCHBOX_URL", "http://matchbox:8080/matchboxv3/fhir");
    const withValidator = await request.get("/fhir/metadata");
    expect(withValidator.body.rest[0].operation).toEqual([
      {
        name: "validate",
        definition: "http://hl7.org/fhir/OperationDefinition/Resource-validate",
      },
    ]);
  });
});

describe("supportedProfile (#1144)", () => {
  it("lists for each type exactly the profiles its resources claim", async () => {
    const { PROFILE_CLAIMS } = await import("../src/fhir-profiles.js");
    const statement = capabilityStatement({ validator: false });
    for (const r of statement.rest[0].resource) {
      const claimed = PROFILE_CLAIMS.filter(
        (c) => c.resourceType === r.type,
      ).map((c) => c.canonical);
      expect(
        (r as { supportedProfile?: string[] }).supportedProfile ?? [],
        r.type,
      ).toEqual(claimed);
    }
  });
});

describe("every listed search parameter is applied by its route", () => {
  const VALUE: Record<string, string> = {
    token: "http://example.org|x",
    date: "ge2024-01-01",
    reference: "Patient/P1",
    string: "ma",
  };
  const searchable = FHIR_RESOURCES.filter((r) => r.search);

  for (const r of searchable) {
    for (const p of r.search!) {
      it(`${r.type}?${p.name}`, async () => {
        const res = await request.get(
          `/fhir/${r.type}?${p.name}=${encodeURIComponent(VALUE[p.type])}`,
        );
        expect(res.status).toBe(200);
        // Applied: it is in the self link, and no outcome names it.
        const self = res.body.link.find(
          (l: { relation: string }) => l.relation === "self",
        );
        expect(new URL(self.url).searchParams.get(p.name)).toBe(VALUE[p.type]);
        expect(JSON.stringify(res.body)).not.toContain("not applied");
        // And it reached the query as a parameter.
        const params = mockRun.mock.calls[0][1] as Record<string, unknown>;
        expect(params[p.name]).toEqual(
          expect.arrayContaining([expect.anything()]),
        );
      });
    }

    it(`${r.type} names a parameter it does not list, and leaves it out of the self link`, async () => {
      const res = await request.get(`/fhir/${r.type}?_elements=id`);
      expect(res.status).toBe(200);
      const outcome = res.body.entry.find(
        (e: { search?: { mode: string } }) => e.search?.mode === "outcome",
      );
      expect(outcome.resource.issue[0].diagnostics).toContain('"_elements"');
      expect(res.body.link[0].url).not.toContain("_elements");
    });
  }
});
