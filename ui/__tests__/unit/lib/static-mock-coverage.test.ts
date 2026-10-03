/**
 * Every GET a page makes through fetchApi() must have a fixture in the
 * static build. Without one, fetchApi passes the request through to
 * /api/..., which does not exist on GitHub Pages, the page swallows the 404,
 * and the demo shows an empty panel with no error. /api/trust-center and
 * /api/credentials/definitions went unnoticed that way (#404).
 *
 * Scans ui/src for fetchApi("/api/...") calls with a literal path. Calls
 * that send a method other than GET are skipped, since fetchApi answers
 * those with a synthetic { ok: true } in static mode. Template-literal paths
 * are not checked.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import path from "path";

const SRC = path.resolve(__dirname, "../../../src");
const PUBLIC = path.resolve(__dirname, "../../../public");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(name) ? [full] : [];
  });
}

function staticGetCalls(): { endpoint: string; file: string }[] {
  const calls: { endpoint: string; file: string }[] = [];
  for (const file of sourceFiles(SRC)) {
    const text = readFileSync(file, "utf8");
    const re = /fetchApi\(\s*"(\/api\/[^"]+)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      // The init object, if any, sits between this call and the next one.
      const next = text.indexOf("fetchApi(", m.index + 1);
      const rest = text.slice(m.index, next === -1 ? m.index + 600 : next);
      const method = /method:\s*["'`](\w+)["'`]/.exec(rest)?.[1];
      if (method && method.toUpperCase() !== "GET") continue;
      calls.push({ endpoint: m[1], file: path.relative(SRC, file) });
    }
  }
  return calls;
}

describe("static export: every GET has a fixture", () => {
  const fetched: string[] = [];

  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_STATIC_EXPORT", "true");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        fetched.push(url);
        return new Response("{}");
      }),
    );
    // fetchApi waits 300 ms to feel natural; not here.
    vi.spyOn(globalThis, "setTimeout").mockImplementation(((fn: () => void) => {
      fn();
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    fetched.length = 0;
  });

  it("finds the calls it is meant to check", () => {
    // Guards the scan itself: a regex that matches nothing would pass below.
    expect(staticGetCalls().length).toBeGreaterThan(30);
  });

  it("resolves each one to a file under public/mock", async () => {
    const { fetchApi } = await import("@/lib/api");
    const missing: string[] = [];
    for (const { endpoint, file } of staticGetCalls()) {
      fetched.length = 0;
      await fetchApi(endpoint);
      const served = fetched[0].replace(
        /^\/MinimumViableHealthDataspacev2/,
        "",
      );
      const onDisk = path.join(PUBLIC, served.split("?")[0]);
      if (!served.startsWith("/mock/") || !existsSync(onDisk)) {
        missing.push(`${endpoint} (${file}) -> ${served}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
