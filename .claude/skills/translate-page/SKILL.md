---
name: translate-page
description: Use when a page or component of the UI is made to follow the language picker (EN, DE, FR, NL, ES), issue #782, ADR-070.
paths: ["ui/src/messages/**", "ui/src/lib/i18n/**"]
---

# Translating a page

Sources: `.claude/rules/i18n.md` (the rules), `ui/src/lib/i18n/translate.tsx`
(`useT`, `<T>`), `ui/src/lib/i18n/ehds-terminology.json` (the terms),
`ADR-070`. A finished example: `/compliance` (#795), the access body's pages
(#799).

## Procedure

1. **Area.** Use the area of your track; it is registered in
   `ui/src/messages/index.ts` with an empty `{}` in each language
   (`patient`, `research`, `holder`, `explore`, `admin`). Do not edit
   `index.ts` unless you need a new area. Texts other areas already have
   (role names in `common`, menu labels in `nav`, purposes in `public`,
   statuses in `access`) are reused with a second `useT`, not copied.
2. **Code.** In each client component: `const t = useT("<area>")`, every
   visible English string through `t("...")`, placeholders as
   `t("{n} datasets", { n })`. Server components use
   `<T area="<area>">{"..."}</T>`; a text with a link or bold part uses
   `tags`. Also `aria-label`, `title`, `placeholder` and table headers.
   Labels from a library map (`SOMETHING_LABELS[x]`) go through `t()` at the
   point of display, and a unit test lists them (see "knows every label the
   access body's pages take from a library" in the i18n test).
3. **Dictionaries.** Add every text to `en/<area>.json` (text to itself) and
   to `de`, `fr`, `nl`, `es`. Terms strictly from the terminology file; FR and
   ES write EEDS. No em dashes. Keep a translation about as long as the
   English where space is tight (buttons, chips, table headers).
4. **Stays English:** data (dataset titles, names, codes, units, API errors,
   demo form contents, NLQ example questions). Say so in the PR.
5. **Unit checks** (from `ui/`): `npx vitest run __tests__/unit/lib/i18n-messages.test.ts`
   plus the page's own tests (they find English text; render with the
   default language, English), `npx tsc --noEmit -p tsconfig.build.json`,
   `npm run lint` (at most 55 warnings), `npx knip`. The i18n test finds
   your files by their import of `@/lib/i18n/translate`; no list to edit.
6. **Journey.** One spec file per track,
   `ui/__tests__/e2e/journeys/51-i18n-<track>.spec.ts`, in the J range the
   track was given. Use `checkLanguages()` from `./i18n-helpers`: per page
   the h1 and one label in de, fr, nl, es, then en. Sign in with
   `loginAs(page, "<persona>", "<persona>")` after `skipIfKeycloakDown()`.
   `npx playwright test <spec> --list` must list it. Running it needs the
   local stack; when several tracks run in parallel, one person runs all
   tracks' journeys at the end against one rebuilt container.
7. **Look once.** French is the longest; check each page at 1280 px for text
   still English and for wrapping.
8. **Commit and PR.** Explicit paths (a bash array; zsh does not split
   variables), never `git add -u/-A`, no co-author trailer. A hook that
   reformats files fails the commit: add again, commit again, check HEAD
   moved. PR against main; comment on #782 with the PR and what stays
   English.

## Output contract

Every visible interface text of the pages comes from a dictionary in all
five languages; the i18n test, tsc, lint and knip pass; the track's spec
lists its journeys; the PR names what stays English and why.
