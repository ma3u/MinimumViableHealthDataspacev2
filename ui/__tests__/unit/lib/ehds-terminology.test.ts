/**
 * Every translation on the hub uses the terms of Regulation (EU) 2025/327 in
 * that language (#782). src/lib/i18n/ehds-terminology.json holds them, taken
 * from the Official Journal in EN, DE, FR, NL and ES and checked against it by
 * scripts/i18n/check-ehds-terminology.py. A legal term is never paraphrased:
 * "Datenzugangsstelle" for "Zugangsstelle für Gesundheitsdaten" reads fine and
 * names nothing in the Regulation.
 *
 * The texts checked: the dataset translations and the national profiles, in
 * the seeds the graph is built from and in the mocks the static site shows.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import terminology from "@/lib/i18n/ehds-terminology.json";

type Lang = "en" | "de" | "fr" | "nl" | "es";
const LANGS: Lang[] = ["en", "de", "fr", "nl", "es"];

interface Term {
  id: string;
  article: string;
  en: string;
  de: string;
  fr: string;
  nl: string;
  es: string;
  avoid?: Partial<Record<Lang, string[]>>;
}
const TERMS = terminology.terms as Term[];

const read = (p: string) => readFileSync(path.resolve(p), "utf8");
const SOURCES: Record<string, string> = {
  "neo4j/seed-catalog-translations.cypher": read(
    "../neo4j/seed-catalog-translations.cypher",
  ),
  "neo4j/seed-jurisdictions.cypher": read("../neo4j/seed-jurisdictions.cypher"),
  "public/mock/catalog.json": read("public/mock/catalog.json"),
  "public/mock/jurisdictions.json": read("public/mock/jurisdictions.json"),
};

/** A word that starts where no letter is before it: "Dateninhaber" inside
 * "Gesundheitsdateninhaber" is the official term, not the avoided one. */
function usesWord(text: string, word: string): boolean {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![\\p{L}])${escaped}`, "iu").test(text);
}

describe("the EHDS terminology file", () => {
  it("names every term in all five languages", () => {
    expect(TERMS.length).toBeGreaterThanOrEqual(13);
    for (const t of TERMS) {
      for (const l of LANGS) expect(t[l], `${t.id} ${l}`).toBeTruthy();
      expect(t.article, t.id).toMatch(/^(Art\. \d+|Title)/);
    }
  });

  it("never lists the official term itself as one to avoid", () => {
    for (const t of TERMS) {
      for (const [l, words] of Object.entries(t.avoid ?? {})) {
        for (const w of words ?? []) {
          expect(w.toLowerCase(), `${t.id} ${l}`).not.toBe(
            t[l as Lang].toLowerCase(),
          );
        }
      }
    }
  });

  it("points at the Official Journal", () => {
    expect(terminology.source.eli).toBe(
      "http://data.europa.eu/eli/reg/2025/327/oj",
    );
  });
});

/**
 * The texts of each language on the hub, so a term is checked only where it
 * is wrong: "EHDS" is right in German and wrong in Spanish.
 */
function textsByLanguage(): Record<Lang, { where: string; text: string }[]> {
  const out: Record<Lang, { where: string; text: string }[]> = {
    en: [],
    de: [],
    fr: [],
    nl: [],
    es: [],
  };
  // The seed: rows like  de: ['title', 'description'],  and the keyword
  // maps, which end in  } AS de .
  const seed = SOURCES["neo4j/seed-catalog-translations.cypher"];
  for (const m of seed.matchAll(
    /\b(de|fr|nl|es): \[((?:'(?:[^'\\]|\\.)*'|null)(?:, (?:'(?:[^'\\]|\\.)*'|null))*)\]/g,
  )) {
    out[m[1] as Lang].push({ where: "seed row", text: m[2] });
  }
  for (const m of seed.matchAll(/\{([^{}]*)\}\s+AS (de|fr|nl|es)\b/g)) {
    const values = [...m[1].matchAll(/: '([^']*)'/g)].map((v) => v[1]);
    out[m[2] as Lang].push({
      where: "seed keywords",
      text: values.join(" | "),
    });
  }
  // The catalogue mock: translations by language.
  const catalog = JSON.parse(SOURCES["public/mock/catalog.json"]) as {
    id: string;
    translations?: Partial<
      Record<Lang, { title?: string; description?: string }>
    >;
  }[];
  for (const d of catalog) {
    for (const [l, t] of Object.entries(d.translations ?? {})) {
      out[l as Lang].push({
        where: `catalog.json ${d.id}`,
        text: `${t?.title ?? ""} ${t?.description ?? ""}`,
      });
    }
  }
  // The national profiles: the role and the laws, in the country's language.
  const profiles = JSON.parse(SOURCES["public/mock/jurisdictions.json"]) as {
    jurisdictions: {
      code: string;
      languages: string[];
      accessBodyRole: string;
      laws: { title: string }[];
    }[];
  };
  for (const j of profiles.jurisdictions) {
    const text = [j.accessBodyRole, ...j.laws.map((l) => l.title)].join(" | ");
    for (const l of j.languages) {
      if (l in out) out[l as Lang].push({ where: `profile ${j.code}`, text });
    }
  }
  return out;
}

describe("the translations on the hub", () => {
  const texts = textsByLanguage();

  it("are found in every language they come in", () => {
    for (const l of ["de", "fr", "nl", "es"] as Lang[]) {
      expect(texts[l].length, l).toBeGreaterThan(0);
    }
  });

  for (const l of ["de", "fr", "nl", "es"] as Lang[]) {
    it(`in ${l} use no term the Regulation does not`, () => {
      const used = texts[l].flatMap(({ where, text }) =>
        TERMS.flatMap((t) =>
          (t.avoid?.[l] ?? [])
            .filter((w) => usesWord(text, w))
            .map((w) => `${where}: ${w} (the Regulation says "${t[l]}")`),
        ),
      );
      expect(used).toEqual([]);
    });
  }

  it("translate the keyword 'EHDS secondary use' with the official term", () => {
    const seed = SOURCES["neo4j/seed-catalog-translations.cypher"];
    const secondary = TERMS.find((t) => t.id === "secondary-use")!;
    const keyword = (map: string) =>
      new RegExp(
        "`EHDS secondary use`: '([^']+)'[^}]*}\\s+AS " + map + "\\b",
      ).exec(seed)?.[1];
    const abbreviation = TERMS.find((t) => t.id === "ehds-abbreviation")!;
    for (const l of ["de", "fr", "nl", "es"] as Lang[]) {
      expect(keyword(l), l).toContain(secondary[l]);
      expect(keyword(l), l).toContain(abbreviation[l]);
    }
  });

  it("call a health data access body by its name in the national profiles", () => {
    const profiles = JSON.parse(SOURCES["public/mock/jurisdictions.json"]) as {
      jurisdictions: { code: string; accessBodyRole: string }[];
    };
    const body = TERMS.find((t) => t.id === "health-data-access-body")!;
    // Where the role is the Regulation's own (not a national law's name, as
    // the GDNG's in DE or the Spanish pre-draft's "organismo nacional de
    // acceso a datos de salud"), it is written as the Regulation writes it.
    const expected: Record<string, string> = {
      AT: body.de,
      BE: body.nl,
    };
    for (const j of profiles.jurisdictions) {
      if (expected[j.code]) {
        expect(j.accessBodyRole, j.code).toContain(expected[j.code]);
      }
    }
  });
});
