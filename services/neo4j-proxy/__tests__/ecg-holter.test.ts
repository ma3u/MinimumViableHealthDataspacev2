/**
 * A synthetic 24 hour Holter ECG, window by window (ADR-095): the same
 * request is the same bytes, the windows add up to the whole recording, the
 * last one has no `next`, each strip holds stripSeconds x 250 samples per
 * lead, and the parameters are bounded.
 */
import { describe, expect, it, vi } from "vitest";
import supertest from "supertest";

vi.mock("neo4j-driver", () => ({
  default: {
    driver: vi.fn(() => ({
      session: vi.fn(() => ({
        run: vi.fn().mockResolvedValue({ records: [] }),
        close: vi.fn(),
      })),
      getServerInfo: vi.fn().mockResolvedValue({ address: "mock:7687" }),
      close: vi.fn(),
    })),
    auth: { basic: vi.fn() },
    int: vi.fn((n: number) => n),
    isInt: vi.fn(() => false),
  },
}));

const { app } = await import("../src/index.js");
const { setDriver } = await import("../src/db.js");
const { heartRate, stripSamples, FACTOR_MV } = await import(
  "../src/ecg-holter.js"
);
const neo4j = (await import("neo4j-driver")).default;
setDriver(neo4j.driver("bolt://mock:7687", neo4j.auth.basic("u", "p")));
const request = supertest(app);

interface Entry {
  fullUrl: string;
  resource: {
    resourceType: string;
    id: string;
    effectivePeriod?: { start: string; end: string };
    component?: Array<{
      code: { coding: Array<{ code: string }> };
      valueSampledData: { data: string; period: number; factor: number };
    }>;
  };
}

const window = (query: string) => request.get(`/synthetic/ecg-holter${query}`);
const ids = (entries: Entry[]) => entries.map((e) => e.resource.id);
const nextOf = (body: { link: Array<{ relation: string; url: string }> }) =>
  body.link.find((l) => l.relation === "next")?.url;

