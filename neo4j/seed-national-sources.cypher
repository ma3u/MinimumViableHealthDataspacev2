// ==============================================================================
// National health data sources: described here, kept at the source (ADR-094)
//
// Two catalogue entries for data the hub never holds, and one figure a source
// released for publication (#1123). ADR-094 lets the hub take a national
// source's dataset descriptions, its published aggregates and feasibility
// counts, never its rows. Analysis happens in the source's own secure
// processing environment (Regulation (EU) 2025/327, Art. 73), under a data
// permit (Art. 68), and only results the source has checked leave it.
//
// Both entries are FICTIONAL analogues, published by MedReg DE, the fictional
// health data access body (.claude/rules/code-style.md). The real national
// bodies appear only behind a demo build flag, never in this file. Every node
// here carries fictional = true. The publication URL is on the reserved
// .example domain (RFC 2606).
//
// PUBLISHED_BY points at (:Participant), the label both readers match:
// /api/catalog (ui/src/app/api/catalog/route.ts) reads
// (d)-[:PUBLISHED_BY]->(:Participant), and the proxy's /catalog/datasets
// (services/neo4j-proxy/src/healthdcat-ap.ts, CATALOG_CYPHER) reads
// (d)-[:PUBLISHED_BY]->(pub) whatever its label. An (:Organization) target
// would leave the UI catalogue without a publisher (#514).
//
// Runs after insert-synthetic-schema-data.cypher, which creates MedReg DE, and
// before register-healthdcat-ap-r8.cypher, which adds what Release 8 needs and
// this file does not state (the variables). neo4j/seed.sh keeps that order.
// Idempotent: MERGE with ON CREATE SET / ON MATCH SET, safe to re-run.
// ==============================================================================

// ── 1. The two dataset descriptions ──
UNWIND [
  {
    id: 'dataset:medreg:national-claims-epa-research',
    title: 'National Claims and ePA Research Dataset (fictional)',
    description: 'Access: secure processing environment only, no row-level download. Fictional description of a national research dataset built from statutory health insurance claims and from electronic patient record (ePA) data of insured persons who did not opt out. The data stays at the source: an approved health data user analyses it in the source\'s secure processing environment under a data permit, and only results the source has checked for re-identification leave it.',
    titleDe: 'Nationaler Forschungsdatensatz aus Abrechnungs- und ePA-Daten (fiktiv)',
    descriptionDe: 'Zugang: nur in der sicheren Verarbeitungsumgebung, kein Herunterladen von Einzeldaten. Fiktive Beschreibung eines nationalen Forschungsdatensatzes aus Abrechnungsdaten der gesetzlichen Krankenversicherung und aus Daten der elektronischen Patientenakte (ePA) von Versicherten, die nicht widersprochen haben. Die Daten bleiben an der Quelle: Ein Gesundheitsdatennutzer mit Datengenehmigung wertet sie in der sicheren Verarbeitungsumgebung der Quelle aus, und nur Ergebnisse, die die Quelle auf Reidentifizierung geprüft hat, verlassen sie.',
    titleEs: 'Conjunto nacional de datos de investigación de facturación y ePA (ficticio)',
    descriptionEs: 'Acceso: solo en el entorno de tratamiento seguro, sin descarga de datos individuales. Descripción ficticia de un conjunto nacional de datos de investigación a partir de datos de facturación del seguro médico obligatorio y de datos de la historia clínica electrónica (ePA) de asegurados que no ejercieron su derecho de autoexclusión. Los datos permanecen en el origen: un usuario de datos de salud con permiso de datos los analiza en el entorno de tratamiento seguro del origen, y solo salen los resultados que el origen ha comprobado frente a la reidentificación.',
    theme: 'Health Services Research',
    kind: 'RealWorldData',
    conformsTo: 'https://ohdsi.github.io/CommonDataModel/cdm54.html',
    categories: ['HRAD', 'EHRS'],
    coding: ['ICD-10', 'OHDSI-VOCAB'],
    pop: 'Fictional: persons insured under statutory health insurance in Germany, and their ePA data where they did not opt out',
    people: 73000000,
    records: 1200000000,
    minAge: 0,
    maxAge: 105,
    start: '2009-01-01',
    end: '2025-12-31',
    codes: ['ICD-10:E11', 'ICD-10:I10', 'ICD-10:J45']
  },
  {
    id: 'dataset:medreg:university-hospital-fhir',
    title: 'University Hospital FHIR Core Dataset (fictional)',
    description: 'Access: secure processing environment only, no row-level download. Fictional description of the FHIR R4 core dataset of a network of university hospitals: patients, encounters, diagnoses, procedures, laboratory values and medication. Feasibility counts answer in real time with small counts suppressed; a data use needs a data permit and an ethics vote, and each hospital keeps its data. Analysis runs in a secure processing environment at the source.',
    titleDe: 'FHIR-Kerndatensatz der Universitätskliniken (fiktiv)',
    descriptionDe: 'Zugang: nur in der sicheren Verarbeitungsumgebung, kein Herunterladen von Einzeldaten. Fiktive Beschreibung des FHIR-R4-Kerndatensatzes eines Verbunds von Universitätskliniken: Patienten, Kontakte, Diagnosen, Prozeduren, Laborwerte und Medikation. Machbarkeitsabfragen liefern sofort Fallzahlen, kleine Zahlen unterdrückt; eine Nutzung braucht eine Datengenehmigung und ein Ethikvotum, und jede Klinik behält ihre Daten. Ausgewertet wird in einer sicheren Verarbeitungsumgebung an der Quelle.',
    titleEs: 'Conjunto básico FHIR de hospitales universitarios (ficticio)',
    descriptionEs: 'Acceso: solo en el entorno de tratamiento seguro, sin descarga de datos individuales. Descripción ficticia del conjunto básico FHIR R4 de una red de hospitales universitarios: pacientes, contactos, diagnósticos, procedimientos, valores de laboratorio y medicación. Las consultas de viabilidad responden al momento con recuentos, suprimidos los pequeños; un uso necesita un permiso de datos y un dictamen ético, y cada hospital conserva sus datos. El análisis se hace en un entorno de tratamiento seguro en el origen.',
    theme: 'Clinical Research',
    kind: 'RealWorldData',
    conformsTo: 'http://hl7.org/fhir/R4',
    categories: ['EHRS'],
    coding: ['SNOMED-CT', 'LOINC', 'ICD-10'],
    pop: 'Fictional: inpatients and outpatients of a network of German university hospitals',
    people: 12000000,
    records: 480000000,
    minAge: 0,
    maxAge: 105,
    start: '2016-01-01',
    end: '2025-12-31',
    codes: ['ICD-10:C50', 'ICD-10:E11', 'ICD-10:I21']
  }
] AS row
MERGE (d:HealthDataset {datasetId: row.id})
  ON CREATE SET d.createdAt = datetime()
  ON MATCH SET d.modifiedAt = datetime()
