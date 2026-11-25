// ==============================================================================
// Migration: RxNorm codes that named another drug (#1167)
//
// scripts/generate-graph-seed.py paired 27 of its 30 RxCUIs with the name of
// another drug: "Lisinopril 10 mg Oral Tab" carried 316672 (simvastatin 10 MG),
// "Insulin Glargine 100 U/mL" 197884 (lisinopril 40 MG), and 1861634 and
// 1245689 are no RxCUI at all. scripts/generate-fhir-bundles.py had four more
// (198211 "Aspirin 81 MG" is simvastatin 40 MG), scripts/generate-persona-
// overview-seed.py three on P1's list. Mapped to OMOP or NeDRex,
// those prescriptions landed on the wrong drug. The generators now write the
// right codes; this file corrects a graph an earlier run loaded.
//
// Each RxCUI was checked on 2026-11-24 with RxNav
// (https://rxnav.nlm.nih.gov/REST/rxcui/<id>/properties.json); newName is
// the name RxNav returns for the new code, oldName for the old one.
//
// A MedicationRequest is recoded only when its display names the intended
// drug, so one that really is simvastatin keeps 316672. That matters because
// 310798 is both an old code (labelled metoprolol) and a new one
// (hydrochlorothiazide). The request moves its CODED_BY to the right
// RxNormConcept and its OMOP drug exposure takes the new source value;
// neo4j/seed-omop-concept-ids.cypher then sets the OMOP concept id. An old
// concept keeps its node with its real name; a code that does not exist goes
// once nothing is coded by it. Idempotent: every statement matches old codes.
//
// neo4j/seed.sh runs it before neo4j/seed-omop-concept-ids.cypher. By hand:
//
//   docker exec -i health-dataspace-neo4j \
//     cypher-shell -u neo4j -p healthdataspace < neo4j/migrate-rxnorm-codes.cypher
// ==============================================================================

