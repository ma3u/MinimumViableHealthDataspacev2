/**
 * Comprehensive tests for middleware.ts — role-based access control,
 * authorized callback, and config matcher.
 *
 * The middleware wraps `withAuth` from next-auth/middleware. We mock
 * that wrapper to capture the middleware function and callbacks, then
 * test them directly.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

/* ── Hoisted state (available inside vi.mock factories) ───────────── */

type AuthorizedCb = (args: { token: unknown; req: unknown }) => boolean;

const captured = vi.hoisted(() => ({
  middleware: null as ((req: unknown) => unknown) | null,
  options: null as { callbacks: { authorized: AuthorizedCb } } | null,
}));

/* ── Mocks ────────────────────────────────────────────────────────── */

const mockRedirect = vi.fn().mockReturnValue({ type: "redirect" });
const mockNext = vi.fn().mockReturnValue({ type: "next" });

vi.mock("next/server", () => ({
  NextResponse: {
    redirect: (...args: unknown[]) => mockRedirect(...args),
    next: (...args: unknown[]) => mockNext(...args),
  },
}));

vi.mock("next-auth/middleware", () => ({
  withAuth: (
    fn: (req: unknown) => unknown,
    opts: { callbacks: { authorized: AuthorizedCb } },
  ) => {
    captured.middleware = fn;
    captured.options = opts;
    return fn;
  },
}));

/* ── Helpers ───────────────────────────────────────────────────────── */

function makeReq(pathname: string, roles: string[] = []) {
  return {
    nextUrl: { pathname },
    url: "http://localhost:3000" + pathname,
    nextauth: { token: { roles } },
  } as unknown as NextRequest & { nextauth: { token: { roles: string[] } } };
}

function makeAuthReq(pathname: string) {
  return {
    nextUrl: { pathname },
  };
}

/* ── Static import triggers the mock wiring synchronously ─────────── */
// vi.mock is hoisted, so by the time this import executes withAuth is mocked
import "@/middleware";

/* ── Tests ─────────────────────────────────────────────────────────── */

describe("middleware — role-based route protection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── /admin routes ────────────────────────────────────────────────

  describe("/admin routes", () => {
    it("redirects to /auth/unauthorized when user has no roles", () => {
      captured.middleware!(makeReq("/admin"));
      expect(mockRedirect).toHaveBeenCalledTimes(1);
      const url = mockRedirect.mock.calls[0][0] as URL;
      expect(url.pathname).toBe("/auth/unauthorized");
    });

    it("redirects when user has EDC_USER_PARTICIPANT but not EDC_ADMIN", () => {
      captured.middleware!(makeReq("/admin", ["EDC_USER_PARTICIPANT"]));
      expect(mockRedirect).toHaveBeenCalledTimes(1);
    });

    it("redirects when user has HDAB_AUTHORITY but not EDC_ADMIN", () => {
      captured.middleware!(makeReq("/admin", ["HDAB_AUTHORITY"]));
      expect(mockRedirect).toHaveBeenCalledTimes(1);
    });

    it("allows access when user has EDC_ADMIN role", () => {
      captured.middleware!(makeReq("/admin", ["EDC_ADMIN"]));
      expect(mockRedirect).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();
    });

    it("allows access when user has EDC_ADMIN among multiple roles", () => {
      captured.middleware!(makeReq("/admin", ["HDAB_AUTHORITY", "EDC_ADMIN"]));
      expect(mockRedirect).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();
    });

    it("applies to /admin sub-paths like /admin/policies", () => {
      captured.middleware!(makeReq("/admin/policies", []));
      expect(mockRedirect).toHaveBeenCalledTimes(1);
    });

    it("applies to /admin/users sub-path", () => {
      captured.middleware!(makeReq("/admin/users", ["EDC_ADMIN"]));
      expect(mockRedirect).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();
    });
  });

  // ── /compliance routes ───────────────────────────────────────────

  describe("/compliance routes", () => {
    it("redirects when user has no roles", () => {
      captured.middleware!(makeReq("/compliance"));
      expect(mockRedirect).toHaveBeenCalledTimes(1);
      const url = mockRedirect.mock.calls[0][0] as URL;
      expect(url.pathname).toBe("/auth/unauthorized");
    });

    it("redirects when user has only EDC_USER_PARTICIPANT", () => {
      captured.middleware!(makeReq("/compliance", ["EDC_USER_PARTICIPANT"]));
      expect(mockRedirect).toHaveBeenCalledTimes(1);
    });

    it("allows access with HDAB_AUTHORITY role", () => {
      captured.middleware!(makeReq("/compliance", ["HDAB_AUTHORITY"]));
      expect(mockRedirect).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();
    });

    it("allows access with EDC_ADMIN role", () => {
      captured.middleware!(makeReq("/compliance", ["EDC_ADMIN"]));
      expect(mockRedirect).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();
    });

    it("allows access with both HDAB_AUTHORITY and EDC_ADMIN", () => {
      captured.middleware!(
        makeReq("/compliance", ["HDAB_AUTHORITY", "EDC_ADMIN"]),
      );
      expect(mockRedirect).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();
    });

    it("applies to /compliance sub-paths", () => {
      captured.middleware!(makeReq("/compliance/reports", []));
      expect(mockRedirect).toHaveBeenCalledTimes(1);
    });
  });

  // ── Other authenticated routes (pass through) ────────────────────

  describe("non-restricted routes pass through", () => {
    const passThroughCases = [
      { path: "/onboarding", roles: [] as string[] },
      { path: "/credentials", roles: [] as string[] },
      { path: "/settings", roles: [] as string[] },
      { path: "/data", roles: ["EDC_USER_PARTICIPANT"] },
      { path: "/negotiate", roles: ["EDC_USER_PARTICIPANT"] },
      { path: "/data/some-id", roles: [] as string[] },
    ];

    passThroughCases.forEach(({ path, roles }) => {
      it(`allows ${path} without role restrictions`, () => {
        captured.middleware!(makeReq(path, roles));
        expect(mockRedirect).not.toHaveBeenCalled();
        expect(mockNext).toHaveBeenCalled();
      });
    });
  });

  // ── Edge cases ───────────────────────────────────────────────────

  describe("edge cases", () => {
    it("handles missing roles (token with no roles)", () => {
      const req = {
        nextUrl: { pathname: "/admin" },
        url: "http://localhost:3000/admin",
        nextauth: { token: {} },
      };
      captured.middleware!(req);
      expect(mockRedirect).toHaveBeenCalledTimes(1);
    });

    it("handles null token roles gracefully", () => {
      const req = {
        nextUrl: { pathname: "/admin" },
        url: "http://localhost:3000/admin",
        nextauth: { token: { roles: null } },
      };
      captured.middleware!(req);
      expect(mockRedirect).toHaveBeenCalledTimes(1);
    });

    it("passes through root path /", () => {
      captured.middleware!(makeReq("/", ["EDC_ADMIN"]));
      expect(mockRedirect).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();
    });

    it("passes through unknown paths", () => {
      captured.middleware!(makeReq("/some-random", []));
      expect(mockRedirect).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();
    });
  });
});

