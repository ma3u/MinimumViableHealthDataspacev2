---
description: Structured review of the current diff — findings by severity
argument-hint: "[--staged | --branch <ref>]"
allowed-tools: Bash(git diff:*), Bash(git status), Bash(git log:*), Read, Grep, Glob
---

## Context (auto-injected)

- Status: !`git status --short`
- Recent commits: !`git log --oneline -5`
- Diff under review: !`git diff HEAD`

## Task

Review the diff against the project rules (`.claude/rules/code-style.md`,
`.claude/rules/testing.md`, `.claude/rules/api-conventions.md`). Verify each
candidate finding against the actual file before reporting.

**Output findings grouped by severity, most severe first** — per finding give
`file:line`, a one-sentence defect, the concrete failure scenario, and a minimal fix:

1. **Bug** — TypeScript strict violations, bare `CREATE` in Cypher (must be `MERGE`),
   missing `set -euo pipefail` in bash, conditional React hooks.
2. **Regression** — behavior that worked before this diff and breaks after
   (check the touched tests and `ui/public/mock/` fixtures still match API shapes).
3. **Security** — hardcoded secrets, missing role guard in new API routes
   (`getServerSession` + role check — see `.claude/rules/api-conventions.md`),
   user input interpolated into Cypher (parameters only), real org/patient names
   outside the `NEXT_PUBLIC_DEMO_TK` gate, mutations of `TransferEvent` audit nodes.
4. **Missing test** — changed logic without a Vitest test in `ui/__tests__/unit/`
   (or `services/neo4j-proxy/__tests__/`), new journey without a Playwright spec.
5. **Missing doc** — new API route without a mock fixture, schema change not
   mirrored in `neo4j/init-schema.cypher`, architectural decision without an ADR.

Also flag static-export compatibility: new pages must guard
`NEXT_PUBLIC_STATIC_EXPORT` and use `fetchApi()` (source: CLAUDE.md gotcha #3).

End with a verdict: **merge-ready** or **needs-changes**, plus the pre-commit
reality check: Prettier will reformat, ESLint budget is ≤ 55 warnings.
