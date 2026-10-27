// ==============================================================================
// HealthDCAT-AP Release 8 for every HealthDataset (#700, ADR-063)
//
// Release 8 (https://data.health.europa.eu/healthdcat-ap/releases/release-8/)
// makes these mandatory for a non-public health dataset: access rights,
// applicable legislation, health category (the Art. 51 list), the health data
// access body, identifier, structured data with its variables, and for the
// distribution an access URL and the legislation. The official SHACL for
// non-public data also asks for a theme, a keyword, a type, provenance, a
// contact point and at least one distribution. This file sets them on every
// dataset the other seeds created, so it runs after them (neo4j/seed.sh).
//
// Values are the codes of the EU controlled vocabularies; the proxy's
// serialiser (services/neo4j-proxy/src/healthdcat-ap.ts) turns them into the
// vocabularies' IRIs:
//   health category  https://hdeu-dcat.data.health.europa.eu/resource/authority/healthcategories/<CODE>
//   coding system    https://hdeu-dcat.data.health.europa.eu/resource/authority/coding-system/<CODE>
//   access right     http://publications.europa.eu/resource/authority/access-right/<CODE>
//   dataset type     http://publications.europa.eu/resource/authority/dataset-type/<CODE>
//   health theme     https://hdeu-dcat.data.health.europa.eu/resource/authority/health-theme/<CODE>
//   legislation      ELI, http://data.europa.eu/eli/reg/2025/327/oj
//
// Idempotent: MERGE for nodes, coalesce() so a value a seed set on purpose is
// kept. Every dataset here is synthetic; the contact addresses are on the
// reserved .example domain (RFC 2606).
// ==============================================================================

// ── 1. Dataset properties: what Release 8 needs, from what the dataset is ──
MATCH (d:HealthDataset)
WITH d,
     toLower(coalesce(d.conformsTo, '')) AS std,
     coalesce(d.hdcatapDatasetType, '') AS kind
SET d.hdcatapAccessRights = coalesce(d.hdcatapAccessRights, 'NON_PUBLIC'),
    d.hdcatapApplicableLegislation = coalesce(d.hdcatapApplicableLegislation,
      ['http://data.europa.eu/eli/reg/2025/327/oj']),
    d.hdcatapDctType = coalesce(d.hdcatapDctType, 'SYNTHETIC_DATA'),
    d.hdcatapHasStructuredData = coalesce(d.hdcatapHasStructuredData, true),
    // The Art. 51(1) categories, chosen from the kind of dataset. EHR-derived
    // data is (a) EHRS in every case; the kind adds what else it is.
    d.hdcatapHealthCategories = coalesce(d.hdcatapHealthCategories,
      ['EHRS'] + CASE kind
        WHEN 'RegistryData'       THEN ['MRMR']
        WHEN 'ClinicalTrial'      THEN ['EHCT']
        WHEN 'ObservationalStudy' THEN ['RQSH']
        WHEN 'CohortStudy'        THEN ['RQSH']
        WHEN 'OutcomeStudy'       THEN ['RQSH']
        WHEN 'SecondaryUse'       THEN ['RQSH']
        WHEN 'SurveyData'         THEN ['RQSH']
        WHEN 'SurveillanceData'   THEN ['PHDR', 'RPDG']
        WHEN 'ResourceData'       THEN ['NRPE']
        WHEN 'SafetyData'         THEN ['RMMD']
        WHEN 'GenomicData'        THEN ['HGPD']
        ELSE [] END),
    d.hdcatapCodingSystems = coalesce(d.hdcatapCodingSystems,
      CASE WHEN std CONTAINS 'omop' OR std CONTAINS 'ohdsi'
           THEN ['OHDSI-VOCAB', 'SNOMED-CT', 'LOINC', 'RXNORM']
           ELSE ['SNOMED-CT', 'LOINC', 'ICD-10', 'RXNORM'] END),
    d.hdcatapKeywords = coalesce(d.hdcatapKeywords,
      [k IN [d.theme, kind, 'synthetic data', 'EHDS secondary use'] WHERE k IS NOT NULL AND k <> '']),
    // Recommended: the health theme, from the HealthDCAT-AP health-theme
    // vocabulary; a theme the vocabulary has no term for gets none.
    d.hdcatapHealthThemes = coalesce(d.hdcatapHealthThemes,
      CASE
        WHEN d.datasetId CONTAINS 'antimicrobial' THEN ['ANTIMICROBIAL_CONTROL']
        WHEN d.datasetId CONTAINS 'covid'         THEN ['RESPIRATORY_DISEASES']
        ELSE CASE d.theme
          WHEN 'Oncology'            THEN ['CANCER_DISEASE']
          WHEN 'Cardiology'          THEN ['NONCOMMUNICABLE_DISEASES']
          WHEN 'Psychiatry'          THEN ['MENTAL_HEALTH']
          WHEN 'Neurology'           THEN ['MENTAL_HEALTH']
          WHEN 'Maternal Health'     THEN ['LIFECOURSE_HEALTH']
          WHEN 'Paediatrics'         THEN ['LIFECOURSE_HEALTH']
          WHEN 'Geriatrics'          THEN ['LIFECOURSE_HEALTH']
          WHEN 'Ophthalmology'       THEN ['SENSORY_HEALTH']
          WHEN 'Dentistry'           THEN ['SENSORY_HEALTH']
          WHEN 'Occupational Health' THEN ['ENVIRONMENTAL_HEALTH']
          WHEN 'Pharmacovigilance'   THEN ['HEALTH_PRODUCTS']
          WHEN 'Genomics'            THEN ['HEALTH_PRODUCTS']
          WHEN 'Clinical Research'   THEN ['HEALTH_PRODUCTS']
          WHEN 'Transplant Medicine' THEN ['HEALTH_SYSTEMS']
          ELSE [] END
      END),
    d.hdcatapProvenance = coalesce(d.hdcatapProvenance,
      'Synthetic data generated for the EHDS integration hub (Synthea, FHIR R4, transformed to OMOP CDM 5.4); it describes no real person.');

