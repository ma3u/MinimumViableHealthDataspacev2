/**
 * Tests for middleware.ts — route matcher config and role logic
 *
 * The middleware uses next-auth withAuth which requires a full Next.js
 * middleware context. We test the exported config and validate the
 * route protection rules via the matcher patterns.
 */
import { describe, it, expect } from "vitest";
import { config } from "@/middleware";

describe("middleware config", () => {
  const { matcher } = config;

  it("should export matcher patterns", () => {
    expect(matcher).toBeDefined();
    expect(Array.isArray(matcher)).toBe(true);
  });

  it("should protect /admin routes", () => {
    expect(matcher).toContainEqual("/admin/:path*");
  });

  it("should protect /compliance routes", () => {
    expect(matcher).toContainEqual("/compliance/:path*");
  });

  it("should protect /onboarding routes", () => {
    expect(matcher).toContainEqual("/onboarding/:path*");
  });

  it("should protect /credentials routes", () => {
    expect(matcher).toContainEqual("/credentials/:path*");
  });

  it("should protect /settings routes", () => {
    expect(matcher).toContainEqual("/settings/:path*");
  });

  it("should protect /data routes", () => {
    expect(matcher).toContainEqual("/data/:path*");
  });

  it("should protect /negotiate routes", () => {
    expect(matcher).toContainEqual("/negotiate/:path*");
  });

  it("should not match /api routes (API routes handle auth internally)", () => {
    const hasApi = matcher.some(
      (m: string) => m.startsWith("/api") || m.includes("api"),
    );
    expect(hasApi).toBe(false);
  });

  it("should not match public routes like /graph or /catalog", () => {
    const publicRoutes = ["/graph", "/catalog", "/patient", "/analytics"];
    for (const route of publicRoutes) {
      const matched = matcher.some((m: string) => m.startsWith(route));
      expect(matched, `${route} should not be in matcher`).toBe(false);
    }
  });

  it("should have exactly 7 protected route patterns", () => {
    expect(matcher).toHaveLength(7);
  });
});
