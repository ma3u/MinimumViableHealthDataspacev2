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
// dataset the other seeds created, so it runs after them (neo4j/seed.sh);
// section 6 adds the recommended ones. /api/catalog does the same for one
// dataset when the editor saves it.
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

// ── 6. Recommended properties (#700) ──
// Release 8 recommends who the data covers, how many people, their ages, the
// period, the codes, how often it grows and how long it is kept. Where the
// graph holds the patients of a dataset, these are derived from them, without
// the patients who opted out of secondary use (Art. 71, ADR-062); everywhere
// else the dataset states them here. The editor (/catalog/editor) sets the same
// properties, and a value it set is kept (coalesce).

// 6a. A holder for the datasets without one, from the fictional data holders.
UNWIND [
  {id: 'dataset:geriatric-falls-de-2024', holder: 'did:web:alpha-klinik.de:participant'},
  {id: 'dataset:diabetes-retinopathy-uk', holder: 'did:web:lmc.nl:clinic'},
  {id: 'dataset:pharmacovigilance-ema',   holder: 'did:web:lmc.nl:clinic'}
] AS row
MATCH (d:HealthDataset {datasetId: row.id})
WHERE NOT EXISTS { MATCH (d)-[:PUBLISHED_BY]->() }
MATCH (p:Participant {participantId: row.holder})
MERGE (d)-[:PUBLISHED_BY]->(p);

