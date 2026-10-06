/**
 * ADR-053: off-hours mode. The notice must name the right morning, and the
 * middleware must let only the routes through that need no backend.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import {
  apiAnswersOffline,
  berlinHolidays,
  isLiveDemoOffline,
  nextOpening,
  staticSiteUrl,
} from "@/lib/offline-mode";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the flag", () => {
  it("is on only for the literal string true", () => {
    vi.stubEnv("LIVE_DEMO_OFFLINE", "true");
    expect(isLiveDemoOffline()).toBe(true);
    vi.stubEnv("LIVE_DEMO_OFFLINE", "false");
    expect(isLiveDemoOffline()).toBe(false);
    vi.stubEnv("LIVE_DEMO_OFFLINE", "");
    expect(isLiveDemoOffline()).toBe(false);
  });
});

describe("routes that answer while offline", () => {
  it("are the probe, the session endpoints and the Keycloak hint", () => {
    for (const p of [
      "/api/health",
      "/api/auth/session",
      "/api/auth/csrf",
      "/api/keycloak-config",
    ]) {
      expect(apiAnswersOffline(p)).toBe(true);
    }
  });

  it("exclude every data route, and do not match by prefix alone", () => {
    for (const p of [
      "/api/patient",
      "/api/graph",
      "/api/mock-dsp/alpha/catalog/request",
      "/api/healthcheck-extra",
      "/api/authority",
    ]) {
      expect(apiAnswersOffline(p)).toBe(false);
    }
  });
});

describe("the static-site link", () => {
  it("keeps the page and its query", () => {
    expect(staticSiteUrl("/graph?persona=patient")).toBe(
      "https://ma3u.github.io/MinimumViableHealthDataspacev2/graph?persona=patient",
    );
  });

  it("sends sign-in and the notice itself to the start page", () => {
    for (const p of ["/", "/offline", "/auth/signin?callbackUrl=%2Fadmin"]) {
      expect(staticSiteUrl(p)).toBe(
        "https://ma3u.github.io/MinimumViableHealthDataspacev2/",
      );
    }
  });
});

describe("Berlin public holidays", () => {
  it("match the 2026 calendar, Frauentag included", () => {
    const h = berlinHolidays(2026);
    for (const d of [
      "2026-01-01",
      "2026-03-08",
      "2026-04-03", // Karfreitag
      "2026-04-06", // Ostermontag
      "2026-05-01",
      "2026-05-14", // Himmelfahrt
      "2026-05-25", // Pfingstmontag
      "2026-10-03",
      "2026-12-25",
      "2026-12-26",
    ]) {
      expect(h.has(d)).toBe(true);
    }
    expect(h.size).toBe(10);
  });
});

describe("the next opening", () => {
  const at = (iso: string) => nextOpening(new Date(iso)).toISOString();

  it("is the next morning on a weekday evening", () => {
    // Tuesday 6 October 2026, 21:00 Berlin.
    expect(at("2026-10-06T19:00:00Z")).toBe("2026-10-07T05:32:00.000Z");
  });

  it("is Monday on a Friday evening and through the weekend", () => {
    expect(at("2026-10-09T19:00:00Z")).toBe("2026-10-12T05:32:00.000Z");
    expect(at("2026-10-11T12:00:00Z")).toBe("2026-10-12T05:32:00.000Z");
  });

  it("is later the same morning before the start has finished", () => {
    expect(at("2026-10-07T03:00:00Z")).toBe("2026-10-07T05:32:00.000Z");
  });

  it("skips a Berlin holiday", () => {
    // Thursday 24 December 2026; the 25th is a holiday and the 26th a Saturday.
    expect(at("2026-12-24T19:00:00Z")).toBe("2026-12-28T05:32:00.000Z");
    // Maundy Thursday 2027 evening: Good Friday, the weekend, Easter Monday.
    expect(at("2027-03-25T19:00:00Z")).toBe("2027-03-30T05:32:00.000Z");
  });
});
