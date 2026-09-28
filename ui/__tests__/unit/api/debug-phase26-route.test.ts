/**
 * Tests for /api/debug/phase26/route.ts, the operator's federated-discovery
 * diagnostic (#377).
 *
 * The point of this file is the gate. The route answered anonymous callers
 * until 2026-09-28 while the API collection filed it under the operator
 * persona, so the code and the role matrix disagreed, which is the defect
 * #357 was. These pin the refusal, and pin that the upstream proxy is never
 * called before refusing, which is the part a later refactor could quietly
 * lose.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth-guard";

import { GET } from "@/app/api/debug/phase26/route";

const PHASE26 = {
  crawlerTargetCount: 4,
  participants: { total: 9, withSource: 5, withDspCatalogUrl: 4 },
  healthDatasets: { total: 10, federated: 5 },
  nlqGlossary: { total: 58, kinds: ["concept", "drug"] },
};

const ADMIN_SESSION = {
  session: {
    user: { id: "test-admin", name: "Test Admin" },
    roles: ["EDC_ADMIN"],
    accessToken: "test-token",
  },
};

describe("GET /api/debug/phase26 as an operator", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 200,
        json: async () => PHASE26,
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("passes the proxy's summary through", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(PHASE26);
  });

  it("answers 502 when the proxy cannot be reached", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED")),
    );
    const res = await GET();
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "connect ECONNREFUSED" });
  });
});

describe("GET /api/debug/phase26 with no session", () => {
  const proxyFetch = vi.fn();

  beforeEach(() => {
    proxyFetch.mockReset();
    vi.stubGlobal("fetch", proxyFetch);
    // __tests__/setup.ts mocks @/lib/auth-guard open: requireAuth always
    // returns an EDC_ADMIN and isAuthError always returns false, so route
    // tests exercise business logic rather than the guard. No route test can
    // catch a missing gate unless it closes the guard itself, which is what
    // this block does.
    vi.mocked(requireAuth).mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );
    vi.mocked(isAuthError).mockImplementation(
      (r): r is NextResponse => r instanceof NextResponse,
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.mocked(requireAuth).mockResolvedValue(ADMIN_SESSION);
    vi.mocked(isAuthError).mockReturnValue(false);
  });

  it("refuses the anonymous caller", async () => {
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("answers the refusal in the { error } shape every route uses", async () => {
    const res = await GET();
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("does not call the proxy before refusing", async () => {
    await GET();
    expect(proxyFetch).not.toHaveBeenCalled();
  });
});

describe("GET /api/debug/phase26 as a signed-in non-operator", () => {
  const proxyFetch = vi.fn();

  beforeEach(() => {
    proxyFetch.mockReset();
    vi.stubGlobal("fetch", proxyFetch);
    // A session is not enough: requireAuth(["EDC_ADMIN"]) answers 403 to a
    // participant who holds none of the listed roles.
    vi.mocked(requireAuth).mockResolvedValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );
    vi.mocked(isAuthError).mockImplementation(
      (r): r is NextResponse => r instanceof NextResponse,
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.mocked(requireAuth).mockResolvedValue(ADMIN_SESSION);
    vi.mocked(isAuthError).mockReturnValue(false);
  });

  it("refuses a data user", async () => {
    const res = await GET();
    expect(res.status).toBe(403);
    expect(proxyFetch).not.toHaveBeenCalled();
  });
});

describe("the role it asks for", () => {
  it("asks for EDC_ADMIN, not merely a session", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ status: 200, json: async () => PHASE26 }),
    );
    await GET();
    // The distinction this pins: requireAuth() with no argument admits any
    // authenticated participant, which would leave a data user able to read
    // the operator's diagnostic. #377 is about the role, not just the login.
    expect(requireAuth).toHaveBeenCalledWith(["EDC_ADMIN"]);
    vi.unstubAllGlobals();
  });
});