// 6b. Stated: the population, the period, the ages and the codes of each
// synthetic dataset whose patients are not in the graph. Codes are ICD-10.
UNWIND [
  {id: 'dataset:antimicrobial-resist-ecdc', pop: 'Synthetic hospital patients with a bacterial isolate tested for antimicrobial susceptibility, EU/EEA', minAge: 0, maxAge: 100, people: 61000, start: '2020-01-01', end: '2025-12-31', codes: ['ICD-10:A41', 'ICD-10:J15', 'ICD-10:N39.0']},
  {id: 'dataset:cardiac-outcomes-eu-2025', pop: 'Synthetic adults after an acute coronary syndrome or a heart failure admission, EU', minAge: 18, maxAge: 95, people: 31000, start: '2018-01-01', end: '2025-06-30', codes: ['ICD-10:I21', 'ICD-10:I25', 'ICD-10:I50']},
  {id: 'dataset:covid-long-haulers-be', pop: 'Synthetic adults with symptoms twelve weeks or more after COVID-19, Belgium', minAge: 18, maxAge: 90, people: 8400, start: '2020-03-01', end: '2024-12-31', codes: ['ICD-10:U07.1', 'ICD-10:U09.9']},
  {id: 'dataset:dental-health-who-euro', pop: 'Synthetic survey respondents aged 5 to 74, European region', minAge: 5, maxAge: 74, people: 63000, start: '2023-01-01', end: '2025-06-30', codes: ['ICD-10:K02', 'ICD-10:K05']},
  {id: 'dataset:diabetes-retinopathy-uk', pop: 'Synthetic people with diabetes aged 12 and over, invited to retinal screening', minAge: 12, maxAge: 95, people: 28000, start: '2019-01-01', end: '2025-03-31', codes: ['ICD-10:E11.3', 'ICD-10:H36.0']},
  {id: 'dataset:genomics-1m-genomes', pop: 'Synthetic reference cohort of whole genomes, mixed ancestry', minAge: 0, maxAge: 100, people: 105000, start: '2021-01-01', end: '2025-12-31', codes: []},
  {id: 'dataset:geriatric-falls-de-2024', pop: 'Synthetic community-dwelling adults aged 65 and over, Germany', minAge: 65, maxAge: 100, people: 4900, start: '2022-01-01', end: '2024-12-31', codes: ['ICD-10:W19', 'ICD-10:R29.6', 'ICD-10:S72']},
  {id: 'dataset:lung-cancer-screening-nl', pop: 'Synthetic current and former smokers aged 50 to 74 in a screening trial, Netherlands', minAge: 50, maxAge: 74, people: 15000, start: '2019-01-01', end: '2025-06-30', codes: ['ICD-10:C34', 'ICD-10:Z12.2']},
  {id: 'dataset:maternal-health-who-afro', pop: 'Synthetic pregnant women and their newborns, African region', minAge: 0, maxAge: 49, people: 98000, start: '2020-01-01', end: '2025-12-31', codes: ['ICD-10:O14', 'ICD-10:O80', 'ICD-10:P07']},
  {id: 'dataset:mental-health-eu-pilot', pop: 'Synthetic adults in contact with mental health services, EU', minAge: 18, maxAge: 90, people: 14500, start: '2021-01-01', end: '2025-06-30', codes: ['ICD-10:F20', 'ICD-10:F32', 'ICD-10:F41']},
  {id: 'dataset:occupational-health-eu', pop: 'Synthetic workers aged 16 to 70 under occupational health surveillance, EU', minAge: 16, maxAge: 70, people: 38000, start: '2018-01-01', end: '2025-12-31', codes: ['ICD-10:H83.3', 'ICD-10:J45', 'ICD-10:L24']},
  {id: 'dataset:organ-transplant-eurotx', pop: 'Synthetic organ donors and recipients', minAge: 0, maxAge: 80, people: 3100, start: '2015-01-01', end: '2025-12-31', codes: ['ICD-10:T86', 'ICD-10:Z94']},
  {id: 'dataset:paediatric-asthma-scand', pop: 'Synthetic children aged 2 to 17 with asthma, Nordic countries', minAge: 2, maxAge: 17, people: 9200, start: '2017-01-01', end: '2025-06-30', codes: ['ICD-10:J45', 'ICD-10:J46']},
  {id: 'dataset:pharmacovigilance-ema', pop: 'Synthetic individual case safety reports, EU/EEA', minAge: 0, maxAge: 100, people: 240000, start: '2015-01-01', end: '2025-12-31', codes: ['ICD-10:T88.7', 'ICD-10:Y57']},
  {id: 'dataset:rare-disease-erdera-2026', pop: 'Synthetic people living with a rare disease, EU', minAge: 0, maxAge: 90, people: 2900, start: '2016-01-01', end: '2026-03-31', codes: ['ICD-10:E84', 'ICD-10:G71.0', 'ICD-10:Q87.4']},
  {id: 'dataset:stroke-rehab-fr-2025', pop: 'Synthetic adults in rehabilitation after a stroke, France', minAge: 18, maxAge: 100, people: 5600, start: '2020-01-01', end: '2025-06-30', codes: ['ICD-10:I63', 'ICD-10:I69']},
  // The federated datasets the catalogue enricher writes from the participants'
  // DSP catalogues (ui/src/app/api/mock-dsp); figures as their descriptions give them.
  {id: 'dataset:alpha:t2dm-registry-2026', pop: 'Synthetic adults with type 2 diabetes in a Berlin registry, five years of follow-up', minAge: 18, maxAge: 95, people: 2400, start: '2021-01-01', end: '2026-06-30', codes: ['ICD-10:E11', 'ICD-10:E66']},
  {id: 'dataset:alpha:cv-icu-2025', pop: 'Synthetic intensive care admissions with a primary cardiovascular diagnosis', minAge: 18, maxAge: 100, people: 3800, start: '2025-01-01', end: '2025-12-31', codes: ['ICD-10:I21', 'ICD-10:I48', 'ICD-10:I50']},
  {id: 'dataset:lmc:t2dm-crossborder-2026', pop: 'Synthetic adults with type 2 diabetes in shared care across the Dutch, German and Belgian border region', minAge: 18, maxAge: 95, people: 1600, start: '2023-01-01', end: '2026-06-30', codes: ['ICD-10:E11']},
  {id: 'dataset:pharmaco:oncology-phase2-2025', pop: 'Synthetic participants of a phase II immunotherapy trial', minAge: 18, maxAge: 85, people: 180, start: '2024-01-01', end: '2025-06-30', codes: ['ICD-10:C80']},
  {id: 'dataset:irs:rare-diseases-fr-2026', pop: 'Synthetic people with a rare disease, France', minAge: 0, maxAge: 90, people: 4200, start: '2016-01-01', end: '2026-03-31', codes: ['ICD-10:E84', 'ICD-10:G71.0', 'ICD-10:Q87.4']},
  // Copied from the Synthea dataset after 6c when the graph links no patients to it.
  {id: 'dataset:omop-cdm-v54-analytics', pop: 'Synthetic patients of the hub, transformed from FHIR R4 to OMOP CDM 5.4'},
  // Stated for a graph that links none of its patients; 6c derives them where it does.
  {id: 'dataset:prostate-cancer-registry', pop: 'Synthetic men with prostate cancer, from several centres', minAge: 40, maxAge: 95, people: 1200, start: '2015-01-01', end: '2025-12-31', codes: ['ICD-10:C61']},
  {id: 'dataset:synthea-fhir-r4-mvd', pop: 'Synthetic patients generated with Synthea for the hub', theme: 'HEALTH_SYSTEMS'},
  {id: 'urn:uuid:riverside:dataset:diab-001', pop: 'Synthetic adults with type 2 diabetes, one patient journey each', theme: 'NONCOMMUNICABLE_DISEASES'}
] AS row
MATCH (d:HealthDataset {datasetId: row.id})
SET d.hdcatapPopulationCoverage = coalesce(d.hdcatapPopulationCoverage, row.pop),
    d.hdcatapMinTypicalAge = coalesce(d.hdcatapMinTypicalAge, row.minAge),
    d.hdcatapMaxTypicalAge = coalesce(d.hdcatapMaxTypicalAge, row.maxAge),
    d.hdcatapNumberOfUniqueIndividuals = coalesce(d.hdcatapNumberOfUniqueIndividuals, row.people),
    d.dctTemporalStart = coalesce(d.dctTemporalStart, row.start),
    d.dctTemporalEnd = coalesce(d.dctTemporalEnd, row.end),
    d.hdcatapCodeValues = coalesce(d.hdcatapCodeValues, CASE WHEN size(coalesce(row.codes, [])) > 0 THEN row.codes END),
    d.conformsTo = coalesce(d.conformsTo, CASE WHEN row.theme IS NOT NULL THEN 'http://hl7.org/fhir/R4' END),
    d.hdcatapHealthThemes = CASE WHEN size(coalesce(d.hdcatapHealthThemes, [])) = 0 AND row.theme IS NOT NULL
                                 THEN [row.theme] ELSE d.hdcatapHealthThemes END;

