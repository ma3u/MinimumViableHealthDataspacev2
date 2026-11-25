// ==============================================================================
// OMOP standard concept ids for the hub's conditions and drugs (#1167)
//
// OMOP CDM v5.4 keeps the source code in *_source_value and the standard
// concept in *_concept_id. The OMOP layer stored the SNOMED code or the RxCUI
// itself as conditionConceptId and drugConceptId (scripts/generate-graph-seed.py)
// or 0 (neo4j/fhir-to-omop-transform.cypher), so a cohort definition written
// against the OMOP vocabulary, a NeDRex disease module turned into one, found
// nobody.
//
// Every mapping below was read on 2026-11-24 from the OHDSI vocabulary service
// (https://api.ohdsi.org/WebAPI/vocabulary): the SNOMED or RxNorm concept with
// that code, and the standard concept it is or maps to. name is the standard
// concept's name.
//
// 1. Each SnomedConcept and RxNormConcept gets omopConceptId and
//    omopConceptName.
// 2. Each OMOP row whose source value is in the table gets the concept id.
// 3. A row the graph generator wrote before #1167, the code in the concept id
//    and no source value, gets both. No OMOP concept id the seeds use (201826,
//    320128, 1503297, ...) is a code in these tables, so a row that already
//    holds a real concept id is not touched; the test checks that.
//
// Idempotent. neo4j/seed.sh runs it after the transform and
// neo4j/migrate-rxnorm-codes.cypher. By hand:
//
//   docker exec -i health-dataspace-neo4j \
//     cypher-shell -u neo4j -p healthdataspace < neo4j/seed-omop-concept-ids.cypher
// ==============================================================================

// ── Conditions: SNOMED CT to the OMOP standard concept ────────────────────────
UNWIND [
  {code: '13645005', omop: 255573, name: 'Chronic obstructive pulmonary disease'},
  {code: '22298006', omop: 4329847, name: 'Myocardial infarction'},
  {code: '34000006', omop: 201606, name: 'Crohn\'s disease'},
  {code: '35489007', omop: 440383, name: 'Depressive disorder'},
  {code: '38341003', omop: 316866, name: 'Hypertensive disorder'},
  {code: '40930008', omop: 140673, name: 'Hypothyroidism'},
  {code: '44054006', omop: 201826, name: 'Type 2 diabetes mellitus'},
  {code: '46635009', omop: 201254, name: 'Type 1 diabetes mellitus'},
  {code: '49436004', omop: 313217, name: 'Atrial fibrillation'},
  {code: '50711007', omop: 197494, name: 'Viral hepatitis C'},
  {code: '55822004', omop: 432867, name: 'Hyperlipidemia'},
  {code: '56717001', omop: 434557, name: 'Tuberculosis'},
  {code: '64572001', omop: 4274025, name: 'Disease'},
  {code: '66857006', omop: 261687, name: 'Hemoptysis'},
  {code: '68566005', omop: 81902, name: 'Urinary tract infectious disease'},
  {code: '69896004', omop: 80809, name: 'Rheumatoid arthritis'},
  {code: '73211009', omop: 201820, name: 'Diabetes mellitus'},
  {code: '84114007', omop: 316139, name: 'Heart failure'},
  {code: '86406008', omop: 439727, name: 'Human immunodeficiency virus infection'},
  {code: '87522002', omop: 436659, name: 'Iron deficiency anemia'},
  {code: '90708001', omop: 198124, name: 'Kidney disease'},
  {code: '90935002', omop: 4236898, name: 'Hemophilia'},
  {code: '93761005', omop: 197500, name: 'Primary malignant neoplasm of colon'},
  {code: '128462008', omop: 432851, name: 'Metastatic malignant neoplasm'},
  {code: '156370009', omop: 40319772, name: 'Psoriatic arthritis'},
  {code: '190828008', omop: 4096347, name: 'Gouty arthropathy'},
  {code: '195967001', omop: 317009, name: 'Asthma'},
  {code: '197480006', omop: 442077, name: 'Anxiety disorder'},
  {code: '230572002', omop: 4044391, name: 'Neuropathy due to diabetes mellitus'},
  {code: '230690007', omop: 381316, name: 'Cerebrovascular accident'},
  {code: '235856003', omop: 194984, name: 'Disease of liver'},
  {code: '239720000', omop: 4035415, name: 'Tear of meniscus of knee'},
  {code: '254637007', omop: 4115276, name: 'Non-small cell lung cancer'},
  {code: '254837009', omop: 4112853, name: 'Malignant tumor of breast'},
  {code: '267036007', omop: 312437, name: 'Dyspnea'},
  {code: '278860009', omop: 4132891, name: 'Chronic low back pain'},
  {code: '363406005', omop: 4180790, name: 'Malignant tumor of colon'},
  {code: '367498001', omop: 4280726, name: 'Seasonal allergic rhinitis'},
  {code: '371631005', omop: 436074, name: 'Panic disorder'},
  {code: '396275006', omop: 80180, name: 'Osteoarthritis'},
  {code: '398254007', omop: 439393, name: 'Pre-eclampsia'},
  {code: '399068003', omop: 4163261, name: 'Malignant tumor of prostate'},
  {code: '414545008', omop: 4185932, name: 'Ischemic heart disease'},
  {code: '414916001', omop: 433736, name: 'Obesity'},
  {code: '415749005', omop: 4212711, name: 'Rupture of tendon'},
  {code: '433144002', omop: 443597, name: 'Chronic kidney disease stage 3'},
  {code: '709044004', omop: 46271022, name: 'Chronic kidney disease'}
] AS m
CALL (m) {
  MATCH (s:SnomedConcept) WHERE toString(coalesce(s.conceptId, s.code)) = m.code
  SET s.omopConceptId = m.omop, s.omopConceptName = m.name
}
CALL (m) {
  MATCH (oc:OMOPConditionOccurrence {conditionSourceValue: m.code})
  SET oc.conditionConceptId = m.omop
}
CALL (m) {
  MATCH (oc:OMOPConditionOccurrence {conditionConceptId: toInteger(m.code)})
  WHERE oc.conditionSourceValue IS NULL
  SET oc.conditionSourceValue = m.code, oc.conditionConceptId = m.omop
};

