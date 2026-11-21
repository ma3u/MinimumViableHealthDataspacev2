# NeDRex (REPO4EU) and the EHDS Integration Hub: call on 19 January 2027

Prepared 20 November 2026. Language of the call: English. Length: 60 minutes, online.

## The question we bring

Can a NeDRex disease module become an OMOP cohort definition that any health data access body
runs the same way inside a secure processing environment, and which NeDRex data may we use there?

## What we already tested

Source: the REPO4EU open dump, "NeDRex Open TUM 03.11.2026 19:31",
[doi:10.5281/zenodo.23940639](https://doi.org/10.5281/zenodo.23940639), CC BY 4.0, also listed on
[data.europa.eu](https://data.europa.eu/data/datasets/oai-zenodo-org-23940639?locale=en).
32 files, MongoDB dump as BSON and as one gzipped CSV per collection. NeDRex 2.2.13, sources
dated 2025-08-27. We read 7 small CSV files (about 4 MB, checksums verified); the 532 MB archive
and the large edge files were not downloaded.

| Collection                      | Rows   | What we saw                                                                                                                                                                            |
| ------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| disorder                        | 26 429 | All MONDO. 8 854 (33%) carry a SNOMED CT cross-reference, 7 483 (28%) an ICD-10 code                                                                                                   |
| drug                            | 15 235 | Primary ids are still DrugBank ids (`drugbank.DB00005`), `dataSources` says `drugbank`. Description and indication text are empty in all rows. 4 150 drugs also carry a DrugCentral id |
| drug_has_indication             | 17 754 | 13 558 from CTD, 4 912 from DrugCentral                                                                                                                                                |
| drug_has_target                 | 17 062 | All from DrugCentral, targets as UniProt ids                                                                                                                                           |
| disorder_is_subtype_of_disorder | 39 456 | MONDO hierarchy                                                                                                                                                                        |

The hosted API at <https://exbio.wzw.tum.de/repo4eu_nedrex_open/> answers (NeDRexAPI 2.0.0a,
71 endpoints including `disorder/get_by_icd10`, `comorbiditome/icd10_to_mondo`, DIAMOnD,
ROBUST, TrustRank and drug validation). We did not use it beyond reading its description: its
terms say that using it means accepting the NeDRex platform licence (see question 4).

## Mapping test against the hub

The hub's 22 most frequent synthetic conditions (SNOMED CT codes) were matched to NeDRex
disorders through the SNOMED cross-references, then to drugs through the indication edges.

| Result                       | Conditions                                                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Matched, code correct        | 15: obesity, ischaemic heart disease, hypothyroidism, hypertension, heart failure, osteoarthritis, chronic kidney disease, prostate cancer, rheumatoid arthritis, COPD, anxiety disorder, Crohn's disease (lands on MONDO "inflammatory bowel disease 1"), depression, atrial fibrillation, urinary tract infection                                                                                 |
| No MONDO match, code correct | 2: asthma (SNOMED 195967001), primary malignant neoplasm of colon (93761005)                                                                                                                                                                                                                                                                                                                        |
| Wrong code in our own seed   | 5: the hub labels 267036007 "iron deficiency anaemia" (SNOMED: dyspnoea), 190828008 "hyperlipidaemia" (gouty arthropathy), 235856003 "hepatitis C" (liver disease), 363406005 "breast cancer" (malignant neoplasm of colon) and 73211009 "type 2 diabetes" (diabetes mellitus, unspecified). Checked against SNOMED CT on a public FHIR terminology server. Our bug, not NeDRex's; fixed separately |

Worked example, rheumatoid arthritis: SNOMED 69896004 (21 synthetic patients) to
`mondo.0008383`, ICD-10 M05 and M06, 9 MONDO subtypes. 77 indicated drugs from DrugCentral
(abatacept, adalimumab, baricitinib, etanercept and others) and 65 from CTD, 35 of them CTD only.

What the test shows:

1. **The source of an indication matters.** For hypertension, 185 of 259 CTD indications have
   no DrugCentral counterpart, including ascorbic acid, glutathione and folic acid. A cohort
   definition should use DrugCentral (approved use) and treat CTD as hypotheses.
2. **Granularity differs.** Heart failure has 4 DrugCentral indications on `mondo.0005252`
   itself; the usual drugs sit on its 15 subtypes. Cohort logic must walk the MONDO hierarchy.
3. **OMOP needs one more step on both sides.** Drugs carry DrugBank and DrugCentral ids, not
   ATC or RxNorm; OMOP drug exposure needs RxNorm. And our hub stores SNOMED codes where OMOP
   expects concept ids (`conditionConceptId`), so a mapping through the OHDSI Athena
   vocabularies is missing on our side too.

## Agenda (60 minutes)

1. Introductions and goals (5 min).
2. Demo of the EHDS Integration Hub (15 min): HealthDCAT-AP catalogue, data permit by the
   access body, analysis in the secure processing environment, all on synthetic data. Eclipse
   Dataspace Components 1.0 (release candidate 8).
3. Identifiers and mapping (15 min): our test above; their view on SNOMED and ICD-10 coverage,
   on CTD versus DrugCentral, and on a route from DrugBank or DrugCentral ids to RxNorm or ATC.
4. Where NeDRex runs (10 min): as a tool inside the secure processing environment (container
   without outbound network) or as an external service the environment queries. The first is
   easier to approve under the EHDS rules for secure processing environments.
5. Licences (10 min): see the questions below.
6. Next step (5 min): one joint test, then possibly a joint proposal in a Horizon Europe or
   EU4Health call.

## Questions for the NeDRex team

1. Which disorder nodes do you use for a disease module in practice, and how would you choose
   between a parent MONDO term and its subtypes for a cohort?
2. Is there a planned or existing mapping from NeDRex drugs to RxNorm or ATC, for example
   through DrugCentral or UniChem?
3. Asthma and colon cancer found no MONDO node through SNOMED. Is ICD-10 the better bridge
   (`comorbiditome/icd10_to_mondo`), and does it cover ICD-10-GM, the German modification?
4. Licence: the dump is CC BY 4.0, while the API's platform licence allows only non-commercial
   internal research and names DrugBank and OMIM terms. Which one applies to the dump? May the
   DrugBank ids and drug names in it be used in a third party's processing environment? Does
   any edge file still contain OMIM-derived data?
5. Can the dump be refreshed on a schedule, and is a versioned container of the API available
   to run offline inside a processing environment?
6. Who on your side would join a small joint test, and what would you want from it?

## Proposed joint test

One hypothesis, one disease module, synthetic data only:

1. Seed: rheumatoid arthritis (`mondo.0008383`), well covered on both sides.
2. NeDRex: build a disease module (DIAMOnD or ROBUST) and rank drug candidates (TrustRank).
3. Hub: translate condition and candidate drugs into an OMOP cohort definition, run it in the
   secure processing environment on the 127 synthetic patients, return aggregate results only.
4. Evidence layer: list the studies on each drug and indication and set them against the
   current guideline through the quality gate.

## Before the call (our side)

- [ ] Fix the five wrong SNOMED codes in `scripts/generate-graph-seed.py` and reseed.
- [ ] Add OMOP concept ids for the hub's conditions from Athena (SNOMED to concept id).
- [ ] Try the ICD-10 route for asthma and colon cancer in the dump (no API use until the
      licence question is settled).
- [ ] Prepare the 15-minute demo on the live hub with the rheumatoid arthritis cohort.
- [ ] Send the agenda and the questions a week ahead.

## Files

The test script, the mapping result and the SNOMED check stayed on the maintainer's machine; the
steps to repeat them are in
[#1167](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/1167).
