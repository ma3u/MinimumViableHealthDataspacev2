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
    // #710 is done (2026-10-28); #934 carries the Simpl use case to March 2027.
    expect(p1.map((i) => i.issue).sort()).toEqual([708, 709, 711, 934]);
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

  it("links every tagged part of a title, a note or a lane driver, and uses every link", () => {
    const texts = [
      ...LANES.map((l) => ({ id: l.id, texts: [l.driver], links: l.links })),
      ...ITEMS.map((i) => ({
        id: `#${i.issue}`,
        texts: [i.title, i.note],
        links: i.links,
      })),
    ];
    for (const { id, texts: parts, links } of texts) {
      const tags = parts.flatMap((t) =>
        [...t.matchAll(/<(\w+)>[\s\S]*?<\/\1>/g)].map((m) => m[1]),
      );
      for (const tag of tags)
        expect(links, `${id} <${tag}>`).toHaveProperty(tag);
      for (const [tag, href] of Object.entries(links ?? {})) {
        expect(tags, `${id} ${tag} is never used`).toContain(tag);
        expect(href, `${id} ${tag}`).toMatch(/^(https:\/\/|\/docs\/)/);
      }
    }
  });

  it("cites the EHDS by article on EUR-Lex, never by a front page", () => {
    const item = (n: number) => ITEMS.find((i) => i.issue === n)!;
    // Art. 53 sets the purposes; Art. 54 is prohibited secondary use.
    expect(item(717).title).toContain("<a53>Art. 53</a53> purposes");
    expect(item(717).links?.a53).toBe(
      "https://eur-lex.europa.eu/eli/reg/2025/327/oj/eng#art_53",
    );
    expect(item(716).links?.a73).toMatch(/#art_73$/);
    expect(LANES.find((l) => l.id === "processing")?.links?.a68).toMatch(
      /#art_68$/,
    );
  });

  it("dates the milestones as their sources do", () => {
    const m = (id: string) => MILESTONES.find((x) => x.id === id)!;
    // 2026/2099 Art. 4(2): assurance level high "From 26 March 2030".
    expect(m("assurance-high").date).toBe("2030-03-26");
    expect(m("assurance-high").href).toBe(
      "https://eur-lex.europa.eu/eli/reg_impl/2026/2099/oj/eng#004.002",
    );
    // eudi-wallet.gov.de says "ab Anfang 2027", no day: the marker sits at
    // the start of the year and says so.
    expect(m("d-you").date).toBe("2027-01-01");
    expect(m("d-you").label).toBe("d-you early 2027");
    // No source gives a Council position on COM(2025) 838.
    expect(m("business-wallet").detail).not.toMatch(/Council's position/);
    expect(m("business-wallet").href).toContain("2025/0358(COD)");
    expect(m("ehds-2027").detail).not.toMatch(/with the EUDI Wallet/);
    // The Hamburg page: "planned to be made available in GitLab in the second
    // half of October 2026". The Innsbruck page has its own roadmap items.
    expect(m("hamburg").date).toBe("2026-10-16");
    expect(m("innsbruck").href).toContain("roadmap-items-innsbruck-5.0");
  });

  it("writes the tooltips without the link tags", () => {
    for (const t of roadmapTargets()) expect(t.label).not.toMatch(/<\/?\w+>/);
    expect(roadmapTargets().find((t) => t.taskId === "i717")!.label).toContain(
      "Applications: Art. 53 purposes, Art. 81 complaints",
    );
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
    expect(chart).toMatch(/710 Simpl issuer trust :done, i710,/);
    expect(chart).toMatch(/711 DSP kit vs Simpl :i711,/);
    // Nothing is blocked since Simpl's code went public (#711); a blocked
    // item would be drawn crit.
    const tag = {
      done: "done, ",
      "in-progress": "active, ",
      blocked: "crit, ",
      planned: "",
    };
    for (const i of ITEMS) {
      expect(chart, `#${i.issue}`).toContain(`:${tag[i.status]}i${i.issue},`);
    }
    expect(chart).toMatch(/700 HealthDCAT-AP R8 :done, i700,/);
  });

  it("draws at a fixed width, since Mermaid measures 0 for its render element", () => {
    expect(chart).toMatch(/useWidth: \d{4}/);
    expect(chart).toContain("todayMarker");
  });
});
