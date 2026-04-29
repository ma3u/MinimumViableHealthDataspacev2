// ==============================================================================
// Issue #19 — pharmacovigilance demo seed: ciprofloxacin + tendon rupture + UTI.
//
// The base Synthea synthetic dataset does not include ciprofloxacin
// prescriptions, so the canonical pharmacovigilance teaching question
// ("Is tendon rupture frequently observed in patients treated with
// ciprofloxacin diagnosed with UTI?") returns an empty cohort against the
// vanilla graph. This seed adds a small realistic cohort that reproduces
// the fluoroquinolone class-effect pattern:
//
//   - 6 fictional patients with UTI
//   - 5 of them prescribed ciprofloxacin
//   - 2 of those 5 develop tendon rupture (realistic 20–40 % excess risk)
//
// All fictional names; patients attached to the existing demo SPE (AlphaKlinik
// Berlin — the DATA_HOLDER in the demo dataspace, per CLAUDE.md fictional-org
// policy). Idempotent MERGE.
// ==============================================================================

// Concepts referenced by the seed
MERGE (scUti:SnomedConcept {conceptId: '68566005'})
  ON CREATE SET scUti.display = 'Urinary tract infectious disease';
MERGE (icdUti:ICD10Code {code: 'N39.0'})
  ON CREATE SET icdUti.display = 'Urinary tract infection, site not specified';
MERGE (rxCipro:RxNormConcept {rxcui: '2551'})
  ON CREATE SET rxCipro.display = 'Ciprofloxacin';
MERGE (scTendon:SnomedConcept {conceptId: '262615006'})
  ON CREATE SET scTendon.display = 'Rupture of tendon';
MERGE (icdTendon:ICD10Code {code: 'M66.9'})
  ON CREATE SET icdTendon.display = 'Spontaneous rupture of unspecified tendon';

// Create six fictional patients, all with UTI, five on ciprofloxacin,
// two with tendon rupture as a subsequent event. The `pvCohort` flag
// makes them easy to exclude from other demo queries if needed.
UNWIND [
  {id: 'pv-pat-001', name: 'Ines Müller',       gender: 'female', birthDate: '1973-04-12', cipro: true,  tendon: true},
  {id: 'pv-pat-002', name: 'Roberto Conti',     gender: 'male',   birthDate: '1958-11-03', cipro: true,  tendon: true},
  {id: 'pv-pat-003', name: 'Léa Bernard',       gender: 'female', birthDate: '1985-07-28', cipro: true,  tendon: false},
  {id: 'pv-pat-004', name: 'Henrik Nielsen',    gender: 'male',   birthDate: '1967-02-14', cipro: true,  tendon: false},
  {id: 'pv-pat-005', name: 'Mariana Ribeiro',   gender: 'female', birthDate: '1991-09-06', cipro: true,  tendon: false},
  {id: 'pv-pat-006', name: 'Willem van Dijk',   gender: 'male',   birthDate: '1977-12-20', cipro: false, tendon: false}
] AS row
MERGE (p:Patient {resourceId: row.id})
  ON CREATE SET
    p.patientId = row.id,
    p.name      = row.name,
    p.gender    = row.gender,
    p.birthDate = row.birthDate,
    p.city      = 'Berlin',
    p.country   = 'DE',
    p.pvCohort  = true
// UTI condition for every patient in the cohort
MERGE (uti:Condition {resourceId: row.id + '-uti'})
  ON CREATE SET
    uti.code      = '68566005',
    uti.display   = 'Urinary tract infectious disease',
    uti.onsetDate = '2024-01-15',
    uti.clinicalStatus = 'active',
    uti.pvCohort  = true
MERGE (p)-[:HAS_CONDITION]->(uti)
WITH p, row, uti
MATCH (scUti:SnomedConcept {conceptId: '68566005'})
MATCH (icdUti:ICD10Code {code: 'N39.0'})
MERGE (uti)-[:CODED_BY]->(scUti)
MERGE (uti)-[:CODED_BY]->(icdUti)
WITH p, row

// Ciprofloxacin prescription for cipro=true patients
FOREACH (_ IN CASE WHEN row.cipro THEN [1] ELSE [] END |
  MERGE (m:MedicationRequest {resourceId: row.id + '-cipro'})
    ON CREATE SET
      m.medicationCode = '2551',
      m.display        = 'Ciprofloxacin 500 mg Oral Tab',
      m.status         = 'completed',
      m.pvCohort       = true
  MERGE (p)-[:HAS_MEDICATION_REQUEST]->(m)
)

WITH p, row
OPTIONAL MATCH (p)-[:HAS_MEDICATION_REQUEST]->(m:MedicationRequest {medicationCode: '2551'})
WITH p, row, m
MATCH (rxCipro:RxNormConcept {rxcui: '2551'})
FOREACH (mm IN CASE WHEN m IS NULL THEN [] ELSE [m] END |
  MERGE (mm)-[:CODED_BY]->(rxCipro)
)

WITH p, row
// Tendon rupture for tendon=true patients
FOREACH (_ IN CASE WHEN row.tendon THEN [1] ELSE [] END |
  MERGE (tr:Condition {resourceId: row.id + '-tendon-rupture'})
    ON CREATE SET
      tr.code      = '262615006',
      tr.display   = 'Rupture of tendon',
      tr.onsetDate = '2024-03-08',
      tr.clinicalStatus = 'active',
      tr.pvCohort  = true
  MERGE (p)-[:HAS_CONDITION]->(tr)
);

// Wire tendon-rupture conditions to their ontology nodes in a second pass
// (separated from the UNWIND to keep FOREACH/MATCH semantics clean).
MATCH (tr:Condition {code: '262615006', pvCohort: true})
MATCH (scTendon:SnomedConcept {conceptId: '262615006'})
MATCH (icdTendon:ICD10Code {code: 'M66.9'})
MERGE (tr)-[:CODED_BY]->(scTendon)
MERGE (tr)-[:CODED_BY]->(icdTendon);

// Verification: expect 6 cohort patients, 5 on cipro, 2 with tendon rupture.
MATCH (p:Patient {pvCohort: true})
OPTIONAL MATCH (p)-[:HAS_MEDICATION_REQUEST]->(m:MedicationRequest {medicationCode: '2551'})
OPTIONAL MATCH (p)-[:HAS_CONDITION]->(tr:Condition {code: '262615006'})
RETURN count(DISTINCT p) AS cohortPatients,
       count(DISTINCT m) AS ciproRx,
       count(DISTINCT tr) AS tendonRuptures;
