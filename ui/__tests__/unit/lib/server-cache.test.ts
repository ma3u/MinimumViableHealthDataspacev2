/**
 * Unit tests for ui/src/lib/server-cache.ts.
 *
 * Verifies cold-start blocking, hot-path return, stale-while-revalidate
 * behaviour after TTL, and that simultaneous cold callers all see the same
 * eventual value.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  cached,
  forget,
  shareInFlight,
  __resetCacheForTests,
} from "@/lib/server-cache";

beforeEach(() => {
  __resetCacheForTests();
  vi.useRealTimers();
});

describe("server-cache", () => {
  it("blocks the first caller until the loader resolves", async () => {
    let resolve!: (v: number) => void;
    const loader = vi.fn(
      () =>
        new Promise<number>((r) => {
          resolve = r;
        }),
    );

    const inFlight = cached("k1", 1000, loader);
    expect(loader).toHaveBeenCalledTimes(1);

    resolve(42);
    await expect(inFlight).resolves.toBe(42);
  });

  it("returns the cached value without invoking the loader again", async () => {
    const loader = vi.fn(async () => "hello");

    const a = await cached("k2", 60_000, loader);
    const b = await cached("k2", 60_000, loader);

    expect(a).toBe("hello");
    expect(b).toBe("hello");
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("stale-while-revalidate: returns stale, refreshes in background after TTL", async () => {
    // Only Date is faked: time moves when the test says so. With real time
    // and a 10 ms TTL, a loaded machine let the refreshed value go stale
    // before the last read, which then started a third load (#404).
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const counter = { n: 0 };
      const loader = vi.fn(async () => ++counter.n);

      // First call → cold, blocks until loader resolves with 1.
      expect(await cached("k3", 10, loader)).toBe(1);

      // Past the TTL.
      vi.setSystemTime(Date.now() + 25);

      // Stale read returns 1 immediately; background refresh is in flight.
      expect(await cached("k3", 10, loader)).toBe(1);

      // One real macrotask lets the refresh settle. Not vi.waitFor: with
      // fake timers on, it advances them on every poll, which moves Date
      // past the TTL again.
      await new Promise((r) => setTimeout(r, 0));

      // Subsequent caller sees the refreshed value, and no third load ran.
      expect(await cached("k3", 10, loader)).toBe(2);
      expect(loader).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("simultaneous cold callers share one load", async () => {
    // Under load, 50 users opening /graph at once each ran the whole graph
    // build (#540); they now wait for one.
    const loader = vi.fn(async () => "done");

    const [a, b, c] = await Promise.all([
      cached("k4", 1000, loader),
      cached("k4", 1000, loader),
      cached("k4", 1000, loader),
    ]);
    expect([a, b, c]).toEqual(["done", "done", "done"]);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("a failed cold load reaches every waiting caller, and the next call loads again", async () => {
    const failing = vi.fn(async () => {
      throw new Error("neo4j down");
    });
    const results = await Promise.allSettled([
      cached("k7", 1000, failing),
      cached("k7", 1000, failing),
    ]);
    expect(results.map((r) => r.status)).toEqual(["rejected", "rejected"]);
    expect(failing).toHaveBeenCalledTimes(1);

    const working = vi.fn(async () => "back");
    expect(await cached("k7", 1000, working)).toBe("back");
  });

  it("a failed background refresh keeps the stale value and is not an unhandled rejection", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    try {
      expect(await cached("k8", 10, async () => "old")).toBe("old");
      vi.setSystemTime(Date.now() + 25);

      const failing = vi.fn(async () => {
        throw new Error("neo4j down");
      });
      expect(await cached("k8", 10, failing)).toBe("old");
      await new Promise((r) => setTimeout(r, 0));

      expect(unhandled).not.toHaveBeenCalled();
      // The stale value stays, and the next caller may try again.
      expect(await cached("k8", 10, async () => "new")).toBe("old");
      await new Promise((r) => setTimeout(r, 0));
      expect(await cached("k8", 10, async () => "unused")).toBe("new");
    } finally {
      process.off("unhandledRejection", unhandled);
      vi.useRealTimers();
    }
  });

  it("__resetCacheForTests clears between specs", async () => {
    const loader1 = vi.fn(async () => "x");
    await cached("k5", 60_000, loader1);
    expect(loader1).toHaveBeenCalledTimes(1);

    __resetCacheForTests();

    const loader2 = vi.fn(async () => "y");
    await cached("k5", 60_000, loader2);
    expect(loader2).toHaveBeenCalledTimes(1);
  });

  it("propagates loader errors to the cold caller", async () => {
    const loader = vi.fn(async () => {
      throw new Error("boom");
    });

    await expect(cached("k6", 1000, loader)).rejects.toThrow("boom");
  });
});

describe("forget", () => {
  it("makes the next caller load afresh", async () => {
    await cached("f1", 60_000, async () => "old");
    forget("f1");
    expect(await cached("f1", 60_000, async () => "new")).toBe("new");
  });
});

describe("shareInFlight (#1088)", () => {
  it("gives callers that arrive during a load the same answer", async () => {
    let resolve!: (v: string) => void;
    const loader = vi.fn(() => new Promise<string>((r) => (resolve = r)));
    const a = shareInFlight("s1", loader);
    const b = shareInFlight("s1", loader);
    resolve("catalog");
    expect(await Promise.all([a, b])).toEqual(["catalog", "catalog"]);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("keeps nothing once the load has answered", async () => {
    expect(await shareInFlight("s2", async () => 1)).toBe(1);
    expect(await shareInFlight("s2", async () => 2)).toBe(2);
  });

  it("passes a failure to every waiting caller, and the next caller tries again", async () => {
    let reject!: (e: Error) => void;
    const failing = () => new Promise<string>((_, r) => (reject = r));
    const a = shareInFlight("s3", failing);
    const b = shareInFlight("s3", failing);
    reject(new Error("dsp down"));
    await expect(a).rejects.toThrow("dsp down");
    await expect(b).rejects.toThrow("dsp down");
    expect(await shareInFlight("s3", async () => "ok")).toBe("ok");
  });

  it("keeps keys apart", async () => {
    const [x, y] = await Promise.all([
      shareInFlight("s4", async () => "x"),
      shareInFlight("s5", async () => "y"),
    ]);
    expect([x, y]).toEqual(["x", "y"]);
  });
});
