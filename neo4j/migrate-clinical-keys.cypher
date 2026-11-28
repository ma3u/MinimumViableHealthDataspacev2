// ==============================================================================
// Migration: clinical nodes keyed by resourceId, lab values with a unit (#1222)
//
// init-schema.cypher makes resourceId unique on Patient, Encounter, Condition,
// Observation, MedicationRequest and Procedure. scripts/load_fhir_neo4j.py and
// scripts/generate-graph-seed.py merged on `id` and never wrote resourceId, so
// the constraint saw none of their nodes: on the compose graph on 2026-11-25,
// 2,477 of them, among them all 771 of the graph seed's laboratory values. Both
// writers now set resourceId = id; this file keys a graph they loaded before.
//
// The graph seed also drew every laboratory value from 3 to 200 whatever the
// test, with no unit and "<code> result" as its name. It now draws in the
// test's range and unit (LOINC in scripts/generate-graph-seed.py, whose table
// is repeated below; a test keeps the two equal). Here an old value is
// rescaled to that range: the old draw was 3 + 197u, the new one is
// low + (high - low)u, so the same u gives what the generator now writes, to
// its rounding. The OMOP measurement mapped from it follows.
//
// Six LOINC names in the generator named another test; their LoincCode
// display is corrected where it still holds the old name.
//
// ODRL policies registered through /api/admin/policies were merged on `id`,
// not on policyId, which the constraint is on; they get policyId = id.
//
// Idempotent: each step matches only what it has not changed yet. A node
// whose id is already another node's resourceId is left alone and counted by
// the last statement, which neo4j/seed.sh requires to be zero.
//
//   docker exec -i health-dataspace-neo4j \
//     cypher-shell -u neo4j -p healthdataspace < neo4j/migrate-clinical-keys.cypher
// ==============================================================================

// ── resourceId = id on the six clinical labels ─────────────────────────────
// One statement per label, written out, so the planner starts from the label
// and answers the NOT EXISTS from the resourceId constraint's index. A label
// held in a variable and tested against labels(n) allowed neither: every node
// was compared with every other, and on the Azure graph the seed of 2026-11-28
// stalled here for the job's full hour. On a test graph of 21,000 nodes it
// took 84 seconds before and 3 after.
MATCH (n:Patient)
WHERE n.resourceId IS NULL AND n.id IS NOT NULL
  AND NOT EXISTS { MATCH (:Patient {resourceId: n.id}) }
SET n.resourceId = n.id
WITH count(n) AS keyed
RETURN 'Patient' AS label, keyed;

MATCH (n:Encounter)
WHERE n.resourceId IS NULL AND n.id IS NOT NULL
  AND NOT EXISTS { MATCH (:Encounter {resourceId: n.id}) }
SET n.resourceId = n.id
WITH count(n) AS keyed
RETURN 'Encounter' AS label, keyed;

MATCH (n:Condition)
WHERE n.resourceId IS NULL AND n.id IS NOT NULL
  AND NOT EXISTS { MATCH (:Condition {resourceId: n.id}) }
SET n.resourceId = n.id
WITH count(n) AS keyed
RETURN 'Condition' AS label, keyed;

MATCH (n:Observation)
WHERE n.resourceId IS NULL AND n.id IS NOT NULL
  AND NOT EXISTS { MATCH (:Observation {resourceId: n.id}) }
SET n.resourceId = n.id
WITH count(n) AS keyed
RETURN 'Observation' AS label, keyed;

MATCH (n:MedicationRequest)
WHERE n.resourceId IS NULL AND n.id IS NOT NULL
  AND NOT EXISTS { MATCH (:MedicationRequest {resourceId: n.id}) }
SET n.resourceId = n.id
WITH count(n) AS keyed
RETURN 'MedicationRequest' AS label, keyed;

MATCH (n:Procedure)
WHERE n.resourceId IS NULL AND n.id IS NOT NULL
  AND NOT EXISTS { MATCH (:Procedure {resourceId: n.id}) }
SET n.resourceId = n.id
WITH count(n) AS keyed
RETURN 'Procedure' AS label, keyed;