// 6c. Derived: where the graph holds a dataset's patients, the people, their
// ages, the period and the codes come from them. Patients who opted out of
// secondary use (the OptedOut label, which a reversal removes) are not
// counted. Run on every seed, so the description follows the data.
// Encounters and conditions are read in separate subqueries: matched together
// they multiply (encounters x conditions rows per patient), which on Azure's
// Synthea cohort passed the 1 GiB transaction limit (ADR-056) and weighted
// each code by its patient's number of encounters.
MATCH (d:HealthDataset)<-[:FROM_DATASET]-(p:Patient)
WHERE NOT p:OptedOut
WITH d, collect(p) AS people
WITH d, people,
     [p IN people | duration.between(date(substring(toString(p.birthDate), 0, 10)), date()).years] AS ages
CALL {
  WITH people
  UNWIND people AS p
  MATCH (p)-[:HAS_ENCOUNTER]->(e:Encounter)
  WITH date(substring(toString(e.date), 0, 10)) AS at
  RETURN min(at) AS encounterFirst, max(at) AS encounterLast
}
CALL {
  WITH people
  UNWIND people AS p
  MATCH (p)-[:HAS_CONDITION]->(c:Condition)
  WITH date(substring(toString(c.onsetDate), 0, 10)) AS at
  RETURN min(at) AS onsetFirst, max(at) AS onsetLast
}
CALL {
  WITH people
  UNWIND people AS p
  MATCH (p)-[:HAS_CONDITION]->(c:Condition)
  // Only SNOMED codes go out as SNOMED-CT; an ICD-10 one (E11.9) would not.
  WHERE c.code IS NOT NULL
    AND coalesce(c.codeSystem, 'http://snomed.info/sct') = 'http://snomed.info/sct'
  WITH c.code AS code, count(*) AS n
  ORDER BY n DESC, code
  LIMIT 10
  RETURN collect('SNOMED-CT:' + code) AS codes
}
WITH d, people, ages, codes,
     CASE WHEN onsetFirst IS NULL OR encounterFirst < onsetFirst THEN encounterFirst ELSE onsetFirst END AS first,
     CASE WHEN onsetLast IS NULL OR encounterLast > onsetLast THEN encounterLast ELSE onsetLast END AS last
