/**
 * The interface's dictionaries (#782, phase 2): every language knows every
 * English text, keeps its placeholders, uses the Regulation's terms, and a
 * text in the code that has no entry is found.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { MESSAGES, type Area } from "@/messages";
import { translate } from "@/lib/i18n/translate";
import terminology from "@/lib/i18n/ehds-terminology.json";

const LANGS = ["de", "fr", "nl", "es"] as const;
const AREAS = Object.keys(MESSAGES.en) as Area[];
const placeholders = (s: string) =>
  [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("the dictionaries", () => {
  it("map every English text to itself", () => {
    for (const area of AREAS) {
      for (const [k, v] of Object.entries(MESSAGES.en[area])) {
        expect(v, `${area}: ${k}`).toBe(k);
      }
    }
  });

  for (const lang of LANGS) {
    it(`${lang} has every text, none empty, with the same placeholders`, () => {
      const missing: string[] = [];
      for (const area of AREAS) {
        for (const k of Object.keys(MESSAGES.en[area])) {
          const v = MESSAGES[lang][area][k];
          if (!v) missing.push(`${area}: ${k}`);
          else
            expect(placeholders(v), `${lang} ${area}: ${k}`).toEqual(
              placeholders(k),
            );
        }
        for (const k of Object.keys(MESSAGES[lang][area])) {
          expect(
            MESSAGES.en[area],
            `${lang} ${area} has a stale text: ${k}`,
          ).toHaveProperty([k]);
        }
      }
      expect(missing).toEqual([]);
    });
  }

  it("use no em dash (house style)", () => {
    expect(JSON.stringify(MESSAGES)).not.toContain(String.fromCharCode(0x2014));
  });
});

describe("the Regulation's terms in the interface", () => {
  type Term = {
    id: string;
    avoid?: Partial<Record<string, string[]>>;
  } & Record<string, unknown>;
  const terms = terminology.terms as unknown as Term[];
  for (const lang of LANGS) {
    it(`${lang} avoids the variants the Regulation does not use`, () => {
      const text = AREAS.flatMap((a) => Object.values(MESSAGES[lang][a])).join(
        " | ",
      );
      const used = terms.flatMap((t) =>
        (t.avoid?.[lang] ?? []).filter((w) =>
          new RegExp(
            `(?<![\\p{L}])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
            "iu",
          ).test(text),
        ),
      );
      expect(used).toEqual([]);
    });
  }
});

describe("translate", () => {
  it("falls back to English for a text a language does not have", () => {
    expect(translate("de", "nav", "A text nobody translated")).toBe(
      "A text nobody translated",
    );
  });

  it("fills in placeholders", () => {
    expect(
      translate("de", "catalog", "{shown} of {total} datasets", {
        shown: 3,
        total: 9,
      }),
    ).toBe("3 von 9 Datensätzen");
  });
});

describe("the code and the dictionaries", () => {
  // Every literal handed to t("...") must be a key of some area, or it is
  // shown in English in every language without anyone noticing. The files
  // are the ones that import the hook or <T>, found rather than listed, so
  // pages translated in parallel do not all edit one list (#782).
  const files = (readdirSync("src", { recursive: true }) as string[])
    .map((f) => path.join("src", f))
    .filter(
      (f) =>
        /\.tsx?$/.test(f) &&
        readFileSync(f, "utf8").includes("@/lib/i18n/translate"),
    )
    .sort();

  it("finds the translated files", () => {
    expect(files.length).toBeGreaterThanOrEqual(20);
    expect(files).toContain(path.join("src", "components", "Navigation.tsx"));
  });
  const known = new Set(AREAS.flatMap((a) => Object.keys(MESSAGES.en[a])));

  it("has an entry for every literal the code translates", () => {
    const unknown: string[] = [];
    for (const f of files) {
      const src = readFileSync(path.resolve(f), "utf8");
      for (const m of src.matchAll(/\bt[cs]?\(\s*"((?:[^"\\]|\\.)*)"/g)) {
        if (!known.has(m[1])) unknown.push(`${f}: ${m[1]}`);
      }
      // <T area="...">{"..."}</T>, the server components' form.
      for (const m of src.matchAll(
        /<T\b[^>]*>\s*\{\s*"((?:[^"\\]|\\.)*)"\s*\}/g,
      )) {
        if (!known.has(m[1])) unknown.push(`${f}: ${m[1]}`);
      }
    }
    expect(unknown).toEqual([]);
  });

  it("knows every menu label", () => {
    const nav = readFileSync(
      path.resolve("src/components/Navigation.tsx"),
      "utf8",
    );
    const labels = [...nav.matchAll(/label: "([^"]+)"/g)].map((m) => m[1]);
    expect(labels.length).toBeGreaterThan(50);
    expect(labels.filter((l) => !(l in MESSAGES.en.nav))).toEqual([]);
  });

  it("knows every feature card and persona journey step of the start page", () => {
    for (const f of [
      "src/components/FeatureCardGrid.tsx",
      "src/components/PersonaJourneyCards.tsx",
    ]) {
      const src = readFileSync(path.resolve(f), "utf8");
      const texts = [
        ...src.matchAll(/\b(?:label|desc|action|role): "([^"]+)"/g),
      ].map((m) => m[1]);
      expect(texts.length, f).toBeGreaterThan(10);
      expect(
        texts.filter((x) => !(x in MESSAGES.en.home)),
        f,
      ).toEqual([]);
    }
  });

  it("knows every purpose of Art. 53(1)", async () => {
    const { PURPOSE_LABELS } = await import("@/lib/permits");
    expect(
      Object.values(PURPOSE_LABELS).filter((p) => !(p in MESSAGES.en.public)),
    ).toEqual([]);
  });

  it("knows every label the access body's pages take from a library", async () => {
    const permits = await import("@/lib/permits");
    const { RESULT_KIND_LABELS } = await import("@/lib/results");
    const { MEASURE_LABELS } = await import("@/lib/supervision");
    const { ITEM_TITLES } = await import("@/lib/activity-report");
    const texts = [
      ...Object.values(permits.APPLICANT_CATEGORY_LABELS),
      ...permits.APPLICATION_ITEMS.map((i) => i.label),
      ...permits.IDENTIFIABILITY.map((v) => v.toLowerCase()),
      ...Object.values(RESULT_KIND_LABELS),
      ...Object.values(MEASURE_LABELS),
      ...Object.values(ITEM_TITLES),
    ];
    // The activity report's figures: <Stat label="..."> translates its label.
    const report = readFileSync(
      path.resolve("src/app/activity-report/page.tsx"),
      "utf8",
    );
    texts.push(...[...report.matchAll(/\blabel="([^"]+)"/g)].map((m) => m[1]));
    expect(texts.length).toBeGreaterThan(40);
    expect(texts.filter((x) => !(x in MESSAGES.en.access))).toEqual([]);
  });

  it("knows every health interest a patient can choose", async () => {
    const { HEALTH_INTERESTS } = await import("@/lib/patient/interests");
    expect(
      HEALTH_INTERESTS.map((i) => i.label).filter(
        (l) => !(l in MESSAGES.en.patient),
      ),
    ).toEqual([]);
  });

  it("knows every persona description of the sign-in page", async () => {
    const { DEMO_PERSONAS } = await import("@/lib/auth");
    expect(
      DEMO_PERSONAS.map((p) => p.description).filter(
        (d) => !(d in MESSAGES.en.signin),
      ),
    ).toEqual([]);
  });

  it("lists every dictionary folder in the index", () => {
    expect(
      readdirSync(path.resolve("src/messages"))
        .filter((d) => !d.includes("."))
        .sort(),
    ).toEqual(["de", "en", "es", "fr", "nl"]);
  });
});
