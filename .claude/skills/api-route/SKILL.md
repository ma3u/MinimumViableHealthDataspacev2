---
name: api-route
description: Use when the user adds or modifies a Next.js API route under ui/src/app/api/.
---

# Next.js API routes

Sources: `.claude/rules/api-conventions.md`, `ui/src/lib/api.ts`, CLAUDE.md gotcha #3.

## Procedure

1. Read an existing route in the same domain for the pattern (named `GET`/`POST`/
   `DELETE` exports, `NextResponse.json`, `{ error: string }` error shape).
2. Auth: `getServerSession(authOptions)` + explicit role check
   (roles from `(session as { roles?: string[] }).roles ?? []`).
3. Neo4j access via `runQuery()` from `@/lib/neo4j` — parameterised Cypher only.
4. **Static-export fallback is mandatory:** create `ui/public/mock/<name>.json`
   matching the live response shape exactly, and register it in the
   `STATIC_MOCK_MAP` in `ui/src/lib/api.ts`.
5. Vitest unit test in `ui/__tests__/unit/api/` — mock `@/lib/neo4j` (see
   `admin-participants-route.test.ts` for the current pattern); the global setup
   already mocks `getServerSession` as EDC_ADMIN.
6. Verify: `npx tsc --noEmit -p tsconfig.build.json` and the targeted vitest file.

## Output contract

Route file + mock fixture + STATIC_MOCK_MAP entry + unit test — all four, always.
