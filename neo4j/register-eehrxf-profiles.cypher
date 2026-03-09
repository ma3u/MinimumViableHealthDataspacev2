// ============================================================
// EEHRxF FHIR Profile Registration
// ============================================================
// Creates EEHRxFCategory and EEHRxFProfile nodes representing
// the European Electronic Health Record Exchange Format (EEHRxF)
// priority categories and HL7 Europe FHIR R4 Implementation Guides.
//
// Reference:
//   - Commission Recommendation C(2019)800 (EEHRxF)
//   - EHDS Regulation (entered into force 26 March 2025)
//   - HL7 Europe FHIR IGs: https://hl7.eu/fhir/
//   - Xt-EHR Joint Action: https://xt-ehr.eu/
//
// Run after: init-schema.cypher
// Idempotent: safe to re-run (uses MERGE)
// ============================================================

// ────────────────────────────────────────────────────────────
// 1. EHDS Priority Categories
// ────────────────────────────────────────────────────────────

MERGE (c:EEHRxFCategory {categoryId: 'patient-summary'})
SET c.name = 'Patient Summaries',
    c.description = 'Cross-border patient summary including demographics, allergies, conditions, medications, and immunizations',
    c.ehdsDeadline = '2029-03',
    c.ehdsGroup = 1,
    c.status = 'partial'
RETURN c.categoryId AS created;

MERGE (c:EEHRxFCategory {categoryId: 'eprescription'})
SET c.name = 'ePrescription / eDispensation',
    c.description = 'Electronic prescription and dispensation of medicinal products across borders',
    c.ehdsDeadline = '2029-03',
    c.ehdsGroup = 1,
    c.status = 'partial'
RETURN c.categoryId AS created;

MERGE (c:EEHRxFCategory {categoryId: 'laboratory-results'})
SET c.name = 'Laboratory Results',
    c.description = 'Standardised laboratory reports including in-vitro diagnostics, clinical biochemistry, haematology, microbiology',
    c.ehdsDeadline = '2031-03',
    c.ehdsGroup = 2,
    c.status = 'partial'
RETURN c.categoryId AS created;

MERGE (c:EEHRxFCategory {categoryId: 'hospital-discharge'})
SET c.name = 'Hospital Discharge Reports',
    c.description = 'Structured hospital discharge summaries including diagnoses, procedures, care plan, and follow-up',
    c.ehdsDeadline = '2031-03',
    c.ehdsGroup = 2,
    c.status = 'partial'
RETURN c.categoryId AS created;

MERGE (c:EEHRxFCategory {categoryId: 'medical-imaging'})
SET c.name = 'Medical Images / Reports',
    c.description = 'Medical imaging studies and diagnostic reports including DICOM references',
    c.ehdsDeadline = '2031-03',
    c.ehdsGroup = 2,
    c.status = 'none'
RETURN c.categoryId AS created;

MERGE (c:EEHRxFCategory {categoryId: 'rare-disease'})
SET c.name = 'Rare Disease Registration',
    c.description = 'European Reference Networks (ERN) rare disease patient registries',
    c.ehdsDeadline = 'TBD',
    c.ehdsGroup = 3,
    c.status = 'none'
RETURN c.categoryId AS created;

// ────────────────────────────────────────────────────────────
// 2. HL7 Europe Base and Core Profiles (hl7.fhir.eu.base#0.1.0)
// ────────────────────────────────────────────────────────────

MERGE (p:EEHRxFProfile {profileId: 'patient-eu-core'})
SET p.name = 'Patient (EU core)',
    p.igName = 'HL7 Europe Base and Core',
    p.igPackage = 'hl7.fhir.eu.base#0.1.0',
    p.fhirVersion = 'R4',
    p.status = 'STU',
    p.url = 'https://hl7.eu/fhir/base/StructureDefinition-Patient-eu.html',
    p.baseResource = 'Patient',
    p.description = 'Core Patient profile for the European context. When ips-pat-1 invariant is satisfied, complies with IPS patient profile.',
    p.coverage = 'full'
RETURN p.profileId AS created;

MERGE (p:EEHRxFProfile {profileId: 'practitioner-eu-core'})
SET p.name = 'Practitioner (EU core)',
    p.igName = 'HL7 Europe Base and Core',
    p.igPackage = 'hl7.fhir.eu.base#0.1.0',
    p.fhirVersion = 'R4',
    p.status = 'STU',
    p.url = 'https://hl7.eu/fhir/base/StructureDefinition-Practitioner-eu.html',
    p.baseResource = 'Practitioner',
    p.description = 'Core Practitioner profile for the European context with common constraints.',
    p.coverage = 'none'
