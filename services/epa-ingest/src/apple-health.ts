/**
 * Apple Health export → trend summary.
 *
 * The Health app exports as `export.zip` containing `export.xml`. That file is
 * routinely **hundreds of megabytes** — a decade of heart-rate samples at one
 * `<Record>` per reading — against an ePA ceiling of **25 MB per file**, and no
 * GP is going to read 400,000 XML rows.
 *
 * So this never loads the document and never emits the samples. It streams the
 * file, keeps only running aggregates per metric per period, and produces a
 * summary measured in kilobytes: the shape a doctor can actually look at.
 *
 * Everything it produces is `self-tracked` — a consumer device is not a lab, and
 * the artefact must say so (see `types.ts`).
 */
import { createReadStream } from "node:fs";
import type { SourceKind } from "./types.js";

/** A metric worth putting in front of a doctor, and how to say it. */
interface MetricSpec {
  /** HealthKit type identifier as it appears in the export. */
  hkType: string;
  label: string;
  /** Preferred unit; samples in any other unit are counted and skipped. */
  unit: string;
  /** How a period is summarised — a mean resting HR, a max VO2max. */
  aggregate: "mean" | "max" | "latest";
  decimals: number;
}

/**
 * Cardiovascular-first, matching the panel `analytes.ts` covers.
 *
 * Blood pressure is included only because a validated cuff writes it to Health;
 * the watch does not measure it, and the summary must not imply otherwise.
 */
export const METRICS: readonly MetricSpec[] = [
  {
    hkType: "HKQuantityTypeIdentifierRestingHeartRate",
    label: "Resting heart rate",
    unit: "count/min",
    aggregate: "mean",
    decimals: 0,
  },
  {
    hkType: "HKQuantityTypeIdentifierHeartRateVariabilitySDNN",
    label: "HRV (SDNN)",
    unit: "ms",
    aggregate: "mean",
    decimals: 0,
  },
  {
    hkType: "HKQuantityTypeIdentifierVO2Max",
    label: "VO2 max",
    unit: "mL/min·kg",
    aggregate: "max",
    decimals: 1,
  },
  {
    hkType: "HKQuantityTypeIdentifierBloodPressureSystolic",
    label: "Blood pressure (systolic)",
    unit: "mmHg",
    aggregate: "mean",
    decimals: 0,
  },
  {
    hkType: "HKQuantityTypeIdentifierBloodPressureDiastolic",
    label: "Blood pressure (diastolic)",
    unit: "mmHg",
    aggregate: "mean",
    decimals: 0,
  },
  {
    hkType: "HKQuantityTypeIdentifierBodyMass",
    label: "Weight",
    unit: "kg",
    aggregate: "latest",
    decimals: 1,
  },
  {
    hkType: "HKQuantityTypeIdentifierStepCount",
    label: "Steps per day",
    unit: "count",
    aggregate: "mean",
    decimals: 0,
  },
  {
    hkType: "HKQuantityTypeIdentifierAppleWalkingSteadiness",
    label: "Walking steadiness",
    unit: "%",
    aggregate: "mean",
    decimals: 0,
  },
] as const;

const BY_TYPE = new Map(METRICS.map((m) => [m.hkType, m]));

/** Running aggregate for one metric in one period. Never holds samples. */
interface Bucket {
  count: number;
  sum: number;
  max: number;
  latestValue: number;
  latestDate: string;
}

export interface PeriodPoint {
  /** `YYYY-MM`. */
  period: string;
  value: number;
  samples: number;
}

export interface MetricTrend {
  hkType: string;
  label: string;
  unit: string;
  aggregate: MetricSpec["aggregate"];
  points: PeriodPoint[];
  totalSamples: number;
  from: string;
  to: string;
  /** Samples skipped because they carried a unit we do not summarise. */
  skippedOtherUnit: number;
}

export interface TrendSummary {
  sourceKind: SourceKind;
  generatedAt: string;
  /** Records seen, including ones no metric wanted. */
  recordsScanned: number;
  trends: MetricTrend[];
  /** HealthKit types present in the export that no metric covers. */
  unusedTypes: string[];
}

function round(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

/** `2026-08-14 09:12:03 +0200` and ISO both reduce to `2026-08`. */
export function periodOf(startDate: string): string | null {
  const m = /^(\d{4})-(\d{2})/.exec(startDate.trim());
  return m ? `${m[1]}-${m[2]}` : null;
}

/**
 * Reads the attributes of one self-closing `<Record .../>` element.
 *
 * A full XML parser would be the obvious choice and is the wrong one here: it
 * would build a tree of several hundred megabytes to answer a question about
 * running sums. Apple's export writes `Record` as a flat self-closing element
 * with quoted attributes, which this reads without a dependency.
 */
export function parseRecordAttributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const m of tag.matchAll(/(\w+)="([^"]*)"/g)) attrs[m[1]] = m[2];
  return attrs;
}

class Accumulator {
  private readonly buckets = new Map<string, Map<string, Bucket>>();
  private readonly skipped = new Map<string, number>();
  private readonly unused = new Set<string>();
  recordsScanned = 0;

