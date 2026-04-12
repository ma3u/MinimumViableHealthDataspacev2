# ADR-009: IssuerService DCP Credential Issuance Fix

**Status:** Accepted
**Date:** 2026-07-12
**Supersedes:** —

## Context

DCP v1.0 credential issuance was failing: IdentityHub's IssuerService could not sign Verifiable Credentials because (a) the EdDSA key pair was not present at the expected Vault path, and (b) participant activation in the CFM database was incomplete. These two root causes meant that credential requests returned errors, blocking the full DSP negotiation flow that depends on valid membership credentials.

## Decision

Apply a two-part deterministic fix:

1. **Vault key alignment** — Mount a static EdDSA key pair at both the IssuerService and IdentityHub Vault paths, ensuring the same signing key is available to all services that need it.
2. **SQL participant fixup** — Run an idempotent SQL script against the CFM database to complete participant activation records that were partially written during initial bootstrap.

Result: 15/15 credential issuance requests succeed (all 5 participants x 3 credential types).

## Consequences

### Positive

- Deterministic initialization: bootstrap always produces working credential issuance
- 15/15 credentials delivered consistently across clean and re-bootstrapped environments
- Idempotent SQL fixup is safe to re-run without side effects
- Unblocks full DSP negotiation flow (ADR-007) which requires valid credentials

### Trade-offs

- Static key pair means all environments share the same signing key (acceptable for dev/demo, not production)
- Requires a service restart after the SQL fixup to pick up corrected participant state
- Root cause was in upstream CFM bootstrap logic — fix is a workaround, not an upstream patch

## References

- [Full details in planning document](../planning-health-dataspace-v2.md)
- Related: [ADR-007 — DID:web and DSP Negotiation](ADR-007-did-web-dsp-negotiation.md)
- Bootstrap script: `scripts/bootstrap-jad.sh`
- Vault configuration: `jad/` directory
