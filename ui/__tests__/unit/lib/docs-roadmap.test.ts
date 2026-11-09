/**
 * The roadmap behind /docs/roadmap (ui/src/lib/docs/roadmap.ts): its data must
 * stay consistent with the plan (#725) and with the GitHub Project the plan
 * is edited in (scripts/sync-roadmap-project.mjs).
 */
import { describe, it, expect } from "vitest";
import {
  EPICS,
  ITEMS,
  LANES,
  MILESTONES,
  ROADMAP_PLANNED_ON,
  ROADMAP_PROJECT,
  epicOf,
  epicStatus,
  epicWindow,
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
    // #710 is done (2026-10-28); #934 carries the Simpl use case to March 2027;
    // #991 to #994 are the TEHDAS2 work before its final conference (#990).
    expect(p1.map((i) => i.issue).sort()).toEqual([
      708, 709, 711, 934, 991, 992, 993, 994,
    ]);
    const spike = ITEMS.find((i) => i.issue === 649);
    expect(spike?.lane).toBe("processing");
    expect(spike?.note).toContain("#716");
  });

  it("keeps the bar labels short", () => {
    for (const i of ITEMS)
      expect(i.short.length, `#${i.issue}`).toBeLessThan(40);
    for (const m of MILESTONES) expect(m.label.length, m.id).toBeLessThan(30);
  });

  it("names the GitHub Project the plan is edited in", () => {
    expect(ROADMAP_PROJECT).toBe("https://github.com/users/ma3u/projects/1");
  });

  it("gives every bar and marker an id of its own, usable as an anchor", () => {
    const ids = roadmapTargets().map((t) => t.taskId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^(i\d+|e\d+|m_\w+)$/);
  });

  it("links every bar to its issue and every milestone to an https source", () => {
    const targets = roadmapTargets();
    expect(targets).toHaveLength(
      ITEMS.length + EPICS.length + MILESTONES.length,
    );
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
      ...EPICS.map((e) => ({
        id: `epic #${e.issue}`,
        texts: [e.title, e.note],
        links: e.links,
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

  it("puts every issue in one epic at most, in a lane of its own", () => {
    const lanes = LANES.map((l) => l.id);
    const seen = new Map<number, number>();
    for (const e of EPICS) {
      expect(lanes, `epic #${e.issue}`).toContain(e.lane);
      expect(e.short.length, `epic #${e.issue}`).toBeLessThan(30);
      for (const n of [...e.open.P1, ...e.open.P2, ...e.open.P3, ...e.done]) {
        expect(seen.get(n), `#${n} in #${e.issue}`).toBeUndefined();
        seen.set(n, e.issue);
      }
    }
    // Each of the four lanes outside the six drivers is one epic's.
    for (const id of ["klarbefund", "operations", "quality", "demos"])
      expect(EPICS.filter((e) => e.lane === id)).toHaveLength(1);
    // A dated item's epic holds it at the item's priority, unless it is done.
    for (const i of ITEMS) {
      const e = epicOf(i.issue);
      if (e && i.status !== "done")
        expect(e.open[i.priority], `#${i.issue}`).toContain(i.issue);
    }
  });

  it("draws an epic from its first issue to the deadline its issues set", () => {
    const e = (n: number) => EPICS.find((x) => x.issue === n)!;
    // #960 has only dated issues: #723 starts first, #720 and #721 end last.
    expect(epicWindow(e(960))).toEqual({
      start: "2026-10-28",
      end: "2028-06-30",
    });
    // #964 has none: from the planning date to the P2 deadline.
    expect(epicWindow(e(964))).toEqual({
      start: ROADMAP_PLANNED_ON,
      end: "2029-03-26",
    });
    // #990 has undated P3 issues (from the planning date) and ends with
    // #996 at the P1 deadline; its demo ends on the conference day.
    expect(epicWindow(e(990))).toEqual({
      start: ROADMAP_PLANNED_ON,
      end: "2027-03-26",
    });
    expect(ITEMS.find((i) => i.issue === 994)?.end).toBe(
      MILESTONES.find((m) => m.id === "tehdas2-final")?.date,
    );
    for (const x of EPICS) {
      const w = epicWindow(x);
      expect(w.start <= w.end, `epic #${x.issue}`).toBe(true);
    }
    // #708 is under way and #951 is done; nothing in #967 has moved yet.
    expect(epicStatus(e(959))).toBe("in-progress");
    expect(epicStatus(e(966))).toBe("in-progress");
    expect(epicStatus(e(967))).toBe("planned");
  });
});
