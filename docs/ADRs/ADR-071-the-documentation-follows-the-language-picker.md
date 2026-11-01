# ADR-071. The documentation follows the language picker: translated Markdown with a source hash, per-language images and charts

Date: 2026-11-01

## Status

Proposed. Extends ADR-070, which left the documentation out of scope.

## Context

ADR-070 made the interface follow the language picker (EN, DE, FR, NL, ES)
with an in-house dictionary, English as the key, and no `/de/` URLs. It left
`/docs/**` English and noted that "a public landing page would need a second
look". The maintainer has decided to translate all of the documentation, its
screenshots and its diagrams, and several translators (agents) will work in
parallel, so the conventions have to be fixed before the first of them starts.

The documentation comes in four shapes, and each needs its own answer:

- 17 hand-written TSX pages under `ui/src/app/docs/` (the user guide alone has
  1827 lines, the developer guide 1863, the architecture page 727).
- 17 published Markdown documents under `docs/`, copied into
  `ui/src/content/published-docs.json` by `scripts/gen-docs-content.py` and
  rendered by `PublishedDoc.tsx` (Mermaid through `splitMermaid`).
- 67 screenshots in `ui/public/images/guide` and `ui/public/images/screenshots`,
  and the SVG diagrams the pages embed from `ui/public/published-docs`.
- Mermaid charts written inline in the TSX pages.

The English published documents keep changing. A translation that silently
drifts from its original is worse than none, and an English edit must never
be blocked because nobody has translated it yet.

## Decision

1. **Translated Markdown** lives at `docs/i18n/<lang>/<the English source's
path below docs/>`, e.g. `docs/i18n/de/ehds/regulation-implementation.md`,
   with this frontmatter:

   ```yaml
   ---
   source: docs/ehds/regulation-implementation.md
   sourceHash: <SHA-256 hex of the English file's bytes at translation time>
   language: de
   ---
   ```

   An optional `summary:` line carries the one-line summary for the section
   index. `python3 scripts/gen-docs-content.py --stamp <file>` writes the
   frontmatter from the path and the English file as it is now. Relative links
   and images stay as in the English file; the generator resolves them against
   the English source's folder, with the same link rewriting as for English,
   and refuses one that resolves to nothing. The Markdown link checker
   (lychee) skips `docs/i18n/`, where those paths do not resolve.

2. **Generated outputs.** `scripts/gen-docs-content.py` also writes each
   translation to `ui/public/published-docs/i18n/<lang>/<section>/<slug>.json`
   (served as a static file, fetched on demand, never bundled) and a small
   index, `ui/src/content/published-docs-i18n.json`, listing per
   `<section>/<slug>` the languages that exist, each `current` (its
   `sourceHash` is the English file's hash now) or `stale`, with its title.
   An image `x.png` may have a translated variant `x.<lang>.png` next to it;
   a translation uses the variant when it exists. `--check` covers all of it,
   and removes nothing on its own: a body whose translation is gone fails the
   check until the generator removes it.

3. **The page.** `PublishedDocPage` renders English on the server as before.
   The client part, `LocalizedDocBody`, fetches the picked language's JSON
   (through `BASE_PATH` from `@/lib/static-export`, so the static export works)
   and swaps the body, with `lang` set on it (WCAG 3.1.2). A missing
   translation shows English with the note "Not yet translated into
   {language}."; a stale one shows the translation with the note "The English
   original was changed after this translation." and a button to read the
   English. Until the fetch answers, and if it fails, English stays.

4. **The TSX pages** use the dictionary of ADR-070, in four areas registered
   empty now so no translator edits `ui/src/messages/index.ts`: `docsGuide`
   (`/docs/user-guide`), `docsDeveloper` (`/docs/developer` and its
   subpages), `docsArchitecture` (`/docs/architecture`) and `docsCommon` (the
   docs index, the section pages, the roadmap, the glossary page's chrome and
   the notes of `LocalizedDocBody`). Long paragraphs are fine as keys.

5. **Images.** `LocalizedImage` (`ui/src/components/docs/LocalizedImage.tsx`)
   and its hook `useLocalizedImageSrc` take the English public path and show
   the picked language's variant when `ui/src/content/localized-images.json`
   lists one. `scripts/gen-localized-images.py` writes that manifest from
   `ui/public/images/guide/<lang>/<file>`,
   `ui/public/images/screenshots/<lang>/<file>` and
   `ui/public/published-docs/<stem>.<lang>.<ext>`; its `--check` runs in the
   pre-commit hook `localized-images`. `DocFigure` and the user guide's
   screenshots use it. The capture specs take `SCREENSHOT_LANG=<lang>`: every
   page opens with `?lang=<lang>` and the pictures go to the `<lang>/`
   subfolder; unset is English into the existing folders.

6. **Diagrams.** A Mermaid chart of a TSX page is a module under
   `ui/src/content/diagrams/<id>.ts` with its text per language (English
   required), registered once in `ui/src/content/diagrams/index.ts`, and
   drawn with `localizedChart(id, lang)` from `@/lib/i18n/diagrams`, which
   falls back to English. Mermaid inside published Markdown is translated in
   the translated Markdown. Static diagrams generated by
   `docs/diagrams/*.py` (or PlantUML) stay English; a translated variant is
   `<name>.<lang>.svg` next to the English one, picked up by the generator
   for published documents and by `LocalizedImage` through the manifest.

7. **A report, not a gate.** `python3 scripts/gen-docs-content.py
--report-i18n` lists per language the missing and the stale translations.
   Tests check that the index, the manifest and the chart registry are well
   formed, never that everything is translated.

## Consequences

- An English edit regenerates the index, which then marks its translations
  stale; the commit goes through, and the reader is told.
- The English body is still the server render, so search engines and the
  first paint see English; another language arrives with one small fetch.
  The flash is the one ADR-070 accepted for the interface.
- A translated published document is about as large as the English one;
  keeping it out of the bundle keeps the English page's weight unchanged.
- Heading anchors come from the heading text, so a link into a translated
  document by an English anchor lands at the top. Cross-document links still
  reach the right document.
- Five languages of 67 screenshots is 268 more images in `ui/public`. They are
  WebP or PNG at the English size, captured only when a language's pages are
  translated.
- `docsCommon` is shared by more than one track; additions there may need a
  merge, which JSON keeps simple.

## Alternatives considered

- Translations inside `published-docs.json`: every language in the bundle of
  every docs page, five times the weight for one reader's language.
- `/de/docs/...` routes, statically generated per language: rejected for the
  interface in ADR-070 for the middleware and `PROTECTED_PATHS` reasons, and
  a second scheme for the docs alone would confuse every link.
- A translation memory or a library (i18next, Crowdin files): a dependency and
  a service for what a hash in a frontmatter and a 200-line generator do here.
- Dates instead of a hash for staleness: a reformatting commit would mark
  everything stale, and a back-dated edit nothing.
