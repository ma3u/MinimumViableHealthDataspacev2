import { BASE_PATH } from "@/lib/static-export";
import type { CatalogLanguage } from "@/lib/metadata-language";

/**
 * The site search (ADR-082): Pagefind, run in the browser over the index that
 * scripts/build-search-index.mjs writes to public/pagefind/<lang>/. Nothing a
 * reader types leaves the browser; the index is a set of static files, the
 * same on GitHub Pages and on Azure.
 */

/** One result: a page or a document, with up to three headings inside it. */
export interface SearchHit {
  url: string;
  title: string;
  kind: "page" | "doc";
  /** Pagefind's excerpt: text escaped by Pagefind, the match in <mark>. */
  excerpt: string;
  anchors: { url: string; title: string; excerpt: string }[];
}

/** What Pagefind's `result.data()` gives, as far as the dialog reads it. */
export interface PagefindData {
  url: string;
  excerpt: string;
  meta: Record<string, string | undefined>;
  sub_results?: { url: string; title: string; excerpt: string }[];
}

interface PagefindResults {
  results: { data(): Promise<PagefindData> }[];
}

interface Pagefind {
  options(o: Record<string, unknown>): Promise<void>;
  init(): Promise<void>;
  debouncedSearch(
    query: string,
    options?: Record<string, unknown>,
    ms?: number,
  ): Promise<PagefindResults | null>;
}

/** Where a language's index is, under the static export's base path. */
export function indexUrl(lang: CatalogLanguage): string {
  return `${BASE_PATH}/pagefind/${lang}/pagefind.js`;
}

const loaded = new Map<CatalogLanguage, Promise<Pagefind>>();

function load(lang: CatalogLanguage): Promise<Pagefind> {
  let p = loaded.get(lang);
  if (!p) {
    p = (async () => {
      // A file under public/, not a module of the bundle: the bundler must
      // leave the import to the browser.
      const pf = (await import(
        /* webpackIgnore: true */ /* turbopackIgnore: true */ indexUrl(lang)
      )) as Pagefind;
      // URLs as the index holds them ("/docs/ehds/glossary"); the router
      // adds the base path.
      // Pagefind matches the start of words, so "SPE" also finds "speaks"
      // and "spec". A higher termSimilarity ranks the exact word above the
      // longer ones (SPE puts the SPE document first); quoting the query
      // would drop the longer words but ranks by page order instead.
      await pf.options({
        baseUrl: "/",
        excerptLength: 20,
        ranking: { termSimilarity: 5 },
      });
      await pf.init();
      return pf;
    })();
    // A failed load (no index in this build) is tried again next time.
    p.catch(() => loaded.delete(lang));
    loaded.set(lang, p);
  }
  return p;
}

/** A Pagefind result as the dialog shows it. */
export function toHit(d: PagefindData): SearchHit {
  const anchors = (d.sub_results ?? [])
    .filter((s) => s.url.includes("#") && s.url !== d.url)
    .slice(0, 3)
    .map(({ url, title, excerpt }) => ({ url, title, excerpt }));
  return {
    url: d.url,
    title: d.meta.title ?? d.url,
    kind: d.meta.kind === "doc" ? "doc" : "page",
    excerpt: d.excerpt,
    anchors,
  };
}

/**
 * Search the index of one language. Resolves to null when a later keystroke
 * replaced this search before it ran.
 */
export async function searchSite(
  lang: CatalogLanguage,
  query: string,
  limit = 8,
): Promise<SearchHit[] | null> {
  const pf = await load(lang);
  const res = await pf.debouncedSearch(query, {}, 150);
  if (!res) return null;
  const data = await Promise.all(
    res.results.slice(0, limit).map((r) => r.data()),
  );
  return data.map(toHit);
}
