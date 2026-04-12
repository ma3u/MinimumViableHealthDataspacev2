# ADR-013: SIMPL-Open EU Programme Alignment

**Status:** Accepted
**Date:** 2026-04-05

## Context

The [SIMPL-Open](https://simpl-programme.eu/) programme is the EU's open-source middleware for common European data spaces. It provides reference implementations for data space operations (catalog federation, contract management, trust anchoring) that EU-funded data spaces are expected to adopt. The EHDS is one of the priority data spaces under the European Data Strategy.

## Decision

Align the Health Dataspace reference implementation with SIMPL-Open architecture where applicable:

1. **DSP 2025-1 protocol** — Already implemented; SIMPL mandates DSP as the data exchange protocol
2. **DCP v1.0 credentials** — Already implemented; SIMPL uses DCP for trust establishment
3. **DID:web identifiers** — Already implemented; SIMPL recommends DID:web for participant identity
4. **DCAT-AP catalog federation** — Already implemented via HealthDCAT-AP (health-specific extension)
5. **ODRL policy enforcement** — Already implemented for EHDS Article 53 access control
6. **Gap: Gaia-X Trust Framework** — Not yet implemented; SIMPL may require Gaia-X compliance labels
7. **Gap: Data Space Connector certification** — SIMPL certification process not yet defined

## Alignment Assessment

| SIMPL Requirement       | Status       | Implementation                         |
| ----------------------- | ------------ | -------------------------------------- |
| DSP 2025-1              | ✅ Compliant | EDC-V control plane + TCK validation   |
| DCP v1.0                | ✅ Compliant | IdentityHub + IssuerService            |
| DID:web                 | ✅ Compliant | 5 participants with DID documents      |
| DCAT-AP federation      | ✅ Compliant | HealthDCAT-AP JSON-LD serialization    |
| ODRL policies           | ✅ Compliant | 14 EHDS policies across 5 participants |
| Gaia-X labels           | ⚠️ Gap       | Not yet required for EHDS pilot phase  |
| Connector certification | ⚠️ Gap       | SIMPL certification process TBD        |

## Consequences

### Positive

- Architecture already aligns with 5 of 7 SIMPL requirements
- Early adoption positions this implementation for SIMPL certification when available
- Demonstrates EHDS-specific extensions on top of generic SIMPL middleware

### Trade-offs

- SIMPL specifications are still evolving — some alignment may need revision
- Gaia-X integration adds complexity without immediate EHDS value
- Certification process undefined — cannot fully validate compliance yet

## References

- [SIMPL-Open Programme](https://simpl-programme.eu/)
- [Gap analysis](../simpl-ehds-gap-analysis.md)
- [European Data Strategy](https://digital-strategy.ec.europa.eu/en/policies/strategy-data)
