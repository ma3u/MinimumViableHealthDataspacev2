import type {
  HealthMetric,
  PersonalHealthSource,
  TrendSeries,
} from "@/lib/journey-config";

/**
 * The person's own measured values, for the cards on /patient (2026-10-28).
 * Until now those cards showed the illustrative values of journey-config for
 * every record, so a person whose Klarbefund app had sent 324 weekly Apple
 * Health means and 212 lab values saw a recovery score and a ferritin that
 * were nobody's. For a record the app created, the cards now show what is in
 * it; a demo persona keeps the illustration.
 *
 * Client-safe: the query lives in load-own-health.ts.
 */

/** One series of the person's values for one code, oldest first. */
export interface OwnSeries {
  code: string;
  display: string;
  unit: string;
  points: { date: string; value: number }[];
}

/** What the record holds, by where it came from. */
export interface OwnHealth {
  /** Weekly means from Apple Health (ADR-057), one series per metric. */
  devices: OwnSeries[];
  /** Values read from lab reports or entered by the person (#473). */
  labs: OwnSeries[];
}

/** At most this many points per trend: the detail view's chart width. */
const TREND_POINTS = 12;

/** Short labels for the four device metrics (app-wearables.ts). */
const DEVICE_LABELS: Record<string, string> = {
  "40443-4": "Resting HR",
  "80404-7": "HRV",
  "41950-7": "Steps/day",
  "29463-7": "Weight",
};

/** UCUM to what a person reads. */
function unitText(unit: string): string {
  if (unit === "/min") return "bpm";
  if (unit === "/d") return "per day";
  return unit;
}

function formatValue(value: number, unit: string): string {
  const shown =
    Math.abs(value) >= 1000
      ? Math.round(value).toLocaleString("en-GB")
      : Number.isInteger(value)
        ? String(value)
        : value.toFixed(Math.abs(value) < 10 ? 2 : 1).replace(/\.?0+$/, "");
  const u = unitText(unit);
  return u && u !== "1" ? `${shown} ${u}` : shown;
}

const last = <T>(xs: T[]): T => xs[xs.length - 1];

function metric(series: OwnSeries, label: string): HealthMetric {
  return { label, value: formatValue(last(series.points).value, series.unit) };
}

/**
 * The series as a trend for the detail view. `neutral`: the view shows how a
 * value moved, never whether that is good, which is not the portal's to say.
 */
function trend(series: OwnSeries, label: string, color: string): TrendSeries {
  const points = series.points.slice(-TREND_POINTS);
  return {
    label,
    unit: unitText(series.unit),
    color,
    current: formatValue(last(points).value, ""),
    goodDirection: "neutral",
    points: points.map((p) => p.value),
    from: points[0].date,
    to: last(points).date,
  };
}

/** Newest value first, so the cards show what was measured last. */
const byNewest = (a: OwnSeries, b: OwnSeries) =>
  last(b.points).date.localeCompare(last(a.points).date);

const TREND_COLOURS = [
  "#2471A3",
  "#148F77",
  "#CA6F1E",
  "#7D3C98",
  "#1E8449",
  "#B03A2E",
];

/**
 * The cards for a record the app created: one for the device trends and one
 * for the lab values, each only when there is something in it. No nutrition
 * card: nothing sends nutrition, and an invented plan is what this replaces.
 */
export function ownHealthSources(own: OwnHealth): PersonalHealthSource[] {
  const cards: PersonalHealthSource[] = [];
  const devices = own.devices.filter((s) => s.points.length > 0);
  if (devices.length > 0) {
    const ordered = Object.keys(DEVICE_LABELS)
      .map((code) => devices.find((s) => s.code === code))
      .filter((s): s is OwnSeries => Boolean(s));
    cards.push({
      id: "fitness",
      title: "Activity & vitals",
      source: "Apple Health, weekly means",
      brand: "#CA6F1E",
      screenshot: null,
      metrics: ordered.map((s) => metric(s, DEVICE_LABELS[s.code])),
      detail:
        "Weekly means from Apple Health that your Klarbefund app sent into your record. A week is the finest grain that leaves the phone.",
      trends: ordered.map((s, i) =>
        trend(s, DEVICE_LABELS[s.code], TREND_COLOURS[i]),
      ),
    });
  }
  const labs = own.labs.filter((s) => s.points.length > 0).sort(byNewest);
  if (labs.length > 0) {
    cards.push({
      id: "labs",
      title: "Lab results",
      source: "From your reports, via Klarbefund",
      brand: "#7D3C98",
      screenshot: null,
      metrics: labs.slice(0, 4).map((s) => metric(s, s.display)),
      detail:
        "Values your Klarbefund app read from your lab reports, or that you entered, newest first. Read from a scan, so preliminary.",
      trends: labs
        .filter((s) => s.points.length > 1)
        .slice(0, 6)
        .map((s, i) => trend(s, s.display, TREND_COLOURS[i])),
    });
  }
  return cards;
}
