/**
 * The cards on /patient for a record Klarbefund created (2026-10-28): the
 * person's own Apple Health means and lab values, not journey-config's
 * illustration.
 */
import { describe, it, expect } from "vitest";
import { ownHealthSources, type OwnHealth } from "@/lib/patient/own-health";

const weeks = (code: string, unit: string, values: number[]) => ({
  code,
  display: code,
  unit,
  points: values.map((value, i) => ({
    date: `2026-${String(7 + Math.floor(i / 4)).padStart(2, "0")}-${String(
      1 + (i % 4) * 7,
    ).padStart(2, "0")}`,
    value,
  })),
});

const OWN: OwnHealth = {
  devices: [
    weeks("41950-7", "/d", [8000, 9500.4, 10234.6]),
    weeks("40443-4", "/min", [58, 57, 55]),
    weeks("80404-7", "ms", [41, 44, 47.5]),
  ],
  labs: [
    {
      code: "2276-4",
      display: "Ferritin",
      unit: "ng/mL",
      points: [{ date: "2026-08-01", value: 80 }],
    },
    {
      code: "2093-3",
      display: "Cholesterol",
      unit: "mg/dL",
      points: [
        { date: "2026-06-01", value: 210 },
        { date: "2026-10-20", value: 190 },
      ],
    },
  ],
};

describe("ownHealthSources", () => {
  it("shows the device means under their real source, in a fixed order", () => {
    const [devices] = ownHealthSources(OWN);
    expect(devices.source).toBe("Apple Health, weekly means");
    expect(devices.metrics).toEqual([
      { label: "Resting HR", value: "55 bpm" },
      { label: "HRV", value: "47.5 ms" },
      { label: "Steps/day", value: "10,235 per day" },
    ]);
  });

  it("gives every trend its own period and no verdict", () => {
    const [devices] = ownHealthSources(OWN);
    for (const t of devices.trends) {
      expect(t.goodDirection).toBe("neutral");
      expect(t.from).toBeTruthy();
      expect(t.to).toBeTruthy();
    }
    expect(devices.trends[0].points).toEqual([58, 57, 55]);
  });

  it("puts the most recently measured lab value first, and trends only what has two values", () => {
    const [, labs] = ownHealthSources(OWN);
    expect(labs.metrics.map((m) => m.label)).toEqual([
      "Cholesterol",
      "Ferritin",
    ]);
    expect(labs.trends.map((t) => t.label)).toEqual(["Cholesterol"]);
  });

  it("invents nothing: no nutrition card, and no card without values", () => {
    expect(ownHealthSources(OWN).map((c) => c.id)).toEqual(["fitness", "labs"]);
    expect(ownHealthSources({ devices: [], labs: [] })).toEqual([]);
  });

  it("keeps at most twelve points per trend", () => {
    const long = weeks(
      "40443-4",
      "/min",
      Array.from({ length: 20 }, (_, i) => 60 - i / 2),
    );
    const [devices] = ownHealthSources({ devices: [long], labs: [] });
    expect(devices.trends[0].points).toHaveLength(12);
  });
});
