/**
 * Tests for /lib/edc/index.ts — barrel re-exports.
 */
import { describe, it, expect } from "vitest";

describe("lib/edc barrel export", () => {
  it("should re-export edcClient", async () => {
    const mod = await import("@/lib/edc");
    expect(mod.edcClient).toBeDefined();
    expect(typeof mod.edcClient.management).toBe("function");
    expect(typeof mod.edcClient.tenant).toBe("function");
    expect(typeof mod.edcClient.issuer).toBe("function");
  });

  it("should re-export EDC_CONTEXT constant", async () => {
    const mod = await import("@/lib/edc");
    expect(mod.EDC_CONTEXT).toBe(
      "https://w3id.org/edc/connector/management/v2",
    );
  });
});