describe("GET /synthetic/ecg-holter", () => {
  it("answers the same bytes for the same window", async () => {
    const a = await window("?offsetSeconds=3600&seconds=60");
    const b = await window("?offsetSeconds=3600&seconds=60");
    expect(a.status).toBe(200);
    expect(a.headers["content-type"]).toMatch(/fhir\+json/);
    expect(a.text).toBe(b.text);
  });

  it("starts with the Patient and two strips, counts the whole recording and links the next window", async () => {
    const res = await window("");
    expect(res.body.resourceType).toBe("Bundle");
    expect(res.body.type).toBe("searchset");
    expect(res.body.total).toBe(2880);
    expect(ids(res.body.entry)).toEqual([
      "holter-demo-1",
      "holter-strip-0",
      "holter-strip-1",
    ]);
    const strip = res.body.entry[1].resource;
    expect(strip).toMatchObject({
      status: "final",
      subject: { reference: "Patient/holter-demo-1" },
      device: { display: "Synthetic Holter recorder" },
      effectivePeriod: {
        start: "2026-11-01T08:00:00Z",
        end: "2026-11-01T08:00:30Z",
      },
      code: {
        coding: [
          {
            system: "urn:oid:2.16.840.1.113883.6.24",
            code: "131328",
            display: "MDC_ECG_ELEC_POTL",
          },
        ],
      },
    });
    expect(
      strip.component.map(
        (c: { code: { coding: Array<{ code: string }> } }) =>
          c.code.coding[0].code,
      ),
    ).toEqual(["131330", "131335"]);
    expect(strip.component[0].valueSampledData).toMatchObject({
      origin: {
        value: 0,
        unit: "mV",
        system: "http://unitsofmeasure.org",
        code: "mV",
      },
      period: 4,
      factor: 0.005,
      dimensions: 1,
    });
    expect(res.body.link).toEqual([
      {
        relation: "self",
        url: "/synthetic/ecg-holter?offsetSeconds=0&seconds=60&durationSeconds=86400&stripSeconds=30",
      },
      {
        relation: "next",
        url: "/synthetic/ecg-holter?offsetSeconds=60&seconds=60&durationSeconds=86400&stripSeconds=30",
      },
    ]);
  });

  it("serves the following windows without the Patient, in order, and the last one without next", async () => {
    let url: string | undefined =
      "/synthetic/ecg-holter?offsetSeconds=0&seconds=60&durationSeconds=150&stripSeconds=30";
    const seen: string[] = [];
    let pages = 0;
    while (url) {
      const res = await request.get(url);
      expect(res.status).toBe(200);
      seen.push(...ids(res.body.entry));
      url = nextOf(res.body);
      pages++;
    }
    expect(pages).toBe(3);
    expect(seen).toEqual([
      "holter-demo-1",
      "holter-strip-0",
      "holter-strip-1",
      "holter-strip-2",
      "holter-strip-3",
      "holter-strip-4",
    ]);
    // The last strip is cut at the end of the recording: 150 s is 5 strips.
    const last = await window(
      "?offsetSeconds=120&seconds=60&durationSeconds=150&stripSeconds=30",
    );
    expect(last.body.total).toBe(5);
    expect(nextOf(last.body)).toBeUndefined();
    expect(last.body.entry[0].resource.effectivePeriod).toEqual({
      start: "2026-11-01T08:02:00Z",
      end: "2026-11-01T08:02:30Z",
    });
  });

  it("holds stripSeconds x 250 samples per lead in each strip", async () => {
    for (const [strip, expected] of [
      [30, 7500],
      [10, 2500],
      [60, 15000],
    ]) {
      const res = await window(`?seconds=60&stripSeconds=${strip}`);
      const observations = (res.body.entry as Entry[]).filter(
        (e) => e.resource.resourceType === "Observation",
      );
      expect(observations).toHaveLength(60 / strip);
      for (const o of observations) {
        for (const c of o.resource.component!) {
          const samples = c.valueSampledData.data.split(" ");
          expect(samples).toHaveLength(expected);
          expect(samples.every((v) => /^-?\d+$/.test(v))).toBe(true);
        }
      }
    }
  });

  it("refuses parameters out of bounds with 400 and an error", async () => {
    for (const query of [
      "?seconds=601",
      "?seconds=0",
      "?durationSeconds=86401",
      "?stripSeconds=9",
      "?stripSeconds=61",
      "?seconds=20&stripSeconds=30",
      "?offsetSeconds=-1",
      "?offsetSeconds=86400",
      "?offsetSeconds=1.5",
      "?seconds=sixty",
    ]) {
      const res = await window(query);
      expect(res.status, query).toBe(400);
      expect(typeof res.body.error, query).toBe("string");
    }
  });
});

describe("the synthetic signal", () => {
  /** R peaks: local maxima of lead II above 0.6 mV. */
  function beats(index: number, startS: number) {
    const { ii } = stripSamples(index, startS, 30);
    const threshold = 0.6 / FACTOR_MV;
    let n = 0;
    for (let i = 1; i < ii.length - 1; i++) {
      if (ii[i] > threshold && ii[i] >= ii[i - 1] && ii[i] > ii[i + 1]) n++;
    }
    return n;
  }

  it("beats slower at night than in the afternoon", () => {
    // 15:00 is 7 h into the recording, 03:00 is 19 h.
    expect(heartRate(7 * 3600)).toBeCloseTo(95, 5);
    expect(heartRate(19 * 3600)).toBeCloseTo(55, 5);
    const afternoon = beats(840, 7 * 3600);
    const night = beats(2280, 19 * 3600);
    expect(afternoon).toBeGreaterThanOrEqual(44);
    expect(afternoon).toBeLessThanOrEqual(51);
    expect(night).toBeGreaterThanOrEqual(25);
    expect(night).toBeLessThanOrEqual(30);
  });

  it("differs from strip to strip and repeats for the same strip", () => {
    expect(stripSamples(5, 150, 30)).toEqual(stripSamples(5, 150, 30));
    expect(stripSamples(5, 150, 30).ii).not.toEqual(
      stripSamples(6, 150, 30).ii,
    );
  });
});
