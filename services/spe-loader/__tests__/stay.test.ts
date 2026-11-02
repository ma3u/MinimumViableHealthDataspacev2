/**
 * The ACI sidecar `spe-ingest` stays up after the load (#833). It logged
 * "loaded; staying up so the pod keeps running" and then exited with code 0,
 * because a promise that never resolves does not keep Node's event loop
 * alive; restartPolicy Always restarted it 42 times in ten minutes. Without
 * `--stay` (a one-shot job) `ingest` still ends after the load.
 */
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ingestCommand } from "../src/ingest-command.js";
import type { UnlockOutcome } from "../src/load.js";
import { stayUp } from "../src/stay.js";

const OUTCOME = { ok: true, speId: "SPE-1" } as unknown as UnlockOutcome;

function workDir(withExtract = true): string {
  const dir = mkdtempSync(join(tmpdir(), "spe-stay-"));
  writeFileSync(join(dir, "unlock.json"), JSON.stringify(OUTCOME));
  if (withExtract) writeFileSync(join(dir, "extract.jsonl"), "{}\n");
  return dir;
}

/** Settles within `ms`, or reports that it is still pending. */
async function settlesWithin<T>(
  p: Promise<T>,
  ms: number,
): Promise<{ settled: boolean; value?: T }> {
  let timer: NodeJS.Timeout | undefined;
  const pending = new Promise<{ settled: false }>((r) => {
    timer = setTimeout(() => r({ settled: false }), ms);
  });
  const result = await Promise.race([
    p.then((value) => ({ settled: true, value })),
    pending,
  ]);
  clearTimeout(timer);
  return result;
}

describe("ingest --stay (#833)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not resolve after loading, only on SIGTERM", async () => {
    const work = workDir();
    const signals = new EventEmitter();
    const load = vi.fn().mockResolvedValue(0);
    const log = vi.fn();
    const run = ingestCommand(work, true, { load, log, signals });

    const early = await settlesWithin(run, 200);
    expect(early.settled).toBe(false);
    expect(load).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledWith(
      "loaded; staying up so the pod keeps running",
    );
    // The plain extract is gone once it is in the workspace.
    expect(existsSync(join(work, "extract.jsonl"))).toBe(false);

    signals.emit("SIGTERM");
    await expect(run).resolves.toBe(0);
    expect(log).toHaveBeenCalledWith("SIGTERM: stopping");
    expect(signals.listenerCount("SIGTERM")).toBe(0);
    expect(signals.listenerCount("SIGINT")).toBe(0);
  });

  it("keeps the refusal's code for when it is stopped", async () => {
    const signals = new EventEmitter();
    const run = ingestCommand(workDir(false), true, {
      load: vi.fn().mockResolvedValue(3),
      log: vi.fn(),
      signals,
    });
    expect((await settlesWithin(run, 50)).settled).toBe(false);
    signals.emit("SIGINT");
    await expect(run).resolves.toBe(3);
  });

  it("without --stay is a one-shot job: resolves with the load's code", async () => {
    const signals = new EventEmitter();
    const run = ingestCommand(workDir(), false, {
      load: vi.fn().mockResolvedValue(0),
      log: vi.fn(),
      signals,
    });
    const done = await settlesWithin(run, 1000);
    expect(done).toEqual({ settled: true, value: 0 });
    expect(signals.listenerCount("SIGTERM")).toBe(0);
  });

  it("holds a referenced timer while it waits and clears it on the signal", async () => {
    const setSpy = vi.spyOn(globalThis, "setInterval");
    const clearSpy = vi.spyOn(globalThis, "clearInterval");
    const signals = new EventEmitter();
    const waiting = stayUp({ source: signals });
    expect(setSpy).toHaveBeenCalledOnce();
    const timer = setSpy.mock.results[0].value as NodeJS.Timeout;
    expect(timer.hasRef()).toBe(true);
    signals.emit("SIGTERM");
    await expect(waiting).resolves.toBe("SIGTERM");
    expect(clearSpy).toHaveBeenCalledWith(timer);
  });

  it("keeps a real Node process running until SIGTERM, then exits 0", async () => {
    // The bug only shows in a process of its own: with nothing referenced,
    // Node ends while the promise is still pending.
    const stay = new URL("../src/stay.ts", import.meta.url).href;
    const child = spawn(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `const { stayUp } = await import(${JSON.stringify(stay)});
         process.stdout.write("waiting\\n");
         const signal = await stayUp();
         process.stdout.write(signal + "\\n");`,
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += String(d)));
    child.stderr.on("data", (d) => (err += String(d)));
    const exited = new Promise<number | null>((r) =>
      child.on("exit", (code) => r(code)),
    );

    await vi.waitFor(() => expect(out).toContain("waiting"), {
      timeout: 10_000,
    });
    const early = await settlesWithin(exited, 1500);
    expect(early.settled, `exited early: ${err}`).toBe(false);

    child.kill("SIGTERM");
    expect(await exited).toBe(0);
    expect(out).toContain("SIGTERM");
  }, 20_000);
});
