import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  formatTrendSummary,
  parseRecordAttributes,
  periodOf,
  summariseExportFile,
  summariseXml,
} from "../src/apple-health.js";

const dir = mkdtempSync(join(tmpdir(), "apple-health-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function record(
  type: string,
  value: string,
  startDate: string,
  unit = "count/min",
): string {
  return `<Record type="${type}" sourceName="Watch" unit="${unit}" startDate="${startDate}" endDate="${startDate}" value="${value}"/>`;
}

const RHR = "HKQuantityTypeIdentifierRestingHeartRate";
const VO2 = "HKQuantityTypeIdentifierVO2Max";
const WEIGHT = "HKQuantityTypeIdentifierBodyMass";

describe("periodOf", () => {
  it("reduces Apple's date format and ISO to a month", () => {
    expect(periodOf("2026-08-14 09:12:03 +0200")).toBe("2026-08");
    expect(periodOf("2026-08-14T09:12:03Z")).toBe("2026-08");
  });

  it("returns null rather than guessing at an unparseable date", () => {
    expect(periodOf("")).toBeNull();
    expect(periodOf("14.08.2026")).toBeNull();
  });
});

describe("parseRecordAttributes", () => {
  it("reads the attributes of a self-closing element", () => {
    expect(
      parseRecordAttributes(record(RHR, "62", "2026-08-14 09:00:00 +0200")),
    ).toMatchObject({
      type: RHR,
      value: "62",
      unit: "count/min",
    });
  });

  it("returns an empty object for a tag with no attributes", () => {
    expect(parseRecordAttributes("<Record/>")).toEqual({});
  });
});

describe("summariseXml", () => {
  const xml = [
    record(RHR, "60", "2026-07-02 08:00:00 +0200"),
    record(RHR, "64", "2026-07-20 08:00:00 +0200"),
    record(RHR, "58", "2026-08-03 08:00:00 +0200"),
    record(VO2, "41.2", "2026-07-05 08:00:00 +0200", "mL/min·kg"),
    record(VO2, "43.8", "2026-07-25 08:00:00 +0200", "mL/min·kg"),
    record(WEIGHT, "78.4", "2026-08-01 07:00:00 +0200", "kg"),
    record(WEIGHT, "77.9", "2026-08-20 07:00:00 +0200", "kg"),
  ].join("\n");

  const summary = summariseXml(xml, "2026-09-13T00:00:00.000Z");
  const trend = (hkType: string) =>
    summary.trends.find((t) => t.hkType === hkType);

  it("marks everything self-tracked: a consumer device is not a lab", () => {
    expect(summary.sourceKind).toBe("self-tracked");
  });

  it("averages a mean metric per month", () => {
    expect(trend(RHR)?.points).toEqual([
      { period: "2026-07", value: 62, samples: 2 },
      { period: "2026-08", value: 58, samples: 1 },
    ]);
  });

  it("takes the max for a max metric", () => {
    expect(trend(VO2)?.points).toEqual([
      { period: "2026-07", value: 43.8, samples: 2 },
    ]);
  });

  it("takes the latest reading for a latest metric, not the last one seen", () => {
    // Both weights are in August; the later date wins regardless of file order.
    const reordered = summariseXml(
      [
        record(WEIGHT, "77.9", "2026-08-20 07:00:00 +0200", "kg"),
        record(WEIGHT, "78.4", "2026-08-01 07:00:00 +0200", "kg"),
      ].join("\n"),
    );
    expect(reordered.trends[0].points[0].value).toBe(77.9);
  });

  it("counts records it scanned, including ones no metric wanted", () => {
    expect(summary.recordsScanned).toBe(7);
  });

  it("reports types it did not summarise instead of ignoring them silently", () => {
    const withOther = summariseXml(
      record(
        "HKQuantityTypeIdentifierDietaryCaffeine",
        "95",
        "2026-08-01 09:00:00 +0200",
        "mg",
      ),
    );
    expect(withOther.unusedTypes).toEqual([
      "HKQuantityTypeIdentifierDietaryCaffeine",
    ]);
    expect(withOther.trends).toEqual([]);
  });

  it("skips a sample in an unexpected unit and says how many", () => {
    const mixed = summariseXml(
      [
        record(WEIGHT, "78.4", "2026-08-01 07:00:00 +0200", "kg"),
        record(WEIGHT, "172.8", "2026-08-02 07:00:00 +0200", "lb"),
      ].join("\n"),
    );
    // Averaging 78.4 kg with 172.8 lb would produce a number that is not a weight.
    expect(mixed.trends[0].skippedOtherUnit).toBe(1);
    expect(mixed.trends[0].points[0].samples).toBe(1);
  });

  it("ignores a record with a non-numeric or missing value", () => {
    expect(
      summariseXml(record(RHR, "", "2026-08-01 07:00:00 +0200")).trends,
    ).toEqual([]);
    expect(
      summariseXml(record(RHR, "n/a", "2026-08-01 07:00:00 +0200")).trends,
    ).toEqual([]);
  });

  it("produces nothing rather than throwing on an export with no records", () => {
    const empty = summariseXml("<HealthData locale='de_DE'></HealthData>");
    expect(empty.trends).toEqual([]);
    expect(empty.recordsScanned).toBe(0);
  });
});

describe("summariseExportFile", () => {
  it("streams a file and agrees with the in-memory path", async () => {
    const xml = Array.from({ length: 500 }, (_, i) =>
      record(
        RHR,
        String(55 + (i % 10)),
        `2026-0${(i % 3) + 6}-1${i % 9} 08:00:00 +0200`,
      ),
    ).join("\n");
    const path = join(dir, "export.xml");
    writeFileSync(path, `<HealthData>\n${xml}\n</HealthData>`, "utf8");

    const streamed = await summariseExportFile(
      path,
      "2026-09-13T00:00:00.000Z",
    );
    const inMemory = summariseXml(
      `<HealthData>\n${xml}\n</HealthData>`,
      "2026-09-13T00:00:00.000Z",
    );

    expect(streamed.recordsScanned).toBe(500);
    expect(streamed).toEqual(inMemory);
  });

  it("counts a record split across a read boundary exactly once", async () => {
    // Pad past the 1 MiB chunk size so records land on both sides of a boundary.
    const pad = `<!-- ${"x".repeat(1 << 20)} -->`;
    const xml = `<HealthData>\n${record(
      RHR,
      "61",
      "2026-08-01 08:00:00 +0200",
    )}\n${pad}\n${record(
      RHR,
      "63",
      "2026-08-02 08:00:00 +0200",
    )}\n</HealthData>`;
    const path = join(dir, "split.xml");
    writeFileSync(path, xml, "utf8");

    const summary = await summariseExportFile(path);
    expect(summary.recordsScanned).toBe(2);
    expect(summary.trends[0].points[0]).toEqual({
      period: "2026-08",
      value: 62,
      samples: 2,
    });
  });
});

describe("formatTrendSummary", () => {
  const summary = summariseXml(
    Array.from({ length: 18 }, (_, i) =>
      record(
        RHR,
        "60",
        `2025-${String((i % 12) + 1).padStart(2, "0")}-05 08:00:00 +0200`,
      ),
    ).join("\n"),
  );

  it("says up front that the data is not diagnostic", () => {
    expect(formatTrendSummary(summary)).toContain("not diagnostic");
    expect(formatTrendSummary(summary)).toContain("Self-tracked");
  });

  it("caps the periods shown and says how many were left out", () => {
    const out = formatTrendSummary(summary, 6);
    expect(out).toMatch(/earlier month\(s\) not shown/);
  });

  it("stays small enough to sit inside the artefact", () => {
    // The whole point: hundreds of MB in, kilobytes out.
    expect(Buffer.byteLength(formatTrendSummary(summary), "utf8")).toBeLessThan(
      4096,
    );
  });

  it("says so plainly when there is nothing to summarise", () => {
    expect(formatTrendSummary(summariseXml(""))).toContain(
      "No summarisable metrics",
    );
  });
});