SET d.id = row.id,
    d.title = row.title,
    d.description = row.description,
    d.titleDe = row.titleDe,
    d.descriptionDe = row.descriptionDe,
    d.titleEs = row.titleEs,
    d.descriptionEs = row.descriptionEs,
    d.issued = date('2026-11-15'),
    d.modified = date('2026-11-24'),
    d.language = ['de', 'en'],
    d.license = 'CC-BY-4.0',
    d.conformsTo = row.conformsTo,
    d.theme = row.theme,
    d.dctSpatial = 'DE',
    d.dctTemporalStart = row.start,
    d.dctTemporalEnd = row.end,
    d.hdcatapDatasetType = row.kind,
    d.hdcatapAccessRights = 'NON_PUBLIC',
    d.hdcatapApplicableLegislation = ['http://data.europa.eu/eli/reg/2025/327/oj'],
    d.hdcatapLegalBasisForAccess = 'EHDS Art. 68 data permit, secure processing environment only (Art. 73)',
    d.hdcatapPurpose = 'Scientific research · Statistics · Public health',
    d.hdcatapPersonalData = true,
    d.hdcatapSensitiveData = true,
    d.hdcatapHasStructuredData = true,
    d.hdcatapHealthCategories = row.categories,
    d.hdcatapHealthThemes = ['HEALTH_SYSTEMS'],
    d.hdcatapCodingSystems = row.coding,
    d.hdcatapCodeValues = row.codes,
    d.hdcatapKeywords = [row.theme, 'secure processing environment', 'EHDS secondary use'],
    d.hdcatapPopulationCoverage = row.pop,
    d.hdcatapNumberOfUniqueIndividuals = row.people,
    d.hdcatapNumberOfRecords = row.records,
    d.hdcatapMinTypicalAge = row.minAge,
    d.hdcatapMaxTypicalAge = row.maxAge,
    d.hdcatapPublisherType = 'HealthDataAccessBody',
    d.hdcatapProvenance = 'Fictional description for the demo (ADR-094). The data it describes stays at the source; the hub holds this description and published aggregates only.',
    // What ADR-094 decision 2.1 says of every national source.
    d.accessMode = 'secure-processing-environment-only',
    d.rowLevelDownload = false,
    d.fictional = true;

