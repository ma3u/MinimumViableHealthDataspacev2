# Test Report — Health Dataspace v2

> Auto-generated test summary. Run `scripts/generate-test-report.sh` to regenerate.

## Integration Test Summary

| Suite               | Total | Passed | Failed | Skipped | Pass Rate |
| ------------------- | ----: | -----: | -----: | ------: | --------: |
| DSP 2025-1 TCK      |    33 |     28 |      0 |       5 |     84.8% |
| DCP v1.0 Compliance |    22 |     20 |      0 |       2 |     90.9% |
| EHDS Health-Domain  |    25 |     16 |      4 |       5 |     64.0% |

## DSP 2025-1 Technology Compatibility Kit

**Suite:** DSP 2025-1 TCK
**Run:** 2026-03-14T15:33:53Z
**Source:** `dsp-tck-20260314T163351.json`

| Metric    | Value |
| --------- | ----- |
| Total     | 33    |
| Passed    | 28 ✅ |
| Failed    | 0 ✅  |
| Skipped   | 5 ⏭️  |
| Pass rate | 84.8% |

<details>
<summary>Individual test results</summary>

| Test ID                | Category    | Status     | Detail         |
| ---------------------- | ----------- | ---------- | -------------- |
| CAT-1.1-alpha-klinik   | catalog     | ✅ passed  |                |
| CAT-1.1-pharmaco       | catalog     | ✅ passed  |                |
| CAT-1.1-medreg         | catalog     | ✅ passed  |                |
| CAT-1.2                | catalog     | ✅ passed  |                |
| CAT-1.3                | catalog     | ✅ passed  |                |
| CAT-1.4                | catalog     | ⏭️ skipped | empty response |
| CAT-1.5                | catalog     | ✅ passed  |                |
| ASSET-2.1-alpha-klinik | asset       | ✅ passed  | 2 assets       |
| ASSET-2.1-pharmaco     | asset       | ✅ passed  | 2 assets       |
| ASSET-2.1-medreg       | asset       | ✅ passed  | 1 assets       |
| ASSET-2.2              | asset       | ✅ passed  |                |
| NEG-3.1-alpha-klinik   | negotiation | ✅ passed  | 0 negotiations |
| NEG-3.1-pharmaco       | negotiation | ✅ passed  | 0 negotiations |
| NEG-3.1-medreg         | negotiation | ✅ passed  | 0 negotiations |
| NEG-3.2                | negotiation | ⏭️ skipped |                |
| NEG-3.3                | negotiation | ⏭️ skipped |                |
| NEG-3.4                | negotiation | ✅ passed  | HTTP 404       |
| XFER-4.1-alpha-klinik  | transfer    | ✅ passed  | 0 transfers    |
| XFER-4.1-pharmaco      | transfer    | ✅ passed  | 0 transfers    |
| XFER-4.1-medreg        | transfer    | ✅ passed  | 0 transfers    |
| XFER-4.2               | transfer    | ⏭️ skipped |                |
| XFER-4.3               | transfer    | ⏭️ skipped |                |
| POL-5.1-alpha-klinik   | policy      | ✅ passed  | 1 policies     |
| POL-5.1-pharmaco       | policy      | ✅ passed  | 1 policies     |
| POL-5.1-medreg         | policy      | ✅ passed  | 1 policies     |
| POL-5.2                | policy      | ✅ passed  |                |
| CDEF-6.1-alpha-klinik  | contractdef | ✅ passed  | 2 definitions  |
| CDEF-6.1-pharmaco      | contractdef | ✅ passed  | 2 definitions  |
| CDEF-6.1-medreg        | contractdef | ✅ passed  | 1 definitions  |
| SCHEMA-7.1             | schema      | ✅ passed  |                |
| SCHEMA-7.2             | schema      | ✅ passed  |                |
| SCHEMA-7.3             | schema      | ✅ passed  |                |
| SCHEMA-7.4             | schema      | ✅ passed  | HTTP 400       |

</details>

## DCP v1.0 Compliance Tests

**Suite:** DCP v1.0 Compliance
**Run:** 2026-03-14T15:37:11Z
**Source:** `dcp-compliance-20260314T163710.json`

| Metric    | Value |
| --------- | ----- |
| Total     | 22    |
| Passed    | 20 ✅ |
| Failed    | 0 ✅  |
| Skipped   | 2 ⏭️  |
| Pass rate | 90.9% |

<details>
<summary>Individual test results</summary>

