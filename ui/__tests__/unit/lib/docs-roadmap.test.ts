/**
 * The roadmap behind /docs/roadmap (ui/src/lib/docs/roadmap.ts): its data must
 * stay consistent with the plan (#725), and the Mermaid source generated from
 * it must parse, or the page shows a render error where the chart should be.
 */
import { describe, it, expect } from "vitest";
import mermaid from "mermaid";
import {
  ITEMS,
  LANES,
  MILESTONES,
  roadmapGantt,
  roadmapTargets,
} from "@/lib/docs/roadmap";

const P1_DUE = "2027-03-26";
const P2_DUE = "2029-03-26";

describe("the roadmap data", () => {
  it("has one item per issue, in a known lane", () => {
    const issues = ITEMS.map((i) => i.issue);
    expect(new Set(issues).size).toBe(issues.length);
    const lanes = LANES.map((l) => l.id);
    for (const i of ITEMS) expect(lanes, `#${i.issue}`).toContain(i.lane);
    for (const m of MILESTONES) expect(lanes, m.id).toContain(m.lane);
  });

  it("gives every item a valid window, P1 due by 26 March 2027 and P2 by 26 March 2029", () => {
    for (const i of ITEMS) {
      expect(Number.isNaN(Date.parse(i.start)), `#${i.issue} start`).toBe(
        false,
      );
      expect(i.start <= i.end, `#${i.issue} window`).toBe(true);
      if (i.priority === "P1")
        expect(i.end <= P1_DUE, `#${i.issue}`).toBe(true);
      if (i.priority === "P2")
        expect(i.end <= P2_DUE, `#${i.issue}`).toBe(true);
    }
  });

  it("carries the plan's P1 items and the Iceberg spike under #716", () => {
    const p1 = ITEMS.filter((i) => i.priority === "P1" && i.status !== "done");
    expect(p1.map((i) => i.issue).sort()).toEqual([708, 709, 710, 711]);
    const spike = ITEMS.find((i) => i.issue === 649);
    expect(spike?.lane).toBe("processing");
    expect(spike?.note).toContain("#716");
  });

  it("keeps labels free of the characters Mermaid's Gantt syntax uses", () => {
    for (const i of ITEMS) expect(i.short, `#${i.issue}`).not.toMatch(/[:;#]/);
    for (const m of MILESTONES) expect(m.label, m.id).not.toMatch(/[:;#]/);
  });

  it("links every bar to its issue and every milestone to an https source", () => {
    const targets = roadmapTargets();
    expect(targets).toHaveLength(ITEMS.length + MILESTONES.length);
    for (const i of ITEMS) {
      expect(targets).toContainEqual(
        expect.objectContaining({
          taskId: `i${i.issue}`,
          href: `https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/${i.issue}`,
        }),
      );
    }
    for (const t of targets) expect(t.href).toMatch(/^https:\/\//);
  });
});

describe("the generated Gantt chart", () => {
  const chart = roadmapGantt();

  it("parses", async () => {
    mermaid.initialize({ startOnLoad: false });
    await expect(mermaid.parse(chart)).resolves.toBeTruthy();
  });

  it("has a section per lane, a bar per item and a marker per milestone", () => {
    for (const l of LANES) expect(chart).toContain(`  section ${l.label}\n`);
    for (const i of ITEMS)
      expect(chart).toContain(`i${i.issue}, ${i.start}, ${i.end}`);
    expect(chart.match(/:milestone, /g)).toHaveLength(MILESTONES.length);
  });

  it("marks status the way the legend says: active, crit, done", () => {
    expect(chart).toMatch(/708 EUDI Wallet sign-in :active, i708,/);
    expect(chart).toMatch(/711 DSP kit vs Simpl :crit, i711,/);
    expect(chart).toMatch(/700 HealthDCAT-AP R8 :done, i700,/);
  });

  it("draws at a fixed width, since Mermaid measures 0 for its render element", () => {
    expect(chart).toMatch(/useWidth: \d{4}/);
    expect(chart).toContain("todayMarker");
  });
});
