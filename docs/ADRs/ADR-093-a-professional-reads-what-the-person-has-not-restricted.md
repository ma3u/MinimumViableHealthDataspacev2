# ADR-093: A health professional reads what the person has not restricted, and every read is logged

Date: 2026-11-14

## Status

**Status:** Proposed (draft, nothing built)

Tracks [#1120](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/1120).
Relates to [ADR-045](ADR-045-observability-and-regulatory-audit-trail.md) (the audit
trail), [ADR-059](ADR-059-the-record-holds-reports-vaccinations-and-the-medication-plan.md)
and [ADR-081](ADR-081-the-record-covers-three-of-the-six-art-14-categories.md) (what the
record holds), [ADR-062](ADR-062-the-art-71-opt-out-is-a-record-and-a-label.md) (the
pattern this one reuses), and the open issues
[#698](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/698) (Chapter II
rights) and [#712](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/712)
(health professionals with a wallet).

## Context

The hub shows two journeys: the person with the Klarbefund app (Chapter II) and the
researcher (Chapter IV). The third use the Regulation names, a health professional
reading a person's data for their care, has no persona, no role and no path. A
hospital sending a discharge report and a lab report to the person's GP is the
smallest journey that exercises it.

What Regulation (EU) 2025/327 asks, read from the Official Journal text on
2026-11-14 (EUR-Lex was not fully available that day; the same OJ act was read from
the [Publications Office cellar](https://publications.europa.eu/resource/celex/32025R0327)):

- [Art. 11](https://eur-lex.europa.eu/eli/reg/2025/327/oj/eng#art_11), access by health
  professionals: the relevant and necessary data of persons **under their treatment**,
  at least the Art. 14 categories (11(1), 11(3)); Member States decide which categories
  each category of professional sees, taking Art. 8 restrictions into account (11(3));
  the professional is not told what was restricted, and may override a restriction
  only to protect the person's vital interests, which is **logged** where the person
  can read it (11(5)).
- [Art. 12](https://eur-lex.europa.eu/eli/reg/2025/327/oj/eng#art_12), the health
  professional access service: open only to professionals holding an electronic
  identification means recognised under eIDAS (Regulation (EU) No 910/2014, Art. 6)
  or one compliant with the common specifications of Art. 36.
- [Art. 13](https://eur-lex.europa.eu/eli/reg/2025/327/oj/eng#art_13), registration:
  the priority categories are registered electronically, and every registration or
  update identifies the professional, the provider and the time (13(4)).
- [Art. 14](https://eur-lex.europa.eu/eli/reg/2025/327/oj/eng#art_14) and
  [Annex I](https://eur-lex.europa.eu/eli/reg/2025/327/oj/eng#anx_I): the discharge
  report is category (f), data on an encounter or episode of care with essential
  information about admission, treatment and discharge; lab results are (e).
- [Art. 15(4)](https://eur-lex.europa.eu/eli/reg/2025/327/oj/eng#art_15): the
  categories are issued in the European exchange format, and a receiving provider
  shall accept it and be able to read it.
- [Art. 8](https://eur-lex.europa.eu/eli/reg/2025/327/oj/eng#art_8): the person may
  restrict professionals' and providers' access to all or parts of their data, is
  told this may affect their care, and **the fact of a restriction is not visible to
  providers**. Recital 17 asks for granularity down to elements of the patient
  summary.
- [Art. 9](https://eur-lex.europa.eu/eli/reg/2025/327/oj/eng#art_9): information on
  every access through the health professional access service, including the 11(5)
  override, free and without delay, kept **at least three years**, naming at least
  who accessed, when, and which data.
- [Art. 105](https://eur-lex.europa.eu/eli/reg/2025/327/oj/eng#art_105): Art. 3 to 15
  apply from 26 March 2029 for categories (a) to (c) and from 26 March 2031 for (d) to
  (f). A discharge report and lab results are 2031; the patient summary is 2029.

Recital 19 gives the legal basis for care: GDPR
[Art. 6(1)(e)](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng#art_6) and
[Art. 9(2)(h)](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng#art_9). It is not
consent, and it is not a data permit.

What the hub has today:

- **Roles.** `jad/keycloak-realm.json` has seven realm roles; none is a health
  professional. `DATA_HOLDER` (`clinicuser`, `lmcuser`) is the organisation acting in
  secondary use, and `seesPatientIdentity()` in `ui/src/lib/patient-identity.ts` lets
  it see names for every patient, with no notion of treatment.
- **The record.** Observations, `DiagnosticReport`, `Immunization` and
  `MedicationStatement` (ADR-059), `Encounter` nodes with a constraint in
  `neo4j/init-schema.cypher`, no `Composition`. ADR-081: categories (a), (d), (e) in
  part, no discharge report.
- **The exchange format.** `/eehrxf` and `neo4j/register-eehrxf-profiles.cypher` pin
  early HL7 Europe drafts (`hl7.fhir.eu.hdr#1.0.0-ci-build`,
  `hl7.fhir.eu.laboratory#0.1.1`); nothing carries `meta.profile`, nothing validates
  ([#718](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/718)).
- **The access log.** The patient's overview reads
  `(TransferEvent)-[:READ]->(Patient)` (`ui/src/app/api/overview/route.ts`), written by
  seeds only. ADR-045 decided one FHIR `AuditEvent` per access, profiled on IHE BALP,
  hash-chained, kept three years, failing closed; the proxy implements the chain
  (`services/neo4j-proxy/src/audit-chain.ts`). No professional read reaches it,
  because there is none.
- **Restrictions.** None. The Art. 71 opt-out (ADR-062) is the nearest pattern: a dated
  record that is never deleted, a label on the covered nodes, and a query rewrite.

## Decision

### 1. A health professional is a person with a role, a provider and a profession

- A realm role `HEALTH_PROFESSIONAL`. It is not `DATA_HOLDER`: the organisation in
  Chapter IV and the professional in Chapter II have different legal bases and
  different reach.
- Two demo users, fictional: `hospitaldoc`, a physician at AlphaKlinik Berlin, and
  `gpdoc`, a general practitioner at **AlphaPraxis Berlin**, a fictional GP practice
  added to the demo organisations. Each user carries the attributes `providerId` and
  `professionCode` (SNOMED CT or the national profession code), mapped into the token.
- In the graph, FHIR-named: `(:Practitioner)-[:HAS_ROLE]->(:PractitionerRole
{professionCode})-[:AT]->(:Organization)`. The practice is an `Organization`, not a
  dataspace participant: primary use between providers does not run over DSP.
- **Treatment relationship.** A professional reads a person's record only while the
  person is under their provider's treatment (Art. 11(1)):
  `(:Patient)-[:UNDER_TREATMENT_AT {from, to, basis}]->(:Organization)`, opened by an
  admission `Encounter` at the hospital, or by a discharge report addressed to the GP.
  No relationship, no read: the route answers 404, as for an unknown patient.
- **Categories per profession** (Art. 11(3)) are configuration, one map from
  `professionCode` to Art. 14 categories, in the demo all six for physicians.
- `seesPatientIdentity()` admits `HEALTH_PROFESSIONAL` for the patients under
  treatment only.
- **Sign-in.** On the demo stack both users sign in with a Keycloak password, and every
  professional page says this stands in for Art. 12's eIDAS means. #712 replaces it with
  a wallet presentation at assurance level high plus a professional attestation; when
  it lands, the password path closes.

### 2. The discharge report is a FHIR document: a Composition per HL7 Europe Hospital Discharge Report

- `(:Composition {resourceId, status, type, date, title})`, `type` LOINC
  [34105-7](https://loinc.org/34105-7) "Hospital Discharge Summary", profiled on the
  HL7 Europe Hospital Discharge Report Composition
  1.0.0 STU 1 (see [Standards](#standards) below; `meta.profile` set). The
  patient summary follows the HL7 International Patient Summary 2.0.1 until the HL7
  Europe Patient Summary leaves ballot.
- Relationships: `SUBJECT` to the `Patient`, `FOR_ENCOUNTER` to the admission
  `Encounter`, `AUTHORED_BY` the `PractitionerRole`, `CUSTODIAN` the hospital
  `Organization`, `HAS_SECTION` to `(:CompositionSection {code, title, order})`, each
  section `ENTRY` to the nodes the record already has (`Condition`, `Observation`,
  `DiagnosticReport`, `MedicationStatement`, `Procedure`). No clinical fact is copied
  into the report: a section points at it, so the trends, the bundle and the restriction
  see one node.
- The lab report is a `DiagnosticReport` per HL7 Europe Laboratory Report, LOINC
  [11502-2](https://loinc.org/11502-2) as its document type, referenced from the
  discharge report's results section.
- **Registration provenance** (Art. 13(4)): every node a professional registers carries
  `recordedBy` (the `PractitionerRole`), `recordedAt` and `recordedAtProvider`, served
  as a FHIR `Provenance`.
- **Delivery to the GP.** The hospital registers the document and addresses it; it is
  not pushed. `(:DocumentReference {status, date})-[:DESCRIBES]->(:Composition)`,
  `-[:ADDRESSED_TO]->(:Organization)` for AlphaPraxis Berlin, shaped as IHE MHD
  Provide Document Bundle and Find Document References. Addressing it opens the GP's
  treatment relationship. The GP's inbox lists what is addressed to the practice;
  opening one is a read like any other (decision 4).
- What leaves the hub is a FHIR `Bundle` of type `document`, Composition first. It is
  validated against the guide in CI (with #718).

### 3. A restriction is a dated record and a label; the professional's view excludes it silently

- `(:Patient)-[:RESTRICTED]->(:AccessRestriction {restrictionId, createdAt, revokedAt,
scope, riskAcknowledgedAt, source})-[:COVERS]->(node)`. `scope` is a category letter,
  a Composition section code, or single resources; `COVERS` is resolved when the
  restriction is created and again when a covered category or section gains entries.
  A revocation sets `revokedAt`; a record is never deleted (as ADR-062).
- `riskAcknowledgedAt` is required: the person confirms they were told the restriction
  may affect their care (Art. 8, second sentence). No acknowledgement, no restriction.
- While at least one open restriction covers a node, it carries the label
  `RestrictedFromCare`. Opening, revoking or recomputing a restriction sets or clears
  the label in the same statement, from the open records, not from the one that changed.
- **The filter.** Every professional read goes through one function,
  `careView(reader)`, the counterpart of `secondaryUseView()`: it excludes
  `RestrictedFromCare` nodes, except those the reader's own provider registered
  (`recordedAtProvider` is the reader's provider; recital 18's original controller).
- **Not visible** (Art. 8, third sentence): a section left empty by the filter is
  dropped, with no `emptyReason` of `withheld`, no count, no security label in the
  response. A Composition whose sections are all restricted answers as if the document
  did not exist. The response for a restricted record and for one with less data must
  be indistinguishable; a test compares them.
- **The vital-interest override** (Art. 11(5)): a professional may open the restricted
  data with a reason, once per encounter. The read is logged with `emergency: true`,
  and the person's access log shows it first.
- In FHIR, the restriction is served to the person as a `Consent` (R4) with
  `provision.type = deny` on the covered data, shaped after IHE Privacy Consent on
  FHIR. It is never served to a professional.

### 4. Every professional read writes an AuditEvent before the data leaves

- Each read by a `HEALTH_PROFESSIONAL` (record, document, inbox entry opened, override)
  appends one FHIR `AuditEvent` to the chain of ADR-045, profiled on IHE BALP
  (patient-centric read): the professional and provider, the date and time, the
  resource types and ids read, purpose of use `TREAT`, the `emergency` flag.
  These are Art. 9(2)'s three items. The write is synchronous and fails closed: no
  audit record, no data.
- In the graph, `(:CareAccessEvent {at, emergency})-[:READ]->(:Patient)`,
  `-[:BY]->(:PractitionerRole)`, `-[:ACCESSED]->(node)` for each resource. The patient's
  overview reads it alongside `TransferEvent`, so "who used my data" covers care and
  research in one list. Retention three years from each access (Art. 9(2)); the
  retention job does not delete younger events.
- The log names what was read, not what was withheld: a read that the filter narrowed
  logs only what was served.
- **Notifications** (Art. 9(1)) are a later step: the event carries what one needs.

## Consequences

- The hub gains the third use the Regulation names, with the person's two rights that
  only make sense against it: Art. 8 and Art. 9 for care. #698's Art. 8 bullet and its
  Art. 9 bullet for professionals' access move to the issue this ADR tracks.
- A new persona is a new folder in the API collection (`bruno/MVHDv2`, ADR-032), new
  rows in `docs/ehds/regulation-implementation.md` for Art. 11 to 13, and a third
  journey in `ui/src/lib/journey-flows.ts` and `journey-steps.ts`, whose `StepStatus`
  gains `not-planned` for the cross-border step.
- `careView()` is a second query rewrite next to `secondaryUseView()`. Both are on the
  side of filtering; both need their own test vectors and a real Neo4j planning test.
- Hiding restrictions completely means a professional cannot tell "no data" from
  "restricted". That is what Art. 8 asks; the override exists for the cases where it
  matters, and its log is the safeguard.
- A label shared by several restrictions must be recomputed from the open records,
  or a revocation unhides data another restriction still covers.
- Cross-border care (Art. 11(2), Art. 23) stays out: the hub is not a national contact
  point. The document is in the exchange format, so a contact point could send it.
- German delivery paths (secure provider messaging, the ePA) stay outside the default
  build; with `NEXT_PUBLIC_DEMO_TK` they are described, not connected.

## Alternatives considered

- **Reuse `DATA_HOLDER` for the professional.** It sees every patient's identity and
  acts for the organisation in secondary use; Art. 11 is a person's access during
  treatment.
- **Negotiate each discharge report over DSP.** Chapter II access is a duty with its own
  legal basis (GDPR Art. 9(2)(h)), not a contract; a negotiation per letter adds nothing
  and hides the access from the Art. 9 log.
- **Push the document to the GP** (a message, as secure provider messaging does).
  Realistic for Germany, but a pushed copy is out of reach of a later restriction and of
  the access log; registering and reading keeps both. A push adapter can sit behind the
  same `DocumentReference`.
- **Mark restricted sections `emptyReason = withheld`.** It tells the provider a
  restriction exists, which Art. 8 forbids.
- **Copy the clinical facts into the Composition.** Two copies of one value would need
  two restrictions and could disagree; sections point at the record instead.
- **Log reads in Plane 1 telemetry only.** Sampled, redacted and kept 90 days (ADR-045);
  Art. 9 asks three years.

## Standards

Every link opened on 2026-11-14; versions from each guide's page or package list.

**European exchange format (Art. 15) and the HL7 Europe FHIR guides.** The Art. 15(1) implementing act is due by 26 March 2027; until then the HL7 Europe guides and the Xt-EHR logical models are the closest thing to it.

| What                                                          | Link                                                                                                                                                                                                                                                                                                                                                         | Version, status                                                                       |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| HL7 Europe Hospital Discharge Report                          | [hl7.eu/fhir/hdr](https://hl7.eu/fhir/hdr/), its [Composition](https://hl7.eu/fhir/hdr/StructureDefinition-composition-eu-hdr.html) and [Bundle](https://hl7.eu/fhir/hdr/StructureDefinition-bundle-eu-hdr.html)                                                                                                                                             | 1.0.0, STU 1, 2026-10-16 (the repo pins `1.0.0-ci-build`)                             |
| HL7 Europe Laboratory Report                                  | [hl7.eu/fhir/laboratory](https://hl7.eu/fhir/laboratory/), its [Composition](https://hl7.eu/fhir/laboratory/StructureDefinition-Composition-eu-lab.html) and [DiagnosticReport](https://hl7.eu/fhir/laboratory/StructureDefinition-DiagnosticReport-eu-lab.html)                                                                                             | 2.1.0, STU 2, 2026-10-16 (the repo pins `0.1.1`)                                      |
| HL7 Europe Base and Core                                      | [hl7.eu/fhir/base](https://hl7.eu/fhir/base/)                                                                                                                                                                                                                                                                                                                | 2.0.1, STU 2, 2026-09-13 (the repo pins `0.1.0`)                                      |
| HL7 Europe Patient Summary                                    | [hl7.eu/fhir/eps](https://hl7.eu/fhir/eps/)                                                                                                                                                                                                                                                                                                                  | 1.0.0-ballot, 2026-06-06: **a ballot, not published**                                 |
| HL7 International Patient Summary                             | [hl7.org/fhir/uv/ips](https://hl7.org/fhir/uv/ips/)                                                                                                                                                                                                                                                                                                          | 2.0.1, STU 2, 2026-06-19: the published summary to use until EPS is                   |
| Xt-EHR logical models (the joint action preparing the format) | [xt-ehr.eu/artifacts/logical-models](https://www.xt-ehr.eu/artifacts/logical-models/), [mapping to FHIR guides](https://www.xt-ehr.eu/mapping-fhir-implementation-guides/)                                                                                                                                                                                   | working artefacts                                                                     |
| FHIR R4 resources                                             | [Composition](https://hl7.org/fhir/R4/composition.html), [DocumentReference](https://hl7.org/fhir/R4/documentreference.html), [Provenance](https://hl7.org/fhir/R4/provenance.html), [Consent](https://hl7.org/fhir/R4/consent.html), [AuditEvent](https://hl7.org/fhir/R4/auditevent.html), [security labels](https://hl7.org/fhir/R4/security-labels.html) | 4.0.1                                                                                 |
| HL7 Data Segmentation for Privacy                             | [hl7.org/fhir/uv/security-label-ds4p](https://hl7.org/fhir/uv/security-label-ds4p/)                                                                                                                                                                                                                                                                          | 1.0.0, STU 1, 2023-04-17; for labelling restricted data, never sent to a professional |

**eHealth Network guidelines** (the category definitions the format builds on, recital 25):

| Category                              | Guideline                                                                                                                                                                                        | Release                                                                       |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| (a) Patient summary                   | [eHN Guideline on Patient Summary](https://health.ec.europa.eu/publications/ehn-guideline-patient-summary_en)                                                                                    | 3.4, adopted November 2024                                                    |
| (e) Laboratory results                | [eHN Laboratory Result Guidelines](https://health.ec.europa.eu/publications/ehn-laboratory-result-guidelines_en)                                                                                 | the page says 1.2; the PDF it links reads 1.1, adopted June 2023 (unresolved) |
| (f) Discharge report                  | [eHN guidelines on Hospital Discharge Report](https://health.ec.europa.eu/publications/ehn-guidelines-hospital-discharge-report_en)                                                              | 1.1, adopted November 2024                                                    |
| (b), (c) ePrescription, eDispensation | [Guidelines on ePrescription and eDispensation](https://health.ec.europa.eu/publications/eprescription-and-edispensation-authorised-medicinal-products-guidelines-electronic-exchange-health_en) | 3.1, adopted November 2024 (not in this journey)                              |
| (d) Imaging                           | [eHN Guidelines on Medical imaging studies and reports](https://health.ec.europa.eu/publications/ehn-guidelines-medical-imaging-studies-and-reports_en)                                          | 1.1, adopted November 2024 (not in this journey)                              |

**IHE profiles** where the journey needs them (ITI Technical Framework, Revision 20.2):

| Use in the journey                                                            | Profile                                                                                                                                                           |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Register and address the discharge report (step 4), find and read it (step 5) | [MHD](https://profiles.ihe.net/ITI/MHD/) 4.2.5; the document-sharing model behind it is [XDS.b](https://profiles.ihe.net/ITI/TF/Volume1/ch-10.html)               |
| Find the person across the hospital and the practice                          | [PDQm](https://profiles.ihe.net/ITI/PDQm/) 3.2.0, [PIXm](https://profiles.ihe.net/ITI/PIXm/) 3.1.0                                                                |
| The access log, one AuditEvent per read (step 6)                              | [BALP](https://profiles.ihe.net/ITI/BALP/) 1.1.4 on [ATNA](https://profiles.ihe.net/ITI/TF/Volume1/ch-9.html)                                                     |
| The restriction (step 7)                                                      | [PCF](https://profiles.ihe.net/ITI/PCF/) 1.1.0 (Privacy Consent on FHIR); [APPC](https://profiles.ihe.net/ITI/TF/Volume1/ch-43.html) for the policy document form |
| The professional's token                                                      | [IUA](https://profiles.ihe.net/ITI/IUA/) 2.5                                                                                                                      |
| Cross-border (step 8, not planned)                                            | [XCA](https://profiles.ihe.net/ITI/TF/Volume1/ch-18.html), [XCPD](https://profiles.ihe.net/ITI/TF/Volume1/ch-27.html), as used between national contact points    |

**Legal basis for care.** GDPR [Art. 9(2)(h)](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng#art_9) (readable copy: [gdpr-info.eu/art-9-gdpr](https://gdpr-info.eu/art-9-gdpr/)): processing necessary for "medical diagnosis, the provision of health or social care or treatment", with Art. 6(1)(e), as recital 19 of Regulation (EU) 2025/327 says.

**Germany.** Laws and specifications only; no organisation is named, and the real paths appear in the UI only behind `NEXT_PUBLIC_DEMO_TK`.

| What                       | Law                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Specification                                                                                                                                                                                                          |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Discharge management       | [§ 39 Abs. 1a SGB V](https://www.gesetze-im-internet.de/sgb_5/__39.html): hospital treatment includes discharge management. The section itself does not name the discharge letter.                                                                                                                                                                                                                                                                       | The hospital discharge letter information object, [`kbv.mio.kh-entlassbrief`](https://simplifier.net/packages/kbv.mio.kh-entlassbrief), `1.0.0-update`, its Composition still draft                                    |
| Hospital FHIR interfaces   | [§ 373 SGB V](https://www.gesetze-im-internet.de/sgb_5/__373.html): open, standardised interfaces for hospital IT systems                                                                                                                                                                                                                                                                                                                                | ISiK [Basis 6.0.0](https://gemspec.gematik.de/ig/fhir/isik/basis/6.0.0/index.html) and [Dokumentenaustausch 6.0.0](https://gemspec.gematik.de/ig/fhir/isik/dokumentenaustausch/6.0.0/index.html) (Stufe 6, 2026-07-01) |
| Secure provider messaging  | [§ 311 Abs. 6 SGB V](https://www.gesetze-im-internet.de/sgb_5/__311.html): secure procedures for sending medical data                                                                                                                                                                                                                                                                                                                                    | [KOM-LE specialist service specification](https://gemspec.gematik.de/docs/gemSpec/gemSpec_FD_KOMLE/latest/) (the technical name of the secure messaging service), 1.25.0                                               |
| Electronic doctor's letter | [§ 383 SGB V](https://www.gesetze-im-internet.de/sgb_5/__383.html): payment for electronic letters                                                                                                                                                                                                                                                                                                                                                       | [eArztbrief requirements catalogue](https://update.kbv.de/ita-update/Abrechnung/eArztbrief/KBV_ITA_VGEX_Anforderungskatalog_eArztbrief.pdf) 2.14, 2026-02-13 (PDF/A letter over secure messaging)                      |
| The ePA                    | [§ 341](https://www.gesetze-im-internet.de/sgb_5/__341.html) (content, incl. electronic letters, Abs. 2 Nr. 1 lit. d), [§ 342](https://www.gesetze-im-internet.de/sgb_5/__342.html) (provided unless the insured person objects), [§ 347](https://www.gesetze-im-internet.de/sgb_5/__347.html) (practices: lab results, letters), [§ 348 Abs. 3](https://www.gesetze-im-internet.de/sgb_5/__348.html) (**hospitals: lab results and discharge letters**) | [ePA FHIR guide](https://gemspec.gematik.de/ig/fhir/epa/) 1.3.2 (ePA 3.1.3, 2026-07-15)                                                                                                                                |