| Test ID              | Category   | Status     | Detail                                                                                                                                      |
| -------------------- | ---------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| DID-1.1-alpha-klinik | did        | ✅ passed  |                                                                                                                                             |
| DID-1.1-pharmaco     | did        | ✅ passed  |                                                                                                                                             |
| DID-1.1-medreg       | did        | ✅ passed  |                                                                                                                                             |
| DID-1.2              | did        | ✅ passed  | 9 participants                                                                                                                              |
| DID-1.3              | did        | ✅ passed  | 9 did:web                                                                                                                                   |
| KEY-2.1-alpha-klinik | keypair    | ✅ passed  | 1 keypairs                                                                                                                                  |
| KEY-2.1-pharmaco     | keypair    | ✅ passed  | 1 keypairs                                                                                                                                  |
| KEY-2.1-medreg       | keypair    | ✅ passed  | 1 keypairs                                                                                                                                  |
| KEY-2.2              | keypair    | ⏭️ skipped | states: 200                                                                                                                                 |
| KEY-2.3              | keypair    | ✅ passed  | algorithm unknown                                                                                                                           |
| VC-3.1-alpha-klinik  | credential | ✅ passed  | 2 VCs                                                                                                                                       |
| VC-3.1-pharmaco      | credential | ✅ passed  | 3 VCs                                                                                                                                       |
| VC-3.1-medreg        | credential | ✅ passed  | 2 VCs                                                                                                                                       |
| VC-3.2               | credential | ✅ passed  | types: MembershipCredential, VerifiableCredential                                                                                           |
| VC-3.3               | credential | ✅ passed  |                                                                                                                                             |
| ISS-4.1              | issuer     | ✅ passed  |                                                                                                                                             |
| ISS-4.2              | issuer     | ✅ passed  | 5 definitions                                                                                                                               |
| ISS-4.3              | issuer     | ✅ passed  | types: DataProcessingPurposeCredential, DataQualityLabelCredential, EHDSParticipantCredential, ManufacturerCredential, MembershipCredential |
| ISS-4.4              | issuer     | ⏭️ skipped |                                                                                                                                             |
| SCOPE-5.1            | scope      | ✅ passed  | 19 scopes                                                                                                                                   |
| SCOPE-5.2            | scope      | ✅ passed  |                                                                                                                                             |
| SCOPE-5.3            | scope      | ✅ passed  |                                                                                                                                             |

</details>

## EHDS Health-Domain Compliance Tests

**Suite:** EHDS Health-Domain Compliance
**Run:** 2026-03-14T15:37:19Z
**Source:** `ehds-compliance-20260314T163717.json`

| Metric    | Value |
| --------- | ----- |
| Total     | 25    |
| Passed    | 16 ✅ |
| Failed    | 4 ❌  |
| Skipped   | 5 ⏭️  |
| Pass rate | 64.0% |

<details>
<summary>Individual test results</summary>

| Test ID   | Category     | Status     | Detail                                                                     |
| --------- | ------------ | ---------- | -------------------------------------------------------------------------- |
| ART53-1.1 | article53    | ✅ passed  |                                                                            |
| ART53-1.2 | article53    | ✅ passed  | 2 approvals, articles: EHDS_Art_53                                         |
| ART53-1.3 | article53    | ✅ passed  | 2 links                                                                    |
| ART53-1.4 | article53    | ❌ failed  |                                                                            |
| HDCAT-2.1 | healthdcatap | ✅ passed  | 5 datasets                                                                 |
| HDCAT-2.2 | healthdcatap | ✅ passed  | 2 with mandatory props                                                     |
| HDCAT-2.3 | healthdcatap | ⏭️ skipped |                                                                            |
| HDCAT-2.4 | healthdcatap | ✅ passed  | 5 distributions                                                            |
| HDCAT-2.5 | healthdcatap | ⏭️ skipped |                                                                            |
| EEHR-3.1  | eehrxf       | ✅ passed  | 12 profiles                                                                |
| EEHR-3.2  | eehrxf       | ✅ passed  | 6 categories                                                               |
| EEHR-3.3  | eehrxf       | ❌ failed  |                                                                            |
| EEHR-3.4  | eehrxf       | ⏭️ skipped |                                                                            |
| OMOP-4.1  | omop         | ✅ passed  | 167 persons                                                                |
| OMOP-4.2  | omop         | ✅ passed  | 167/167 mapped (100.0%)                                                    |
| OMOP-4.3  | omop         | ❌ failed  |                                                                            |
| OMOP-4.4  | omop         | ⏭️ skipped |                                                                            |
| OMOP-4.5  | omop         | ✅ passed  | 34203 measurements                                                         |
| OMOP-4.6  | omop         | ⏭️ skipped |                                                                            |
| OMOP-4.7  | omop         | ❌ failed  | 100 orphans                                                                |
| OMOP-4.8  | omop         | ✅ passed  |                                                                            |
| GRAPH-5.1 | graph        | ✅ passed  | DataProduct=2 HealthDataset=5 Patient=167 OMOPPerson=167 SnomedConcept=364 |
| GRAPH-5.2 | graph        | ✅ passed  | 113622 nodes                                                               |
| GRAPH-5.3 | graph        | ✅ passed  | 265372 relationships                                                       |
| GRAPH-5.4 | graph        | ✅ passed  | 4 VCs                                                                      |

