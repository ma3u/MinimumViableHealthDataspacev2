---
name: playwright-journey
description: Use when the user adds E2E tests, Playwright specs, or journey coverage.
---

# Playwright journey specs

Sources: `.claude/rules/testing.md`, `ui/__tests__/e2e/journeys/helpers.ts`,
`ui/playwright.config.ts`.

## Procedure

1. Find the next free spec number and `J` range in `ui/__tests__/e2e/journeys/`
   (ranges are reserved per area — see the Test ID table in `.claude/rules/testing.md`).
2. Use the shared helpers: `loginAs(page, user, pass)` for Keycloak flows,
   `setPersona(page, username)` for static-mode tests, `skipIfKeycloakDown()` /
   `skipIfNeo4jDown(page)` so specs self-skip instead of failing when backends
   are absent (every existing spec does this).
3. Assert on visible text, aria-labels, `data-testid` — never CSS class names.
4. Structure: arrange (persona/navigate) → act → assert.
5. Verify: `npx playwright test <spec> --project=chromium` (CI runs chromium only;
   `--project=live` targets the JAD stack at `PLAYWRIGHT_BASE_URL=http://localhost:3003`).

## Output contract

Spec lists cleanly (`--list`), self-skips without its backend, and its J numbers
don't collide with an existing range.