RETURN p.profileId AS created;

MERGE (p:EEHRxFProfile {profileId: 'organization-eu-core'})
SET p.name = 'Organization (EU core)',
    p.igName = 'HL7 Europe Base and Core',
    p.igPackage = 'hl7.fhir.eu.base#0.1.0',
    p.fhirVersion = 'R4',
    p.status = 'STU',
    p.url = 'https://hl7.eu/fhir/base/StructureDefinition-Organization-eu.html',
    p.baseResource = 'Organization',
    p.description = 'Core Organization profile for the European context.',
    p.coverage = 'none'
RETURN p.profileId AS created;

MERGE (p:EEHRxFProfile {profileId: 'practitioner-role-eu-core'})
SET p.name = 'PractitionerRole (EU core)',
    p.igName = 'HL7 Europe Base and Core',
    p.igPackage = 'hl7.fhir.eu.base#0.1.0',
    p.fhirVersion = 'R4',
    p.status = 'STU',
    p.url = 'https://hl7.eu/fhir/base/StructureDefinition-PractitionerRole-eu.html',
    p.baseResource = 'PractitionerRole',
    p.description = 'Core PractitionerRole profile for the European context.',
    p.coverage = 'none'
RETURN p.profileId AS created;

// ────────────────────────────────────────────────────────────
// 3. HL7 Europe Laboratory Report (hl7.fhir.eu.laboratory#0.1.1)
// ────────────────────────────────────────────────────────────

MERGE (p:EEHRxFProfile {profileId: 'diagnostic-report-lab-eu'})
SET p.name = 'DiagnosticReport (EU Lab)',
    p.igName = 'HL7 Europe Laboratory Report',
    p.igPackage = 'hl7.fhir.eu.laboratory#0.1.1',
    p.fhirVersion = 'R4',
    p.status = 'STU',
    p.url = 'https://hl7.eu/fhir/laboratory/StructureDefinition-DiagnosticReport-eu-lab.html',
    p.baseResource = 'DiagnosticReport',
    p.description = 'European laboratory report as DiagnosticReport with structured Observations.',
    p.coverage = 'none'
RETURN p.profileId AS created;

MERGE (p:EEHRxFProfile {profileId: 'observation-results-lab-eu'})
SET p.name = 'Observation Results (EU Lab)',
    p.igName = 'HL7 Europe Laboratory Report',
    p.igPackage = 'hl7.fhir.eu.laboratory#0.1.1',
    p.fhirVersion = 'R4',
    p.status = 'STU',
    p.url = 'https://hl7.eu/fhir/laboratory/StructureDefinition-Observation-resultslab-eu-lab.html',
    p.baseResource = 'Observation',
    p.description = 'Laboratory result observation with LOINC/NPU coding and specimen reference.',
    p.coverage = 'partial'
RETURN p.profileId AS created;

MERGE (p:EEHRxFProfile {profileId: 'bundle-lab-report-eu'})
SET p.name = 'Bundle Lab Report (EU)',
    p.igName = 'HL7 Europe Laboratory Report',
    p.igPackage = 'hl7.fhir.eu.laboratory#0.1.1',
    p.fhirVersion = 'R4',
    p.status = 'STU',
    p.url = 'https://hl7.eu/fhir/laboratory/StructureDefinition-Bundle-eu-lab.html',
    p.baseResource = 'Bundle',
    p.description = 'Document Bundle containing a complete EU laboratory report with Composition and DiagnosticReport.',
    p.coverage = 'none'
RETURN p.profileId AS created;

// ────────────────────────────────────────────────────────────
// 4. HL7 Europe Hospital Discharge Report (hl7.fhir.eu.hdr)
// ────────────────────────────────────────────────────────────

MERGE (p:EEHRxFProfile {profileId: 'composition-hdr-eu'})
SET p.name = 'Composition (EU HDR)',
    p.igName = 'HL7 Europe Hospital Discharge Report',
    p.igPackage = 'hl7.fhir.eu.hdr#1.0.0-ci-build',
    p.fhirVersion = 'R4',
    p.status = 'Ballot',
    p.url = 'https://build.fhir.org/ig/hl7-eu/hdr/',
    p.baseResource = 'Composition',
    p.description = 'Hospital discharge report composition with structured sections for diagnoses, procedures, care plan.',
    p.coverage = 'none'