// ── 2. The access body: the one that governs the dataset, else MedReg DE ──
MATCH (d:HealthDataset)
WHERE NOT EXISTS { MATCH (:Participant)-[:GOVERNS]->(d) }
MATCH (hdab:Participant {participantId: 'did:web:medreg.de:hdab'})
MERGE (hdab)-[:GOVERNS]->(d);

// ── 3. A contact point for every dataset, at its holder ──
MATCH (d:HealthDataset)
WHERE NOT EXISTS { MATCH (d)-[:HAS_CONTACT_POINT]->(:ContactPoint) }
OPTIONAL MATCH (d)-[:PUBLISHED_BY]->(holder:Participant)
WITH d, coalesce(holder.name, 'Health Dataspace Data Steward') AS owner
WITH d, owner,
     toLower(apoc.text.regreplace(owner, '[^A-Za-z0-9]+', '-')) AS slug
MERGE (cp:ContactPoint {contactId: 'contact:' + slug})
  ON CREATE SET cp.name = owner + ' data access desk',
                cp.email = 'data-access@' + slug + '.example'
MERGE (d)-[:HAS_CONTACT_POINT]->(cp);

// ── 4. At least one distribution, where access is asked for ──
MATCH (d:HealthDataset)
WHERE NOT EXISTS { MATCH (d)-[:HAS_DISTRIBUTION]->(:Distribution) }
MERGE (x:Distribution {distributionId: 'dist:' + d.datasetId + ':access'})
  ON CREATE SET x.title = d.title + ' (access through the health data access body)',
                x.format = 'JSON-LD'
MERGE (d)-[:HAS_DISTRIBUTION]->(x);

MATCH (d:HealthDataset)-[:HAS_DISTRIBUTION]->(x:Distribution)
SET x.accessURL = coalesce(x.accessURL,
      'https://ehds.mabu.red/data/discover?dataset=' + apoc.text.urlencode(d.datasetId)),
    x.hdcatapApplicableLegislation = coalesce(x.hdcatapApplicableLegislation,
      ['http://data.europa.eu/eli/reg/2025/327/oj']);