</details>

## Unit & API Tests (Vitest)

| Metric       | Value                         |
| ------------ | ----------------------------- |
| Tests passed | 275                           |
| Tests failed | 15                            |
| Summary      | 15 failed \| 275 passed (290) |

### Coverage (v8)

```

```

## E2E Tests (Playwright)

| Metric       | Value     |
| ------------ | --------- |
| Spec files   | 6         |
| Tests passed | 70 passed |
| Tests failed | 0 failed  |

**HTML Report with Screenshots:** After running E2E tests, open the interactive report:

```bash
open ui/playwright-report/index.html    # macOS
npx playwright show-report              # cross-platform
```

Every test captures a screenshot automatically. Retried tests include traces and video recordings.
The HTML report is also uploaded as a GitHub Actions artifact on CI runs.

## Test Inventory

### Unit & API Tests

| File                                                | Type |
| --------------------------------------------------- | ---- |
| `__tests__/api/admin-policies.test.ts`              | api  |
| `__tests__/api/admin-tenants.test.ts`               | api  |
| `__tests__/api/analytics.test.ts`                   | api  |
| `__tests__/api/assets.test.ts`                      | api  |
| `__tests__/api/catalog.test.ts`                     | api  |
| `__tests__/api/compliance-tck.test.ts`              | api  |
| `__tests__/api/compliance.test.ts`                  | api  |
| `__tests__/api/credentials-request.test.ts`         | api  |
| `__tests__/api/credentials.test.ts`                 | api  |
| `__tests__/api/eehrxf.test.ts`                      | api  |
| `__tests__/api/federated-nlq.test.ts`               | api  |
| `__tests__/api/graph.test.ts`                       | api  |
| `__tests__/api/negotiations-id.test.ts`             | api  |
| `__tests__/api/negotiations.test.ts`                | api  |
| `__tests__/api/participants-me.test.ts`             | api  |
| `__tests__/api/participants.test.ts`                | api  |
| `__tests__/api/patient.test.ts`                     | api  |
| `__tests__/api/transfers-id.test.ts`                | api  |
| `__tests__/api/transfers.test.ts`                   | api  |
| `__tests__/unit/components/AuthProvider.test.tsx`   | unit |
| `__tests__/unit/components/MermaidDiagram.test.tsx` | unit |
| `__tests__/unit/components/Navigation.test.tsx`     | unit |
| `__tests__/unit/components/UserMenu.test.tsx`       | unit |
| `__tests__/unit/lib/api.test.ts`                    | unit |
| `__tests__/unit/lib/auth.test.ts`                   | unit |
| `__tests__/unit/lib/edc-client.test.ts`             | unit |
| `__tests__/unit/lib/edc-index.test.ts`              | unit |
| `__tests__/unit/lib/keycloak-realm.test.ts`         | unit |
| `__tests__/unit/lib/neo4j.test.ts`                  | unit |
| `__tests__/unit/pages/auth-query-pages.test.tsx`    | unit |
| `__tests__/unit/pages/docs-pages.test.tsx`          | unit |
| `__tests__/unit/pages/exchange-pages.test.tsx`      | unit |
| `__tests__/unit/pages/explore-pages.test.tsx`       | unit |
| `__tests__/unit/pages/governance-pages.test.tsx`    | unit |
| `__tests__/unit/pages/home.test.tsx`                | unit |
| `__tests__/unit/pages/portal-pages.test.tsx`        | unit |
| `__tests__/unit/pages/signin-errors.test.tsx`       | unit |

### E2E Tests

| File                                   |
| -------------------------------------- |
| `__tests__/e2e/auth.spec.ts`           |
| `__tests__/e2e/browser-errors.spec.ts` |
| `__tests__/e2e/docs.spec.ts`           |
| `__tests__/e2e/navigation.spec.ts`     |
| `__tests__/e2e/pages.spec.ts`          |
| `__tests__/e2e/smoke.spec.ts`          |

---

_Generated: 2026-03-14 15:42:50 UTC_
