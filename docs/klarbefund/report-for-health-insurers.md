# Klarbefund: evidence report for health insurers

Date 2026-10-15. Prepared by the project for a statutory or private health
insurer, a hospital group or an ePA vendor who asks the same three
questions: _is the extraction right, is the data safe, and is this a
medical device?_ Everything here is produced by tools that anyone can run on
the repository, with the commands given, and every open item is named as
open. The one-page version for a steering meeting is the summary table; the
rest is the evidence behind each line.

**What is on offer.** Klarbefund is a demo environment and an open-source
reference implementation ([Apache 2.0](../../LICENSE)). It is not a product with a vendor
behind it. What the project offers an insurer is either a **white-label
version** of the app, under the insurer's name and operator responsibility,
or **technical consulting** to integrate the scanner, the coding dictionary
and the FHIR writer into an ePA or EHR app the insurer already runs. Both
paths start from the evidence below.

## Summary

| Question                                  | Answer, with the evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Status                                  |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Does it read laboratory values correctly? | Synthetic benchmark under nine scan conditions: 0 silent errors, 0 invented values, 50 of 72 rows exact; degraded scans lose rows, they never show a wrong value. 1751 analyte codings, 71 units, LOINC and [UCUM](https://ucum.org/ucum).                                                                                                                                                                                                                                                                                                                                                                                                                                        | evidenced, pilot on real reports open   |
| Is the data safe?                         | On the device by default, [Face ID](https://developer.apple.com/documentation/localauthentication) or passcode in front of the results, [AES-GCM](https://developer.apple.com/documentation/cryptokit/aes/gcm) per record, key in the [Secure Enclave-backed Keychain](https://support.apple.com/guide/security/keychain-data-protection-secb0694df1a/web), no third-party package, read-only Apple Health. CodeQL 0 findings, 0 known vulnerabilities, 9 posture tests, threat model, SBOM.                                                                                                                                                                                      | self-tested, independent test open      |
| Is it a medical device?                   | Intended purpose: store, display, export and explain what a measurement is; no diagnosis, no verdict. Under [MDCG 2019-11](https://health.ec.europa.eu/document/download/b45335c5-1679-4c71-a91c-fc7a4d37f12b_en) generally not a device; the trends colouring is the borderline the project has written down.                                                                                                                                                                                                                                                                                                                                                                    | position written, external opinion open |
| Does it fit the ePA and the EHDS?         | [FHIR R4](https://hl7.org/fhir/R4/) with LOINC, UCUM, [SNOMED CT](https://www.snomed.org/), [CVX](https://www2a.cdc.gov/vaccines/iis/iisstandards/vaccines.asp?rpt=cvx) and [ATC](https://atcddd.fhi.no/atc_ddd_index/); the test database now carries results in three of the six [EHDS Art. 14(1)](https://eur-lex.europa.eu/eli/reg/2025/327/oj/eng#014.001) priority categories: medical test results, imaging reports and, as content of the patient summary, vaccinations and the medication plan; the hub exports the whole record in one Bundle; [Art. 47](https://eur-lex.europa.eu/eli/reg/2025/327/oj/eng#art_47) wellness label applies if marketed as interoperable. | yes                                     |
| Is it a DiGA?                             | No, by design: a DiGA must be a CE-marked device ([§ 33a SGB V](https://www.gesetze-im-internet.de/sgb_5/__33a.html)). No DiGA certificates are claimed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | n/a                                     |
| Can my team verify this?                  | Yes: every number has a command, the scans and tests run on a Mac with Xcode, and the hub's API collection ([Bruno](https://www.usebruno.com/)) rehearses the integration.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | yes                                     |

## 1. What Klarbefund does

A person photographs a laboratory report or opens the laboratory's PDF.
The app reads it on the device, codes every row with LOINC and UCUM, keeps
the printed reference range, shows trends across reports, and exports the
record as FHIR R4, [OMOP CDM](https://ohdsi.github.io/CommonDataModel/cdm54.html), JSON or PDF. Values read from a photograph stay
`preliminary` until the person checks them; only a laboratory's own PDF
text layer yields `final`. With consent the app writes the person's record
into their own account on the EHDS demo hub, and weekly means from Apple
Health beside it. Nothing leaves the phone otherwise.

Details: [`README.md`](README.md) (person-facing),
[`clients/ios/README.md`](../../clients/ios/README.md) (developer),
[`evidence.md`](evidence.md), [`self-assessment.md`](self-assessment.md).

## 2. Accuracy

The measure is `ExtractionAccuracy`: a field-by-field comparison with a
hand-checked truth, value, unit, code, reference range and date. The number
that matters clinically is **silent errors**, rows the app showed as a value
and got wrong; the benchmark asserts zero under every condition.

| Condition          | Found | Exact | Silent errors | Spurious |
| ------------------ | ----: | ----: | ------------: | -------: |
| clean 150 dpi scan |     8 |     8 |             0 |        0 |
| skewed 1 degree    |     8 |     8 |             0 |        0 |
| skewed 2 degrees   |     7 |     5 |             0 |        0 |
| skewed 5 degrees   |     5 |     0 |             0 |        0 |
| dim room           |     8 |     8 |             0 |        0 |
| flash glare        |     8 |     8 |             0 |        0 |
| slight motion blur |     7 |     7 |             0 |        0 |
| heavy blur         |     0 |     0 |             0 |        0 |
| low resolution     |     7 |     6 |             0 |        0 |
| **all nine**       |    58 |    50 |         **0** |    **0** |

Synthetic sheets, 8 rows each, read with Apple [Vision](https://developer.apple.com/documentation/vision/recognizing-text-in-images), 2026-10-15
([`accuracy-benchmark.json`](accuracy-benchmark.json)). A pilot on real
reports, with written consent and only counts leaving the participant's
folder, is designed ([`evidence.md`](evidence.md#measuring-accuracy)) and
not yet run; an insurer's own pilot is the natural next step.

## 3. Security and data protection

| Layer                                                                                                                                                    | What was done                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Result, 2026-10-15                                                                                                                                                                                          |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Static analysis                                                                                                                                          | CodeQL over the app (82 Swift files); CodeQL and Semgrep over the hub in CI                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | 0 findings                                                                                                                                                                                                  |
| Dependencies                                                                                                                                             | [CycloneDX](https://cyclonedx.org/) bills for the app and every hub service ([`docs/sbom/`](../sbom/README.md)); grype and npm audit against them                                                                                                                                                                                                                                                                                                                                                                                                                                                | 0 known vulnerabilities; the app has 0 third-party packages                                                                                                                                                 |
| Secrets                                                                                                                                                  | gitleaks over the tree and the last 200 commits                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | 0 after review                                                                                                                                                                                              |
| Containers, manifests                                                                                                                                    | trivy over Dockerfiles and Kubernetes manifests                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | 0 after the fixes, as of 2026-10-16 (3 HIGH, 2 MEDIUM, 12 LOW before)                                                                                                                                       |
| Build configuration                                                                                                                                      | [`SecurityPostureTests`](../../clients/ios/Tests/SharedTests/SecurityPostureTests.swift): entitlements, privacy manifest, ATS, cryptography, PKCE, HealthKit read-only, export compliance                                                                                                                                                                                                                                                                                                                                                                                                        | 9 of 9 pass; 11 since the app lock ([ADR-060](../ADRs/ADR-060-the-app-locks-with-face-id-and-answers-pinning-and-jailbreak-detection.md)) was added the same day                                            |
| Threat model                                                                                                                                             | STRIDE for the app ([`threat-model-klarbefund.md`](../security/threat-model-klarbefund.md)) beside the hub's                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | written; residual risks listed                                                                                                                                                                              |
| Live hub, outside                                                                                                                                        | 46 anonymous black-box checks ([`check-hub-blackbox.sh`](../../scripts/security/check-hub-blackbox.sh)): route gates, redirects, headers, TLS, Keycloak console                                                                                                                                                                                                                                                                                                                                                                                                                                  | 44 of 46 pass in the online run at 20:37 UTC; the two fails were a script expectation (fixed) and [F10](../security/security-test-report-2026-10-15.md#findings), the Keycloak console, closed at 21:19 UTC |
| GDPR                                                                                                                                                     | [Art. 25](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng#art_25) by default, [Art. 5](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng#art_5) minimisation, [Art. 6](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng#art_6)/[9](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng#art_9) consents, [Art. 15](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng#art_15)/[17](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng#art_17)/[20](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng#art_20) rights: met in code; transparency and transfers partly; DPIA and controller role open | see [`self-assessment.md`](self-assessment.md)                                                                                                                                                              |
| BSI [TR-03161](https://www.bsi.bund.de/SharedDocs/Downloads/EN/BSI/Publications/TechGuidelines/TR03161/TR-03161-1.pdf?__blob=publicationFile&v=2) part 1 | Assessed by objective group: 8 met, 2 partly, 1 open (resilience, declined with reasons in [ADR-060](../ADRs/ADR-060-the-app-locks-with-face-id-and-answers-pinning-and-jailbreak-detection.md)), 2 n/a                                                                                                                                                                                                                                                                                                                                                                                          | input to a laboratory's gap analysis                                                                                                                                                                        |

The full method, findings and fixes are in
[`security-test-report-2026-10-15.md`](../security/security-test-report-2026-10-15.md).
It is the project testing itself. An independent penetration test, which
an insurer will rightly ask for, is listed there with what it would add.

## 4. Regulatory position

| Framework                                                                                                            | Position                                                                                                                                                                                                                                                                                                                                                                                                         | Open                                    |
| -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| [MDR](https://eur-lex.europa.eu/eli/reg/2017/745/oj/eng) / [IVDR](https://eur-lex.europa.eu/eli/reg/2017/746/oj/eng) | Storage, display, export and explanation of what a measurement is; no diagnosis, risk score or treatment advice. Generally not a device under [MDCG 2019-11](https://health.ec.europa.eu/document/download/b45335c5-1679-4c71-a91c-fc7a4d37f12b_en) Rev.1. The trends screen colours values against published, sourced bands; the project's position is that a comparison with a quoted number is not a finding. | written qualification, external opinion |
| DiGA ([§ 139e SGB V](https://www.gesetze-im-internet.de/sgb_5/__139e.html))                                          | Not applicable; deliberately not a device                                                                                                                                                                                                                                                                                                                                                                        | none                                    |
| EU AI Act                                                                                                            | Not high-risk while not a device; every answer, on device or hosted, names its provider and model ([Art. 50](https://eur-lex.europa.eu/eli/reg/2024/1689/oj/eng#art_50))                                                                                                                                                                                                                                         | none                                    |
| EHDS [2025/327](https://eur-lex.europa.eu/eli/reg/2025/327/oj/eng)                                                   | [Art. 3](https://eur-lex.europa.eu/eli/reg/2025/327/oj/eng#art_3) record access with consent; [Art. 47](https://eur-lex.europa.eu/eli/reg/2025/327/oj/eng#art_47) wellness label if marketed as interoperable with EHR systems                                                                                                                                                                                   | label text when marketed                |
| Apple                                                                                                                | [TestFlight](https://developer.apple.com/help/app-store-connect/test-a-beta-version/invite-external-testers) beta approved for external testers; App Privacy label: health data, not linked, not tracked                                                                                                                                                                                                         | none                                    |

## 5. The test database, and the kinds of result it holds

The demo hub runs on 127 synthetic patients ([Synthea](https://github.com/synthetichealth/synthea)) plus hand-seeded
records, in a Neo4j graph that mirrors FHIR R4 and OMOP CDM. On 2026-10-15
it gained the four result types an ePA integrator asks for first ([ADR-059](../ADRs/ADR-059-the-record-holds-reports-vaccinations-and-the-medication-plan.md)).

| Result type                                                                  | Coding                                                                                               | In the app     | In the test database | How an integrator gets it                                                                      |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------- | -------------------- | ---------------------------------------------------------------------------------------------- |
| Laboratory, blood and urine                                                  | LOINC, UCUM                                                                                          | yes            | yes                  | [`/api/patient/observations`](../../ui/src/app/api/patient/observations/route.ts), FHIR Bundle |
| Resting ECG, Holter                                                          | LOINC [11524-6](https://tx.fhir.org/r4/CodeSystem/$lookup?system=http://loinc.org&code=11524-6), EC  | yes            | **new**              | `include=all`, DiagnosticReport with Observations                                              |
| Spirometry, CPET, stress test, lactate                                       | LOINC, PF and EC                                                                                     | yes            | planned              |                                                                                                |
| DXA body composition                                                         | LOINC [38269-7](https://tx.fhir.org/r4/CodeSystem/$lookup?system=http://loinc.org&code=38269-7), RAD | yes            | planned              |                                                                                                |
| Continuous glucose monitoring                                                | LOINC [107930-0](https://tx.fhir.org/r4/CodeSystem/$lookup?system=http://loinc.org&code=107930-0)    | yes            | planned              |                                                                                                |
| 24 h blood pressure, device screens                                          | LOINC                                                                                                | yes            | planned              |                                                                                                |
| Wearable weekly means                                                        | LOINC                                                                                                | yes            | yes                  | written by the app ([ADR-057](../ADRs/ADR-057-klarbefund-sends-weekly-device-means.md))        |
| Imaging reports (X-ray, echo, ultrasound)                                    | LOINC, RAD                                                                                           | no (narrative) | **new**              | `include=all`, DiagnosticReport with conclusion                                                |
| Vaccination record                                                           | CVX                                                                                                  | no             | **new**              | `include=all`, Immunization                                                                    |
| Medication plan ([BMP](https://www.gesetze-im-internet.de/sgb_5/__31a.html)) | ATC, 1-0-1 dosing                                                                                    | no             | **new**              | `include=all`, MedicationStatement                                                             |
| Conditions, medications                                                      | SNOMED CT, [RxNorm](https://www.nlm.nih.gov/research/umls/rxnorm/index.html)                         | via hub        | yes                  | profile API, [`$everything`](https://hl7.org/fhir/R4/patient-operation-everything.html)        |

Candidates after these, by [EHDS Art. 14](https://eur-lex.europa.eu/eli/reg/2025/327/oj/eng#014.001) category: microbiology, allergy
panels, genetics (laboratory results); pathology, sleep studies, ECG
narratives (reports); patient-reported outcomes and discharge letters
(patient summary, discharge reports). Each is one seed file and one mapper.

Rehearsal: [`bruno/MVHDv2/01 Patient/06 My whole record (Art. 14 categories).bru`](https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/bruno/MVHDv2/01%20Patient/06%20My%20whole%20record%20%28Art.%2014%20categories%29.bru) pulls the Bundle
with all four result types and fails loudly when one is missing.

## 6. Integration paths

1. **White-label app.** The app as it is, renamed and signed by the insurer,
   with the insurer as operator: privacy notice, DPIA, processor agreement
   for the hosted explanation service ([Azure OpenAI](https://learn.microsoft.com/en-us/azure/ai-foundry/openai/how-to/deployment-types#data-zone-standard), EU data zone, by
   default), and the Apple account. The code stays open source.
2. **Components into an existing ePA or EHR app.** The `Shared` Swift
   package (scanning, the 1751-coding dictionary, provenance, FHIR and OMOP
   writers, consents) has no third-party dependency and is covered by 419
   tests; it drops into an existing iOS app. The same dictionary exists in
   TypeScript ([`services/epa-ingest`](../../services/epa-ingest)) for a server-side path.
3. **Hub-side only.** An insurer's platform reads the record as FHIR R4
   from the hub's API, or runs the ePA ingest CLI against PDFs it already
   holds, without the app.

In every path the insurer owns the data protection roles; the project
supplies the templates and the evidence.

## 7. What is still open

| Item                                            | Who closes it                      |
| ----------------------------------------------- | ---------------------------------- |
| Independent penetration test, TR-03161 gap list | a BSI-recognised laboratory        |
| Pilot accuracy on real reports                  | the insurer's pilot, with consents |
| Written MDR qualification, external opinion     | regulatory counsel                 |
| DPIA, records of processing, controller role    | the operator                       |
| Profile page sections for the new result types  | the project                        |
| Swift suite in CI (needs workflow rights)       | the repository owner               |

## 8. Verify it yourself

```bash
git clone https://github.com/ma3u/MinimumViableHealthDataspacev2 && cd MinimumViableHealthDataspacev2
cd clients/ios && swift test                                   # 419 tests, incl. the benchmark and the posture tests
cd ../.. && scripts/security/scan-repo.sh                      # SBOM check, grype, trivy, gitleaks, semgrep, hadolint, npm audit
scripts/security/check-hub-blackbox.sh                         # the live hub from outside, office hours Mon-Fri 05:17-18:13 UTC
./scripts/run-api-tests.sh Local "01 Patient"                  # the record as an integrator receives it
```

Documents: [`evidence.md`](evidence.md), [`self-assessment.md`](self-assessment.md),
[`run-on-mac.md`](run-on-mac.md), [`security-test-report-2026-10-15.md`](../security/security-test-report-2026-10-15.md),
[`threat-model-klarbefund.md`](../security/threat-model-klarbefund.md),
[ADR-059](../ADRs/ADR-059-the-record-holds-reports-vaccinations-and-the-medication-plan.md).
