/**
 * Dataset descriptions in more than one language (#782, phase 1).
 *
 * English is the source language of every description. A translation sits on
 * the HealthDataset node as a property with the language as suffix (titleDe,
 * descriptionDe, hdcatapKeywordsDe), written by
 * neo4j/seed-catalog-translations.cypher; the proxy's HealthDCAT-AP
 * serialiser tags each with its language. Only the description of a dataset
 * is translated here, never what a person entered (an application, a permit).
 */

/** The languages a description can carry besides English, as in the proxy. */
const METADATA_LANGUAGES = ["de", "fr", "nl", "es"] as const;
export type MetadataLanguage = (typeof METADATA_LANGUAGES)[number];
export type CatalogLanguage = "en" | MetadataLanguage;

/** What the language switch shows, in each language's own name. */
export const LANGUAGE_NAMES: Record<CatalogLanguage, string> = {
  en: "English",
  de: "Deutsch",
  fr: "Français",
  nl: "Nederlands",
  es: "Español",
};

export interface Translation {
  title?: string;
  description?: string;
  keywords?: string[];
}

const suffix = (lang: string) => lang[0].toUpperCase() + lang.slice(1);

/** The translations among a node's properties, as a map by language. */
export function translationsOf(
  props: Record<string, unknown> | null | undefined,
): Partial<Record<MetadataLanguage, Translation>> {
  const out: Partial<Record<MetadataLanguage, Translation>> = {};
  for (const lang of METADATA_LANGUAGES) {
    const s = suffix(lang);
    const title = props?.[`title${s}`];
    const description = props?.[`description${s}`];
    const keywords = props?.[`hdcatapKeywords${s}`];
    const t: Translation = {};
    if (typeof title === "string" && title) t.title = title;
    if (typeof description === "string" && description) {
      t.description = description;
    }
    if (Array.isArray(keywords) && keywords.length) {
      t.keywords = keywords.map(String);
    }
    if (Object.keys(t).length) out[lang] = t;
  }
  return out;
}

export interface Localised {
  title: string;
  description: string;
  /** The language each text is actually in: the chosen one, or English. */
  titleLang: CatalogLanguage;
  descriptionLang: CatalogLanguage;
}

/**
 * A dataset's title and description in the chosen language, each falling
 * back to English on its own when that language has none. A description in
 * the chosen language is not replaced by its title, as the serialiser does:
 * the page has the English description to show instead.
 */
export function localise(
  d: {
    title?: string;
    description?: string;
    translations?: Partial<Record<MetadataLanguage, Translation>>;
  },
  lang: CatalogLanguage,
): Localised {
  const t = lang === "en" ? undefined : d.translations?.[lang];
  return {
    title: t?.title ?? d.title ?? "",
    description: t?.description ?? d.description ?? "",
    titleLang: t?.title ? lang : "en",
    descriptionLang: t?.description ? lang : "en",
  };
}

/** The languages, English first, that at least one dataset is described in. */
export function languagesOf(
  datasets: { translations?: Partial<Record<MetadataLanguage, Translation>> }[],
): CatalogLanguage[] {
  const found = new Set<MetadataLanguage>();
  for (const d of datasets) {
    for (const lang of METADATA_LANGUAGES) {
      if (d.translations?.[lang]) found.add(lang);
    }
  }
  return ["en", ...METADATA_LANGUAGES.filter((l) => found.has(l))];
}

/** Every text of a dataset in every language, for a search in any of them. */
export function searchableText(d: {
  title?: string;
  description?: string;
  translations?: Partial<Record<MetadataLanguage, Translation>>;
}): string {
  return [
    d.title,
    d.description,
    ...Object.values(d.translations ?? {}).flatMap((t) => [
      t?.title,
      t?.description,
      ...(t?.keywords ?? []),
    ]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

const STORAGE_KEY = "catalog-metadata-language";

/** The language the visitor chose before, or null when they never chose. */
export function storedLanguage(): CatalogLanguage | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "en" || METADATA_LANGUAGES.includes(v as MetadataLanguage)) {
      return v as CatalogLanguage;
    }
  } catch {
    // no storage (private window): no choice on record
  }
  return null;
}

/**
 * The first of the browser's languages the catalogue has descriptions in,
 * by its primary subtag (de-AT is German), else English. Only a default:
 * a choice the visitor made, or ?lang= in the address, wins over it.
 */
export function browserLanguage(
  available: CatalogLanguage[],
  preferred: readonly string[] = typeof navigator === "undefined"
    ? []
    : navigator.languages?.length
      ? navigator.languages
      : [navigator.language],
): CatalogLanguage {
  for (const tag of preferred) {
    const primary = (tag ?? "").toLowerCase().split("-")[0];
    if (available.includes(primary as CatalogLanguage)) {
      return primary as CatalogLanguage;
    }
  }
  return "en";
}

/**
 * The language to show: ?lang= in the address (a shared link), else the
 * visitor's stored choice, else the browser's language, else English. A
 * language the catalogue has no descriptions in falls through to the next.
 */
export function initialLanguage(
  available: CatalogLanguage[],
  fromUrl: string | null,
  stored: CatalogLanguage | null,
  preferred?: readonly string[],
): CatalogLanguage {
  const url = (fromUrl ?? "").toLowerCase() as CatalogLanguage;
  if (available.includes(url)) return url;
  if (stored && available.includes(stored)) return stored;
  return browserLanguage(available, preferred);
}

export function storeLanguage(lang: CatalogLanguage): void {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // the choice holds for this page only
  }
}
