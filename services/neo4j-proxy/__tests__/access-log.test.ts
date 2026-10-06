/**
 * The access log (TransferEvent, Art. 73; kept a year): an access a load test
 * made is marked with the run, so the register can tell synthetic traffic
 * from real use (#571).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const run = vi.fn();
vi.mock("../src/db.js", () => ({
  getSession: () => ({ run, close: vi.fn() }),
}));

const { logTransferEvent } = await import("../src/audit.js");
const { requestLogging } = await import("../src/logger.js");

/** Calls logTransferEvent inside a request that carries this X-Load-Test. */
function inRequest(loadTest?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = {
      path: "/nlq",
      method: "POST",
      baseUrl: "",
      header: (h: string) =>
        h.toLowerCase() === "x-load-test" ? loadTest : undefined,
    };
    requestLogging({ info: vi.fn(), error: vi.fn() } as never)(
      req as never,
      { on: vi.fn(), statusCode: 200 } as never,
      () => {
        logTransferEvent(
          "/nlq",
          "POST",
          "did:web:pharmaco.de:research",
          200,
          1,
        ).then(resolve, reject);
      },
    );
  });
}

beforeEach(() => {
  run.mockReset().mockResolvedValue({ records: [] });
});

describe("the access log of a load test run", () => {
  it("marks the access with the run it came from", async () => {
    await inRequest("20261006-1359-load-aca");
    const [cypher, params] = run.mock.calls[0];
    expect(cypher).toMatch(/loadTest: \$loadTest/);
    expect(params.loadTest).toBe("20261006-1359-load-aca");
  });

  it("leaves a real access unmarked, and ignores a header that is not a run id", async () => {
    await inRequest(undefined);
    await inRequest("not a run; drop");
    expect(run.mock.calls[0][1].loadTest).toBeNull();
    expect(run.mock.calls[1][1].loadTest).toBeNull();
  });
});
