# ADR-082: The site search is Pagefind, indexed from the sources, searched in the browser

Date: 2026-11-09

**Status:** Proposed
**Relates to:** [ADR-053](ADR-053-everything-stops-off-hours.md), [ADR-071](ADR-071-the-documentation-follows-the-language-picker.md)
**Tracks:** [#1000](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/1000)

## Status

Proposed with the pull request that adds `ui/scripts/build-search-index.mjs`.

## Context

The site has 34 pages a visitor can read and 21 published documents, each in
five languages (ADR-071), and no way to search them. A reader looking for
"opt-out" has to know it is in the EHDS glossary, the regulation
implementation document and the jurisdictions page.

The search has to work in three places that serve the same code: the static
export on GitHub Pages (no server), the live site on Azure (off hours it
answers every page with a 503 notice, ADR-053) and `next dev`. The privacy
policy (`ui/src/app/datenschutz/page.tsx`) says the site sends nothing to a
third party, and the CSP (`ui/src/middleware.ts`) allows scripts only from
the site with a nonce.

Pagefind, the search most static documentation sites use, normally crawls the
built HTML. Here there is little to crawl: the live build renders every page
per request (the root layout reads the CSP nonce), and the pages of the static
export fetch their data in the browser, so their HTML is mostly a frame.

## Decision

1. **Pagefind** is the search: a static index of small files that the browser
   searches with WebAssembly. The dialog (`ui/src/components/SiteSearch.tsx`)
   is the site's own: it opens under the magnifier in the menu bar, placed
   from the icon's position and kept on screen (across the screen on a
   phone), also with Ctrl+K, Cmd+K or `/`. Ranking uses
   `termSimilarity: 5`, so an exact word ranks above longer words that start
   with it ("SPE" lists the SPE document first, before "speaks" or "spec").
2. **The index is built from the sources**, not crawled:
   `ui/scripts/build-search-index.mjs` feeds Pagefind the published documents
   (rendered from their Markdown with the same heading anchors as the page),
   the pages of `ui/src/content/site-pages.json` (the list the sitemap reads)
   with their titles, descriptions and the strings of the message areas of the
   pages that are mostly text, and the glossary terms. It runs as `prebuild`
   and `predev`, so the static site, the live image and `next dev` carry the
   same index. CI builds that called `npx next build` now call `npm run build`.
3. **One index per interface language**, under `public/pagefind/<lang>/`. A
   document not yet translated goes into an index in English, as the page
   shows it. The dialog searches the index of the language picked.
4. **Nothing leaves the browser.** The index is files from the site; the
   middleware no longer handles `/pagefind/` (so it loads off hours and its
   worker gets no page CSP), and the page CSP gains `worker-src 'self'`.
5. **The last five searches stay in the browser.** With the field empty the
   dialog lists them; they are kept in local storage
   (`site-search-recent`, `ui/src/lib/recent-searches.ts`), which the privacy
   policy names, and "Clear" removes them. A search is kept when the reader
   opens a result or closes the dialog after it found something.

## Consequences

- A new document under `docs/` or a new entry in `site-pages.json` is
  searchable with the next build; nothing else to maintain.
  `__tests__/unit/lib/site-search-index.test.ts` fails when a page or a
  document is missing from an index, or when an anchor differs from the
  page's.
- Pagefind matches word starts, so a short query still lists longer words
  further down ("SPE" also finds "spec"). Quoting an acronym would drop them
  but ranks by page order and put the SPE document out of the first eight,
  so the ranking does the work instead.
- Data shown by the pages (datasets, permits, patients) is not searched: it
  is fetched at run time and differs by role. The catalogue keeps its own
  search.
- The index adds about 0.8 MB per language to the site; a search loads the
  entry, one WebAssembly module and the chunks it needs, about 150 KB.
- `pagefind` is a dev dependency with a native binary per platform; the
  lockfile carries the Linux one the Docker build and CI use.

## Alternatives considered

- **Algolia DocSearch**: popular for documentation, but every query goes to
  Algolia in the USA, which the privacy policy would have to name, and the
  index is built by their crawler, which cannot sign in.
- **Pagefind over the built HTML** (`pagefind --site out`): the usual way, but
  the static pages hold little text, and the live image has no HTML to crawl,
  so the live site would have searched a different index or none.
- **A hand-made JSON index with MiniSearch or Fuse.js**: works, but has no
  stemming for five languages, no excerpts with the match marked and no
  headings as results; Pagefind has all three.
