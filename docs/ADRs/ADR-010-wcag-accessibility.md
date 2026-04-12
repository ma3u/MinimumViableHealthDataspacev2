# ADR-010: WCAG 2.2 AA Accessibility Compliance

**Status:** Accepted
**Date:** 2026-04-01

## Context

The EHDS regulation emphasizes digital inclusion. The UI must be accessible to users with disabilities, including those using assistive technologies. WCAG 2.2 Level AA is the EU standard (EN 301 549) for public-facing web applications.

## Decision

Implement WCAG 2.2 AA compliance across all UI pages with automated enforcement:

1. **Axe-core integration** in Playwright E2E tests — every page is scanned for WCAG violations
2. **Zero-violation gate** — CI fails if any AA-level violation is detected
3. **Semantic HTML** — all interactive elements use proper ARIA roles, labels, and landmarks
4. **Keyboard navigation** — full functionality without mouse, visible focus indicators
5. **Color contrast** — minimum 4.5:1 for normal text, 3:1 for large text (dark theme)
6. **Screen reader** — meaningful alt text, live regions for dynamic updates

## Implementation

- Playwright spec `27-wcag-accessibility.spec.ts` scans all 22 routes with @axe-core/playwright
- CI runs WCAG audit as separate step in both local and Azure deployment pipelines
- Lighthouse accessibility score target: 95+

## Consequences

### Positive

- EN 301 549 compliance for EU public sector accessibility directive
- Inclusive design for all EHDS participants regardless of ability
- Automated enforcement prevents regression

### Trade-offs

- Dark-first theme required careful contrast tuning for all status colors
- Some third-party components (react-force-graph-2d) have limited accessibility — documented as known limitations

## References

- [WCAG 2.2 specification](https://www.w3.org/TR/WCAG22/)
- [EN 301 549 v3.2.1](https://www.etsi.org/deliver/etsi_en/301500_301599/301549/)
- Playwright spec: `ui/__tests__/e2e/journeys/27-wcag-accessibility.spec.ts`