// ── The graph seed's laboratory values: range, unit, name ──────────────────
UNWIND [
  {code: '4548-4', name: 'HbA1c', unit: '%', low: 4.5, high: 11.0, decimals: 1},
  {code: '2345-7', name: 'Glucose [Mass/vol] in Serum', unit: 'mg/dL', low: 70.0, high: 250.0, decimals: 0},
  {code: '2160-0', name: 'Creatinine [Mass/vol] in Serum', unit: 'mg/dL', low: 0.5, high: 3.5, decimals: 2},
  {code: '33914-3', name: 'eGFR (MDRD)/1.73 sq M', unit: 'mL/min/{1.73_m2}', low: 15.0, high: 110.0, decimals: 0},
  {code: '2093-3', name: 'Total Cholesterol [Mass/vol]', unit: 'mg/dL', low: 130.0, high: 300.0, decimals: 0},
  {code: '2571-8', name: 'Triglycerides [Mass/vol]', unit: 'mg/dL', low: 50.0, high: 400.0, decimals: 0},
  {code: '2085-9', name: 'HDL Cholesterol', unit: 'mg/dL', low: 25.0, high: 90.0, decimals: 0},
  {code: '13457-7', name: 'LDL Cholesterol (calc)', unit: 'mg/dL', low: 50.0, high: 220.0, decimals: 0},
  {code: '8480-6', name: 'Systolic Blood Pressure', unit: 'mm[Hg]', low: 100.0, high: 180.0, decimals: 0},
  {code: '8462-4', name: 'Diastolic Blood Pressure', unit: 'mm[Hg]', low: 60.0, high: 110.0, decimals: 0},
  {code: '39156-5', name: 'BMI', unit: 'kg/m2', low: 18.0, high: 42.0, decimals: 1},
  {code: '718-7', name: 'Hemoglobin [Mass/vol]', unit: 'g/dL', low: 9.0, high: 17.5, decimals: 1},
  {code: '4544-3', name: 'Hematocrit', unit: '%', low: 30.0, high: 52.0, decimals: 1},
  {code: '6690-2', name: 'WBC Count', unit: '10*3/uL', low: 3.0, high: 15.0, decimals: 1},
  {code: '777-3', name: 'Platelet Count', unit: '10*3/uL', low: 100.0, high: 450.0, decimals: 0},
  {code: '2823-3', name: 'Potassium [Moles/vol]', unit: 'mmol/L', low: 3.2, high: 5.8, decimals: 1},
  {code: '2951-2', name: 'Sodium [Moles/vol]', unit: 'mmol/L', low: 128.0, high: 148.0, decimals: 0},
  {code: '1742-6', name: 'ALT [U/L]', unit: 'U/L', low: 8.0, high: 120.0, decimals: 0},
  {code: '1920-8', name: 'AST [U/L]', unit: 'U/L', low: 8.0, high: 110.0, decimals: 0},
  {code: '1975-2', name: 'Total Bilirubin [Mass/vol]', unit: 'mg/dL', low: 0.2, high: 2.5, decimals: 1},
  {code: '2532-0', name: 'LDH [U/L]', unit: 'U/L', low: 120.0, high: 400.0, decimals: 0},
  {code: '14959-1', name: 'Microalbumin/Creatinine [Mass Ratio] Urine', unit: 'mg/g', low: 2.0, high: 300.0, decimals: 0},
  {code: '5902-2', name: 'Prothrombin Time', unit: 's', low: 10.0, high: 20.0, decimals: 1},
  {code: '3016-3', name: 'TSH [Milli-int-unit/L]', unit: 'm[IU]/L', low: 0.2, high: 8.0, decimals: 2},
  {code: '3026-2', name: 'Thyroxine (T4) [Mass/vol]', unit: 'ug/dL', low: 4.5, high: 12.5, decimals: 1},
  {code: '2276-4', name: 'Ferritin [Mass/vol]', unit: 'ng/mL', low: 15.0, high: 400.0, decimals: 0},
  {code: '49765-1', name: 'Calcium [Mass/vol] in Blood', unit: 'mg/dL', low: 8.4, high: 10.6, decimals: 1},
  {code: '14627-4', name: 'Bicarbonate [Moles/vol] Venous', unit: 'mmol/L', low: 20.0, high: 30.0, decimals: 0},
  {code: '6768-6', name: 'Alkaline Phosphatase [U/L]', unit: 'U/L', low: 40.0, high: 200.0, decimals: 0},
  {code: '30313-1', name: 'Hemoglobin [Mass/vol] Arterial', unit: 'g/dL', low: 10.0, high: 17.0, decimals: 1},
  {code: '2028-9', name: 'CO2 Total', unit: 'mmol/L', low: 20.0, high: 31.0, decimals: 0},
  {code: '26464-8', name: 'Leukocytes [#/vol] in Blood', unit: '10*3/uL', low: 3.0, high: 15.0, decimals: 1},
  {code: '48065-7', name: 'D-Dimer FEU', unit: 'ug/mL{FEU}', low: 0.1, high: 3.0, decimals: 2},
  {code: '1751-7', name: 'Albumin [Mass/vol]', unit: 'g/dL', low: 2.8, high: 5.2, decimals: 1},
  {code: '2157-6', name: 'CK (Creatine Kinase)', unit: 'U/L', low: 30.0, high: 600.0, decimals: 0},
  {code: '30341-2', name: 'ESR (Erythrocyte Sed Rate)', unit: 'mm/h', low: 2.0, high: 60.0, decimals: 0},
  {code: '71426-1', name: 'CRP [Mass/vol] High Sensitivity', unit: 'mg/L', low: 0.2, high: 15.0, decimals: 1},
  {code: '14937-7', name: 'Urea Nitrogen [Moles/vol]', unit: 'mmol/L', low: 2.5, high: 12.0, decimals: 1},
  {code: '2744-1', name: 'Blood pH (arterial)', unit: '[pH]', low: 7.25, high: 7.5, decimals: 2},
  {code: '33762-6', name: 'NT-proBNP', unit: 'pg/mL', low: 20.0, high: 3000.0, decimals: 0}
] AS t
MATCH (o:Observation {code: t.code})
WHERE o.id = 'obs-' + split(o.id, '-')[1] + '-' + t.code
  AND o.unit IS NULL AND o.valueUnit IS NULL
  AND o.display = t.code + ' result'
  AND o.value IS NOT NULL