RETURN p.profileId AS created;

MERGE (p:EEHRxFProfile {profileId: 'encounter-hdr-eu'})
SET p.name = 'Encounter (EU HDR)',
    p.igName = 'HL7 Europe Hospital Discharge Report',
    p.igPackage = 'hl7.fhir.eu.hdr#1.0.0-ci-build',
    p.fhirVersion = 'R4',
    p.status = 'Ballot',
    p.url = 'https://build.fhir.org/ig/hl7-eu/hdr/',
    p.baseResource = 'Encounter',
    p.description = 'Inpatient encounter forming the basis of a hospital discharge report.',
    p.coverage = 'partial'
RETURN p.profileId AS created;

// ────────────────────────────────────────────────────────────
// 5. HL7 Europe Medication Prescription & Dispense (hl7.fhir.eu.mpd)
// ────────────────────────────────────────────────────────────

MERGE (p:EEHRxFProfile {profileId: 'medication-request-eu'})
SET p.name = 'MedicationRequest (EU MPD)',
    p.igName = 'HL7 Europe Medication Prescription & Dispense',
    p.igPackage = 'hl7.fhir.eu.mpd',
    p.fhirVersion = 'R4',
    p.status = 'Ballot',
    p.url = 'https://build.fhir.org/ig/hl7-eu/medications/',
    p.baseResource = 'MedicationRequest',
    p.description = 'European ePrescription as MedicationRequest with cross-border dispensation support.',
    p.coverage = 'partial'
RETURN p.profileId AS created;

MERGE (p:EEHRxFProfile {profileId: 'medication-dispense-eu'})
SET p.name = 'MedicationDispense (EU MPD)',
    p.igName = 'HL7 Europe Medication Prescription & Dispense',
    p.igPackage = 'hl7.fhir.eu.mpd',
    p.fhirVersion = 'R4',
    p.status = 'Ballot',
    p.url = 'https://build.fhir.org/ig/hl7-eu/medications/',
    p.baseResource = 'MedicationDispense',
    p.description = 'European eDispensation record for cross-border medication fulfillment.',
    p.coverage = 'none'
RETURN p.profileId AS created;

// ────────────────────────────────────────────────────────────
// 6. HL7 Europe Imaging Study Report (hl7.fhir.eu.imaging)
// ────────────────────────────────────────────────────────────

MERGE (p:EEHRxFProfile {profileId: 'imaging-study-eu'})
SET p.name = 'ImagingStudy (EU)',
    p.igName = 'HL7 Europe Imaging Study Report',
    p.igPackage = 'hl7.fhir.eu.imaging',
    p.fhirVersion = 'R5',
    p.status = 'Ballot',
    p.url = 'https://build.fhir.org/ig/hl7-eu/imaging/',
    p.baseResource = 'ImagingStudy',
    p.description = 'European imaging study report with DICOM references and diagnostic interpretation.',
    p.coverage = 'none'
RETURN p.profileId AS created;

// ────────────────────────────────────────────────────────────
// 7. Profile → Category Relationships
// ────────────────────────────────────────────────────────────

// Patient Summary category profiles
MATCH (p:EEHRxFProfile {profileId: 'patient-eu-core'}), (c:EEHRxFCategory {categoryId: 'patient-summary'})
MERGE (p)-[:PART_OF_CATEGORY]->(c);

MATCH (p:EEHRxFProfile {profileId: 'practitioner-eu-core'}), (c:EEHRxFCategory {categoryId: 'patient-summary'})
MERGE (p)-[:PART_OF_CATEGORY]->(c);

MATCH (p:EEHRxFProfile {profileId: 'organization-eu-core'}), (c:EEHRxFCategory {categoryId: 'patient-summary'})
MERGE (p)-[:PART_OF_CATEGORY]->(c);

// ePrescription category profiles
MATCH (p:EEHRxFProfile {profileId: 'medication-request-eu'}), (c:EEHRxFCategory {categoryId: 'eprescription'})
MERGE (p)-[:PART_OF_CATEGORY]->(c);

