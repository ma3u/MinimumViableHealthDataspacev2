---
applyTo: "ui/**/*.{ts,tsx},services/**/*.ts,neo4j/**/*.cypher,scripts/**/*.sh,jad/**/*.sh,docs/**/*.md,*.md"
description: Language and formatting conventions extracted from this repository.
---

# Code style

Mirror of `.claude/rules/code-style.md` — change both together.

## TypeScript / Next.js

Source: `ui/tsconfig.json`, `ui/tsconfig.build.json`, `ui/.eslintrc.json`, `ui/src/`.

- All UI source lives under `ui/src/`. Use the `@/*` alias (maps to `ui/src/*`) for
  every import.
- Pages live in `ui/src/app/` (App Router). Server components are the default;
  client components need `"use client"` as the **first** line.
- API routes are `ui/src/app/api/<resource>/route.ts` exporting named HTTP handlers
  (`GET`, `POST`, `DELETE`).
- Components: `PascalCase` function declaration matching the filename. Hooks:
  `useCamelCase` in `use-kebab-case.ts`. Module-level readonly values:
  `UPPER_SNAKE_CASE`. Unused params/vars: prefix `_` (e.g. `_participantType`).
- `strict` mode is on. Avoid `as any`; prefer an explicit assertion such as
  `as { roles?: string[] }`. `readonly` tuples from `as const` need
  `[...arr] as string[]` before passing to a `string[]` parameter.
- React hooks are called unconditionally — never inside a conditional, even when the
  result is discarded (e.g. `useDemoPersona()` in both Navigation and UserMenu). Use
  `useEffect` cleanups for listener teardown, and module-level `EventTarget`
  instances (not component-scoped) for cross-component same-tab reactivity.
- The pre-commit type-check uses `tsconfig.build.json`, which excludes
  `__tests__/` — a type error only reachable from a test will not be caught there.

## Static-export guards

Source: `ui/src/lib/api.ts`, `.github/workflows/pages.yml`.

- Read `process.env.NEXT_PUBLIC_STATIC_EXPORT === "true"` into an `IS_STATIC`
  constant at module top.
- In static mode `fetchApi()` routes GETs to `/mock/*.json` and returns a synthetic
  `{ ok: true }` 200 for every non-GET mutation.
- Never assume API routes exist in the static build — CI renames `ui/src/app/api/`
  before building.

## Tailwind / styling

Source: `ui/src/lib/graph-constants.ts`.

- Dark-first: `bg-gray-900` background, `text-gray-300`/`text-gray-400` text,
  `border-gray-700` borders.
- Layer accents: L1 `#2471A3`, L2 `#148F77`, L3 `#1E8449`, L4 `#CA6F1E`,
  L5 `#7D3C98`.
- Role badges: EDC_ADMIN red, DATA_HOLDER blue, DATA_USER green, HDAB_AUTHORITY
  amber, PATIENT teal.

## Cypher

Source: `neo4j/init-schema.cypher`.

- `PascalCase` node labels (`DataProduct`, `OMOPPerson`); `UPPER_SNAKE_CASE`
  relationship types (`HAS_CONDITION`, `CODED_BY`); `camelCase` properties.
- Always `MERGE` with explicit `ON CREATE SET` / `ON MATCH SET`. Never a bare
  `CREATE` — seeds must be idempotent.
- Every constraint and index uses `IF NOT EXISTS`. Indexes are immutable once
  created, so re-running the schema is safe but altering one is not.
- A schema change in any markdown doc under `docs/` must be reflected in
  `neo4j/init-schema.cypher`.

## Bash

Source: `scripts/`, `.pre-commit-config.yaml` (shellcheck at error severity).

- First line after the shebang: `set -euo pipefail`.
- Quote every expansion: `"$var"`, `"${array[@]}"`.
- Fix all shellcheck errors before committing; naming pattern is `verb-noun.sh`
  (`run-dsp-tck.sh`, `generate-synthea.sh`).

## Markdown & Prettier

- Prettier formats `*.md`, `*.yaml`, `*.json`, `*.ts`, `*.tsx` in pre-commit and
  **rewrites staged files** — `git add` again and retry the commit. Do not fight it.
- Keep the existing tone and formatting when editing markdown; use relative links
  between documents.

## Fictional organisation policy

Every participant name in demo data, comments, and docs must be fictional.

| Role                   | Fictional name              | Country | Domain slug       |
| ---------------------- | --------------------------- | ------- | ----------------- |
| DATA_HOLDER (clinic)   | AlphaKlinik Berlin          | DE      | `alpha-klinik.de` |
| DATA_USER (CRO/pharma) | PharmaCo Research AG        | DE      | `pharmaco.de`     |
| HDAB (authority)       | MedReg DE                   | DE      | `medreg.de`       |
| DATA_HOLDER (clinic)   | Limburg Medical Centre      | NL      | `lmc.nl`          |
| HDAB (research)        | Institut de Recherche Santé | FR      | `irs.fr`          |

Forbidden: Charité, Bayer, BfArM, Zuyderland, INSERM, or any other real
organisation. If a new participant is needed, invent a fictional name and add it to
this table.

**Exception:** real names (TK Krankenkasse, gematik) may appear _only_ behind the
`NEXT_PUBLIC_DEMO_TK` build flag. The default build, the committed repo, and the
public github.io site stay fictional; real third-party screenshots are git-ignored
and never committed (`ui/src/lib/journey-config.ts`).
