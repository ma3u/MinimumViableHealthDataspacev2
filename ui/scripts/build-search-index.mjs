#!/usr/bin/env node
/**
 * Builds the site search index into public/pagefind/ (ADR-082).
 *
 * Pagefind usually crawls a site's built HTML. This one has none to crawl on
 * Azure (the root layout reads the CSP nonce, so every page renders per
 * request), and the static export's pages fetch their data in the browser. So
 * the index is built from the sources the pages render, before `next build`,
 * the same way for the static site, the live site and `next dev`:
 *
 * - every published document (docs/ via scripts/gen-docs-content.py), in each
 *   language it is translated to, with its headings as anchors;
 * - every page of src/content/site-pages.json, with its title, description
 *   and, for the pages that are mostly text, the strings of its message areas;
 * - the EHDS glossary, one anchor per term.
 *
 * One index per interface language (en, de, fr, nl, es), in public/pagefind/<lang>/.
 * A text not yet translated goes into that language's index in English, as the
 * page shows it.
 *
 * Run from ui/: node scripts/build-search-index.mjs (prebuild and predev do).
 */
import { readFileSync, readdirSync, existsSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Marked } from "marked";

const UI = join(dirname(fileURLToPath(import.meta.url)), "..");

/** The interface languages, as src/lib/use-language.ts offers them. */
export const LANGUAGES = ["en", "de", "fr", "nl", "es"];

const readJson = (...p) => JSON.parse(readFileSync(join(UI, ...p), "utf8"));

/** GitHub's heading anchor, the same as headingId() in src/lib/docs/markdown.ts,
 *  so a result lands on the heading the page renders. */
export function headingId(text) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * A message string as a reader sees it, as HTML text: no <a>…</a> tags, no
 * {placeholders}. Escaped first, then the escaped tags removed, so no
 * removal can leave markup behind (CodeQL, incomplete sanitization).
 */
function plainHtml(s) {
  return escapeHtml(s)
    .replace(/&lt;\/?[a-z][a-z0-9]*&gt;/gi, "")
    .replace(/\{[a-zA-Z_][a-zA-Z0-9_]*\}/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Every message area of one language, English text to translated text. */
function messages(lang) {
  const dir = join(UI, "src", "messages", lang);
  const areas = {};
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    areas[f.replace(/\.json$/, "")] = readJson("src", "messages", lang, f);
  }
  return areas;
}

/** Translate an English string the way <T> does: the first area that has it. */
function translator(areas) {
  return (s) => {
    for (const area of Object.values(areas)) {
      if (typeof area[s] === "string" && area[s]) return area[s];
    }
    return s;
  };
}

const marked = new Marked({
  gfm: true,
  renderer: {
    heading({ tokens, depth }) {
      const html = this.parser.parseInline(tokens);
      const text = tokens.map((t) => ("text" in t ? t.text : t.raw)).join("");
      return `<h${depth} id="${headingId(text)}">${html}</h${depth}>\n`;
    },
    // Images and diagrams say nothing a search finds; their alt text stays.
    image({ text }) {
      return escapeHtml(text);
    },
  },
});

/** A document's Markdown without its mermaid diagrams. */
function docHtml(markdown) {
  const text = markdown.replace(/^```mermaid[ \t]*\n[\s\S]*?^```[ \t]*$/gm, "");
  return marked.parse(text);
}

function page({ lang, url, title, kind, body }) {
  return {
    url,
    language: lang,
    html:
      `<html lang="${lang}"><head><title>${escapeHtml(title)}</title></head>` +
      `<body><main data-pagefind-body>` +
      `<span data-pagefind-meta="kind" hidden>${kind}</span>` +
      `<h1 data-pagefind-meta="title">${escapeHtml(title)}</h1>` +
      `${body}</main></body></html>`,
  };
}

function glossaryHtml(lang) {
  const { terms } = readJson("src", "lib", "i18n", "ehds-terminology.json");
  return terms
    .map((t) => {
      const names = LANGUAGES.map((l) => t[l]).filter(Boolean);
      const unique = [...new Set(names)];
      const note = t.note ? `<p>${escapeHtml(t.note)}</p>` : "";
      return (
        `<h2 id="${escapeHtml(t.id)}">${escapeHtml(t[lang] ?? t.en)}</h2>` +
        `<p>${escapeHtml(unique.join(" · "))} (${escapeHtml(
          t.article,
        )})</p>${note}`
      );
    })
    .join("\n");
}

/**
 * Everything the index holds, one record per page and language. Pure, so the
 * unit test reads it without starting Pagefind.
 */
export function searchDocuments() {
  const { pages } = readJson("src", "content", "site-pages.json");
  const { docs } = readJson("src", "content", "published-docs.json");
  const out = [];
  for (const lang of LANGUAGES) {
    const areas = messages(lang);
    const t = translator(areas);
    for (const p of pages) {
      const parts = [`<p>${escapeHtml(t(p.description))}</p>`];
      for (const area of p.areas ?? []) {
        const strings = Object.entries(areas[area] ?? {}).map(([en, tr]) =>
          plainHtml(lang === "en" ? en : tr || en),
        );
        parts.push(`<p>${strings.filter(Boolean).join(" · ")}</p>`);
      }
      if (p.path === "/docs/ehds/glossary") parts.push(glossaryHtml(lang));
      out.push(
        page({
          lang,
          url: p.path,
          title: t(p.title),
          kind: "page",
          body: parts.join("\n"),
        }),
      );
    }
    for (const d of docs) {
      const file = join(
        UI,
        "public",
        "published-docs",
        "i18n",
        lang,
        d.section,
        `${d.slug}.json`,
      );
      const tr =
        lang !== "en" && existsSync(file)
          ? JSON.parse(readFileSync(file, "utf8"))
          : null;
      out.push(
        page({
          lang,
          url: `/docs/${d.section}/${d.slug}`,
          title: tr?.title ?? d.title,
          kind: "doc",
          body: `<p>${escapeHtml(d.summary)}</p>\n${docHtml(
            tr?.markdown ?? d.markdown,
          )}`,
        }),
      );
    }
  }
  return out;
}

async function main() {
  const pagefind = await import("pagefind");
  const root = join(UI, "public", "pagefind");
  rmSync(root, { recursive: true, force: true });
  const documents = searchDocuments();
  // One index per language, each in its own folder: Pagefind keys a page by
  // its URL, so the five languages of one page cannot share an index.
  for (const lang of LANGUAGES) {
    const { index, errors } = await pagefind.createIndex({
      forceLanguage: lang,
    });
    if (!index) throw new Error(`Pagefind did not start: ${errors.join("; ")}`);
    for (const d of documents.filter((d) => d.language === lang)) {
      const res = await index.addHTMLFile({ url: d.url, content: d.html });
      if (res.errors.length) {
        throw new Error(`${lang} ${d.url}: ${res.errors.join("; ")}`);
      }
    }
    const written = await index.writeFiles({ outputPath: join(root, lang) });
    if (written.errors.length) throw new Error(written.errors.join("; "));
    await index.deleteIndex();
    // The site has its own search dialog; Pagefind's ready-made interfaces
    // would only be shipped, never loaded.
    for (const f of readdirSync(join(root, lang))) {
      if (/^pagefind-(ui|component-ui|modular-ui|highlight)\./.test(f)) {
        rmSync(join(root, lang, f));
      }
    }
  }
  await pagefind.close();
  console.log(
    `search index: ${documents.length / LANGUAGES.length} pages in ${
      LANGUAGES.length
    } languages -> public/pagefind/<lang>/`,
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
