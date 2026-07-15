---
name: compliance-layer
description: Use when the user works on EHDS articles, DSP protocol, DCP credentials, ODRL policies, or the audit trail.
---

# EHDS / DSP compliance layer

Sources: `docs/health-dataspace-graph-schema.md`, `.claude/rules/api-conventions.md`
(protocol table), `docs/architecture/federation.md` (privacy rules).

## Procedure

1. Reference the correct EHDS article for patient-data features:
   Art. 3–12 primary use (patient portal) · Art. 50–51 secondary use (research,
   Trust Center, pseudonymisation) · Art. 53 query transparency (`:QueryAuditEvent`).
2. Audit nodes are append-only: never delete `TransferEvent` or `QueryAuditEvent`.
3. Consent operations create `PatientConsent` nodes with `revoked: false` + timestamp.
4. ODRL policies on `DataProduct` nodes specify `permission`/`prohibition`/`obligation`
   (ODRL 2.2).
5. Federated queries enforce dual-side k-anonymity (`MIN_COHORT_SIZE`, default 5)
   and caller-side ODRL — rules and rationale in `docs/architecture/federation.md`.
6. After any compliance-layer change run `./scripts/run-ehds-tests.sh`
   (plus `run-dsp-tck.sh` / `run-dcp-tests.sh` when the protocol surface changed).

## Output contract

Cite the EHDS article in the code comment only when the code enforces it; keep
the audit trail immutable; compliance suites pass.
