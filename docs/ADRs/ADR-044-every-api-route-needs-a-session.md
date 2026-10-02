# ADR-044: Every API route needs a session

**Status:** Accepted (2026-10-02, decided by Matthias in #404)
**Date:** 2026-10-02
**Relates to:** [ADR-020](ADR-020-cross-participant-dataset-discovery.md), [ADR-031](ADR-031-checks-must-assert.md), [ADR-032](ADR-032-persona-organised-api-collection.md)
**Tracks:** [#404](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/404)

## Context

Middleware skips `/api/*`, so each route is its own gate. Until this ADR
some routes answered without a session on purpose, each with a reason in
its header comment:

- `/api/permits`, `/api/information`, `/api/activity-report` and
  `GET /api/compliance/results`: the access body's register of permits, its
  information duty, its activity report and its register of results, which
  Regulation (EU) 2025/327 (Art. 57(1)(j), 58(1), 59(1), 73) wants published.
- `/api/graph`: the demo landing view, synthetic data only.
- `/api/nlq/backend`: provider and index names, left open in #377 because an
  e2e spec probed it anonymously.

The rules file claimed only two routes were open. A check of every handler
during #404 found these six plus the sign-in routes, the health probe and
the demo DSP catalogue. Asked whether the six were intended, Matthias
decided: every route needs a login.

## Decision

Every API route needs a session, enforced by `requireAuth()` in every
handler. The six routes above now answer any signed-in participant and
refuse an anonymous caller with `401 { error: "Unauthorized" }`. Their pages
(`/graph`, `/permits`, `/information`, `/activity-report`) join
`PROTECTED_PATHS`, so an anonymous visitor is sent to sign in.

The only routes that answer without a session are the ones a session
cannot precede, and one machine caller:

| Route                                           | Why it stays open                                                                                               |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `/api/auth/[...nextauth]`                       | signing in itself                                                                                               |
| `/api/auth/eudi/start`, `/api/auth/eudi/status` | the EUDI wallet sign-in, before a session exists                                                                |
| `/api/keycloak-config`                          | tells the sign-in banner where Keycloak is                                                                      |
| `/api/health`                                   | liveness and readiness probe; gating it would restart the UI in a loop                                          |
| `/api/mock-dsp/[participant]/catalog/request`   | **open:** the catalog crawler POSTs to it with no session (ADR-020); gating it needs a machine credential first |

## Consequences

- The access body's publications are no longer reachable without an account.
  The regulation asks for them to be published; this deployment now shows
  them to signed-in participants only. The static GitHub Pages build still
  shows them from fixtures, since it has no login.
- `ui/__tests__/unit/api/every-route-needs-a-session.test.ts` checks every
  handler (not every file) for `requireAuth()` against the table above, and
  calls the six newly gated routes with no session. A new anonymous route
  fails it; adding one means superseding this ADR.
- `bruno/MVHDv2/09 Access control/19` to `/24` assert the six 401s. The
  requests that read those routes now use the collection's default session.
- `33-graphrag-nlp.spec.ts` forges a session from `NEXTAUTH_SECRET` for its
  backend probe, asserts the anonymous 401 (J609), and fails rather than
  skips when its session is refused (ADR-031).
- The demo DSP route stays open until the crawler has a credential. The
  options are a bearer token the crawler gets from Key Vault (ADR-036) or a
  DCP token as a real DSP connector would send (ADR-007).

## Alternatives considered

- **Keep the regulatory publications public.** Rejected by the decision in
  #404.
- **Gate the sign-in routes and the health probe too.** Not possible: a
  visitor needs them before a session exists, and the platform needs the
  probe to keep the container running.
