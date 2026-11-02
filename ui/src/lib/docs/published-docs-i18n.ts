/**
 * The translations of the published documents (ADR-071): which languages
 * each document has and whether each is current. The index is small and
 * bundled; the translated bodies are files under public/, fetched only when
 * a reader picks that language.
 *
 * Both are written by scripts/gen-docs-content.py from docs/i18n/<lang>/...;
 * a translation is "stale" when the English file changed after it was
 * translated (its sourceHash is no longer the English file's hash).
 */
import index from "@/content/published-docs-i18n.json";
import type { CatalogLanguage } from "@/lib/metadata-language";
import { BASE_PATH } from "@/lib/static-export";

export type TranslationStatus = "current" | "stale";

export interface DocTranslation {
  status: TranslationStatus;
  /** The document's title in that language, its first heading. */
  title: string;
  /** The one-line summary, when the translation's frontmatter has one. */
  summary?: string;
}

type Index = Record<string, Partial<Record<CatalogLanguage, DocTranslation>>>;

const DOCS = index.docs as Index;

/** The translation of one published document into a language, if any. */
export function translationOf(
  section: string,
  slug: string,
  lang: CatalogLanguage,
): DocTranslation | undefined {
  if (lang === "en") return undefined;
  return DOCS[`${section}/${slug}`]?.[lang];
}

/** Where the page fetches a translated body, under the static export's
 *  base path. */
export function translationUrl(
  section: string,
  slug: string,
  lang: CatalogLanguage,
): string {
  return `${BASE_PATH}/published-docs/i18n/${lang}/${section}/${slug}.json`;
}
