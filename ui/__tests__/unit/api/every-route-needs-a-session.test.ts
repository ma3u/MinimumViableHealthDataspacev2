/**
 * Every API route needs a session (#404, ADR-044). The only exceptions are
 * the routes that make signing in possible, the liveness probe, and the
 * demo DSP endpoint the catalog crawler calls as a machine.
 *
 * Two checks. The inventory fails when a route file never calls
 * requireAuth() and is not on the list below, so a new anonymous route
 * cannot get in by forgetting the gate. The no-session block calls the five
 * routes that were public until #404 with the real guard and no session.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";
import { getServerSession } from "next-auth/next";
import { NextRequest } from "next/server";

// The real requireAuth(), against the mocked session (setup.ts mocks it open).
vi.unmock("@/lib/auth-guard");

vi.mock("@/lib/neo4j", () => ({ runQuery: vi.fn(async () => []) }));

const API_DIR = path.resolve(__dirname, "../../../src/app/api");

/** Route paths that answer without a session, each with its reason. */
const ANONYMOUS: Record<string, string> = {
  "auth/[...nextauth]": "the NextAuth handler: signing in itself",
  "auth/eudi/start": "starts an EUDI wallet sign-in, before any session",
  "auth/eudi/status": "polled by the QR page until the wallet sign-in lands",
  "keycloak-config": "tells the sign-in banner where Keycloak is",
  health: "the liveness and readiness probe (k8s/probes.yaml)",
  "mock-dsp/[participant]/catalog/request":
    "the demo DSP catalogue; the catalog crawler calls it with no session (open question in #404)",
};

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return routeFiles(full);
    return name === "route.ts" ? [full] : [];
  });
}

describe("every API route needs a session (ADR-044)", () => {
  // Per handler, not per file: GET /api/compliance/results was open in a
  // file whose POST was gated, and a file-level check passed it.
  it("gates every handler outside the anonymous list", () => {
    const files = routeFiles(API_DIR);
    expect(files.length).toBeGreaterThan(50);
    const ungated: string[] = [];
    for (const file of files) {
      const route = path.relative(API_DIR, path.dirname(file));
      if (route in ANONYMOUS) continue;
      const text = readFileSync(file, "utf8");
      // File-local helpers that call requireAuth() count as a gate.
      const helpers = [
        ...text.matchAll(/function (\w+)\([^)]*\)[^{]*\{([\s\S]*?)\n\}\n/g),
      ]
        .filter((m) => m[2].includes("requireAuth("))
        .map((m) => m[1]);
      const handlers = [
        ...text.matchAll(
          /export async function (GET|POST|PUT|DELETE|PATCH)\b([\s\S]*?)(?=\nexport async function|$)/g,
        ),
      ];
      for (const [, method, body] of handlers) {
        const gated =
          body.includes("requireAuth(") ||
          helpers.some((h) => new RegExp(`\\b${h}\\(`).test(body));
        if (!gated) ungated.push(`${method} ${route}`);
      }
    }
    expect(ungated).toEqual([]);
  });

  it("lists no anonymous route that no longer exists", () => {
    const routes = new Set(
      routeFiles(API_DIR).map((f) => path.relative(API_DIR, path.dirname(f))),
    );
    expect(Object.keys(ANONYMOUS).filter((r) => !routes.has(r))).toEqual([]);
  });
});

describe("the routes that were public until #404 refuse an anonymous caller", () => {
  beforeEach(() => {
    vi.mocked(getServerSession).mockResolvedValue(null);
  });

  const cases: [string, () => Promise<Response>][] = [
    [
      "/api/graph",
      async () =>
        (await import("@/app/api/graph/route")).GET(
          new Request("http://localhost/api/graph"),
        ),
    ],
    [
      "/api/permits",
      async () => (await import("@/app/api/permits/route")).GET(),
    ],
    [
      "/api/information",
      async () => (await import("@/app/api/information/route")).GET(),
    ],
    [
      "/api/activity-report",
      async () =>
        (await import("@/app/api/activity-report/route")).GET(
          new NextRequest("http://localhost/api/activity-report"),
        ),
    ],
    [
      "/api/compliance/results",
      async () => (await import("@/app/api/compliance/results/route")).GET(),
    ],
    [
      "/api/nlq/backend",
      async () => (await import("@/app/api/nlq/backend/route")).GET(),
    ],
  ];

  it.each(cases)("%s answers 401 with { error }", async (_route, call) => {
    const res = await call();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });
});
