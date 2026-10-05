/**
 * The rate limit counts per user, then per participant, then per address
 * (#519). Every request reaches the proxy from a UI replica, so a per-IP key
 * gave the whole platform one bucket; per participant alone capped one
 * organisation's 20 users at 100 requests a minute.
 */
import { describe, it, expect } from "vitest";
import supertest from "supertest";

process.env.RATE_LIMIT_MAX = "2";
process.env.RATE_LIMIT_PARTICIPANT_MAX = "4";
process.env.RATE_LIMIT_WINDOW_MS = "60000";

const { app, rateLimitKey } = await import("../src/app.js");
app.get("/limited", (_req, res) => {
  res.json({ ok: true });
});
const request = supertest(app);

const CALLER = "3f2a9c1e8b7d6a5f4e3d2c1b0a9f8e7d";

describe("rateLimitKey", () => {
  const req = (headers: Record<string, string>, ip = "10.0.0.5") =>
    ({ header: (n: string) => headers[n], ip }) as never;

  it("keys on the user hash first, then the participant, then the address", () => {
    expect(
      rateLimitKey(req({ "x-caller": CALLER, "x-participant": "did:web:a" })),
    ).toBe(`u:${CALLER}`);
    expect(rateLimitKey(req({ "x-participant": "did:web:a" }))).toBe(
      "p:did:web:a",
    );
    expect(rateLimitKey(req({}))).toBe("10.0.0.5");
  });

  it("ignores a caller that is not a hash, and an oversized participant", () => {
    expect(
      rateLimitKey(
        req({ "x-caller": "alice@example.org", "x-participant": "did:web:a" }),
      ),
    ).toBe("p:did:web:a");
    expect(
      rateLimitKey(req({ "x-participant": "x".repeat(257) }, "10.0.0.6")),
    ).toBe("10.0.0.6");
  });
});

describe("general limiter", () => {
  it("gives each user their own budget", async () => {
    const alice = {
      "X-Caller": CALLER,
      "X-Participant": "did:web:alpha-klinik.de:participant",
    };
    const bob = {
      "X-Caller": CALLER.replace("3f2a", "9e1b"),
      "X-Participant": "did:web:alpha-klinik.de:participant",
    };
    expect((await request.get("/limited").set(alice)).status).toBe(200);
    expect((await request.get("/limited").set(alice)).status).toBe(200);
    const third = await request.get("/limited").set(alice);
    expect(third.status).toBe(429);
    expect(third.headers["ratelimit-limit"]).toBe("2");
    // same organisation, another person: not affected
    expect((await request.get("/limited").set(bob)).status).toBe(200);
  });

  it("gives a participant without a named user the larger budget", async () => {
    const org = { "X-Participant": "did:web:pharmaco.de:research" };
    for (let i = 0; i < 4; i += 1) {
      expect((await request.get("/limited").set(org)).status).toBe(200);
    }
    const fifth = await request.get("/limited").set(org);
    expect(fifth.status).toBe(429);
    expect(fifth.headers["ratelimit-limit"]).toBe("4");
  });

  it("without any header, counts the address behind the ingress", async () => {
    const a = { "X-Forwarded-For": "10.1.0.11" };
    const b = { "X-Forwarded-For": "10.1.0.12" };
    for (let i = 0; i < 4; i += 1) {
      expect((await request.get("/limited").set(a)).status).toBe(200);
    }
    expect((await request.get("/limited").set(a)).status).toBe(429);
    expect((await request.get("/limited").set(b)).status).toBe(200);
  });
});
