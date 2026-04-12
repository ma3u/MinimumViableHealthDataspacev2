# ADR-011: Security Penetration Testing Strategy

**Status:** Accepted
**Date:** 2026-04-01

## Context

Health data is among the most sensitive personal data categories (GDPR Article 9). The EHDS infrastructure must be resilient against common web vulnerabilities (OWASP Top 10) and health-domain-specific threats. Manual penetration testing is expensive and infrequent; automated security testing provides continuous assurance.

## Decision

Implement automated security testing as part of the CI/CD pipeline:

1. **Playwright security spec** (`28-security-pentest.spec.ts`) — 50 automated security checks covering:
   - HTTP security headers (CSP, HSTS, X-Frame-Options, etc.)
   - Authentication boundary enforcement (401/403 for protected routes)
   - Session management (cookie flags, token expiration)
   - Input validation (XSS, SQL injection, path traversal)
   - Information leakage (error messages, stack traces, server headers)
   - CORS configuration validation
2. **Trivy container scanning** — CVE detection in Docker images (CI gate)
3. **Gitleaks** — secret detection in source code (pre-commit + CI)
4. **Dependency audit** — `npm audit` in CI pipeline
5. **BSI IT-Grundschutz** alignment for health infrastructure baseline

## Implementation

- Security tests run in CI against both local and Azure deployments
- Aggressive tests (SEC-41 to SEC-50) excluded from Azure runs to avoid triggering WAF
- Trivy findings at CRITICAL/HIGH severity block deployment
- Gitleaks uses `.gitleaks.toml` allowlist for dev-only secrets

## Consequences

### Positive

- Continuous security assurance without manual pen testing
- OWASP Top 10 coverage automated in every deployment
- Early detection of security regressions

### Trade-offs

- Automated tests cannot replace human penetration testers for business logic flaws
- Some security headers (CSP) require ongoing tuning as new features are added
- False positives in Trivy/Gitleaks require maintenance of allowlists

## References

- [OWASP Top 10 (2021)](https://owasp.org/Top10/)
- [BSI IT-Grundschutz](https://www.bsi.bund.de/EN/Themen/Unternehmen-und-Organisationen/Standards-und-Zertifizierung/IT-Grundschutz/it-grundschutz_node.html)
- Playwright spec: `ui/__tests__/e2e/journeys/28-security-pentest.spec.ts`