MATCH (p:EEHRxFProfile {profileId: 'medication-dispense-eu'}), (c:EEHRxFCategory {categoryId: 'eprescription'})
MERGE (p)-[:PART_OF_CATEGORY]->(c);

// Laboratory Results category profiles
MATCH (p:EEHRxFProfile {profileId: 'diagnostic-report-lab-eu'}), (c:EEHRxFCategory {categoryId: 'laboratory-results'})
MERGE (p)-[:PART_OF_CATEGORY]->(c);

MATCH (p:EEHRxFProfile {profileId: 'observation-results-lab-eu'}), (c:EEHRxFCategory {categoryId: 'laboratory-results'})
MERGE (p)-[:PART_OF_CATEGORY]->(c);

MATCH (p:EEHRxFProfile {profileId: 'bundle-lab-report-eu'}), (c:EEHRxFCategory {categoryId: 'laboratory-results'})
MERGE (p)-[:PART_OF_CATEGORY]->(c);

MATCH (p:EEHRxFProfile {profileId: 'patient-eu-core'}), (c:EEHRxFCategory {categoryId: 'laboratory-results'})
MERGE (p)-[:PART_OF_CATEGORY]->(c);

// Hospital Discharge category profiles
MATCH (p:EEHRxFProfile {profileId: 'composition-hdr-eu'}), (c:EEHRxFCategory {categoryId: 'hospital-discharge'})
MERGE (p)-[:PART_OF_CATEGORY]->(c);

MATCH (p:EEHRxFProfile {profileId: 'encounter-hdr-eu'}), (c:EEHRxFCategory {categoryId: 'hospital-discharge'})
MERGE (p)-[:PART_OF_CATEGORY]->(c);

MATCH (p:EEHRxFProfile {profileId: 'patient-eu-core'}), (c:EEHRxFCategory {categoryId: 'hospital-discharge'})
MERGE (p)-[:PART_OF_CATEGORY]->(c);

// Medical Imaging category profiles
MATCH (p:EEHRxFProfile {profileId: 'imaging-study-eu'}), (c:EEHRxFCategory {categoryId: 'medical-imaging'})
MERGE (p)-[:PART_OF_CATEGORY]->(c);

// ────────────────────────────────────────────────────────────
// 8. Profile Dependencies
// ────────────────────────────────────────────────────────────

// Lab Report profiles depend on Base Patient
MATCH (p:EEHRxFProfile {profileId: 'diagnostic-report-lab-eu'}), (dep:EEHRxFProfile {profileId: 'patient-eu-core'})
MERGE (p)-[:DEPENDS_ON]->(dep);

MATCH (p:EEHRxFProfile {profileId: 'observation-results-lab-eu'}), (dep:EEHRxFProfile {profileId: 'patient-eu-core'})
MERGE (p)-[:DEPENDS_ON]->(dep);

// HDR profiles depend on Base Patient
MATCH (p:EEHRxFProfile {profileId: 'composition-hdr-eu'}), (dep:EEHRxFProfile {profileId: 'patient-eu-core'})
MERGE (p)-[:DEPENDS_ON]->(dep);

MATCH (p:EEHRxFProfile {profileId: 'encounter-hdr-eu'}), (dep:EEHRxFProfile {profileId: 'patient-eu-core'})
MERGE (p)-[:DEPENDS_ON]->(dep);

// Medication profiles depend on Base Patient and Practitioner
MATCH (p:EEHRxFProfile {profileId: 'medication-request-eu'}), (dep:EEHRxFProfile {profileId: 'patient-eu-core'})
MERGE (p)-[:DEPENDS_ON]->(dep);

MATCH (p:EEHRxFProfile {profileId: 'medication-request-eu'}), (dep:EEHRxFProfile {profileId: 'practitioner-eu-core'})
MERGE (p)-[:DEPENDS_ON]->(dep);

// ────────────────────────────────────────────────────────────
// 9. Dynamic Resource Count Mapping
//    Links profiles to representative FHIR nodes and counts
// ────────────────────────────────────────────────────────────

// Patient (EU core) → count Patient nodes
MATCH (p:EEHRxFProfile {profileId: 'patient-eu-core'})
OPTIONAL MATCH (resource:Patient)
WITH p, count(resource) AS cnt
SET p.resourceCount = cnt,
    p.coverage = CASE WHEN cnt > 0 THEN 'full' ELSE 'none' END
RETURN p.profileId, p.resourceCount, p.coverage;