// ── 1. The right concepts exist, named as RxNav names them ────────────────────
// The graph generator keys RxNormConcept by an integer rxcui; a concept that
// already exists under either form is reused (#1231 is the key's type).
UNWIND [
  {old: '316672', new: '314076', label: 'lisinopril 10 mg oral tab', oldName: 'simvastatin 10 MG', newName: 'lisinopril 10 MG Oral Tablet'},
  {old: '259255', new: '617310', label: 'atorvastatin 20 mg oral tab', oldName: 'atorvastatin 80 MG Oral Tablet', newName: 'atorvastatin 20 MG Oral Tablet'},
  {old: '198211', new: '198051', label: 'omeprazole 20 mg oral cap', oldName: 'simvastatin 40 MG Oral Tablet', newName: 'omeprazole 20 MG Delayed Release Oral Capsule'},
  {old: '310798', new: '866436', label: 'metoprolol succinate 50 mg tab', oldName: 'hydrochlorothiazide 25 MG Oral Tablet', newName: '24 HR metoprolol succinate 50 MG Extended Release Oral Tablet'},
  {old: '1861634', new: '1545658', label: 'empagliflozin 10 mg oral tab', oldName: null, newName: 'empagliflozin 10 MG Oral Tablet'},
  {old: '1598339', new: '1488569', label: 'dapagliflozin 10 mg oral tab', oldName: 'ethanol 0.523 ML/ML Topical Gel', newName: 'dapagliflozin 10 MG Oral Tablet'},
  {old: '213169', new: '859747', label: 'rosuvastatin 10 mg tab', oldName: 'clopidogrel 75 MG Oral Tablet [Plavix]', newName: 'rosuvastatin calcium 10 MG Oral Tablet'},
  {old: '352272', new: '309362', label: 'clopidogrel 75 mg tab', oldName: 'escitalopram 10 MG Oral Tablet [Lexapro]', newName: 'clopidogrel 75 MG Oral Tablet'},
  {old: '1049630', new: '1364445', label: 'apixaban 5 mg oral tab', oldName: 'diphenhydramine hydrochloride 25 MG Oral Tablet', newName: 'apixaban 5 MG Oral Tablet'},
  {old: '197381', new: '966221', label: 'levothyroxine 50 mcg tab', oldName: 'atenolol 50 MG Oral Tablet', newName: 'levothyroxine sodium 0.05 MG Oral Tablet'},
  {old: '312938', new: '312941', label: 'sertraline 50 mg oral tab', oldName: 'sertraline 100 MG Oral Tablet', newName: 'sertraline 50 MG Oral Tablet'},
  {old: '197591', new: '313988', label: 'furosemide 40 mg oral tab', oldName: 'diazepam 5 MG Oral Tablet', newName: 'furosemide 40 MG Oral Tablet'},
  {old: '197770', new: '310798', label: 'hydrochlorothiazide 25 mg tab', oldName: 'hydrochlorothiazide 50 MG Oral Tablet', newName: 'hydrochlorothiazide 25 MG Oral Tablet'},
  {old: '198405', new: '198145', label: 'prednisone 10 mg oral tab', oldName: 'ibuprofen 100 MG Oral Tablet', newName: 'prednisone 10 MG Oral Tablet'},
  {old: '311671', new: '310431', label: 'gabapentin 300 mg oral cap', oldName: 'metolazone 5 MG Oral Tablet', newName: 'gabapentin 300 MG Oral Capsule'},
  {old: '198240', new: '314200', label: 'pantoprazole 40 mg tab', oldName: 'tamoxifen 10 MG Oral Tablet', newName: 'pantoprazole 40 MG Delayed Release Oral Tablet'},
  {old: '197696', new: '310490', label: 'glipizide 5 mg oral tab', oldName: '72 HR fentanyl 0.075 MG/HR Transdermal System', newName: 'glipizide 5 MG Oral Tablet'},
  {old: '197884', new: '311041', label: 'insulin glargine 100 u/ml', oldName: 'lisinopril 40 MG Oral Tablet', newName: 'insulin glargine 100 UNT/ML Injectable Solution'},
  {old: '261222', new: '2553601', label: 'semaglutide 0.5 mg inj', oldName: 'amoxicillin 200 MG Chewable Tablet [Amoxil]', newName: '0.5 ML semaglutide 1 MG/ML Auto-Injector'},
  {old: '1546356', new: '2601743', label: 'tirzepatide 5 mg inj', oldName: 'dabigatran', newName: '0.5 ML tirzepatide 10 MG/ML Auto-Injector'},
  {old: '198013', new: '979492', label: 'losartan 50 mg tab', oldName: 'naproxen 250 MG Oral Tablet', newName: 'losartan potassium 50 MG Oral Tablet'},
  {old: '308136', new: '312961', label: 'simvastatin 20 mg tab', oldName: 'amlodipine 2.5 MG Oral Tablet', newName: 'simvastatin 20 MG Oral Tablet'},
  {old: '562251', new: '198189', label: 'ramipril 5 mg cap', oldName: 'amoxicillin 250 MG / clavulanate 125 MG Oral Tablet', newName: 'ramipril 5 MG Oral Capsule'},
  {old: '197807', new: '197805', label: 'ibuprofen 400 mg tab', oldName: 'ibuprofen 800 MG Oral Tablet', newName: 'ibuprofen 400 MG Oral Tablet'},
  {old: '310429', new: '198440', label: 'acetaminophen 500 mg tab', oldName: 'furosemide 20 MG Oral Tablet', newName: 'acetaminophen 500 MG Oral Tablet'},
  {old: '897122', new: '2123111', label: 'salbutamol 100 mcg inhaler', oldName: '3 ML liraglutide 6 MG/ML Pen Injector', newName: 'NDA020503 200 ACTUAT albuterol 0.09 MG/ACTUAT Metered Dose Inhaler'},
  {old: '1245689', new: '1246304', label: 'budesonide/formoterol inhaler', oldName: null, newName: '120 ACTUAT budesonide 0.16 MG/ACTUAT / formoterol fumarate 0.0045 MG/ACTUAT Metered Dose Inhaler'},
  {old: '259255', new: '617310', label: 'atorvastatin 20 mg oral tablet', oldName: 'atorvastatin 80 MG Oral Tablet', newName: 'atorvastatin 20 MG Oral Tablet'},
  {old: '313782', new: '198051', label: 'omeprazole 20 mg delayed release oral capsule', oldName: 'acetaminophen 325 MG Oral Tablet', newName: 'omeprazole 20 MG Delayed Release Oral Capsule'},
  {old: '198211', new: '243670', label: 'aspirin 81 mg oral tablet', oldName: 'simvastatin 40 MG Oral Tablet', newName: 'aspirin 81 MG Oral Tablet'},
  {old: '835829', new: '311041', label: 'insulin glargine 100 unt/ml injectable solution', oldName: 'testosterone cypionate 100 MG/ML Injectable Solution', newName: 'insulin glargine 100 UNT/ML Injectable Solution'},
  {old: '197361', new: '314076', label: 'lisinopril 10 mg oral tablet', oldName: 'amlodipine 5 MG Oral Tablet', newName: 'lisinopril 10 MG Oral Tablet'},
  {old: '308460', new: '2123111', label: 'salbutamol 100 mcg inhaler', oldName: 'azithromycin 250 MG Oral Tablet', newName: 'NDA020503 200 ACTUAT albuterol 0.09 MG/ACTUAT Metered Dose Inhaler'},
  {old: '209459', new: '617310', label: 'atorvastatin 20 mg oral tablet', oldName: 'acetaminophen 500 MG Oral Tablet [Tylenol]', newName: 'atorvastatin 20 MG Oral Tablet'}
] AS m
OPTIONAL MATCH (have:RxNormConcept) WHERE toString(have.rxcui) = m.new
WITH m, count(have) AS existing
WHERE existing = 0
MERGE (n:RxNormConcept {rxcui: toInteger(m.new)})
  ON CREATE SET n.display = m.newName,
                n.system = 'http://www.nlm.nih.gov/research/umls/rxnorm';

