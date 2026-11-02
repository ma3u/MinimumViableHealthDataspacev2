/**
 * POST /api/admin/spe/power in the static demo (ADR-072): nothing is
 * started or stopped and ARM is never called; it answers what a start would
 * (202, starting, 240 s), so the page has a shape to show.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";

afterEach(() => {
  vi.doUnmock("@/lib/static-export");
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("POST /api/admin/spe/power, static demo", () => {
  it("answers a mock and calls nothing", async () => {
    vi.resetModules();
    vi.doMock("@/lib/static-export", () => ({
      IS_STATIC: true,
      BASE_PATH: "/MinimumViableHealthDataspacev2",
    }));
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { POST } = await import("@/app/api/admin/spe/power/route");
    const res = await POST(
      new NextRequest("http://localhost/api/admin/spe/power", {
        method: "POST",
        body: JSON.stringify({ action: "start", spe: "all" }),
      }),
    );
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({
      action: "start",
      static: true,
      spes: [
        {
          id: "SPE-1",
          group: "mvhd-spe-1",
          state: "starting",
          etaSeconds: 240,
        },
        {
          id: "SPE-2",
          group: "mvhd-spe-2",
          state: "starting",
          etaSeconds: 240,
        },
      ],
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
