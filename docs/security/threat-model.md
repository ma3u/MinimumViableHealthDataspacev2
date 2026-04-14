# Threat Model — EHDS Integration Hub

**STRIDE analysis for the demo/MVP phase.**
Scope: UI (Next.js), Neo4j graph, DSP 2025-1 contract flow, DCP v1.0 credential exchange.

---

## System Context

```
Browser ──HTTPS──► Next.js UI ──bolt/HTTP──► Neo4j 5
                        │
                        ├─ /api/admin/*   (EDC_ADMIN only)
                        ├─ /api/patient/* (PATIENT only)
                        └─ /api/*         (authenticated)
                        │
              Keycloak 24 (OIDC)
              └─ realm: edcv  (7 personas)

DSP flow:  ConsumerEDC ──HTTP──► ProviderEDC
DCP flow:  Wallet ──HTTP──► CredentialService ──► TrustCenter
```

---

## Assets

| Asset                  | Sensitivity | Notes                                 |
| ---------------------- | ----------- | ------------------------------------- |
| Patient FHIR records   | HIGH        | Synthetic in demo; real in production |
| Neo4j credentials      | HIGH        | Hardcoded defaults in dev only        |
| Keycloak client secret | HIGH        | `KEYCLOAK_SECRET` env var             |
| NEXTAUTH_SECRET        | HIGH        | JWT signing key                       |
| Verifiable Credentials | MEDIUM      | Participant DIDs + attestations       |
| Contract / policy data | MEDIUM      | ODRL policies, transfer agreements    |
| Audit log              | MEDIUM      | Access provenance records             |
| Graph topology         | LOW         | Schema is public documentation        |

---

## STRIDE Analysis

### Spoofing

| ID   | Threat                      | Component          | Demo Mitigation              | Production Mitigation                 |
| ---- | --------------------------- | ------------------ | ---------------------------- | ------------------------------------- |
| S-01 | Impersonate participant DID | DSP negotiation    | DID:web anchored to domain   | DNSSEC + DID rotation policy          |
| S-02 | Forge JWT session           | Next.js API routes | `NEXTAUTH_SECRET` required   | Short-lived tokens + refresh rotation |
| S-03 | Replay VC presentation      | DCP exchange       | Presentation timestamp check | Nonce-based challenge-response        |
| S-04 | Keycloak realm takeover     | Keycloak           | Admin credentials restricted | Separate realm per env + MFA on admin |

### Tampering

| ID   | Threat                             | Component           | Demo Mitigation                         | Production Mitigation              |
| ---- | ---------------------------------- | ------------------- | --------------------------------------- | ---------------------------------- |
| T-01 | Cypher injection via audit filters | `/api/admin/audit`  | **✅ Parameterised queries (D1)**       | Same + WAF                         |
| T-02 | Modify contract terms in transit   | DSP HTTP            | HTTPS only (TLS 1.2+)                   | mTLS between EDC connectors        |
| T-03 | Tamper with VC claims              | DCP                 | VC signature verified                   | Hardware HSM for issuer key        |
| T-04 | CSRF on state-changing API calls   | Next.js POST routes | SameSite=Lax cookies (NextAuth default) | CSRF tokens on sensitive mutations |

### Repudiation

| ID   | Threat                      | Component       | Demo Mitigation                        | Production Mitigation                 |
| ---- | --------------------------- | --------------- | -------------------------------------- | ------------------------------------- |
| R-01 | Deny data transfer occurred | Neo4j audit log | `DataTransfer` + `DataAccessLog` nodes | Append-only log + digital signature   |
| R-02 | Deny contract acceptance    | DSP             | Contract node with timestamp + DID     | Countersigned contract hash on ledger |

### Information Disclosure

| ID   | Threat                      | Component   | Demo Mitigation                   | Production Mitigation        |
| ---- | --------------------------- | ----------- | --------------------------------- | ---------------------------- |
| I-01 | Patient data via unauth API | Next.js API | Role checks + middleware redirect | Same + network segmentation  |
| I-02 | Neo4j password in browser   | Next.js     | Server-side only env vars         | Vault + Kubernetes secrets   |
| I-03 | JWT in localStorage         | Browser     | **✅ Not stored (SEC-07 test)**   | HttpOnly cookie              |
| I-04 | XSS exfiltrates session     | Browser     | **✅ CSP header (D2)**            | Nonce-based CSP + SRI        |
| I-05 | Neo4j browser exposed       | Neo4j port  | Docker internal network           | No public exposure, VPN only |
| I-06 | Clickjacking                | Browser     | **✅ X-Frame-Options: DENY (D2)** | Same                         |