// ── 2. Recode the requests whose label names the intended drug ────────────────
UNWIND [
  {old: '316672', new: '314076', label: 'lisinopril 10 mg oral tab', oldName: 'simvastatin 10 MG', newName: 'lisinopril 10 MG Oral Tablet'},
  {old: '259255', new: '617310', label: 'atorvastatin 20 mg oral tab', oldName: 'atorvastatin 80 MG Oral Tablet', newName: 'atorvastatin 20 MG Oral Tablet'},
  {old: '198211', new: '198051', label: 'omeprazole 20 mg oral cap', oldName: 'simvastatin 40 MG Oral Tablet', newName: 'omeprazole 20 MG Delayed Release Oral Capsule'},
  {old: '310798', new: '866436', label: 'metoprolol succinate 50 mg tab', oldName: 'hydrochlorothiazide 25 MG Oral Tablet', newName: '24 HR metoprolol succinate 50 MG Extended Release Oral Tablet'},
  {old: '1861634', new: '1545658', label: 'empagliflozin 10 mg oral tab', oldName: null, newName: 'empagliflozin 10 MG Oral Tablet'},
  {old: '1598339', new: '1488569', label: 'dapagliflozin 10 mg oral tab', oldName: 'ethanol 0.523 ML/ML Topical Gel', newName: 'dapagliflozin 10 MG Oral Tablet'},
  {old: '213169', new: '859747', label: 'rosuvastatin 10 mg tab', oldName: 'clopidogrel 75 MG Oral Tablet [Plavix]', newName: 'rosuvastatin calcium 10 MG Oral Tablet'},
  {old: '352272', new: '309362', label: 'clopidogrel 75 mg tab', oldName: 'escitalopram 10 MG Oral Tablet [Lexapro]', newName: 'clopidogrel 75 MG Oral Tablet'},
  {old: '1049630', new: '1364445', label: 'apixaban 5 mg oral tab', oldName: 'diphenhydramine hydrochloride 25 MG Oral Tablet', newName: 'apixaban 5 MG Oral Tablet'},
  {old: '197381', new: '966221', label: 'levothyroxine 50 mcg tab', oldName: 'atenolol 50 MG Oral Tablet', newName: 'levothyroxine sodium 0.05 MG Oral Tablet'},
  {old: '312938', new: '312941', label: 'sertraline 50 mg oral tab', oldName: 'sertraline 100 MG Oral Tablet', newName: 'sertraline 50 MG Oral Tablet'},
  {old: '197591', new: '313988', label: 'furosemide 40 mg oral tab', oldName: 'diazepam 5 MG Oral Tablet', newName: 'furosemide 40 MG Oral Tablet'},
  {old: '197770', new: '310798', label: 'hydrochlorothiazide 25 mg tab', oldName: 'hydrochlorothiazide 50 MG Oral Tablet', newName: 'hydrochlorothiazide 25 MG Oral Tablet'},
  {old: '198405', new: '198145', label: 'prednisone 10 mg oral tab', oldName: 'ibuprofen 100 MG Oral Tablet', newName: 'prednisone 10 MG Oral Tablet'},
  {old: '311671', new: '310431', label: 'gabapentin 300 mg oral cap', oldName: 'metolazone 5 MG Oral Tablet', newName: 'gabapentin 300 MG Oral Capsule'},
  {old: '198240', new: '314200', label: 'pantoprazole 40 mg tab', oldName: 'tamoxifen 10 MG Oral Tablet', newName: 'pantoprazole 40 MG Delayed Release Oral Tablet'},
  {old: '197696', new: '310490', label: 'glipizide 5 mg oral tab', oldName: '72 HR fentanyl 0.075 MG/HR Transdermal System', newName: 'glipizide 5 MG Oral Tablet'},
  {old: '197884', new: '311041', label: 'insulin glargine 100 u/ml', oldName: 'lisinopril 40 MG Oral Tablet', newName: 'insulin glargine 100 UNT/ML Injectable Solution'},
  {old: '261222', new: '2553601', label: 'semaglutide 0.5 mg inj', oldName: 'amoxicillin 200 MG Chewable Tablet [Amoxil]', newName: '0.5 ML semaglutide 1 MG/ML Auto-Injector'},
  {old: '1546356', new: '2601743', label: 'tirzepatide 5 mg inj', oldName: 'dabigatran', newName: '0.5 ML tirzepatide 10 MG/ML Auto-Injector'},
  {old: '198013', new: '979492', label: 'losartan 50 mg tab', oldName: 'naproxen 250 MG Oral Tablet', newName: 'losartan potassium 50 MG Oral Tablet'},
  {old: '308136', new: '312961', label: 'simvastatin 20 mg tab', oldName: 'amlodipine 2.5 MG Oral Tablet', newName: 'simvastatin 20 MG Oral Tablet'},
  {old: '562251', new: '198189', label: 'ramipril 5 mg cap', oldName: 'amoxicillin 250 MG / clavulanate 125 MG Oral Tablet', newName: 'ramipril 5 MG Oral Capsule'},
  {old: '197807', new: '197805', label: 'ibuprofen 400 mg tab', oldName: 'ibuprofen 800 MG Oral Tablet', newName: 'ibuprofen 400 MG Oral Tablet'},
  {old: '310429', new: '198440', label: 'acetaminophen 500 mg tab', oldName: 'furosemide 20 MG Oral Tablet', newName: 'acetaminophen 500 MG Oral Tablet'},
  {old: '897122', new: '2123111', label: 'salbutamol 100 mcg inhaler', oldName: '3 ML liraglutide 6 MG/ML Pen Injector', newName: 'NDA020503 200 ACTUAT albuterol 0.09 MG/ACTUAT Metered Dose Inhaler'},
  {old: '1245689', new: '1246304', label: 'budesonide/formoterol inhaler', oldName: null, newName: '120 ACTUAT budesonide 0.16 MG/ACTUAT / formoterol fumarate 0.0045 MG/ACTUAT Metered Dose Inhaler'},
  {old: '259255', new: '617310', label: 'atorvastatin 20 mg oral tablet', oldName: 'atorvastatin 80 MG Oral Tablet', newName: 'atorvastatin 20 MG Oral Tablet'},
  {old: '313782', new: '198051', label: 'omeprazole 20 mg delayed release oral capsule', oldName: 'acetaminophen 325 MG Oral Tablet', newName: 'omeprazole 20 MG Delayed Release Oral Capsule'},
  {old: '198211', new: '243670', label: 'aspirin 81 mg oral tablet', oldName: 'simvastatin 40 MG Oral Tablet', newName: 'aspirin 81 MG Oral Tablet'},
  {old: '835829', new: '311041', label: 'insulin glargine 100 unt/ml injectable solution', oldName: 'testosterone cypionate 100 MG/ML Injectable Solution', newName: 'insulin glargine 100 UNT/ML Injectable Solution'},
  {old: '197361', new: '314076', label: 'lisinopril 10 mg oral tablet', oldName: 'amlodipine 5 MG Oral Tablet', newName: 'lisinopril 10 MG Oral Tablet'},
  {old: '308460', new: '2123111', label: 'salbutamol 100 mcg inhaler', oldName: 'azithromycin 250 MG Oral Tablet', newName: 'NDA020503 200 ACTUAT albuterol 0.09 MG/ACTUAT Metered Dose Inhaler'},
  {old: '209459', new: '617310', label: 'atorvastatin 20 mg oral tablet', oldName: 'acetaminophen 500 MG Oral Tablet [Tylenol]', newName: 'atorvastatin 20 MG Oral Tablet'}
] AS m
MATCH (mr:MedicationRequest)
WHERE coalesce(mr.code, mr.medicationCode) = m.old
  AND toLower(coalesce(mr.display, mr.name, '')) = m.label
