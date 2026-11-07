/**
 * A pull is one request (#881, finding 15). /dataspace/data hands it to the
 * dataset's own route by running it through the app again; that second pass
 * must not write a second log line or count against a rate limit again, and
 * the heavy limit is the consumer's, not the address's.
 */
import { describe, it, expect, vi } from "vitest";
import supertest from "supertest";

process.env.RATE_LIMIT_PARTICIPANT_MAX = "4";
process.env.RATE_LIMIT_PARTICIPANT_HEAVY_MAX = "4";
process.env.RATE_LIMIT_WINDOW_MS = "60000";

vi.mock("neo4j-driver", () => ({
  default: {
    driver: vi.fn(() => ({
      session: vi.fn(() => ({
        run: vi.fn().mockResolvedValue({ records: [] }),
        close: vi.fn(),
      })),
      getServerInfo: vi.fn().mockResolvedValue({ address: "mock:7687" }),
      close: vi.fn(),
    })),
    auth: { basic: vi.fn() },
  },
}));

// The signature checks are dataspace-token.test.ts's; here the token's text
// names the consumer, and every token grants the catalogue.
vi.mock("../src/dataspace-token.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/dataspace-token.js")>()),
  verifyDataspaceToken: vi.fn(async (token: string) => ({
    datasetId: "healthdcatap-catalog",
    consumer: consumer(token),
    provider: "did:web:identityhub%3A7083:alpha-klinik",
  })),
}));

function consumer(name: string) {
  return `did:web:identityhub%3A7083:${name}`;
}

const { app } = await import("../src/index.js");
const { logger } = await import("../src/logger.js");
const { setDriver } = await import("../src/db.js");
const neo4j = (await import("neo4j-driver")).default;
setDriver(neo4j.driver("bolt://mock:7687", neo4j.auth.basic("u", "p")));
const request = supertest(app);

const pull = (name: string, from: string) =>
  request
    .get("/dataspace/data")
    .set("Authorization", `Bearer ${name}`)
    .set("X-Forwarded-For", from);

describe("a pull through /dataspace/data", () => {
  it("writes one log line, naming the dataset's route", async () => {
    const info = vi.spyOn(logger, "info");
    const res = await pull("pharmaco", "10.0.1.1");
    await new Promise((resolve) => setImmediate(resolve));

    expect(res.status).toBe(200);
    const lines = info.mock.calls.filter(([, msg]) => msg === "request");
    expect(lines).toHaveLength(1);
    expect(lines[0][0]).toMatchObject({
      method: "GET",
      route: "/catalog/datasets",
      status: 200,
    });
    info.mockRestore();
  });

  it("counts once against the general limit of a caller that names its participant", async () => {
    const own = { "X-Participant": consumer("lmc") };
    for (let i = 1; i <= 4; i++) {
      const res = await pull("lmc", "10.0.2.1").set(own);
      expect(res.status, `pull ${i}`).toBe(200);
    }
    const fifth = await pull("lmc", "10.0.2.1").set(own);
    expect(fifth.status).toBe(429);
    expect(fifth.body.error).toMatch(/^Too many requests/);
  });

  it("counts the heavy limit against the consumer, wherever the pull comes from", async () => {
    for (let i = 1; i <= 4; i++) {
      const res = await pull("irs", `10.0.3.${i}`);
      expect(res.status, `pull ${i}`).toBe(200);
    }
    const fifth = await pull("irs", "10.0.3.5");
    expect(fifth.status).toBe(429);
    expect(fifth.body.error).toMatch(/^Query rate limit exceeded/);
  });

  it("refuses a pull with a method the dataset is not read with", async () => {
    const res = await request
      .post("/dataspace/data")
      .set("Authorization", "Bearer pharmaco")
      .set("X-Forwarded-For", "10.0.4.1");
    expect(res.status).toBe(405);
    expect(res.body.error).toBe(
      "Dataset healthdcatap-catalog is read with GET",
    );
  });
});
