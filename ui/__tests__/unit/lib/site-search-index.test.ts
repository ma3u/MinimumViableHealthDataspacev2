/**
 * What the site search index holds (ADR-082), read from the records
 * scripts/build-search-index.mjs hands to Pagefind, without starting it.
 */
import { describe, expect, it } from "vitest";
import {
  LANGUAGES,
  headingId as indexHeadingId,
  searchDocuments,
} from "../../../scripts/build-search-index.mjs";
import { OFFERED_LANGUAGES } from "@/lib/use-language";
import { headingId, renderMarkdown } from "@/lib/docs/markdown";
import { publishedDocs } from "@/lib/docs/published-docs";
import sitePages from "@/content/site-pages.json";
import terminology from "@/lib/i18n/ehds-terminology.json";

const records = searchDocuments() as {
  url: string;
  language: string;
  html: string;
}[];
const of = (lang: string, url: string) =>
  records.find((r) => r.language === lang && r.url === url);
const ids = (html: string) =>
  [...html.matchAll(/<h[1-6] id="([^"]+)"/g)].map((m) => m[1]);
const title = (html: string) =>
  html.match(/<h1 data-pagefind-meta="title">([^<]*)<\/h1>/)?.[1];

describe("site search index", () => {
  it("has an index for every language the interface offers", () => {
    expect([...LANGUAGES].sort()).toEqual([...OFFERED_LANGUAGES].sort());
  });

  it("holds every page and every published document in every language", () => {
    const urls = [
      ...sitePages.pages.map((p) => p.path),
      ...publishedDocs.map((d) => `/docs/${d.section}/${d.slug}`),
    ];
    for (const lang of LANGUAGES) {
      const inLang = records.filter((r) => r.language === lang);
      expect(inLang.map((r) => r.url).sort()).toEqual([...urls].sort());
    }
  });

  it("anchors a document's headings where the page renders them", () => {
    for (const d of publishedDocs) {
      const rec = of("en", `/docs/${d.section}/${d.slug}`)!;
      const rendered = ids(renderMarkdown(d.markdown));
      // Mermaid diagrams are left out of the index; every heading stays.
      expect(ids(rec.html)).toEqual(rendered);
    }
  });

  it("makes anchors the way the documents do", () => {
    for (const s of ["7.2 Clocks", "Art. 71: opt-out", "Ärzte & Pflege"]) {
      expect(indexHeadingId(s)).toBe(headingId(s));
    }
  });

  it("indexes a translated document in its own language", () => {
    const d = publishedDocs[0];
    const en = of("en", `/docs/${d.section}/${d.slug}`)!;
    const de = of("de", `/docs/${d.section}/${d.slug}`)!;
    expect(de.html).toContain('<html lang="de">');
    expect(title(de.html)).not.toBe(title(en.html));
  });

  it("translates a page title when the interface has it", () => {
    expect(title(of("de", "/impressum")!.html)).toBe("Impressum");
    expect(title(of("en", "/impressum")!.html)).toBe("Legal notice");
  });

  it("gives every glossary term its own anchor", () => {
    const rec = of("en", "/docs/ehds/glossary")!;
    for (const t of terminology.terms) expect(ids(rec.html)).toContain(t.id);
  });

  it("leaves no message placeholder or tag in the text", () => {
    for (const r of records.filter((r) => !r.url.startsWith("/docs/"))) {
      expect(r.html).not.toMatch(/\{[a-zA-Z_]+\}/);
      expect(r.html).not.toMatch(/&lt;\/?[a-z]+&gt;/);
    }
  });
});
