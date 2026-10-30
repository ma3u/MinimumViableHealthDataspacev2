/**
 * ADR-069: SPE-2 runs on Azure as its own container app, and the morning
 * start brings it and the proxy up within a minute of each other. The proxy
 * used to try SPE-2 once and then run without it all day; connectSpe2() keeps
 * trying until SPE-2 answers, and leaves no driver behind when it never does.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Driver } from "neo4j-driver";
import { connectSpe2, getSpeDrivers, setSpe2Driver } from "../src/db.js";

function fakeDriver(answers: boolean, address = "mvhd-neo4j-spe2:7688") {
  return {
    getServerInfo: answers
      ? vi.fn().mockResolvedValue({ address })
      : vi.fn().mockRejectedValue(new Error("ServiceUnavailable")),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

beforeEach(() => {
  setSpe2Driver(null);
});

describe("connectSpe2", () => {
  it("keeps trying until SPE-2 answers, then federates over it", async () => {
    const drivers = [fakeDriver(false), fakeDriver(false), fakeDriver(true)];
    let made = 0;
    const sleep = vi.fn().mockResolvedValue(undefined);
    const onConnected = vi.fn();

    const ok = await connectSpe2({
      create: () => drivers[made++] as unknown as Driver,
      attempts: 5,
      intervalMs: 15000,
      sleep,
      onConnected,
    });

    expect(ok).toBe(true);
    expect(made).toBe(3);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(15000);
    // The drivers that never connected are closed, the one that did is kept.
    expect(drivers[0].close).toHaveBeenCalled();
    expect(drivers[1].close).toHaveBeenCalled();
    expect(drivers[2].close).not.toHaveBeenCalled();
    expect(onConnected).toHaveBeenCalledWith("mvhd-neo4j-spe2:7688", 3);
    expect(getSpeDrivers().map((s) => s.label)).toEqual(["SPE-1", "SPE-2"]);
  });

  it("gives up after the last attempt and leaves SPE-1 alone", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const onGiveUp = vi.fn();
    const made: ReturnType<typeof fakeDriver>[] = [];

    const ok = await connectSpe2({
      create: () => {
        const d = fakeDriver(false);
        made.push(d);
        return d as unknown as Driver;
      },
      attempts: 3,
      intervalMs: 10,
      sleep,
      onGiveUp,
    });

    expect(ok).toBe(false);
    expect(made).toHaveLength(3);
    // No wait after the last attempt.
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(onGiveUp).toHaveBeenCalledWith(expect.any(Error));
    expect(made.every((d) => d.close.mock.calls.length === 1)).toBe(true);
    expect(getSpeDrivers().map((s) => s.label)).toEqual(["SPE-1"]);
  });

  it("connects on the first attempt without waiting", async () => {
    const sleep = vi.fn();
    const ok = await connectSpe2({
      create: () => fakeDriver(true) as unknown as Driver,
      attempts: 1,
      intervalMs: 0,
      sleep,
    });
    expect(ok).toBe(true);
    expect(sleep).not.toHaveBeenCalled();
  });
});