describe("middleware — authorized callback", () => {
  const authorized = () => captured.options!.callbacks.authorized;

  // ── Protected paths ──────────────────────────────────────────────

  describe("protected paths", () => {
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
    ];

    protectedPaths.forEach((pathname) => {
      it(`requires token for ${pathname}`, () => {
        const result = authorized()({
          token: null,
          req: makeAuthReq(pathname),
        });
        expect(result).toBe(false);
      });

      it(`allows access to ${pathname} with a token`, () => {
        const result = authorized()({
          token: { sub: "user-1", roles: [] },
          req: makeAuthReq(pathname),
        });
        expect(result).toBe(true);
      });
    });
  });

  // ── Public paths ─────────────────────────────────────────────────

  describe("public paths", () => {
    const publicPaths = [
      "/",
      "/graph",
      "/catalog",
      "/patient",
      "/analytics",
      "/about",
    ];

    publicPaths.forEach((pathname) => {
      it(`allows ${pathname} without token (public)`, () => {
        const result = authorized()({
          token: null,
          req: makeAuthReq(pathname),
        });
        expect(result).toBe(true);
      });

      it(`allows ${pathname} with token`, () => {
        const result = authorized()({
          token: { sub: "user-1" },
          req: makeAuthReq(pathname),
        });
        expect(result).toBe(true);
      });
    });
  });
});

describe("middleware — config matcher", () => {
  // Re-import to get the config export
  it("exports exactly 7 matcher patterns", async () => {
    const { config } = await import("@/middleware");
    expect(config.matcher).toHaveLength(7);
  });

  it("includes all protected route patterns", async () => {
    const { config } = await import("@/middleware");
    const expected = [
      "/admin/:path*",
      "/compliance/:path*",
      "/onboarding/:path*",
      "/credentials/:path*",
      "/settings/:path*",
      "/data/:path*",
      "/negotiate/:path*",
    ];
    expect(config.matcher).toEqual(expected);
  });

  it("does not include /api routes", async () => {
    const { config } = await import("@/middleware");
    const hasApi = config.matcher.some(
      (m: string) => m.startsWith("/api") || m.includes("api"),
    );
    expect(hasApi).toBe(false);
  });

  it("does not include static file patterns", async () => {
    const { config } = await import("@/middleware");
    const hasStatic = config.matcher.some(
      (m: string) =>
        m.includes("_next") || m.includes(".ico") || m.includes(".png"),
    );
    expect(hasStatic).toBe(false);
  });
});