// ── 2. MedReg DE publishes and governs both ──
MATCH (medreg:Participant {participantId: 'did:web:medreg.de:hdab'})
MATCH (d:HealthDataset)
WHERE d.datasetId IN ['dataset:medreg:national-claims-epa-research',
                      'dataset:medreg:university-hospital-fhir']
MERGE (d)-[:PUBLISHED_BY]->(medreg)
MERGE (medreg)-[:GOVERNS]->(d);

// ── 3. A contact point at the access body ──
MERGE (cp:ContactPoint {contactId: 'contact:medreg-de'})
  ON CREATE SET cp.name = 'MedReg DE data access desk',
                cp.email = 'data-access@medreg-de.example'
  ON MATCH SET cp.name = coalesce(cp.name, 'MedReg DE data access desk');

MATCH (cp:ContactPoint {contactId: 'contact:medreg-de'})
MATCH (d:HealthDataset)
WHERE d.datasetId IN ['dataset:medreg:national-claims-epa-research',
                      'dataset:medreg:university-hospital-fhir']
MERGE (d)-[:HAS_CONTACT_POINT]->(cp);

// ── 4. One distribution each: analysis in the SPE, no download URL ──
// An accessURL where the permit is applied for; deliberately no downloadURL,
// since nothing row-level leaves the source.
MATCH (d:HealthDataset)
WHERE d.datasetId IN ['dataset:medreg:national-claims-epa-research',
                      'dataset:medreg:university-hospital-fhir']
MERGE (x:Distribution {distributionId: 'dist:' + d.datasetId + ':spe'})
  ON CREATE SET x.createdAt = datetime()
  ON MATCH SET x.modifiedAt = datetime()
SET x.title = 'Analysis in the secure processing environment of the source (no download)',
    x.description = 'Reached through the health data access body under a data permit (Art. 68); processed only in the source\'s secure processing environment (Art. 73).',
    x.format = 'JSON-LD',
    x.accessURL = 'https://ehds.mabu.red/data/discover?dataset=' + d.datasetId,
    x.accessService = 'Secure processing environment of the source (Art. 73)',
    x.hdcatapApplicableLegislation = ['http://data.europa.eu/eli/reg/2025/327/oj'],
    x.fictional = true
MERGE (d)-[:HAS_DISTRIBUTION]->(x);

// ── 5. A published aggregate (ADR-094 decision 2.2) ──
// A figure the source released for publication, with its source, licence,
// release date and the source's small-count rule. The hub may hold it; the
// rows behind it stay at the source.
MERGE (pa:PublishedAggregate {aggregateId: 'aggregate:medreg:t2d-prevalence-2024'})
  ON CREATE SET pa.createdAt = datetime()
  ON MATCH SET pa.modifiedAt = datetime()
SET pa.title = 'Diagnosed type 2 diabetes among insured adults, 2024 (fictional)',
    pa.description = 'Share of insured adults aged 18 and over with at least two outpatient diagnoses of type 2 diabetes (ICD-10 E11) in two quarters of 2024. Fictional figure for the demo (ADR-094).',
    pa.value = 8.9,
    pa.unit = '%',
    pa.population = 'Fictional: insured adults aged 18 and over',
    pa.period = '2024',
    pa.sourceUrl = 'https://medreg-de.example/publications/t2d-prevalence-2024',
    pa.licence = 'CC-BY-4.0',
    pa.releaseDate = date('2026-06-30'),
    pa.smallCountRule = 'Cells with fewer than 5 persons are suppressed, and so is any cell from which a suppressed one could be derived.',
    pa.fictional = true;

MATCH (d:HealthDataset {datasetId: 'dataset:medreg:national-claims-epa-research'})
MATCH (pa:PublishedAggregate {aggregateId: 'aggregate:medreg:t2d-prevalence-2024'})
MERGE (d)-[:HAS_PUBLISHED_AGGREGATE]->(pa);
