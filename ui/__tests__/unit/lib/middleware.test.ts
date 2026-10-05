/**
 * Tests for middleware.ts — role-based route protection and CSP injection.
 *
 * Middleware no longer wraps `withAuth`; it does manual `getToken()` auth and
 * applies a per-request CSP nonce to every HTML response. Tests call the
 * default-exported `middleware()` function with mock NextRequests.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/* ── Mocks ─────────────────────────────────────────────────────────── */

const getTokenMock = vi.fn();
vi.mock("next-auth/jwt", () => ({
  getToken: (...args: unknown[]) => getTokenMock(...args),
}));

/* ── Helpers ───────────────────────────────────────────────────────── */

type TokenLike = { roles?: string[] | null } | null;

function makeReq(pathname: string) {
  const url = "http://localhost:3000" + pathname;
  return {
    nextUrl: { pathname },
    url,
    headers: new Headers(),
  } as unknown as import("next/server").NextRequest;
}

async function invoke(pathname: string, token: TokenLike = null) {
  getTokenMock.mockResolvedValueOnce(token);
  const { default: middleware } = await import("@/middleware");
  return middleware(makeReq(pathname));
}

/* ── Config matcher ────────────────────────────────────────────────── */

describe("middleware config matcher", () => {
  it("exports the page pattern and, for off-hours mode, the API routes", async () => {
    const { config } = await import("@/middleware");
    expect(Array.isArray(config.matcher)).toBe(true);
    expect(config.matcher).toEqual([expect.any(String), "/api/:path*"]);
  });

  it("excludes api, static assets, images, favicon, swagger-ui, mock, and static", async () => {
    const { config } = await import("@/middleware");
    const [pattern] = config.matcher;
    expect(pattern).toContain("api");
    expect(pattern).toContain("_next/static");
    expect(pattern).toContain("_next/image");
    expect(pattern).toContain("favicon.ico");
    expect(pattern).toContain("swagger-ui");
    expect(pattern).toContain("mock");
    expect(pattern).toContain("static");
  });
});

/* ── Auth gating on protected paths ────────────────────────────────── */

describe("middleware — protected path auth gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const protectedPaths = [
    "/admin",
    "/admin/policies",
    "/compliance",
    "/compliance/reports",
    "/onboarding",
    "/credentials",
    "/settings",
    "/data",
    "/data/transfer/123",
    "/negotiate",
    "/patient/profile",
    "/patient/research",
    "/patient/insights",
  ];

  protectedPaths.forEach((pathname) => {
    it(`redirects to /auth/signin when unauthenticated at ${pathname}`, async () => {
      const res = await invoke(pathname, null);
      expect(res.status).toBe(307);
      const location = res.headers.get("location") ?? "";
      expect(location).toContain("/auth/signin");
      expect(location).toContain("callbackUrl=");
    });
  });
});

/* ── Role-based authorization ──────────────────────────────────────── */

describe("middleware — role-based authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("/admin requires EDC_ADMIN", () => {
    it("redirects to /auth/unauthorized when roles missing", async () => {
      const res = await invoke("/admin", { roles: [] });
      expect(res.headers.get("location")).toContain("/auth/unauthorized");
    });

    it("redirects when user has HDAB_AUTHORITY only", async () => {
      const res = await invoke("/admin", { roles: ["HDAB_AUTHORITY"] });
      expect(res.headers.get("location")).toContain("/auth/unauthorized");
    });

    it("allows access with EDC_ADMIN", async () => {
      const res = await invoke("/admin", { roles: ["EDC_ADMIN"] });
      expect(res.headers.get("location")).toBeNull();
    });

    it("applies to /admin sub-paths", async () => {
      const res = await invoke("/admin/policies", { roles: [] });
      expect(res.headers.get("location")).toContain("/auth/unauthorized");
    });
  });

  describe("/compliance requires HDAB_AUTHORITY or EDC_ADMIN", () => {
    it("redirects when only EDC_USER_PARTICIPANT", async () => {
      const res = await invoke("/compliance", {
        roles: ["EDC_USER_PARTICIPANT"],
      });
      expect(res.headers.get("location")).toContain("/auth/unauthorized");
    });

    it("allows HDAB_AUTHORITY", async () => {
      const res = await invoke("/compliance", { roles: ["HDAB_AUTHORITY"] });
      expect(res.headers.get("location")).toBeNull();
    });

    it("allows EDC_ADMIN", async () => {
      const res = await invoke("/compliance", { roles: ["EDC_ADMIN"] });
      expect(res.headers.get("location")).toBeNull();
    });
  });

  describe("/patient/* sub-routes require PATIENT or EDC_ADMIN", () => {
    const paths = [
      "/patient/profile",
      "/patient/research",
      "/patient/insights",
    ];

    paths.forEach((p) => {
      it(`redirects ${p} when role is EDC_USER_PARTICIPANT only`, async () => {
        const res = await invoke(p, { roles: ["EDC_USER_PARTICIPANT"] });
        expect(res.headers.get("location")).toContain("/auth/unauthorized");
      });

      it(`allows ${p} for PATIENT`, async () => {
        const res = await invoke(p, { roles: ["PATIENT"] });
        expect(res.headers.get("location")).toBeNull();
      });

      it(`allows ${p} for EDC_ADMIN`, async () => {
        const res = await invoke(p, { roles: ["EDC_ADMIN"] });
        expect(res.headers.get("location")).toBeNull();
      });
    });
  });

  describe("authenticated-only paths (any role)", () => {
    const paths = [
      "/onboarding",
      "/credentials",
      "/settings",
      "/data",
      "/data/some-id",
      "/negotiate",
    ];

    paths.forEach((p) => {
      it(`allows ${p} with any authenticated token`, async () => {
        const res = await invoke(p, { roles: [] });
        expect(res.headers.get("location")).toBeNull();
      });
    });
  });

  it("handles null token.roles gracefully on protected role-gated path", async () => {
    const res = await invoke("/admin", { roles: null });
    expect(res.headers.get("location")).toContain("/auth/unauthorized");
  });
});

