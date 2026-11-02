/**
 * "Credentials" reads the same everywhere in a language (#782, ADR-070): the
 * menu's word, on the start page's feature cards as on the holder's and the
 * administration's pages. "Verifiable Credentials" is that word with the
 * language's "verifiable". A type name such as MembershipCredential is a
 * name, not the word, and is not checked.
 */
import { describe, expect, it } from "vitest";
import { MESSAGES, type Area } from "@/messages";

const WORD = {
  de: "nachweis",
  fr: "attestation",
  nl: "bewijsstuk",
  es: "credencial",
} as const;
const VERIFIABLE = {
  de: "verifizierbar",
  fr: "vérifiable",
  nl: "verifieerba",
  es: "verificable",
} as const;
const LANGS = Object.keys(WORD) as (keyof typeof WORD)[];
const AREAS = Object.keys(MESSAGES.en) as Area[];
/**
 * The prose of a text: code (<c>, <code>) and paths such as
 * /api/credentials/present are names, not the word, and stay English.
 */
const prose = (s: string) =>
  s
    .replace(/<(c|code)>[\s\S]*?<\/\1>/g, " ")
    .replace(/<\/?[a-z]+>/g, " ")
    .replace(/\S*\/\S*/g, " ");
const keys = (re: RegExp) =>
  AREAS.flatMap((area) =>
    Object.keys(MESSAGES.en[area])
      .filter((k) => re.test(prose(k)))
      .map((k) => ({ area, k })),
  );

describe("the word for credentials", () => {
  const credential = keys(/\bcredentials?\b/i);
  const verifiable = keys(/\bverifiable credentials?\b/i);

  it("finds the texts that mention credentials", () => {
    expect(credential.length).toBeGreaterThan(50);
    expect(verifiable.length).toBeGreaterThan(10);
  });

  it("the menu uses the words the other areas are held to", () => {
    expect(MESSAGES.de.nav.Credentials).toBe("Nachweise");
    expect(MESSAGES.fr.nav.Credentials).toBe("Attestations");
    expect(MESSAGES.nl.nav.Credentials).toBe("Bewijsstukken");
    expect(MESSAGES.es.nav.Credentials).toBe("Credenciales");
  });

  for (const lang of LANGS) {
    it(`${lang} says ${WORD[lang]} wherever English says credential`, () => {
      const off = credential
        .map(({ area, k }) => ({ area, k, v: MESSAGES[lang][area][k] ?? "" }))
        .filter(({ v }) => !v.toLowerCase().includes(WORD[lang]))
        .map(({ area, k, v }) => `${area}: ${k} -> ${v}`);
      expect(off).toEqual([]);
    });

    it(`${lang} says ${VERIFIABLE[lang]} wherever English says verifiable credential`, () => {
      const off = verifiable
        .map(({ area, k }) => ({ area, k, v: MESSAGES[lang][area][k] ?? "" }))
        .filter(({ v }) => !v.toLowerCase().includes(VERIFIABLE[lang]))
        .map(({ area, k, v }) => `${area}: ${k} -> ${v}`);
      expect(off).toEqual([]);
    });

    it(`${lang} keeps no English "credentials" in a translation`, () => {
      const off = AREAS.flatMap((area) =>
        Object.entries(MESSAGES[lang][area])
          .filter(([, v]) => /\b(?:verifiable )?credentials?\b/i.test(prose(v)))
          .map(([k, v]) => `${area}: ${k} -> ${v}`),
      );
      expect(off).toEqual([]);
    });
  }
});
