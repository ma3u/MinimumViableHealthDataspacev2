# BSI C5 Gap Analysis — Minimum Viable Health Dataspace v2

**Standard**: BSI Cloud Computing Compliance Criteria Catalogue (C5:2020)
**Relevance**: EHDS Art. 50(6) requires HDAB-approved dataspaces to meet C5 or equivalent.
**Scope**: Demo/MVP assessment. Full production audit requires accredited C5 auditor.

---

## Status Legend

| Symbol | Meaning                           |
| ------ | --------------------------------- |
| ✅     | Implemented (demo)                |
| 🟡     | Partially implemented             |
| ⚠️     | Accepted risk for demo            |
| ❌     | Not applicable or not implemented |
| 🔵     | Production roadmap only           |

---

## C5 Control Domains

### OIS — Organisational and Information Security

| Control | Requirement          | Demo Status | Gap / Mitigation                              |
| ------- | -------------------- | ----------- | --------------------------------------------- |
| OIS-01  | IS policy documented | ✅          | This document + threat model                  |
| OIS-02  | IS roles assigned    | ⚠️          | Fictional personas only; no real CISO         |
| OIS-03  | Risk assessment      | ✅          | threat-model.md + STRIDE analysis             |
| OIS-04  | Asset inventory      | ✅          | Assets listed in threat model                 |
| OIS-05  | Supplier security    | ⚠️          | Neo4j, Keycloak, NATS — not formally assessed |

### CCM — Change Management

| Control | Requirement                | Demo Status | Gap / Mitigation                  |
| ------- | -------------------------- | ----------- | --------------------------------- |
| CCM-01  | Change process documented  | ✅          | Git workflow + PR reviews         |
| CCM-02  | Security review on changes | 🟡          | This phase adds security CI gates |
| CCM-03  | Rollback plan              | ✅          | Git revert + Docker image tags    |

### DEV — Development Security (most relevant for code)

| Control | Requirement                | Demo Status | Gap / Mitigation                             |
| ------- | -------------------------- | ----------- | -------------------------------------------- |
| DEV-01  | Secure coding guidelines   | ✅          | `.claude/rules/code-style.md`                |
| DEV-02  | Input validation           | ✅          | Parameterised Cypher queries                 |
| DEV-03  | Output encoding            | 🟡          | React auto-escapes; CSP added D2             |
| DEV-04  | Authentication enforcement | ✅          | NextAuth + Keycloak OIDC                     |
| DEV-05  | Dependency management      | ✅          | `npm audit --audit-level=high` in CI         |
| DEV-06  | Static analysis            | 🟡          | ESLint + TypeScript strict; no SAST tool yet |
| DEV-07  | No hardcoded credentials   | ✅          | Env vars only; parameterised queries         |
| DEV-08  | Secrets scanning           | ⚠️          | No `detect-secrets` or `gitleaks` in CI yet  |
| DEV-09  | Security testing           | ✅          | SEC-01–SEC-10 E2E tests (D3)                 |
| DEV-10  | Vulnerability disclosure   | ⚠️          | No SECURITY.md or CVD policy yet             |

### IAM — Identity and Access Management

| Control | Requirement                  | Demo Status | Gap / Mitigation                                                                                                              |
| ------- | ---------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------- |
| IAM-01  | Authentication required      | ✅          | All routes (UI + API) require session; pentest D6 added getServerSession guards to all /api/admin/_ and /api/patient/_ routes |
| IAM-02  | Role-based access control    | ✅          | 7 Keycloak roles + middleware                                                                                                 |
| IAM-03  | Least privilege              | 🟡          | Role matrix implemented; no fine-grained ABAC                                                                                 |
| IAM-04  | MFA for privileged accounts  | ⚠️          | Keycloak MFA not configured in demo                                                                                           |
| IAM-05  | Session management           | ✅          | NextAuth sessions + NEXTAUTH_SECRET                                                                                           |
| IAM-06  | Credential lifecycle         | ⚠️          | Demo credentials are static                                                                                                   |
| IAM-07  | Privileged access management | ⚠️          | Admin role via Keycloak only; no PAM system                                                                                   |

### COS — Communication Security

| Control | Requirement                   | Demo Status            | Gap / Mitigation                                       |
| ------- | ----------------------------- | ---------------------- | ------------------------------------------------------ |
| COS-01  | Encryption in transit         | ✅ (local) / 🔵 (prod) | HTTPS in production; HTTP localhost acceptable for dev |
| COS-02  | Strong TLS configuration      | ⚠️                     | Not validated; depends on reverse proxy                |
| COS-03  | Certificate management        | 🔵                     | Production only — cert rotation via Let's Encrypt      |
| COS-04  | Internal network segmentation | ⚠️                     | Docker network isolation only                          |

### DIP — Data Integrity and Protection