// Observation Results (EU Lab) → count Observation nodes with LOINC codes
MATCH (p:EEHRxFProfile {profileId: 'observation-results-lab-eu'})
OPTIONAL MATCH (resource:Observation)-[:CODED_BY]->(:LoincCode)
WITH p, count(resource) AS cnt
SET p.resourceCount = cnt,
    p.coverage = CASE WHEN cnt > 100 THEN 'partial' WHEN cnt > 0 THEN 'partial' ELSE 'none' END
RETURN p.profileId, p.resourceCount, p.coverage;

// Encounter (EU HDR) → count inpatient Encounter nodes
MATCH (p:EEHRxFProfile {profileId: 'encounter-hdr-eu'})
OPTIONAL MATCH (resource:Encounter)
WHERE resource.encounterClass IN ['IMP', 'inpatient', 'EMER', 'emergency']
WITH p, count(resource) AS cnt
SET p.resourceCount = cnt,
    p.coverage = CASE WHEN cnt > 0 THEN 'partial' ELSE 'none' END
RETURN p.profileId, p.resourceCount, p.coverage;

// MedicationRequest (EU MPD) → count MedicationRequest nodes
MATCH (p:EEHRxFProfile {profileId: 'medication-request-eu'})
OPTIONAL MATCH (resource:MedicationRequest)
WITH p, count(resource) AS cnt
SET p.resourceCount = cnt,
    p.coverage = CASE WHEN cnt > 0 THEN 'partial' ELSE 'none' END
RETURN p.profileId, p.resourceCount, p.coverage;

// DiagnosticReport (EU Lab) → not loaded from Synthea
MATCH (p:EEHRxFProfile {profileId: 'diagnostic-report-lab-eu'})
SET p.resourceCount = 0, p.coverage = 'none'
RETURN p.profileId, p.resourceCount, p.coverage;

// Bundle Lab Report → not loaded from Synthea
MATCH (p:EEHRxFProfile {profileId: 'bundle-lab-report-eu'})
SET p.resourceCount = 0, p.coverage = 'none'
RETURN p.profileId, p.resourceCount, p.coverage;

// Composition HDR → not loaded
MATCH (p:EEHRxFProfile {profileId: 'composition-hdr-eu'})
SET p.resourceCount = 0, p.coverage = 'none'
RETURN p.profileId, p.resourceCount, p.coverage;

// MedicationDispense → not loaded
MATCH (p:EEHRxFProfile {profileId: 'medication-dispense-eu'})
SET p.resourceCount = 0, p.coverage = 'none'
RETURN p.profileId, p.resourceCount, p.coverage;

// ImagingStudy → not loaded
MATCH (p:EEHRxFProfile {profileId: 'imaging-study-eu'})
SET p.resourceCount = 0, p.coverage = 'none'
RETURN p.profileId, p.resourceCount, p.coverage;

// Practitioner → not loaded from Synthea bundles
MATCH (p:EEHRxFProfile {profileId: 'practitioner-eu-core'})
SET p.resourceCount = 0, p.coverage = 'none'
RETURN p.profileId, p.resourceCount, p.coverage;

// Organization → not loaded from Synthea bundles
MATCH (p:EEHRxFProfile {profileId: 'organization-eu-core'})
SET p.resourceCount = 0, p.coverage = 'none'
RETURN p.profileId, p.resourceCount, p.coverage;

// PractitionerRole → not loaded
MATCH (p:EEHRxFProfile {profileId: 'practitioner-role-eu-core'})
SET p.resourceCount = 0, p.coverage = 'none'
RETURN p.profileId, p.resourceCount, p.coverage;

// ────────────────────────────────────────────────────────────
// 10. Update Category Status (aggregate from profiles)
// ────────────────────────────────────────────────────────────

MATCH (c:EEHRxFCategory)<-[:PART_OF_CATEGORY]-(p:EEHRxFProfile)
WITH c,
     collect(p.coverage) AS coverages,
     sum(p.resourceCount) AS totalResources
SET c.totalResources = totalResources,
    c.profileCount = size(coverages),
    c.status = CASE
      WHEN all(cv IN coverages WHERE cv = 'full') THEN 'available'
      WHEN any(cv IN coverages WHERE cv IN ['full', 'partial']) THEN 'partial'
      ELSE 'none'
    END
RETURN c.categoryId, c.status, c.totalResources, c.profileCount;
