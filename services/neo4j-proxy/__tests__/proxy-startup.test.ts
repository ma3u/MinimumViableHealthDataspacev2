/**
 * The proxy listens whatever the SPE workspaces do (ADR-069): they are
 * connected in the background, each try bounded by connectionTimeout, and
 * retried with a capped backoff for as long as the proxy runs. A workspace
 * whose Bolt port accepts and then never answers must not keep the hub's
 * API from coming up.
 */
import { describe, expect, it, vi } from "vitest";

process.env.NEO4J_SPE1_URI = "bolt://hangs-spe1:7687";
process.env.NEO4J_SPE2_URI = "bolt://hangs-spe2:7687";
process.env.SPE_AUDIT_SYNC_MS = "0";

const hub = {
  getServerInfo: vi.fn().mockResolvedValue({ address: "hub:7687" }),
  session: vi.fn(),
  close: vi.fn(),
};
const hanging = () => ({
  getServerInfo: vi.fn(() => new Promise(() => undefined)),
  close: vi.fn().mockResolvedValue(undefined),
});

const driverFn = vi.fn((uri: string) =>
  uri.includes("hangs") ? hanging() : hub,
);
vi.mock("neo4j-driver", () => ({
  default: {
    driver: (...a: unknown[]) => driverFn(...(a as [string])),
    auth: { basic: vi.fn() },
    int: vi.fn((n: number) => n),
    isInt: vi.fn(() => false),
    integer: { toNumber: (n: unknown) => Number(n) },
    session: { READ: "READ", WRITE: "WRITE" },
  },
}));

const { app, main } = await import("../src/index.js");
const { spe1Driver, spe2Driver, getSpeDrivers } = await import("../src/db.js");

describe("proxy startup with workspaces that hang", () => {
  it("listens at once, and keeps the hanging workspaces out of the federation", async () => {
    const listen = vi
      .spyOn(app, "listen")
      .mockImplementation((_p: unknown, cb?: () => void) => {
        if (cb) cb();
        return { close: vi.fn() } as never;
      });
    const started = Date.now();
    await Promise.race([
      main(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("main() blocked")), 2000),
      ),
    ]);
    expect(listen).toHaveBeenCalledOnce();
    expect(Date.now() - started).toBeLessThan(2000);

    // Both workspaces were asked, with a short connection timeout.
    const workspaceCalls = driverFn.mock.calls.filter((c) =>
      String(c[0]).includes("hangs"),
    );
    expect(workspaceCalls.map((c) => c[0]).sort()).toEqual([
      "bolt://hangs-spe1:7687",
      "bolt://hangs-spe2:7687",
    ]);
    for (const c of workspaceCalls) {
      expect((c as unknown[])[2]).toMatchObject({ connectionTimeout: 5000 });
    }
    // Not connected, so not federated, and never the hub in SPE-1's place.
    expect(spe1Driver).toBeNull();
    expect(spe2Driver).toBeNull();
    expect(getSpeDrivers()).toEqual([]);
  });
});
