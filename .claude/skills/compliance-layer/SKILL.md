---
name: compliance-layer
description: Use when the user works on EHDS articles, DSP protocol, DCP credentials, ODRL policies, or the audit trail.
---

# EHDS / DSP compliance layer

Sources: `docs/health-dataspace-graph-schema.md`, `.claude/rules/api-conventions.md`
(protocol table), `docs/architecture/federation.md` (privacy rules).

## Procedure

1. Reference the correct EHDS article, always the **adopted** number of Regulation
   (EU) 2025/327, never the 2022 proposal's (look it up in
   `docs/ehds-article-numbering.md`; there is no constant offset):
   - Primary use, Chapter II: Art. 3 access, 4 access services and proxies, 5 insert,
     6 rectification, 7 portability, 8 restrict access, 9 information on access,
     10 primary-use opt-out; Art. 23 MyHealth@EU.
   - Secondary use, Chapter IV: Art. 51 minimum categories, 53 purposes, 54 prohibited
     purposes, 55 and 57 access bodies and their tasks (57(1)(j) public register),
     58 information to natural persons, 59 activity report, 61 duties of users
     (61(4) results), 66 data minimisation and pseudonymisation (Trust Center),
     67 application, 68 permit, 69 data request, 71 opt-out from secondary use,
     72 trusted holder, 73 secure processing environment, 75 HealthData@EU,
     77 dataset description, 78 quality label.
   - Query and access logs (`:QueryAuditEvent`, `TransferEvent`): Art. 73(1)(e), kept
     at least one year (`ui/src/lib/retention.ts`, `docs/audit-retention-policy.md`).
2. Audit nodes are append-only: never delete `TransferEvent` or `QueryAuditEvent`.
3. Consent operations create `PatientConsent` nodes with `revoked: false` + timestamp.
4. ODRL policies on `DataProduct` nodes specify `permission`/`prohibition`/`obligation`
   (ODRL 2.2).
5. Federated queries enforce dual-side k-anonymity (`MIN_COHORT_SIZE`, default 5)
   and caller-side ODRL; rules and rationale in `docs/architecture/federation.md`.
6. After any compliance-layer change run `./scripts/run-ehds-tests.sh`
   (plus `run-ehds-dataspace-checks.sh` / `run-ehds-identity-checks.sh` when the protocol surface changed).

## Output contract

Cite the EHDS article in the code comment only when the code enforces it; keep
the audit trail immutable; compliance suites pass.
