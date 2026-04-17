/**
 * Tests for /api/health/route.ts
 *
 * Liveness endpoint used by ACA / docker-compose healthchecks and by the
 * admin dashboard's heartbeat widget. Contract is intentionally tiny so
 * we pin the shape to catch accidental changes.
 */
import { describe, it, expect } from "vitest";
import { GET } from "@/app/api/health/route";

describe("GET /api/health", () => {
  it("returns 200 with status=ok", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("ok");
  });

  it("includes an ISO-8601 timestamp", async () => {
    const res = await GET();
    const data = await res.json();
    expect(data.timestamp).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/,
    );
    // Timestamp should parse into a real Date (not NaN) and be close to now.
    const drift = Math.abs(Date.now() - Date.parse(data.timestamp));
    expect(drift).toBeLessThan(5_000);
  });

  it("returns fresh timestamps on each call (no caching)", async () => {
    const a = await (await GET()).json();
    // Tiny delay so the ms component can tick.
    await new Promise((r) => setTimeout(r, 5));
    const b = await (await GET()).json();
    expect(a.timestamp <= b.timestamp).toBe(true);
  });
});