MATCH (n:RxNormConcept) WHERE toString(n.rxcui) = m.new
OPTIONAL MATCH (mr)-[wrong:CODED_BY]->(o:RxNormConcept) WHERE toString(o.rxcui) = m.old
DELETE wrong
WITH DISTINCT mr, m, n
SET mr.code = CASE WHEN mr.code IS NULL THEN null ELSE m.new END,
    mr.medicationCode = CASE WHEN mr.medicationCode IS NULL THEN null ELSE m.new END
MERGE (mr)-[:CODED_BY]->(n)
WITH mr, m
OPTIONAL MATCH (mr)-[:MAPPED_TO]->(de:OMOPDrugExposure)
FOREACH (_ IN CASE WHEN de IS NULL THEN [] ELSE [1] END |
  SET de.drugSourceValue = m.new, de.drugConceptId = 0);

// ── 2b. OMOP drug rows the generator wrote without a MAPPED_TO ────────────────
// Rows from before ADR-098 have no link to their request, so step 2 does not
// reach them. They carry the old code (as drugConceptId, or as drugSourceValue
// once seed-omop-concept-ids.cypher has run) and the name 'OMOP <label>'.
UNWIND [
  {old: '316672', new: '314076', label: 'lisinopril 10 mg oral tab', oldName: 'simvastatin 10 MG', newName: 'lisinopril 10 MG Oral Tablet'},
  {old: '259255', new: '617310', label: 'atorvastatin 20 mg oral tab', oldName: 'atorvastatin 80 MG Oral Tablet', newName: 'atorvastatin 20 MG Oral Tablet'},
  {old: '198211', new: '198051', label: 'omeprazole 20 mg oral cap', oldName: 'simvastatin 40 MG Oral Tablet', newName: 'omeprazole 20 MG Delayed Release Oral Capsule'},
  {old: '310798', new: '866436', label: 'metoprolol succinate 50 mg tab', oldName: 'hydrochlorothiazide 25 MG Oral Tablet', newName: '24 HR metoprolol succinate 50 MG Extended Release Oral Tablet'},
  {old: '1861634', new: '1545658', label: 'empagliflozin 10 mg oral tab', oldName: null, newName: 'empagliflozin 10 MG Oral Tablet'},
  {old: '1598339', new: '1488569', label: 'dapagliflozin 10 mg oral tab', oldName: 'ethanol 0.523 ML/ML Topical Gel', newName: 'dapagliflozin 10 MG Oral Tablet'},
  {old: '213169', new: '859747', label: 'rosuvastatin 10 mg tab', oldName: 'clopidogrel 75 MG Oral Tablet [Plavix]', newName: 'rosuvastatin calcium 10 MG Oral Tablet'},
  {old: '352272', new: '309362', label: 'clopidogrel 75 mg tab', oldName: 'escitalopram 10 MG Oral Tablet [Lexapro]', newName: 'clopidogrel 75 MG Oral Tablet'},
  {old: '1049630', new: '1364445', label: 'apixaban 5 mg oral tab', oldName: 'diphenhydramine hydrochloride 25 MG Oral Tablet', newName: 'apixaban 5 MG Oral Tablet'},
  {old: '197381', new: '966221', label: 'levothyroxine 50 mcg tab', oldName: 'atenolol 50 MG Oral Tablet', newName: 'levothyroxine sodium 0.05 MG Oral Tablet'},
  {old: '312938', new: '312941', label: 'sertraline 50 mg oral tab', oldName: 'sertraline 100 MG Oral Tablet', newName: 'sertraline 50 MG Oral Tablet'},
  {old: '197591', new: '313988', label: 'furosemide 40 mg oral tab', oldName: 'diazepam 5 MG Oral Tablet', newName: 'furosemide 40 MG Oral Tablet'},
  {old: '197770', new: '310798', label: 'hydrochlorothiazide 25 mg tab', oldName: 'hydrochlorothiazide 50 MG Oral Tablet', newName: 'hydrochlorothiazide 25 MG Oral Tablet'},
  {old: '198405', new: '198145', label: 'prednisone 10 mg oral tab', oldName: 'ibuprofen 100 MG Oral Tablet', newName: 'prednisone 10 MG Oral Tablet'},
  {old: '311671', new: '310431', label: 'gabapentin 300 mg oral cap', oldName: 'metolazone 5 MG Oral Tablet', newName: 'gabapentin 300 MG Oral Capsule'},
  {old: '198240', new: '314200', label: 'pantoprazole 40 mg tab', oldName: 'tamoxifen 10 MG Oral Tablet', newName: 'pantoprazole 40 MG Delayed Release Oral Tablet'},
  {old: '197696', new: '310490', label: 'glipizide 5 mg oral tab', oldName: '72 HR fentanyl 0.075 MG/HR Transdermal System', newName: 'glipizide 5 MG Oral Tablet'},
  {old: '197884', new: '311041', label: 'insulin glargine 100 u/ml', oldName: 'lisinopril 40 MG Oral Tablet', newName: 'insulin glargine 100 UNT/ML Injectable Solution'},
  {old: '261222', new: '2553601', label: 'semaglutide 0.5 mg inj', oldName: 'amoxicillin 200 MG Chewable Tablet [Amoxil]', newName: '0.5 ML semaglutide 1 MG/ML Auto-Injector'},
  {old: '1546356', new: '2601743', label: 'tirzepatide 5 mg inj', oldName: 'dabigatran', newName: '0.5 ML tirzepatide 10 MG/ML Auto-Injector'},
  {old: '198013', new: '979492', label: 'losartan 50 mg tab', oldName: 'naproxen 250 MG Oral Tablet', newName: 'losartan potassium 50 MG Oral Tablet'},
  {old: '308136', new: '312961', label: 'simvastatin 20 mg tab', oldName: 'amlodipine 2.5 MG Oral Tablet', newName: 'simvastatin 20 MG Oral Tablet'},
  {old: '562251', new: '198189', label: 'ramipril 5 mg cap', oldName: 'amoxicillin 250 MG / clavulanate 125 MG Oral Tablet', newName: 'ramipril 5 MG Oral Capsule'},
  {old: '197807', new: '197805', label: 'ibuprofen 400 mg tab', oldName: 'ibuprofen 800 MG Oral Tablet', newName: 'ibuprofen 400 MG Oral Tablet'},
  {old: '310429', new: '198440', label: 'acetaminophen 500 mg tab', oldName: 'furosemide 20 MG Oral Tablet', newName: 'acetaminophen 500 MG Oral Tablet'},
  {old: '897122', new: '2123111', label: 'salbutamol 100 mcg inhaler', oldName: '3 ML liraglutide 6 MG/ML Pen Injector', newName: 'NDA020503 200 ACTUAT albuterol 0.09 MG/ACTUAT Metered Dose Inhaler'},
  {old: '1245689', new: '1246304', label: 'budesonide/formoterol inhaler', oldName: null, newName: '120 ACTUAT budesonide 0.16 MG/ACTUAT / formoterol fumarate 0.0045 MG/ACTUAT Metered Dose Inhaler'},
  {old: '259255', new: '617310', label: 'atorvastatin 20 mg oral tablet', oldName: 'atorvastatin 80 MG Oral Tablet', newName: 'atorvastatin 20 MG Oral Tablet'},
  {old: '313782', new: '198051', label: 'omeprazole 20 mg delayed release oral capsule', oldName: 'acetaminophen 325 MG Oral Tablet', newName: 'omeprazole 20 MG Delayed Release Oral Capsule'},
  {old: '198211', new: '243670', label: 'aspirin 81 mg oral tablet', oldName: 'simvastatin 40 MG Oral Tablet', newName: 'aspirin 81 MG Oral Tablet'},
  {old: '835829', new: '311041', label: 'insulin glargine 100 unt/ml injectable solution', oldName: 'testosterone cypionate 100 MG/ML Injectable Solution', newName: 'insulin glargine 100 UNT/ML Injectable Solution'},
  {old: '197361', new: '314076', label: 'lisinopril 10 mg oral tablet', oldName: 'amlodipine 5 MG Oral Tablet', newName: 'lisinopril 10 MG Oral Tablet'},
  {old: '308460', new: '2123111', label: 'salbutamol 100 mcg inhaler', oldName: 'azithromycin 250 MG Oral Tablet', newName: 'NDA020503 200 ACTUAT albuterol 0.09 MG/ACTUAT Metered Dose Inhaler'},
  {old: '209459', new: '617310', label: 'atorvastatin 20 mg oral tablet', oldName: 'acetaminophen 500 MG Oral Tablet [Tylenol]', newName: 'atorvastatin 20 MG Oral Tablet'}
] AS m
MATCH (de:OMOPDrugExposure)
WHERE (de.drugSourceValue = m.old
       OR (de.drugSourceValue IS NULL AND toString(de.drugConceptId) = m.old))
  AND toLower(coalesce(de.name, '')) = 'omop ' + m.label
