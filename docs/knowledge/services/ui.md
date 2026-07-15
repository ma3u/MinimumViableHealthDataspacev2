---
type: service
title: UI — Next.js 14 app router
description: Unified frontend — 16+ pages, 36+ API routes, 7 role personas, dual live/static operation.
resource: ui/, ACA app mvhd-ui, https://ehds.mabu.red
tags: [nextjs, react, port-3000]
timestamp: 2026-07-15T00:00:00Z
---

Dual mode: live (API routes → Neo4j/Keycloak) and static GitHub Pages export
(`NEXT_PUBLIC_STATIC_EXPORT=true`, API folder renamed by CI, mocks from
`ui/public/mock/` — see [mock-fixtures](../apis/mock-fixtures.md)). Chosen per
ADR-004. Auth: [keycloak](keycloak.md) via NextAuth (`ui/src/lib/auth.ts`).
RBAC role → nav-group table: `.claude/rules/api-conventions.md`.
Gates: tsc (tsconfig.build.json), ESLint ≤55 warnings, Vitest, Playwright.
