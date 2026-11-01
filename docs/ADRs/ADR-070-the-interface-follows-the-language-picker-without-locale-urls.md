# ADR-070. The interface follows the language picker, without locale URLs

Date: 2026-11-01

## Status

Proposed

## Context

Issue #782 brought dataset descriptions in German, Spanish, French and Dutch
and a language picker in the menu bar (#783, #784, #785). Switching it left
the start page, the menus and the sign-in page English, which reads as
broken: the picker promised more than it did.

The issue's plan for the interface (phase 2) was `next-intl` or an in-house
dictionary, German under `/de/...`, a script redirect on GitHub Pages and a
middleware redirect on Azure. It also named the risk that plan brings:
`ui/src/middleware.ts` matches `PROTECTED_PATHS` on the raw path, so
`/de/compliance` would escape the sign-in redirect and the role checks until
every match strips a locale first.

Constraints: the static export (`output: "export"`, `basePath`) has no
middleware; the hub is a demonstrator behind a sign-in, not a public site
that needs search engines to index each language; one maintainer works with
Claude Code, so every UI change must carry its languages at little cost.

## Decision

1. The language is the picker's (`ui/src/lib/use-language.ts`): `?lang=`,
   then the stored choice, then the browser's language, then English. Pages
   keep their URLs; there are no `/de/` routes and no redirects.
2. An in-house dictionary, no library. English is the source and the key:
   `ui/src/messages/<lang>/<area>.json` maps each English text to its
   translation; `useT(area)` (`ui/src/lib/i18n/translate.tsx`) returns it in
   the picked language and falls back to English per text.
3. Legal terms come from `ui/src/lib/i18n/ehds-terminology.json`, taken from
   the Official Journal in each language and checked by
   `scripts/i18n/check-ehds-terminology.py`.
4. `__tests__/unit/lib/i18n-messages.test.ts` fails when a language lacks a
   text, changes a placeholder, uses a term the Regulation does not, or when
   the code translates a literal no dictionary has.
5. The picker sets `<html lang>` (WCAG 2.2, 3.1.1); a translated dataset
   description carries its own `lang` (3.1.2).
6. Areas are translated page by page (#782): menu bar, sign-in, catalogue
   and national profiles first; untranslated pages stay English.

## Consequences

- `PROTECTED_PATHS`, every link, the 472 `page.goto` calls and every link
  already sent to partners keep working; the locale-prefix bypass cannot
  happen because there is no prefix.
- The first render is English (server and static HTML), then switches on the
  client: a short flash for a reader of another language.
- No `hreflang` per language and no language a crawler can see. Acceptable
  for a hub behind a sign-in; a public landing page would need a second look.
- English text is the key, so changing an English sentence orphans its
  translations; the parity test lists them as missing, never silently.
- Every visible text added later needs its entries in all languages; the
  test catches a `t("...")` literal with none, not a literal that was never
  wrapped in `t()`.

## Alternatives considered

- `next-intl` with `/de/` routing: needs middleware the static export lacks
  and brings the `PROTECTED_PATHS` bypass with it.
- `next-intl` without routing: a dependency for what a 30-line hook does
  here; its message keys are no easier to keep in sync than English text.
- Opaque message ids (`nav.datasetCatalog`): stable under English edits, but
  every component becomes harder to read and to search for its text.