SET d.hdcatapNumberOfUniqueIndividuals = size(people),
    d.hdcatapNumberOfRecords = coalesce(d.hdcatapNumberOfRecords, size(people)),
    d.hdcatapMinTypicalAge = reduce(lo = 200, a IN ages | CASE WHEN a < lo THEN a ELSE lo END),
    d.hdcatapMaxTypicalAge = reduce(hi = 0, a IN ages | CASE WHEN a > hi THEN a ELSE hi END),
    d.dctTemporalStart = toString(first),
    d.dctTemporalEnd = toString(last),
    d.hdcatapCodeValues = codes,
    // Its patients are in the hub's OMOP CDM, whose aggregates /analytics shows.
    d.hdcatapAnalyticsURL = coalesce(d.hdcatapAnalyticsURL, 'https://ehds.mabu.red/analytics');

// 6c'. The OMOP dataset is the Synthea dataset transformed: where the graph
// links no patients to it (Azure), it describes the same people.
MATCH (o:HealthDataset {datasetId: 'dataset:omop-cdm-v54-analytics'})
WHERE NOT EXISTS { MATCH (o)<-[:FROM_DATASET]-(:Patient) }
MATCH (s:HealthDataset {datasetId: 'dataset:synthea-fhir-r4-mvd'})
WHERE s.hdcatapNumberOfUniqueIndividuals IS NOT NULL
SET o.hdcatapNumberOfUniqueIndividuals = s.hdcatapNumberOfUniqueIndividuals,
    o.hdcatapMinTypicalAge = s.hdcatapMinTypicalAge,
    o.hdcatapMaxTypicalAge = s.hdcatapMaxTypicalAge,
    o.dctTemporalStart = s.dctTemporalStart,
    o.dctTemporalEnd = s.dctTemporalEnd,
    o.hdcatapCodeValues = s.hdcatapCodeValues;

// 6d. For every dataset: how often it grows (the synthetic sets are generated
// again now and then), the finest time step of its records (a day), and how
// long it is kept (ten years after its last record).
MATCH (d:HealthDataset)
SET d.hdcatapAccrualPeriodicity = coalesce(d.hdcatapAccrualPeriodicity, 'IRREG'),
    d.hdcatapTemporalResolution = coalesce(d.hdcatapTemporalResolution, 'P1D'),
    d.hdcatapRetentionStart = coalesce(d.hdcatapRetentionStart, d.dctTemporalStart),
    d.hdcatapRetentionEnd = coalesce(d.hdcatapRetentionEnd,
      CASE WHEN d.dctTemporalEnd IS NOT NULL
           THEN toString(date(d.dctTemporalEnd) + duration('P10Y')) END);
