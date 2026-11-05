/**
 * The health cards on /patient and their detail view (#782). Their texts are
 * data, in lib/journey-config.ts (the illustration a demo persona sees) and
 * lib/patient/own-health.ts (the cards of a record the Klarbefund app
 * created); the card and HealthDetailModal translate them where they show
 * them, so the i18n test's search for t("...") literals does not see them.
 * This one lists them and finds each in the patient area. The lab names of a
 * person's own record are their data and stay as read.
 */
import { describe, expect, it } from "vitest";
import { MESSAGES } from "@/messages";
import { personalHealth } from "@/lib/journey-config";
import { ownHealthSources, type OwnSeries } from "@/lib/patient/own-health";
import { EHR_SYNC_SOURCE } from "@/lib/patient/ehr-sync";

const patient = MESSAGES.en.patient as Record<string, string>;
const missing = (texts: string[]) => [
  ...new Set(texts.filter((x) => !(x in patient))),
];

const series = (code: string, unit: string): OwnSeries => ({
  code,
  display: code,
  unit,
  points: [
    { date: "2026-10-01", value: 1 },
    { date: "2026-10-08", value: 2 },
  ],
});

describe("the patient area knows every text of the health cards", () => {
  it("the illustration's titles, sources, metrics, trends, goals and plan", () => {
    const texts = personalHealth.flatMap((s) => [
      s.title,
      s.source,
      s.detail,
      ...s.metrics.map((m) => m.label),
      ...s.trends.flatMap((t) => [t.label, t.unit]),
      ...(s.weeklyGoals ?? []).flatMap((g) => [g.label, g.unit, g.note]),
      ...(s.weeklyPlan ?? []).flatMap((d) => [d.day, d.focus]),
    ]);
    expect(texts.length).toBeGreaterThan(40);
    expect(missing(texts)).toEqual([]);
  });

  it("the cards of a record the app created, all but the lab names", () => {
    const [devices, labs] = ownHealthSources({
      // The four device metrics and the UCUM units app-wearables.ts sends.
      devices: [
        series("40443-4", "/min"),
        series("80404-7", "ms"),
        series("41950-7", "/d"),
        series("29463-7", "kg"),
      ],
      labs: [series("2276-4", "ng/mL")],
    });
    const texts = [
      ...[devices, labs].flatMap((s) => [s.title, s.source, s.detail]),
      ...devices.metrics.map((m) => m.label),
      ...devices.trends.flatMap((t) => [t.label, t.unit]),
    ];
    expect(devices.metrics).toHaveLength(4);
    expect(missing(texts)).toEqual([]);
  });

  it("the source the EHR request records for a sync", () => {
    expect(missing([EHR_SYNC_SOURCE])).toEqual([]);
  });
});
