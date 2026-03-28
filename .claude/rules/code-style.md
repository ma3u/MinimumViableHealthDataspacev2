---
description: Code style conventions extracted from this codebase
globs:
  - "ui/src/**/*.ts"
  - "ui/src/**/*.tsx"
  - "neo4j/**/*.cypher"
  - "services/**/*.ts"
  - "scripts/**/*.sh"
---

# Code Style Conventions

## TypeScript / Next.js

### Module structure

- All UI source lives under `ui/src/`. Use the `@/*` path alias (maps to `ui/src/*`) for all imports.
- Pages live in `ui/src/app/` (Next.js 14 App Router). Each route has a `page.tsx`; server components are the default.
- Client components must have `"use client"` as the first line.
- API routes live in `ui/src/app/api/<resource>/route.ts` and export named HTTP method handlers (`GET`, `POST`, `DELETE`).

### Naming

- React components: `PascalCase` function declaration, matching filename.
- Hooks: `useCamelCase`, file named `use-kebab-case.ts`.
- Constants: `UPPER_SNAKE_CASE` for module-level readonly values.
- Unused function parameters or variables: prefix with `_` (e.g. `_participantType`).

### TypeScript

- `tsconfig.json` strict mode is on: no implicit any, strict null checks.
- Pre-commit type-check uses `tsconfig.build.json`, which excludes test files from `__tests__/`.
- Avoid `as any`; prefer explicit type assertions like `as { roles?: string[] }`.
- `readonly` tuples from `as const` arrays require `[...arr] as string[]` spread before passing to functions expecting `string[]`.

### React patterns

- React hooks must be called unconditionally — no hook calls inside conditionals, even when the return value will be ignored (e.g., `useDemoPersona()` in both Navigation and UserMenu).
- Use `useEffect` cleanup functions for event listener teardown.
- Module-level `EventTarget` instances (not component-scoped) for cross-component same-tab reactivity.

### Static export guards

- Check `process.env.NEXT_PUBLIC_STATIC_EXPORT === "true"` as `IS_STATIC` constant at module top.
- In static mode, `fetchApi()` from `ui/src/lib/api.ts` routes GET requests to `/mock/*.json` fixtures and returns a synthetic `{ ok: true }` 200 for all non-GET mutations.
- Never assume API routes are available in the static build; the CI workflow renames `src/app/api/` before building.

### Tailwind / styling

- Dark-first: background `bg-gray-900`, text `text-gray-300`/`text-gray-400`, borders `border-gray-700`.
- Layer accent colors (from `graph-constants.ts`): L1 `#2471A3`, L2 `#148F77`, L3 `#1E8449`, L4 `#CA6F1E`, L5 `#7D3C98`.
- Role badge colors: EDC_ADMIN red, DATA_HOLDER blue, DATA_USER green, HDAB_AUTHORITY amber, PATIENT teal.

## Cypher (Neo4j)

- Node labels: `PascalCase` (e.g., `DataProduct`, `OMOPPerson`).
- Relationship types: `UPPER_SNAKE_CASE` (e.g., `HAS_CONDITION`, `CODED_BY`).
- Node properties: `camelCase`.
- Always use `MERGE` with explicit ON CREATE SET / ON MATCH SET; never bare `CREATE` for idempotency.
- All constraint and index definitions must use `IF NOT EXISTS`.
- Schema changes in markdown docs under `docs/` must be reflected in `neo4j/init-schema.cypher`.

## Bash Scripts

- First line after shebang: `set -euo pipefail`.
- Quote all variable expansions: `"$var"`, `"${array[@]}"`.
- shellcheck runs at error severity in pre-commit — fix all shellcheck errors before committing.
- Scripts in `scripts/` follow naming pattern: `verb-noun.sh` (e.g., `run-dsp-tck.sh`, `generate-synthea.sh`).

## Prettier (enforced by pre-commit)

- Runs on: `*.md`, `*.yaml`, `*.json`, `*.ts`, `*.tsx`.
- Files are auto-reformatted by the hook; you must `git add` the modified files and retry the commit.
- Do not fight Prettier formatting — accept its output.

## Fictional Organisation Policy

All participant names in demo data, comments, and docs must be fictional:

- DATA_HOLDER: AlphaKlinik Berlin, Limburg Medical Centre
- DATA_USER: PharmaCo Research AG
- HDAB: MedReg DE, Institut de Recherche Santé
- Forbidden: Charité, Bayer, BfArM, Zuyderland, INSERM, or any real organisation.
