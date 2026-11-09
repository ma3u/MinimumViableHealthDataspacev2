/**
 * Unit tests for EDC-V / CFM API Client (ui/src/lib/edc/client.ts)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// We need to mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("EDC Client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    // Clear cached token between tests
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  /**
   * Helper: set up mock for Keycloak token + subsequent API call
   */
  function mockTokenAndApi(apiResponse: unknown, apiStatus = 200) {
    let callCount = 0;
    mockFetch.mockImplementation(async (url: string | URL) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("/openid-connect/token")) {
        return {
          ok: true,
          json: async () => ({
            access_token: "test-token-" + callCount++,
            expires_in: 3600,
            token_type: "Bearer",
          }),
        };
      }
      // API call
      return {
        ok: apiStatus >= 200 && apiStatus < 300,
        status: apiStatus,
        statusText: apiStatus === 200 ? "OK" : "Error",
        json: async () => apiResponse,
        text: async () => JSON.stringify(apiResponse),
      };
    });
  }

  describe("edcClient.management", () => {
    it("should make authenticated requests to the management API", async () => {
      mockTokenAndApi([{ "@id": "asset-1" }]);

      const { edcClient } = await import("@/lib/edc/client");
      const result = await edcClient.management("/v3/assets/request", "POST", {
        "@type": "QuerySpec",
      });

      expect(result).toEqual([{ "@id": "asset-1" }]);
      // Should have called fetch twice: once for token, once for API
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Verify the API call included Authorization header
      const apiCall = mockFetch.mock.calls[1];
      expect(apiCall[1].headers["Authorization"]).toMatch(/^Bearer test-token/);
    });

    it("should include Content-Type and Accept JSON headers", async () => {
      mockTokenAndApi({ data: "ok" });

      const { edcClient } = await import("@/lib/edc/client");
      await edcClient.management("/v3/assets");

      const apiCall = mockFetch.mock.calls[1];
      expect(apiCall[1].headers["Content-Type"]).toBe("application/json");
      expect(apiCall[1].headers["Accept"]).toBe("application/json");
    });

    it("should throw on non-OK API response", async () => {
      mockTokenAndApi({ error: "not found" }, 404);

      const { edcClient } = await import("@/lib/edc/client");
      await expect(edcClient.management("/v3/assets/missing")).rejects.toThrow(
        "EDC API error",
      );
    });
  });

  describe("edcClient (other APIs)", () => {
    it("should expose identity, issuer, tenant, and provision facades", async () => {
      mockTokenAndApi({ ok: true });

      const { edcClient } = await import("@/lib/edc/client");
      expect(typeof edcClient.identity).toBe("function");
      expect(typeof edcClient.issuer).toBe("function");
      expect(typeof edcClient.tenant).toBe("function");
      expect(typeof edcClient.provision).toBe("function");
    });
  });

  describe("EDC_CONTEXT", () => {
    it("should export the EDC management v2 context URI", async () => {
      const { EDC_CONTEXT } = await import("@/lib/edc/client");
      expect(EDC_CONTEXT).toBe("https://w3id.org/edc/connector/management/v2");
    });
  });

  describe("Keycloak token caching", () => {
    it("should reuse cached token within expiry window", async () => {
      mockTokenAndApi({ data: "first" });

      const { edcClient } = await import("@/lib/edc/client");

      await edcClient.management("/v3/test1");
      await edcClient.management("/v3/test2");

      // Token endpoint should only be called once (cached)
      const tokenCalls = mockFetch.mock.calls.filter(
        (c) =>
          typeof c[0] === "string" && c[0].includes("/openid-connect/token"),
      );
      expect(tokenCalls.length).toBe(1);
    });
  });

  describe("Token failure handling", () => {
    it("should proceed without auth when token request fails", async () => {
      let callCount = 0;
      mockFetch.mockImplementation(async (url: string | URL) => {
        const urlStr = typeof url === "string" ? url : url.toString();
        if (urlStr.includes("/openid-connect/token")) {
          return { ok: false, status: 401, statusText: "Unauthorized" };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ fallback: true }),
        };
      });

      const { edcClient } = await import("@/lib/edc/client");
      // Should not throw — it warns and continues without auth
      const result = await edcClient.management("/v3/public-endpoint");
      expect(result).toEqual({ fallback: true });
    });
  });
});
