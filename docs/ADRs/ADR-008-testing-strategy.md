# ADR-008: Comprehensive Testing Strategy

**Status:** Accepted
**Date:** 2026-03-11
**Supersedes:** —

## Context

The health dataspace spans multiple layers (UI, API routes, Neo4j proxy, protocol compliance) and must be testable both with the full JAD stack running and as a static GitHub Pages export. A single testing framework cannot cover all these scenarios effectively. The strategy must support fast developer feedback loops while also validating end-to-end persona journeys.

## Decision

Adopt a three-tier testing strategy:

1. **Vitest** (unit/integration) — Fast, co-located tests for React components and API route logic. MSW (Mock Service Worker) intercepts API calls. Coverage targets: API routes 90%+, components 70%+.
2. **Playwright** (E2E browser) — Journey-based browser tests covering all 7 persona roles. Tests run against both the live stack (`localhost:3000`) and static export. 5 critical E2E paths defined (graph explorer, catalog browse, patient profile, compliance dashboard, role navigation).
3. **Supertest** (Neo4j proxy HTTP) — Integration tests for the Express proxy endpoints (`/fhir/Patient`, `/omop/cohort`, `/catalog/datasets`).

Additionally, custom TCK runners validate protocol compliance: DSP 2025-1, DCP v1.0, and EHDS domain rules.

## Consequences

### Positive

- Fast feedback: Vitest unit tests run in <5 seconds
- Comprehensive coverage across all application layers
- Playwright tests validate real user journeys across personas
- Protocol compliance tests catch spec violations early
- CI-friendly: all tiers run in GitHub Actions

### Trade-offs

- Three test frameworks to maintain and configure
- Playwright E2E tests require a running UI + Neo4j (or static build)
- Protocol TCK tests require the full JAD stack (19 services)
- Coverage thresholds are targets, not yet enforced in CI gates

## References

- [Full details in planning document](../planning-health-dataspace-v2.md)
- Vitest config: `ui/vitest.config.ts`
- Playwright config: `ui/playwright.config.ts`
- E2E journeys: `ui/__tests__/e2e/journeys/`
- Protocol runners: `scripts/run-dsp-tck.sh`, `scripts/run-dcp-tests.sh`
