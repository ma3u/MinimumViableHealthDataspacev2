---
name: static-export
description: Use when the user works on demo personas, localStorage persistence, or GitHub Pages static-export behaviour.
---

# Static export & demo personas

Sources: `ui/src/lib/use-demo-persona.ts`, `ui/src/lib/auth.ts` (`DEMO_PERSONAS`),
`.github/instructions/code-style.instructions.md` (static export guards), AGENTS.md gotcha 3 (static export has no API routes).

## Procedure

1. `IS_STATIC = process.env.NEXT_PUBLIC_STATIC_EXPORT === "true"` as a module-top
   constant; in static mode `fetchApi()` serves `/mock/*.json` for GET and a
   synthetic `{ ok: true }` for mutations.
2. Persona-aware components call `useDemoPersona()` **unconditionally** (hooks rule).
3. New nav items: role filter in `ui/src/components/Navigation.tsx` nav groups.
4. Persona-differentiated mock data uses query-suffixed fixtures
   (e.g. `patient_profile_patient1.json` for `?patientId=P1`).
5. E2E coverage in `ui/__tests__/e2e/journeys/19-static-github-pages.spec.ts`
   via the `setPersona(page, username)` localStorage helper — never mock
   `next-auth/react` in E2E (`.github/instructions/testing.instructions.md`).

## Output contract

Page works in BOTH modes: live (API route) and static (mock fixture). If it only
works in one, the task is not done.

---

Mirror of `.claude/skills/static-export/SKILL.md` (Claude Code). Change both together.