| Control | Requirement         | Demo Status | Gap / Mitigation                         |
| ------- | ------------------- | ----------- | ---------------------------------------- |
| DIP-01  | Data classification | ✅          | Threat model assets table                |
| DIP-02  | Encryption at rest  | ⚠️          | Neo4j data not encrypted at rest in demo |
| DIP-03  | Backup and recovery | ⚠️          | No backup for Neo4j volume in demo       |
| DIP-04  | Data minimisation   | ✅          | FHIR only returns requested fields       |
| DIP-05  | Audit logging       | ✅          | `DataAccessLog` nodes in Neo4j           |
| DIP-06  | Log integrity       | ⚠️          | Logs are mutable in Neo4j                |

### LOG — Logging and Monitoring

| Control | Requirement            | Demo Status | Gap / Mitigation                       |
| ------- | ---------------------- | ----------- | -------------------------------------- |
| LOG-01  | Security events logged | 🟡          | Access logs via Neo4j; no SIEM         |
| LOG-02  | Log retention          | ⚠️          | No retention policy; volume-based only |
| LOG-03  | Alerting on anomalies  | ❌          | No alerting in demo                    |
| LOG-04  | Log access control     | ⚠️          | Neo4j admin can modify logs            |

### INS — Incident Management

| Control | Requirement                      | Demo Status | Gap / Mitigation                       |
| ------- | -------------------------------- | ----------- | -------------------------------------- |
| INS-01  | Incident response plan           | ⚠️          | Not documented                         |
| INS-02  | Security incident classification | ⚠️          | Not defined                            |
| INS-03  | Breach notification process      | ⚠️          | GDPR Art. 33 requires 72h notification |

---

## Priority Gap Closure Plan

### Demo Phase (implement now)

| Priority | Control | Action                               | Issue                           |
| -------- | ------- | ------------------------------------ | ------------------------------- |
| P0       | DEV-07  | Parameterised Cypher (D1)            | ✅ Done — Phase 23              |
| P0       | DEV-03  | CSP + security headers (D2)          | ✅ Done — Phase 23              |
| P0       | DEV-09  | Security E2E tests (D3)              | ✅ Done — Phase 23              |
| P0       | DEV-05  | npm audit in CI (D4)                 | ✅ Done — Phase 23              |
| P1       | DEV-08  | Add `detect-secrets` pre-commit hook | GitHub #4 — D5                  |
| P1       | DEV-10  | Create SECURITY.md + CVD policy      | GitHub #4 — D8                  |
| P1       | IAM-01  | Verify all API routes check auth     | ✅ Done — Phase 24 (pentest D6) |

### Production Roadmap

| Priority | Control   | Action                                            |
| -------- | --------- | ------------------------------------------------- |
| P0       | COS-01/02 | TLS 1.3 + HSTS + cert rotation                    |
| P0       | IAM-04    | MFA for EDC_ADMIN + HDAB_AUTHORITY                |
| P0       | DIP-02    | Neo4j disk encryption                             |
| P1       | DEV-06    | SAST (CodeQL or Semgrep) in CI                    |
| P1       | DEV-08    | gitleaks in CI + pre-commit                       |
| P1       | LOG-01    | SIEM integration (OpenSearch / Loki)              |
| P1       | LOG-03    | Alerting on failed auth / anomalous access        |
| P2       | INS-01    | Incident response runbook                         |
| P2       | DIP-06    | Append-only audit log (Neo4j Enterprise or Kafka) |
| P2       | IAM-03    | ABAC via OPA policies                             |
| P2       | DSP       | DID-signed contract messages per DSP §5.3         |
| P2       | DCP       | VC signature + expiry + revocation checks         |

---

## EHDS Regulatory Mapping

| EHDS Article | Requirement                  | C5 Controls    | Demo Status           |
| ------------ | ---------------------------- | -------------- | --------------------- |
| Art. 3(1)    | Patient right to access data | IAM-01, IAM-03 | ✅ /patient/\* routes |
| Art. 6       | Data accuracy                | DIP-04, DIP-05 | 🟡                    |
| Art. 10      | Secondary use consent        | IAM-02, DIP-01 | ✅ ODRL policy nodes  |
| Art. 45      | HDAB approval required       | IAM-02         | ✅ HDABApproval nodes |
| Art. 50(6)   | C5 or equivalent required    | All domains    | 🟡 Demo partial       |
| Art. 51      | Audit trail                  | LOG-01, DIP-05 | 🟡                    |
| GDPR Art. 25 | Privacy by design            | DIP-04, IAM-03 | 🟡                    |
| GDPR Art. 32 | Technical security measures  | COS-01, DIP-02 | ⚠️                    |

---

_Last updated: 2026-03-28 | Phase 24 — Pentest + API Auth Fix (D6)_
_Next review: Before any production deployment or HDAB accreditation submission._