// ── 5. The variables: one CSVW table group per standard ──
// A machine-readable description of the data variables (healthdcatap:hasVariables
// -> csvw:TableGroup), mandatory when hasStructuredData is true. The datasets
// share the description of the standard they are in.
UNWIND [
  {group: 'vars:fhir-r4', title: 'FHIR R4 resources of the dataset', tables: [
    {name: 'Patient', title: 'Patient', columns: [
      {name: 'id', title: 'Pseudonymous patient id', description: 'Research pseudonym of the person; never a name', datatype: 'string'},
      {name: 'gender', title: 'Administrative gender', description: 'FHIR administrative gender', datatype: 'string'},
      {name: 'birthYear', title: 'Year of birth', description: 'Year of birth only, the date is withheld (Art. 66)', datatype: 'integer'}]},
    {name: 'Condition', title: 'Condition', columns: [
      {name: 'code', title: 'Diagnosis code', description: 'SNOMED CT or ICD-10 code of the condition', datatype: 'string'},
      {name: 'onsetDateTime', title: 'Onset', description: 'When the condition began', datatype: 'dateTime'}]},
    {name: 'Observation', title: 'Observation', columns: [
      {name: 'code', title: 'LOINC code', description: 'What was measured, as a LOINC code', datatype: 'string'},
      {name: 'value', title: 'Value', description: 'The measured value', datatype: 'decimal'},
      {name: 'unit', title: 'Unit', description: 'The UCUM unit of the value', datatype: 'string'},
      {name: 'effectiveDateTime', title: 'Date', description: 'When the value was measured', datatype: 'dateTime'}]},
    {name: 'MedicationRequest', title: 'Medication request', columns: [
      {name: 'medicationCode', title: 'Medication code', description: 'RxNorm code of the medication', datatype: 'string'},
      {name: 'authoredOn', title: 'Prescribed on', description: 'When the medication was prescribed', datatype: 'date'}]}]},
  {group: 'vars:omop-cdm-54', title: 'OMOP CDM 5.4 tables of the dataset', tables: [
    {name: 'person', title: 'Person', columns: [
      {name: 'person_id', title: 'Person id', description: 'Pseudonymous person identifier', datatype: 'integer'},
      {name: 'gender_concept_id', title: 'Gender concept', description: 'OMOP concept of the gender', datatype: 'integer'},
      {name: 'year_of_birth', title: 'Year of birth', description: 'Year of birth of the person', datatype: 'integer'}]},
    {name: 'condition_occurrence', title: 'Condition occurrence', columns: [
      {name: 'condition_concept_id', title: 'Condition concept', description: 'Standard OMOP concept of the condition', datatype: 'integer'},
      {name: 'condition_start_date', title: 'Start date', description: 'When the condition started', datatype: 'date'}]},
    {name: 'measurement', title: 'Measurement', columns: [
      {name: 'measurement_concept_id', title: 'Measurement concept', description: 'Standard OMOP concept of the measurement', datatype: 'integer'},
      {name: 'value_as_number', title: 'Value', description: 'The measured value', datatype: 'decimal'},
      {name: 'unit_source_value', title: 'Unit', description: 'The unit as recorded', datatype: 'string'}]},
    {name: 'drug_exposure', title: 'Drug exposure', columns: [
      {name: 'drug_concept_id', title: 'Drug concept', description: 'Standard OMOP concept of the drug', datatype: 'integer'},
      {name: 'drug_exposure_start_date', title: 'Start date', description: 'When the exposure started', datatype: 'date'}]}]}
] AS g
MERGE (tg:VariablesTableGroup {groupId: g.group})
  ON CREATE SET tg.title = g.title
  ON MATCH SET tg.title = g.title
WITH tg, g
UNWIND g.tables AS t
MERGE (tb:VariablesTable {tableId: g.group + ':' + t.name})
  ON CREATE SET tb.name = t.name, tb.title = t.title
  ON MATCH SET tb.name = t.name, tb.title = t.title
MERGE (tg)-[:HAS_TABLE]->(tb)
WITH tb, g, t
UNWIND t.columns AS c
MERGE (col:VariablesColumn {columnId: g.group + ':' + t.name + ':' + c.name})
  ON CREATE SET col.name = c.name, col.title = c.title, col.description = c.description, col.datatype = c.datatype
  ON MATCH SET col.name = c.name, col.title = c.title, col.description = c.description, col.datatype = c.datatype
MERGE (tb)-[:HAS_COLUMN]->(col);

MATCH (d:HealthDataset)
WHERE d.hdcatapHasStructuredData = true
  AND NOT EXISTS { MATCH (d)-[:HAS_VARIABLES]->(:VariablesTableGroup) }
WITH d, toLower(coalesce(d.conformsTo, '')) AS std
MATCH (tg:VariablesTableGroup {groupId:
  CASE WHEN std CONTAINS 'omop' OR std CONTAINS 'ohdsi' THEN 'vars:omop-cdm-54' ELSE 'vars:fhir-r4' END})
MERGE (d)-[:HAS_VARIABLES]->(tg);
