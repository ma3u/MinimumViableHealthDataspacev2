# /review — Code Review

Perform a structured code review of the current changes.

## Usage

```
/review
/review --staged         # review only staged changes
/review --branch main    # review diff against a specific branch
```

## Workflow

1. Gather the diff:

```bash
git diff HEAD
```

For staged only: `!git diff --cached`
For branch comparison: `!git diff main...HEAD`

2. Also gather context:

```bash
git status --short
git log --oneline -5
```

3. Review against these project-specific criteria:

### Correctness

- TypeScript strict mode satisfied (no implicit any, no unhandled nulls)
- `MERGE` used in Cypher (never bare `CREATE`)
- `set -euo pipefail` present in all modified bash scripts
- React hooks called unconditionally
- `[...roles] as string[]` spread used when `DEMO_PERSONAS` roles are passed to functions

### Security

- No hardcoded credentials, tokens, or secrets
- No real patient data or real organisation names
- Role checks present in new API routes (`getServerSession` + role guard)
- No user-controlled input interpolated directly into Cypher queries

### Static export compatibility

- New pages check `NEXT_PUBLIC_STATIC_EXPORT` / `IS_STATIC`
- New API routes have a corresponding mock file in `ui/public/mock/`
- `fetchApi()` used in client components (not bare `fetch`)

### Testing

- New UI components have a Vitest unit test in `ui/__tests__/unit/`
- New user journeys have a Playwright spec in `ui/__tests__/e2e/journeys/`
- New API routes have MSW handler if tested in unit tests

### Pre-commit hygiene

- Prettier will accept the file as-is (check with `npx prettier --check <file>`)
- ESLint warning count remains ≤ 55 (`npm run lint`)
- `npx tsc --noEmit -p tsconfig.build.json` passes

### Compliance / policy

- Only fictional organisation names used (AlphaKlinik Berlin, PharmaCo Research AG, MedReg DE, Limburg Medical Centre, Institut de Recherche Santé)
- EHDS article references accurate when cited in code comments
- `TransferEvent` nodes remain immutable (no delete operations on audit trail)

4. Produce a review summary with:
   - **Pass** / **Fail** / **Warn** for each category above
   - Specific line references for any issues found
   - Suggested fixes (not rewrites — minimal targeted changes)