WITH o, t,
     CASE WHEN o.value < 3 THEN 0.0 WHEN o.value > 200 THEN 1.0
          ELSE (toFloat(o.value) - 3.0) / 197.0 END AS u
WITH o, t, round(t.low + (t.high - t.low) * u, t.decimals) AS v
WITH o, t, CASE WHEN t.decimals = 0 THEN toInteger(v) ELSE v END AS value
SET o.value = value, o.unit = t.unit, o.display = t.name
WITH o, t, value
OPTIONAL MATCH (o)-[:MAPPED_TO]->(m:OMOPMeasurement)
FOREACH (_ IN CASE WHEN m IS NULL THEN [] ELSE [1] END |
  SET m.valueAsNumber = value, m.unit = t.unit)
RETURN count(DISTINCT o) AS labValuesRescaled;

// ── LOINC names that named another test ────────────────────────────────────
UNWIND [
  {code: '33914-3', old: 'eGFR CKD-EPI',            new: 'eGFR (MDRD)/1.73 sq M'},
  {code: '14959-1', old: 'Microalbumin [Mass/vol] Urine', new: 'Microalbumin/Creatinine [Mass Ratio] Urine'},
  {code: '3026-2',  old: 'Free T4 [Mass/vol]',      new: 'Thyroxine (T4) [Mass/vol]'},
  {code: '30313-1', old: 'Hemoglobin A1',           new: 'Hemoglobin [Mass/vol] Arterial'},
  {code: '26464-8', old: 'WBC differential',        new: 'Leukocytes [#/vol] in Blood'},
  {code: '14937-7', old: 'Uric Acid',               new: 'Urea Nitrogen [Moles/vol]'},
  {code: '49765-1', old: 'Calcium [Mass/vol]',      new: 'Calcium [Mass/vol] in Blood'},
  {code: '14627-4', old: 'Bicarbonate [Moles/vol]', new: 'Bicarbonate [Moles/vol] Venous'},
  {code: '48065-7', old: 'D-Dimer',                 new: 'D-Dimer FEU'},
  {code: '2744-1',  old: 'Blood pH',                new: 'Blood pH (arterial)'}
] AS f
MATCH (l:LoincCode {loincNumber: f.code})
WHERE l.display = f.old
SET l.display = f.new
RETURN count(l) AS loincNamesCorrected;

// ── ODRL policies keyed by policyId ────────────────────────────────────────
MATCH (pol:OdrlPolicy)
WHERE pol.policyId IS NULL AND pol.id IS NOT NULL
  AND NOT EXISTS { MATCH (t:OdrlPolicy {policyId: pol.id}) }
SET pol.policyId = pol.id
RETURN count(pol) AS policiesKeyed;

// ── What is left without its key (seed.sh requires 0) ──────────────────────
RETURN COUNT { MATCH (n) WHERE (n:Patient OR n:Encounter OR n:Condition OR n:Observation OR n:MedicationRequest OR n:Procedure) AND n.resourceId IS NULL AND n.id IS NOT NULL }
     + COUNT { MATCH (p:OdrlPolicy) WHERE p.policyId IS NULL } AS unkeyed;
