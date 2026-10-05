/**
 * The rate limit counts per participant, not per client IP (#519). Every
 * request reaches the proxy from a UI replica, so a per-IP key gave the
 * whole platform one bucket.
 */
import { describe, it, expect, beforeAll } from "vitest";
import supertest from "supertest";

process.env.RATE_LIMIT_MAX = "2";
process.env.RATE_LIMIT_WINDOW_MS = "60000";

const { app, rateLimitKey } = await import("../src/app.js");
app.get("/limited", (_req, res) => {
  res.json({ ok: true });
});
const request = supertest(app);

describe("rateLimitKey", () => {
  it("keys on X-Participant when present", () => {
    const key = rateLimitKey({
      header: (n: string) =>
        n === "x-participant"
          ? "did:web:alpha-klinik.de:participant"
          : undefined,
      ip: "10.0.0.5",
    } as never);
    expect(key).toBe("p:did:web:alpha-klinik.de:participant");
  });

  it("falls back to the IP without the header, and ignores an oversized header", () => {
    expect(
      rateLimitKey({ header: () => undefined, ip: "10.0.0.5" } as never),
    ).toBe("10.0.0.5");
    expect(
      rateLimitKey({ header: () => "x".repeat(257), ip: "10.0.0.6" } as never),
    ).toBe("10.0.0.6");
  });
});

describe("general limiter", () => {
  beforeAll(() => {
    expect(process.env.RATE_LIMIT_MAX).toBe("2");
  });

  it("gives each participant its own bucket", async () => {
    const alpha = { "X-Participant": "did:web:alpha-klinik.de:participant" };
    const pharma = { "X-Participant": "did:web:pharmaco.de:research" };
    expect((await request.get("/limited").set(alpha)).status).toBe(200);
    expect((await request.get("/limited").set(alpha)).status).toBe(200);
    const third = await request.get("/limited").set(alpha);
    expect(third.status).toBe(429);
    expect(third.headers["ratelimit-limit"]).toBe("2");
    // another participant, same client IP: not affected
    expect((await request.get("/limited").set(pharma)).status).toBe(200);
  });

  it("without the header, counts the address behind the ingress", async () => {
    const a = { "X-Forwarded-For": "10.1.0.11" };
    const b = { "X-Forwarded-For": "10.1.0.12" };
    expect((await request.get("/limited").set(a)).status).toBe(200);
    expect((await request.get("/limited").set(a)).status).toBe(200);
    expect((await request.get("/limited").set(a)).status).toBe(429);
    expect((await request.get("/limited").set(b)).status).toBe(200);
  });
});