// insert-synthetic-schema-data.cypher wrote 443611, chronic kidney disease
// stage 5, on its stage 3 rows; 443597 is stage 3.
MATCH (oc:OMOPConditionOccurrence {conditionConceptId: 443611})
WHERE oc.name = 'CKD Stage 3 (OMOP)'
SET oc.conditionConceptId = 443597;

// ── Drugs: RxNorm to the OMOP standard concept ────────────────────────────────
UNWIND [
  {code: '2551', omop: 1797513, name: 'ciprofloxacin'},
  {code: '104377', omop: 19003851, name: 'lisinopril 10 MG Oral Tablet [Zestril]'},
  {code: '197361', omop: 1332419, name: 'amlodipine 5 MG Oral Tablet'},
  {code: '197381', omop: 1314008, name: 'atenolol 50 MG Oral Tablet'},
  {code: '197591', omop: 723042, name: 'diazepam 5 MG Oral Tablet'},
  {code: '197696', omop: 1154030, name: '72 HR fentanyl 0.075 MG/HR Transdermal System'},
  {code: '197770', omop: 19019044, name: 'hydrochlorothiazide 50 MG Oral Tablet'},
  {code: '197805', omop: 19019072, name: 'ibuprofen 400 MG Oral Tablet'},
  {code: '197807', omop: 19019074, name: 'ibuprofen 800 MG Oral Tablet'},
  {code: '197884', omop: 1308221, name: 'lisinopril 40 MG Oral Tablet'},
  {code: '198013', omop: 19019272, name: 'naproxen 250 MG Oral Tablet'},
  {code: '198051', omop: 19019418, name: 'omeprazole 20 MG Delayed Release Oral Capsule'},
  {code: '198145', omop: 1551101, name: 'prednisone 10 MG Oral Tablet'},
  {code: '198189', omop: 1334460, name: 'ramipril 5 MG Oral Capsule'},
  {code: '198211', omop: 1539407, name: 'simvastatin 40 MG Oral Tablet'},
  {code: '198240', omop: 19019851, name: 'tamoxifen 10 MG Oral Tablet'},
  {code: '198405', omop: 19019979, name: 'ibuprofen 100 MG Oral Tablet'},
  {code: '198440', omop: 19020053, name: 'acetaminophen 500 MG Oral Tablet'},
  {code: '213169', omop: 1322185, name: 'clopidogrel 75 MG Oral Tablet [Plavix]'},
  {code: '243670', omop: 19059056, name: 'aspirin 81 MG Oral Tablet'},
  {code: '245314', omop: 1154380, name: 'albuterol 5 MG/ML Inhalation Solution'},
  {code: '259255', omop: 1545959, name: 'atorvastatin 80 MG Oral Tablet'},
  {code: '261222', omop: 1713477, name: 'amoxicillin 200 MG Chewable Tablet [Amoxil]'},
  {code: '308136', omop: 19073094, name: 'amlodipine 2.5 MG Oral Tablet'},
  {code: '309362', omop: 19075601, name: 'clopidogrel 75 MG Oral Tablet'},
  {code: '310429', omop: 19077546, name: 'furosemide 20 MG Oral Tablet'},
  {code: '310431', omop: 19077548, name: 'gabapentin 300 MG Oral Capsule'},
  {code: '310490', omop: 19077638, name: 'glipizide 5 MG Oral Tablet'},
  {code: '310798', omop: 19078106, name: 'hydrochlorothiazide 25 MG Oral Tablet'},
  {code: '311041', omop: 19078559, name: 'insulin glargine 100 UNT/ML Injectable Solution'},
  {code: '311671', omop: 907020, name: 'metolazone 5 MG Oral Tablet'},
  {code: '312938', omop: 739207, name: 'sertraline 100 MG Oral Tablet'},
  {code: '312941', omop: 739209, name: 'sertraline 50 MG Oral Tablet'},
  {code: '312961', omop: 1539411, name: 'simvastatin 20 MG Oral Tablet'},
  {code: '313988', omop: 957136, name: 'furosemide 40 MG Oral Tablet'},
  {code: '314076', omop: 19080128, name: 'lisinopril 10 MG Oral Tablet'},
  {code: '314200', omop: 19080217, name: 'pantoprazole 40 MG Delayed Release Oral Tablet'},
  {code: '316672', omop: 1539464, name: 'simvastatin 10 MG'},
  {code: '352272', omop: 715965, name: 'escitalopram 10 MG Oral Tablet [Lexapro]'},
  {code: '562251', omop: 1713671, name: 'amoxicillin 250 MG / clavulanate 125 MG Oral Tablet'},
  {code: '617310', omop: 19123592, name: 'atorvastatin 20 MG Oral Tablet'},
  {code: '855332', omop: 40163554, name: 'warfarin sodium 5 MG Oral Tablet'},
  {code: '859747', omop: 40165245, name: 'rosuvastatin calcium 10 MG Oral Tablet'},
  {code: '860975', omop: 40163924, name: '24 HR metformin hydrochloride 500 MG Extended Release Oral Tablet'},
  {code: '861007', omop: 40164929, name: 'metformin hydrochloride 500 MG Oral Tablet'},
  {code: '866436', omop: 40166830, name: '24 HR metoprolol succinate 50 MG Extended Release Oral Tablet'},
  {code: '897122', omop: 40169222, name: '3 ML liraglutide 6 MG/ML Pen Injector'},
  {code: '966221', omop: 40175210, name: 'levothyroxine sodium 0.05 MG Oral Tablet'},
  {code: '979492', omop: 40185304, name: 'losartan potassium 50 MG Oral Tablet'},
  {code: '1049630', omop: 40232448, name: 'diphenhydramine hydrochloride 25 MG Oral Tablet'},
  {code: '1246304', omop: 42708508, name: '120 ACTUAT budesonide 0.16 MG/ACTUAT / formoterol fumarate 0.0045 MG/ACTUAT Metered Dose Inhaler'},
  {code: '1364445', omop: 43013030, name: 'apixaban 5 MG Oral Tablet'},
  {code: '1488569', omop: 44785831, name: 'dapagliflozin 10 MG Oral Tablet'},
  {code: '1545658', omop: 45774754, name: 'empagliflozin 10 MG Oral Tablet'},
  {code: '1546356', omop: 45775372, name: 'dabigatran'},
  {code: '1598339', omop: 45892703, name: 'ethanol 0.523 ML/ML Topical Gel'},
  {code: '2123111', omop: 1511248, name: 'NDA020503 200 ACTUAT albuterol 0.09 MG/ACTUAT Metered Dose Inhaler'},
  {code: '2553601', omop: 1537598, name: '0.5 ML semaglutide 1 MG/ML Auto-Injector'},
  {code: '2601743', omop: 780255, name: '0.5 ML tirzepatide 10 MG/ML Auto-Injector'}
] AS m
CALL (m) {
  MATCH (r:RxNormConcept) WHERE toString(r.rxcui) = m.code
  SET r.omopConceptId = m.omop, r.omopConceptName = m.name
}
CALL (m) {
  MATCH (de:OMOPDrugExposure {drugSourceValue: m.code})
  SET de.drugConceptId = m.omop
}
CALL (m) {
  MATCH (de:OMOPDrugExposure {drugConceptId: toInteger(m.code)})
  WHERE de.drugSourceValue IS NULL
  SET de.drugSourceValue = m.code, de.drugConceptId = m.omop
};
