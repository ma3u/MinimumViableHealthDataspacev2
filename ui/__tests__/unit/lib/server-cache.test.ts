/**
 * Unit tests for ui/src/lib/server-cache.ts.
 *
 * Verifies cold-start blocking, hot-path return, stale-while-revalidate
 * behaviour after TTL, and that simultaneous cold callers all see the same
 * eventual value.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { cached, __resetCacheForTests } from "@/lib/server-cache";

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
    const counter = { n: 0 };
    const loader = vi.fn(async () => ++counter.n);

    // First call → cold, blocks until loader resolves with 1.
    expect(await cached("k3", 10, loader)).toBe(1);

    // Fast-forward past TTL (10 ms) without polling time mocks; sleeping is
    // simpler and the loader is synchronous-ish, so this is safe.
    await new Promise((r) => setTimeout(r, 25));

    // Stale read returns 1 immediately; background refresh is in flight.
    expect(await cached("k3", 10, loader)).toBe(1);

    // Allow the background refresh to settle.
    await new Promise((r) => setTimeout(r, 5));

    // Subsequent caller sees the refreshed value.
    expect(await cached("k3", 10, loader)).toBe(2);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("multiple simultaneous cold callers all see the same eventual value", async () => {
    // Each caller gets its own loader promise — the current minimal
    // implementation does not de-dupe simultaneous cold calls. We only
    // assert that every awaiter eventually receives a usable value.
    const loader = vi.fn(async () => "done");

    const [a, b, c] = await Promise.all([
      cached("k4", 1000, loader),
      cached("k4", 1000, loader),
      cached("k4", 1000, loader),
    ]);
    expect([a, b, c]).toEqual(["done", "done", "done"]);
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