SET de.drugSourceValue = m.new, de.drugConceptId = 0;

// ── 2c. P1's request under its old id, once the seed wrote the new one ────────
// scripts/generate-persona-overview-seed.py keys P1's requests by their code
// (med-p1-<rxcui>), so a corrected code is a new node. The old one, recoded by
// step 2, would be a second copy; it goes with the OMOP row mapped from it.
UNWIND [
  {old: '197361', new: '314076'},
  {old: '308460', new: '2123111'},
  {old: '209459', new: '617310'}
] AS m
MATCH (p:Patient)-[:HAS_MEDICATION_REQUEST]->(stale:MedicationRequest {resourceId: 'med-p1-' + m.old})
WHERE EXISTS { MATCH (p)-[:HAS_MEDICATION_REQUEST]->(:MedicationRequest {resourceId: 'med-p1-' + m.new}) }
OPTIONAL MATCH (stale)-[:MAPPED_TO]->(row)
DETACH DELETE stale, row;

// ── 3. Old concepts carry their real name; codes that do not exist go ─────────
UNWIND [
  {old: '316672', new: '314076', label: 'lisinopril 10 mg oral tab', oldName: 'simvastatin 10 MG', newName: 'lisinopril 10 MG Oral Tablet'},
  {old: '259255', new: '617310', label: 'atorvastatin 20 mg oral tab', oldName: 'atorvastatin 80 MG Oral Tablet', newName: 'atorvastatin 20 MG Oral Tablet'},
  {old: '198211', new: '198051', label: 'omeprazole 20 mg oral cap', oldName: 'simvastatin 40 MG Oral Tablet', newName: 'omeprazole 20 MG Delayed Release Oral Capsule'},
  {old: '310798', new: '866436', label: 'metoprolol succinate 50 mg tab', oldName: 'hydrochlorothiazide 25 MG Oral Tablet', newName: '24 HR metoprolol succinate 50 MG Extended Release Oral Tablet'},
  {old: '1861634', new: '1545658', label: 'empagliflozin 10 mg oral tab', oldName: null, newName: 'empagliflozin 10 MG Oral Tablet'},
  {old: '1598339', new: '1488569', label: 'dapagliflozin 10 mg oral tab', oldName: 'ethanol 0.523 ML/ML Topical Gel', newName: 'dapagliflozin 10 MG Oral Tablet'},
  {old: '213169', new: '859747', label: 'rosuvastatin 10 mg tab', oldName: 'clopidogrel 75 MG Oral Tablet [Plavix]', newName: 'rosuvastatin calcium 10 MG Oral Tablet'},
  {old: '352272', new: '309362', label: 'clopidogrel 75 mg tab', oldName: 'escitalopram 10 MG Oral Tablet [Lexapro]', newName: 'clopidogrel 75 MG Oral Tablet'},
  {old: '1049630', new: '1364445', label: 'apixaban 5 mg oral tab', oldName: 'diphenhydramine hydrochloride 25 MG Oral Tablet', newName: 'apixaban 5 MG Oral Tablet'},
  {old: '197381', new: '966221', label: 'levothyroxine 50 mcg tab', oldName: 'atenolol 50 MG Oral Tablet', newName: 'levothyroxine sodium 0.05 MG Oral Tablet'},
  {old: '312938', new: '312941', label: 'sertraline 50 mg oral tab', oldName: 'sertraline 100 MG Oral Tablet', newName: 'sertraline 50 MG Oral Tablet'},
  {old: '197591', new: '313988', label: 'furosemide 40 mg oral tab', oldName: 'diazepam 5 MG Oral Tablet', newName: 'furosemide 40 MG Oral Tablet'},
  {old: '197770', new: '310798', label: 'hydrochlorothiazide 25 mg tab', oldName: 'hydrochlorothiazide 50 MG Oral Tablet', newName: 'hydrochlorothiazide 25 MG Oral Tablet'},
  {old: '198405', new: '198145', label: 'prednisone 10 mg oral tab', oldName: 'ibuprofen 100 MG Oral Tablet', newName: 'prednisone 10 MG Oral Tablet'},
  {old: '311671', new: '310431', label: 'gabapentin 300 mg oral cap', oldName: 'metolazone 5 MG Oral Tablet', newName: 'gabapentin 300 MG Oral Capsule'},
  {old: '198240', new: '314200', label: 'pantoprazole 40 mg tab', oldName: 'tamoxifen 10 MG Oral Tablet', newName: 'pantoprazole 40 MG Delayed Release Oral Tablet'},
  {old: '197696', new: '310490', label: 'glipizide 5 mg oral tab', oldName: '72 HR fentanyl 0.075 MG/HR Transdermal System', newName: 'glipizide 5 MG Oral Tablet'},
  {old: '197884', new: '311041', label: 'insulin glargine 100 u/ml', oldName: 'lisinopril 40 MG Oral Tablet', newName: 'insulin glargine 100 UNT/ML Injectable Solution'},
  {old: '261222', new: '2553601', label: 'semaglutide 0.5 mg inj', oldName: 'amoxicillin 200 MG Chewable Tablet [Amoxil]', newName: '0.5 ML semaglutide 1 MG/ML Auto-Injector'},
  {old: '1546356', new: '2601743', label: 'tirzepatide 5 mg inj', oldName: 'dabigatran', newName: '0.5 ML tirzepatide 10 MG/ML Auto-Injector'},
  {old: '198013', new: '979492', label: 'losartan 50 mg tab', oldName: 'naproxen 250 MG Oral Tablet', newName: 'losartan potassium 50 MG Oral Tablet'},
  {old: '308136', new: '312961', label: 'simvastatin 20 mg tab', oldName: 'amlodipine 2.5 MG Oral Tablet', newName: 'simvastatin 20 MG Oral Tablet'},
  {old: '562251', new: '198189', label: 'ramipril 5 mg cap', oldName: 'amoxicillin 250 MG / clavulanate 125 MG Oral Tablet', newName: 'ramipril 5 MG Oral Capsule'},
  {old: '197807', new: '197805', label: 'ibuprofen 400 mg tab', oldName: 'ibuprofen 800 MG Oral Tablet', newName: 'ibuprofen 400 MG Oral Tablet'},
  {old: '310429', new: '198440', label: 'acetaminophen 500 mg tab', oldName: 'furosemide 20 MG Oral Tablet', newName: 'acetaminophen 500 MG Oral Tablet'},
  {old: '897122', new: '2123111', label: 'salbutamol 100 mcg inhaler', oldName: '3 ML liraglutide 6 MG/ML Pen Injector', newName: 'NDA020503 200 ACTUAT albuterol 0.09 MG/ACTUAT Metered Dose Inhaler'},
  {old: '1245689', new: '1246304', label: 'budesonide/formoterol inhaler', oldName: null, newName: '120 ACTUAT budesonide 0.16 MG/ACTUAT / formoterol fumarate 0.0045 MG/ACTUAT Metered Dose Inhaler'},
  {old: '259255', new: '617310', label: 'atorvastatin 20 mg oral tablet', oldName: 'atorvastatin 80 MG Oral Tablet', newName: 'atorvastatin 20 MG Oral Tablet'},
  {old: '313782', new: '198051', label: 'omeprazole 20 mg delayed release oral capsule', oldName: 'acetaminophen 325 MG Oral Tablet', newName: 'omeprazole 20 MG Delayed Release Oral Capsule'},
  {old: '198211', new: '243670', label: 'aspirin 81 mg oral tablet', oldName: 'simvastatin 40 MG Oral Tablet', newName: 'aspirin 81 MG Oral Tablet'},
  {old: '835829', new: '311041', label: 'insulin glargine 100 unt/ml injectable solution', oldName: 'testosterone cypionate 100 MG/ML Injectable Solution', newName: 'insulin glargine 100 UNT/ML Injectable Solution'},
  {old: '197361', new: '314076', label: 'lisinopril 10 mg oral tablet', oldName: 'amlodipine 5 MG Oral Tablet', newName: 'lisinopril 10 MG Oral Tablet'},
  {old: '308460', new: '2123111', label: 'salbutamol 100 mcg inhaler', oldName: 'azithromycin 250 MG Oral Tablet', newName: 'NDA020503 200 ACTUAT albuterol 0.09 MG/ACTUAT Metered Dose Inhaler'},
  {old: '209459', new: '617310', label: 'atorvastatin 20 mg oral tablet', oldName: 'acetaminophen 500 MG Oral Tablet [Tylenol]', newName: 'atorvastatin 20 MG Oral Tablet'}
] AS m
MATCH (o:RxNormConcept) WHERE toString(o.rxcui) = m.old
  AND toLower(coalesce(o.display, '')) = m.label
FOREACH (_ IN CASE WHEN m.oldName IS NULL THEN [] ELSE [1] END |
  SET o.display = m.oldName)
WITH o, m
WHERE m.oldName IS NULL AND NOT EXISTS { MATCH ()-[:CODED_BY]->(o) }
DETACH DELETE o;
