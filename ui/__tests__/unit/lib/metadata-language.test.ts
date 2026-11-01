/**
 * Dataset descriptions in more than one language (#782): what the catalogue
 * shows in the chosen language and where it falls back to English.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  browserLanguage,
  initialLanguage,
  languagesOf,
  localise,
  searchableText,
  storedLanguage,
  storeLanguage,
  translationsOf,
} from "@/lib/metadata-language";

const registry = {
  title: "Belgian Long COVID Registry",
  description: "Post-COVID symptom tracking.",
  translations: {
    de: {
      title: "Belgisches Long-COVID-Register",
      description: "Erfassung von Post-COVID-Symptomen.",
    },
    fr: { title: "Registre belge du COVID long" },
  },
};

describe("translationsOf", () => {
  it("reads the suffixed properties of a node into a map by language", () => {
    expect(
      translationsOf({
        title: "X",
        titleDe: "X auf Deutsch",
        descriptionDe: "",
        hdcatapKeywordsDe: ["Kardiologie"],
        titleNl: null,
      }),
    ).toEqual({ de: { title: "X auf Deutsch", keywords: ["Kardiologie"] } });
  });

  it("gives nothing for a node with English only", () => {
    expect(translationsOf({ title: "X" })).toEqual({});
    expect(translationsOf(null)).toEqual({});
  });
});

describe("localise", () => {
  it("shows the chosen language", () => {
    expect(localise(registry, "de")).toEqual({
      title: "Belgisches Long-COVID-Register",
      description: "Erfassung von Post-COVID-Symptomen.",
      titleLang: "de",
      descriptionLang: "de",
    });
  });

  it("falls back to English for each text on its own", () => {
    const fr = localise(registry, "fr");
    expect(fr.title).toBe("Registre belge du COVID long");
    expect(fr.titleLang).toBe("fr");
    expect(fr.description).toBe("Post-COVID symptom tracking.");
    expect(fr.descriptionLang).toBe("en");
  });

  it("falls back to English for a language the dataset is not in", () => {
    expect(localise(registry, "es")).toMatchObject({
      title: "Belgian Long COVID Registry",
      titleLang: "en",
    });
  });
});

describe("languagesOf", () => {
  it("lists English first, then the languages some dataset is in", () => {
    expect(languagesOf([registry, { title: "Y" }])).toEqual(["en", "de", "fr"]);
    expect(languagesOf([{ title: "Y" }])).toEqual(["en"]);
  });
});

describe("searchableText", () => {
  it("finds a dataset by its text in any language", () => {
    const text = searchableText(registry);
    expect(text).toContain("long-covid-register");
    expect(text).toContain("registre belge");
    expect(text).toContain("symptom tracking");
  });
});

describe("the stored choice", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("is none until the visitor chooses", () => {
    expect(storedLanguage()).toBeNull();
  });

  it("is what the visitor chose last", () => {
    storeLanguage("nl");
    expect(storedLanguage()).toBe("nl");
  });

  it("ignores a stored value that is no language of the catalogue", () => {
    localStorage.setItem("catalog-metadata-language", "xx");
    expect(storedLanguage()).toBeNull();
  });
});

describe("browserLanguage", () => {
  const offered = ["en", "de", "fr"] as const;

  it("takes the first browser language the catalogue offers, by its primary subtag", () => {
    expect(browserLanguage([...offered], ["de-AT", "en"])).toBe("de");
    expect(browserLanguage([...offered], ["it-IT", "fr-BE", "de"])).toBe("fr");
  });

  it("is English when the catalogue offers none of them", () => {
    expect(browserLanguage([...offered], ["it-IT", "pl"])).toBe("en");
    expect(browserLanguage([...offered], [])).toBe("en");
  });

  it("does not pick a language no dataset is described in", () => {
    expect(browserLanguage(["en", "de"], ["nl-BE", "fr-BE"])).toBe("en");
  });
});

describe("initialLanguage", () => {
  const offered: ("en" | "de" | "fr")[] = ["en", "de", "fr"];

  it("lets ?lang= in the address win, for a shared link", () => {
    expect(initialLanguage(offered, "en", "de", ["de-DE"])).toBe("en");
    expect(initialLanguage(offered, "FR", null, ["de-DE"])).toBe("fr");
  });

  it("then the visitor's stored choice, over the browser", () => {
    expect(initialLanguage(offered, null, "fr", ["de-DE"])).toBe("fr");
    expect(initialLanguage(offered, null, "en", ["de-DE"])).toBe("en");
  });

  it("then the browser's language", () => {
    expect(initialLanguage(offered, null, null, ["de-CH", "en"])).toBe("de");
  });

  it("passes over a language the catalogue does not offer", () => {
    expect(initialLanguage(offered, "es", "nl", ["de-DE"])).toBe("de");
  });
});
