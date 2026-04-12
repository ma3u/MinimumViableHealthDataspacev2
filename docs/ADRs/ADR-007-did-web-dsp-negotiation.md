# ADR-007: DID:web Resolution and DSP Contract Negotiation

**Status:** Accepted
**Date:** 2026-07-08
**Supersedes:** —

## Context

The EHDS requires verifiable participant identity and standardized contract negotiation for health data exchange. The Dataspace Protocol (DSP) 2025-1 specification mandates decentralized identifiers for participants and a formal negotiation state machine for data sharing agreements. The reference implementation needed to prove end-to-end DSP negotiation with real DID resolution.

## Decision

Implement W3C DID:web identifiers and DSP 2025-1 contract negotiation:

- Each participant receives a `did:web` identifier served by their IdentityHub instance
- DID documents are resolvable via standard HTTPS (e.g., `did:web:alpha-klinik.de:participant`)
- DSP 2025-1 contract negotiation state machine implemented end-to-end
- Proven working with 3 FINALIZED contract agreements between fictional participants
- Verifiable Credentials issued via DCP v1.0 for membership attestation

## Consequences

### Positive

- Full end-to-end DSP negotiation proven working (REQUESTED → AGREED → VERIFIED → FINALIZED)
- DID:web provides decentralized identity without blockchain dependency
- Aligns with Simpl-Open and Gaia-X trust framework requirements
- 3 working contract agreements demonstrate production-readiness of the protocol

### Trade-offs

- DID documents use Docker-internal hostnames, requiring DNS configuration for external resolution
- DID:web relies on DNS/TLS security rather than cryptographic self-certification
- IdentityHub must be available for DID resolution (availability dependency)

## References

- [Full details in planning document](../planning-health-dataspace-v2.md)
- [Simpl-Open vs EHDS gap analysis](../ehds-simpl-open-gap-analysis.md)
- DID conventions: `did:web:<domain>:participant`
- Keycloak realm: `jad/keycloak-realm.json`