  add(attrs: Record<string, string>): void {
    const type = attrs.type;
    if (!type) return;
    this.recordsScanned++;

    const spec = BY_TYPE.get(type);
    if (!spec) {
      if (type.startsWith("HKQuantityTypeIdentifier")) this.unused.add(type);
      return;
    }

    if (attrs.unit && attrs.unit !== spec.unit) {
      this.skipped.set(type, (this.skipped.get(type) ?? 0) + 1);
      return;
    }

    // `Number("")` is 0, not NaN — an empty attribute would otherwise be
    // recorded as a resting heart rate of zero.
    const raw = attrs.value?.trim();
    if (!raw) return;
    const value = Number(raw);
    if (!Number.isFinite(value)) return;

    const period = periodOf(attrs.startDate ?? "");
    if (!period) return;

    let periods = this.buckets.get(type);
    if (!periods) {
      periods = new Map();
      this.buckets.set(type, periods);
    }
    const bucket = periods.get(period);
    if (!bucket) {
      periods.set(period, {
        count: 1,
        sum: value,
        max: value,
        latestValue: value,
        latestDate: attrs.startDate ?? "",
      });
      return;
    }
    bucket.count++;
    bucket.sum += value;
    if (value > bucket.max) bucket.max = value;
    if ((attrs.startDate ?? "") >= bucket.latestDate) {
      bucket.latestValue = value;
      bucket.latestDate = attrs.startDate ?? "";
    }
  }

  summarise(generatedAt: string): TrendSummary {
    const trends: MetricTrend[] = [];

    for (const spec of METRICS) {
      const periods = this.buckets.get(spec.hkType);
      if (!periods || periods.size === 0) continue;

      const points: PeriodPoint[] = [...periods.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([period, b]) => ({
          period,
          value: round(
            spec.aggregate === "mean"
              ? b.sum / b.count
              : spec.aggregate === "max"
                ? b.max
                : b.latestValue,
            spec.decimals,
          ),
          samples: b.count,
        }));

      trends.push({
        hkType: spec.hkType,
        label: spec.label,
        unit: spec.unit,
        aggregate: spec.aggregate,
        points,
        totalSamples: points.reduce((n, p) => n + p.samples, 0),
        from: points[0].period,
        to: points[points.length - 1].period,
        skippedOtherUnit: this.skipped.get(spec.hkType) ?? 0,
      });
    }

    return {
      // A consumer device is not a lab. Nothing here is ever lab-issued.
      sourceKind: "self-tracked",
      generatedAt,
      recordsScanned: this.recordsScanned,
      trends,
      unusedTypes: [...this.unused].sort(),
    };
  }
}

/** Aggregates an in-memory export — the testable core of the streaming path. */
export function summariseXml(
  xml: string,
  generatedAt = new Date().toISOString(),
): TrendSummary {
  const acc = new Accumulator();
  for (const m of xml.matchAll(/<Record\b[^>]*\/?>/g)) {
    acc.add(parseRecordAttributes(m[0]));
  }
  return acc.summarise(generatedAt);
}

/**
 * Streams `export.xml` and returns the summary.
 *
 * Chunks are joined at element boundaries: the tail after the last complete
 * `<Record …>` is carried into the next chunk, so a record split across a read
 * boundary is counted once rather than lost or double-counted.
 */
export async function summariseExportFile(
  path: string,
  generatedAt = new Date().toISOString(),
): Promise<TrendSummary> {
  const acc = new Accumulator();
  const stream = createReadStream(path, {
    encoding: "utf8",
    highWaterMark: 1 << 20,
  });
  let carry = "";

  for await (const chunk of stream) {
    const text = carry + (chunk as string);
    let lastEnd = 0;
    for (const m of text.matchAll(/<Record\b[^>]*\/?>/g)) {
      acc.add(parseRecordAttributes(m[0]));
      lastEnd = m.index + m[0].length;
    }
    // Keep only what could still be the start of a record.
    const openAt = text.lastIndexOf("<Record", Math.max(lastEnd, 0));
    carry = openAt >= lastEnd ? text.slice(openAt) : "";
    // Never let the carry grow without bound on a file with no records.
    if (carry.length > 1 << 16) carry = carry.slice(-(1 << 16));
  }

  return acc.summarise(generatedAt);
}

/** Compact, human-readable summary — the thing that goes in front of a doctor. */
export function formatTrendSummary(
  summary: TrendSummary,
  maxPeriods = 12,
): string {
  const lines: string[] = [
    "Self-tracked trends (consumer device — not diagnostic)",
    `Scanned ${summary.recordsScanned.toLocaleString("en-GB")} records`,
    "",
  ];

  if (summary.trends.length === 0) {
    lines.push("No summarisable metrics found in this export.", "");
    return lines.join("\n");
  }

  for (const t of summary.trends) {
    const shown = t.points.slice(-maxPeriods);
    const how =
      t.aggregate === "mean"
        ? "monthly mean"
        : t.aggregate === "max"
          ? "monthly max"
          : "last reading";
    lines.push(`${t.label} (${t.unit}) — ${how}, ${t.from} to ${t.to}`);
    lines.push(`  ${shown.map((p) => `${p.period} ${p.value}`).join("   ")}`);
    if (t.points.length > shown.length) {
      lines.push(
        `  (${t.points.length - shown.length} earlier month(s) not shown)`,
      );
    }
    if (t.skippedOtherUnit > 0) {
      lines.push(
        `  ${t.skippedOtherUnit} sample(s) skipped — unit other than ${t.unit}`,
      );
    }
    lines.push("");
  }

  if (summary.unusedTypes.length > 0) {
    lines.push(
      `${summary.unusedTypes.length} other HealthKit type(s) present and not summarised.`,
      "",
    );
  }
  return lines.join("\n");
}
