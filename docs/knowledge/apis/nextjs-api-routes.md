---
type: api
title: Next.js API routes contract
description: Conventions every route under ui/src/app/api/ follows, and their static-export twin.
resource: .claude/rules/api-conventions.md
tags: [nextjs, api, rbac]
generated: { by: claude-code/fable-5, at: 2026-07-15T15:30:23Z }
verified: { by: human:ma3u, at: 2026-07-15T15:30:23Z }
status: stable
---

Named `GET/POST/DELETE` exports returning `NextResponse.json`; errors always
`{ error: string }` (401 unauthenticated, 403 wrong role, 404, 502 backend).
Auth: `getServerSession(authOptions)` + role check from
`(session as { roles?: string[] }).roles`. `/api/admin/*` requires `EDC_ADMIN`.
Neo4j via parameterised `runQuery()` only. Every route has a mock twin:
[mock-fixtures](mock-fixtures.md). Full role table:
`.claude/rules/api-conventions.md`.