/* ── Public paths pass through ─────────────────────────────────────── */

describe("middleware — public paths", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // "/patient" used to be here. #357 gated it: /api/patient, the page's only
  // data call, now refuses an anonymous caller, so leaving the page public
  // would show an empty shell instead of sending the visitor to sign in.
  // "/graph", "/catalog" and "/analytics" too, since #404: every API route
  // needs a session (ADR-044), and so does every page that reads one.
  const publicPaths = ["/", "/about", "/some-random"];

  publicPaths.forEach((p) => {
    it(`passes ${p} through without auth check`, async () => {
      const res = await invoke(p, null);
      expect(res.headers.get("location")).toBeNull();
      // getToken should not even be called for public paths
      expect(getTokenMock).not.toHaveBeenCalled();
    });
  });

  it("sends an anonymous visitor on /patient to sign in (#357)", async () => {
    const res = await invoke("/patient", null);
    expect(res.headers.get("location")).toContain("/auth/signin");
  });

  [
    "/graph",
    "/permits",
    "/information",
    "/activity-report",
    "/catalog",
    "/analytics",
    "/query",
    "/eehrxf",
    "/tasks",
  ].forEach((p) => {
    it(`sends an anonymous visitor on ${p} to sign in (#404)`, async () => {
      const res = await invoke(p, null);
      expect(res.headers.get("location")).toContain("/auth/signin");
    });
  });
});

/* ── CSP headers ───────────────────────────────────────────────────── */

describe("middleware — Content-Security-Policy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sets a CSP header with a nonce on public responses", async () => {
    const res = await invoke("/", null);
    const csp = res.headers.get("Content-Security-Policy");
    expect(csp).toBeTruthy();
    expect(csp).toMatch(/nonce-[A-Za-z0-9+/=]+/);
    expect(csp).toContain("'strict-dynamic'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it("sets a CSP header on signin redirect responses", async () => {
    const res = await invoke("/admin", null);
    const csp = res.headers.get("Content-Security-Policy");
    expect(csp).toBeTruthy();
    expect(csp).toContain("script-src");
  });

  it("sets a CSP header on unauthorized redirect responses", async () => {
    const res = await invoke("/admin", { roles: [] });
    const csp = res.headers.get("Content-Security-Policy");
    expect(csp).toBeTruthy();
  });
});

/* ── Off-hours mode (ADR-053) ──────────────────────────────────────── */

describe("middleware — off-hours mode", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("passes API routes through untouched while the demo is up", async () => {
    const res = await invoke("/api/patient");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Security-Policy")).toBeNull();
  });

  it("shows every page as the offline notice, without asking for a session", async () => {
    vi.stubEnv("LIVE_DEMO_OFFLINE", "true");
    for (const p of ["/", "/graph", "/admin/policies"]) {
      getTokenMock.mockClear();
      const res = await invoke(p);
      expect(res.headers.get("x-middleware-rewrite")).toContain("/offline");
      expect(res.headers.get("location")).toBeNull();
      expect(res.headers.get("Content-Security-Policy")).toContain("nonce-");
      expect(getTokenMock).not.toHaveBeenCalled();
    }
  });

  it("does not rewrite the notice onto itself", async () => {
    vi.stubEnv("LIVE_DEMO_OFFLINE", "true");
    const res = await invoke("/offline");
    expect(res.headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("answers data routes with a 503 that points at the static site", async () => {
    vi.stubEnv("LIVE_DEMO_OFFLINE", "true");
    const res = await invoke("/api/graph");
    expect(res.status).toBe(503);
    expect(res.headers.get("Retry-After")).toBe("3600");
    const body = await res.json();
    expect(body.error).toMatch(/offline/);
    expect(body.staticSite).toBe(
      "https://ma3u.github.io/MinimumViableHealthDataspacev2/",
    );
  });

  it("keeps the liveness probe and the session endpoint answering", async () => {
    vi.stubEnv("LIVE_DEMO_OFFLINE", "true");
    for (const p of ["/api/health", "/api/auth/session"]) {
      const res = await invoke(p);
      expect(res.status).toBe(200);
    }
  });
});
