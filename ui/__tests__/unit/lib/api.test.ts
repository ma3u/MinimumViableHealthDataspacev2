/**
 * Unit tests for fetchApi helper (ui/src/lib/api.ts)
 *
 * Tests both static export mode (mock routing) and normal mode.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("fetchApi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("normal mode (no static export)", () => {
    it("should call fetch with the endpoint directly", async () => {
      vi.stubEnv("NEXT_PUBLIC_STATIC_EXPORT", "");

      mockFetch.mockResolvedValue(new Response(JSON.stringify({ ok: true })));

      const { fetchApi } = await import("@/lib/api");
      await fetchApi("/api/catalog");

      expect(mockFetch).toHaveBeenCalledWith("/api/catalog", undefined);
    });

    it("should pass through RequestInit options", async () => {
      vi.stubEnv("NEXT_PUBLIC_STATIC_EXPORT", "");

      mockFetch.mockResolvedValue(new Response("{}"));

      const { fetchApi } = await import("@/lib/api");
      const init = { method: "POST", body: JSON.stringify({ q: "test" }) };
      await fetchApi("/api/nlq", init);

      expect(mockFetch).toHaveBeenCalledWith("/api/nlq", init);
    });
  });

  describe("static export mode", () => {
    it("should route /api/catalog to /mock/catalog.json", async () => {
      vi.stubEnv("NEXT_PUBLIC_STATIC_EXPORT", "true");

      mockFetch.mockResolvedValue(new Response("[]"));

      const { fetchApi } = await import("@/lib/api");
      await fetchApi("/api/catalog");

      expect(mockFetch).toHaveBeenCalledWith(
        "/MinimumViableHealthDataspacev2/mock/catalog.json",
        undefined,
      );
    });

    it("should route /api/graph to /mock/graph.json", async () => {
      vi.stubEnv("NEXT_PUBLIC_STATIC_EXPORT", "true");

      mockFetch.mockResolvedValue(new Response("{}"));

      const { fetchApi } = await import("@/lib/api");
      await fetchApi("/api/graph");

      expect(mockFetch).toHaveBeenCalledWith(
        "/MinimumViableHealthDataspacev2/mock/graph.json",
        undefined,
      );
    });

    it("should route /api/patient to /mock/patient.json", async () => {
      vi.stubEnv("NEXT_PUBLIC_STATIC_EXPORT", "true");

      mockFetch.mockResolvedValue(new Response("{}"));

      const { fetchApi } = await import("@/lib/api");
      await fetchApi("/api/patient");

      expect(mockFetch).toHaveBeenCalledWith(
        "/MinimumViableHealthDataspacev2/mock/patient.json",
        undefined,
      );
    });

    it("should route /api/analytics to /mock/analytics.json", async () => {
      vi.stubEnv("NEXT_PUBLIC_STATIC_EXPORT", "true");

      mockFetch.mockResolvedValue(new Response("{}"));

      const { fetchApi } = await import("@/lib/api");
      await fetchApi("/api/analytics");

      expect(mockFetch).toHaveBeenCalledWith(
        "/MinimumViableHealthDataspacev2/mock/analytics.json",
        undefined,
      );
    });

    it("should route /api/credentials to /mock/credentials.json", async () => {
      vi.stubEnv("NEXT_PUBLIC_STATIC_EXPORT", "true");

      mockFetch.mockResolvedValue(new Response("{}"));

      const { fetchApi } = await import("@/lib/api");
      await fetchApi("/api/credentials");

      expect(mockFetch).toHaveBeenCalledWith(
        "/MinimumViableHealthDataspacev2/mock/credentials.json",
        undefined,
      );
    });

    it("should route /api/participants to /mock/participants.json", async () => {
      vi.stubEnv("NEXT_PUBLIC_STATIC_EXPORT", "true");

      mockFetch.mockResolvedValue(new Response("{}"));

      const { fetchApi } = await import("@/lib/api");
      await fetchApi("/api/participants");

      expect(mockFetch).toHaveBeenCalledWith(
        "/MinimumViableHealthDataspacev2/mock/participants.json",
        undefined,
      );
    });

    it("should route unknown endpoints to fetch with basePath prefix", async () => {
      vi.stubEnv("NEXT_PUBLIC_STATIC_EXPORT", "true");

      mockFetch.mockResolvedValue(new Response("{}"));

      const { fetchApi } = await import("@/lib/api");
      await fetchApi("/api/unknown-endpoint");

      // Unknown endpoint should just get basePath + original endpoint
      expect(mockFetch).toHaveBeenCalledWith(
        "/MinimumViableHealthDataspacev2/api/unknown-endpoint",
        undefined,
      );
    });
  });
});
