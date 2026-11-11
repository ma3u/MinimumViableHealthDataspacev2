/**
 * The docs pages outside the guides in the picked language (ADR-071): the
 * docs index, the section pages and their documents' chrome, the roadmap,
 * the glossary's chrome and the architecture page. Labels these pages take
 * from data (the roadmap, the service table, the section cards) are
 * translated where they are shown, so the i18n test's search for literals
 * does not see them; this test lists them and finds each in its area. It
 * also renders a few of them in German.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { MESSAGES, type Area } from "@/messages";
import { translate } from "@/lib/i18n/translate";
import {
  EPICS,
  ITEMS,
  LANES,
  MILESTONES,
  STATUS_LABEL,
  roadmapTargets,
} from "@/lib/docs/roadmap";
import facts from "@/app/docs/docs-facts.json";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// The timeline's own test draws it in German (RoadmapTimeline.test.tsx).
vi.mock("@/components/docs/RoadmapTimeline", () => ({
  default: () => <div data-testid="roadmap-timeline" />,
}));

// One document translated into German, as the generator writes the index.
vi.mock("@/content/published-docs-i18n.json", () => ({
  default: {
    languages: ["de", "fr", "nl", "es"],
    docs: {
      "security/sbom": {
        de: {
          status: "current",
          title: "Software-Stücklisten",
          summary: "Die Stücklisten des Hubs und der App.",
        },
      },
    },
  },
}));

import SecurityDocsPage from "@/app/docs/security/page";
import RoadmapDocsPage from "@/app/docs/roadmap/page";
import ArchitecturePage from "@/app/docs/architecture/page";

const LANGS = ["de", "fr", "nl", "es"] as const;
const src = (f: string) => readFileSync(path.resolve(f), "utf8");
const strings = (s: string, re: RegExp) =>
  [...s.matchAll(re)].map((m) => JSON.parse(`"${m[1]}"`) as string);
const unknownIn = (area: Area, texts: string[]) =>
  texts.filter((x) => !(x in MESSAGES.en[area]));

const FILES = [
  "src/app/docs/page.tsx",
  "src/app/docs/architecture/page.tsx",
  "src/app/docs/security/page.tsx",
  "src/app/docs/operations/page.tsx",
  "src/app/docs/klarbefund/page.tsx",
  "src/app/docs/ehds/page.tsx",
  "src/app/docs/ehds/glossary/page.tsx",
  "src/app/docs/roadmap/page.tsx",
  "src/components/docs/PublishedDoc.tsx",
  "src/components/docs/LastUpdatedLine.tsx",
];

afterEach(() => {
  localStorage.clear();
});

describe("the docs pages' texts are in their dictionaries", () => {
  it("knows every literal a <T> on these pages shows, also those with tags", () => {
    // The i18n test's own search stops at a tag like <strong />; this one
    // reads every literal that closes a <T>, whatever its attributes.
    const unknown: string[] = [];
    for (const f of FILES) {
      for (const m of src(f).matchAll(
        /<T\b(?:(?!<\/T>)[\s\S])*?area="(\w+)"(?:(?!<\/T>)[\s\S])*?\{\s*"((?:[^"\\]|\\.)*)"\s*\}\s*<\/T>/g,
      )) {
        const text = JSON.parse(`"${m[2]}"`) as string;
        if (!(text in MESSAGES.en[m[1] as Area])) unknown.push(`${f}: ${text}`);
      }
    }
    expect(unknown).toEqual([]);
  });

  it("knows the section cards of the docs index and the menu labels it reuses", () => {
    const index = src("src/app/docs/page.tsx");
    const labels = strings(index, /label: "((?:[^"\\]|\\.)*)"/g);
    const descs = strings(index, /desc:\s*"((?:[^"\\]|\\.)*)"/g);
    expect(labels).toHaveLength(8);
    expect(descs).toHaveLength(8);
    expect(unknownIn("nav", labels)).toEqual([]);
    expect(unknownIn("docsCommon", descs)).toEqual([]);
  });

  it("knows the link labels and descriptions the section pages take from lists", () => {
    const klarbefund = src("src/app/docs/klarbefund/page.tsx");
    const reports = [
      ...klarbefund.matchAll(/\["[a-z-]+", "((?:[^"\\]|\\.)*)"\]/g),
    ].map((m) => m[1]);
    const ehds = src("src/app/docs/ehds/page.tsx");
    const decisions = [
      ...ehds.matchAll(/"ADR-\d+-[^"]+",\s*"((?:[^"\\]|\\.)*)"/g),
    ].map((m) => m[1]);
    expect(reports).toHaveLength(5);
    expect(decisions).toHaveLength(4);
    expect(
      unknownIn("docsCommon", [
        ...reports,
        ...decisions,
        "the bills still match the lockfiles",
        "48 anonymous checks of the live hub (exits 3 off hours)",
        "the app's build-setting tests",
      ]),
    ).toEqual([]);
    // The back links of the documents are the sections' menu labels.
    for (const section of [
      "security",
      "operations",
      "klarbefund",
      "ehds",
      "developer",
    ]) {
      const page = src(`src/app/docs/${section}/[slug]/page.tsx`);
      const [, label] = page.match(/backLabel="([^"]+)"/)!;
      expect(MESSAGES.en.nav, section).toHaveProperty([label]);
    }
  });

  it("knows the architecture page's table of contents, services and ADR statuses", () => {
    const page = src("src/app/docs/architecture/page.tsx");
    const toc = strings(page, /label: "((?:[^"\\]|\\.)*)"/g);
    const purposes = strings(page, /purpose:\s*"((?:[^"\\]|\\.)*)"/g);
    const layers = strings(page, /layer: "((?:[^"\\]|\\.)*)"/g);
    expect(toc).toHaveLength(9);
    // 17 since #927 took the ten edc018 services and jad-seed off the page.
    expect(purposes.length).toBeGreaterThan(15);
    const statuses = [...new Set(facts.adrs.map((a) => a.status))].filter(
      Boolean,
    );
    expect(
      unknownIn("docsArchitecture", [
        ...toc,
        ...purposes,
        ...statuses,
        ...[...new Set(layers)].filter((l) => !["EDC", "CFM"].includes(l)),
        "Next.js UI (static export)",
      ]),
    ).toEqual([]);
  });

  it("knows the roadmap: drivers, lanes, items, milestones and statuses", () => {
    const page = src("src/app/docs/roadmap/page.tsx");
    const drivers = strings(
      page.slice(page.indexOf("const DRIVERS")),
      /\b(?:title|text|label):\s*"((?:[^"\\]|\\.)*)"/g,
    );
    expect(drivers.length).toBeGreaterThan(40);
    expect(
      unknownIn("docsCommon", [
        ...drivers,
        ...LANES.flatMap((l) => [l.label, l.driver]),
        ...ITEMS.flatMap((i) => [i.short, i.title, i.note]),
        ...MILESTONES.flatMap((m) => [m.label, m.detail]),
        ...EPICS.flatMap((e) => [e.short, e.title, e.note]),
        ...Object.values(STATUS_LABEL),
        "Epic",
        "{done} of {total} done",
        "{start} to {end}",
        "Drag to pan, Ctrl or ⌘ and the wheel to zoom. Click a bar or a diamond for its details; a double click opens its issue or source. The red line is today.",
        "Edit in the GitHub Project",
        "Open issue #{n}",
        "Open the source",
        "Milestone",
      ]),
    ).toEqual([]);
  });
});

describe("the roadmap's chart in every language", () => {
  for (const lang of LANGS) {
    it(`${lang}: has every lane, bar and marker label`, () => {
      for (const t of [
        ...LANES.map((l) => l.label),
        ...ITEMS.map((i) => i.short),
        ...MILESTONES.map((m) => m.label),
        ...EPICS.flatMap((e) => [e.short, e.title]),
      ]) {
        expect(MESSAGES[lang].docsCommon, `${lang}: ${t}`).toHaveProperty([t]);
      }
    });
  }

  it("writes the tooltips in the language, the English ones unchanged in form", () => {
    const de = (text: string, vars?: Record<string, string | number>) =>
      translate("de", "docsCommon", text, vars);
    const label = roadmapTargets(de).find((t) => t.taskId === "i711")!.label;
    expect(label).toContain("Geplant");
    expect(label).toContain("2026-11-09 bis 2027-03-26");
    expect(roadmapTargets().find((t) => t.taskId === "i711")!.label).toMatch(
      /^#711 DSP compatibility kit .* \(P1, planned, 2026-11-09 to 2027-03-26\)\. /,
    );
  });
});

describe("the pages in German", () => {
  it("shows a section's documents with their translated title and summary", async () => {
    localStorage.setItem("catalog-metadata-language", "de");
    render(<SecurityDocsPage />);
    const title = await screen.findByText("Software-Stücklisten");
    expect(title).toHaveAttribute("lang", "de");
    expect(title.closest("a")).toHaveAttribute("href", "/docs/security/sbom");
    expect(
      screen.getByText("Die Stücklisten des Hubs und der App."),
    ).toBeInTheDocument();
    // A document without a German translation keeps its English card.
    expect(
      screen.getByText(/^Security test report/).closest("a"),
    ).toHaveAttribute("href", "/docs/security/security-test-report");
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: /Sicherheit und Datenschutz/,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Zuletzt aktualisiert am/)).toBeInTheDocument();
  });

  it("draws the roadmap's table and the Project link in German", async () => {
    localStorage.setItem("catalog-metadata-language", "de");
    render(<RoadmapDocsPage />);
    const items = (
      await screen.findByRole("heading", {
        level: 2,
        name: "Epics und Einträge",
      })
    ).parentElement!;
    expect(within(items).getAllByText("Geplant").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("link", { name: "GitHub-Projekt" }),
    ).toHaveAttribute("href", "https://github.com/users/ma3u/projects/1");
    const epics = items;
    expect(
      within(epics).getByRole("heading", {
        level: 3,
        name: "Connector-Plattform: EDC 1.0 und die Data Planes",
      }),
    ).toBeInTheDocument();
    expect(within(epics).getAllByText(/von \d+ erledigt/)).toHaveLength(
      EPICS.length,
    );
  });

  it("shows the architecture page's headings and service table in German", async () => {
    localStorage.setItem("catalog-metadata-language", "de");
    render(<ArchitecturePage />);
    expect(
      await screen.findByRole("heading", {
        level: 2,
        name: "4. Abhängigkeiten der Dienste",
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Infrastruktur").length).toBeGreaterThan(0);
    expect(
      screen.getByText(
        `Gemeinsame Datenbank (${
          facts.postgresDbs.length
        } DBs: ${facts.postgresDbs.join(", ")})`,
      ),
    ).toBeInTheDocument();
  });
});
