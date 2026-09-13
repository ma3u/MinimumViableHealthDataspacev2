---
type: api
title: Static-export mock fixtures
description: The JSON twin of every API route, served on GitHub Pages where API routes don't exist.
resource: ui/public/mock/, ui/src/lib/api.ts (STATIC_MOCK_MAP)
tags: [static-export, mocks, github-pages]
generated: { by: claude-code/fable-5, at: 2026-07-15T15:30:23Z }
verified: { by: human:ma3u, at: 2026-07-15T15:30:23Z }
status: stable
---

`fetchApi()` routes GETs to `/mock/*.json` when
`NEXT_PUBLIC_STATIC_EXPORT === "true"` and fakes `{ ok: true }` for mutations.
**Invariant:** mock shape must match the live API response exactly — the
J221–J260 static journeys assert on it. Registry: `STATIC_MOCK_MAP` in
`ui/src/lib/api.ts`; persona-specific variants use suffixed files
(`patient_profile_patient1.json`). Adding a route without a fixture breaks the
published github.io demo silently (CLAUDE.md gotcha #3).