### Denial of Service

| ID   | Threat                   | Component          | Demo Mitigation           | Production Mitigation              |
| ---- | ------------------------ | ------------------ | ------------------------- | ---------------------------------- |
| D-01 | Unbounded Cypher queries | `/api/admin/audit` | `LIMIT $limit` (max 200)  | Rate limiting + query timeout      |
| D-02 | EDC flood via DSP        | ProviderEDC        | Demo has no rate limiting | EDC rate limiter + circuit breaker |
| D-03 | Large FHIR bundle        | neo4j-proxy        | Response size not capped  | Stream response + pagination       |

### Elevation of Privilege

| ID   | Threat                          | Component | Demo Mitigation                        | Production Mitigation                    |
| ---- | ------------------------------- | --------- | -------------------------------------- | ---------------------------------------- |
| E-01 | PATIENT accesses admin API      | Next.js   | Role check in `/api/admin/*` handlers  | Same + separate service account          |
| E-02 | DATA_USER reads PATIENT records | Next.js   | `/patient/*` middleware guards         | Attribute-based access control           |
| E-03 | Keycloak role injection         | JWT       | Roles mapped from Keycloak claims only | Claim whitelist + role schema validation |

---

## DSP 2025-1 Protocol Risks

| Risk   | Description                         | Demo Status                   | Mitigation                             |
| ------ | ----------------------------------- | ----------------------------- | -------------------------------------- | -------------------------------------- |
| DSP-01 | Unsigned ContractAgreement messages | Consumer can forge acceptance | ⚠️ Not implemented                     | DID-signed messages per spec §5.3      |
| DSP-02 | No state machine enforcement        | STARTED→FINALIZED jump        | ⚠️ State stored in Neo4j, not enforced | Add state machine guard in ProviderEDC |
| DSP-03 | Transfer without active contract    | No contract reference check   | ⚠️ Seeded data assumes valid contracts | Validate `contractId` on each transfer |
| DSP-04 | Replay of transfer request          | Same `transferId` reused      | ⚠️ No nonce tracking                   | Idempotency key + TTL cache            |

---

## DCP v1.0 Protocol Risks

| Risk   | Description                | Demo Status                    | Mitigation                        |
| ------ | -------------------------- | ------------------------------ | --------------------------------- | ---------------------------------------- |
| DCP-01 | Unsigned VC presentation   | Forged participant attestation | ⚠️ Signature not verified in demo | Implement VC verification in TrustCenter |
| DCP-02 | Expired VC accepted        | `expirationDate` not checked   | ⚠️ Not checked                    | Add expiry check to `/api/credentials`   |
| DCP-03 | Revoked VC accepted        | No revocation list check       | ⚠️ Not implemented                | StatusList2021 or OCSP-style revocation  |
| DCP-04 | Credential schema mismatch | Wrong VC type accepted         | ⚠️ Type not validated             | Schema registry + type assertion         |

---

## Demo Phase Risk Register

| ID        | Risk                       | Likelihood           | Impact | Treatment             |
| --------- | -------------------------- | -------------------- | ------ | --------------------- |
| R-HIGH-01 | Cypher injection via audit | Low (fixed D1)       | HIGH   | ✅ Fixed              |
| R-HIGH-02 | Secrets in page HTML       | Low                  | HIGH   | ✅ SEC-10 test guards |
| R-MED-01  | Missing security headers   | Medium (was missing) | MEDIUM | ✅ Fixed D2           |
| R-MED-02  | Unsigned DSP messages      | High                 | MEDIUM | ⚠️ Accepted for demo  |
| R-MED-03  | VC signature not verified  | High                 | MEDIUM | ⚠️ Accepted for demo  |
| R-LOW-01  | No rate limiting on APIs   | High                 | LOW    | ⚠️ Accepted for demo  |

---

_Last updated: 2026-03-28 | Phase 23 — Demo Security Hardening_
