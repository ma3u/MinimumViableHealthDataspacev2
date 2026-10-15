// ============================================================
// Study results beyond laboratory values (ADR-059)
//
// Four kinds of result an ePA or EHR integrator asks for first, as the EHDS
// priority categories of Art. 14 name them: a resting ECG and an imaging
// report (medical images and reports), a vaccination record and a medication
// plan (patient summary). Seeded for three fictional patients: the demo
// patient P1 (seed-persona-overview.cypher) and two of the hand-seeded
// records in insert-synthetic-schema-data.cypher.
//
// Fictional data only, every value invented. Idempotent MERGE throughout;
// run after seed-persona-overview.cypher. Every LOINC code was checked
// against the NLM clinical tables API on 2026-10-15.
//
// Graph shape (docs/knowledge/datamodels/fhir-r4-nodes.md):
//   (:Patient)-[:HAS_DIAGNOSTIC_REPORT]->(:DiagnosticReport)-[:HAS_RESULT]->(:Observation)
//   (:Patient)-[:HAS_OBSERVATION]->(:Observation)        the same Observation, so the
//                                                        timeline and the FHIR Bundle see it
//   (:Patient)-[:HAS_IMMUNIZATION]->(:Immunization)
//   (:Patient)-[:HAS_MEDICATION_STATEMENT]->(:MedicationStatement)
// ============================================================

// ── 1. Resting ECG: one DiagnosticReport (LOINC 11524-6, category EC) with
//       its interval measurements as Observations ───────────────────────────
UNWIND [
  {patient: 'P1', id: 'dr-ecg-p1-2026-03-04', at: '2026-03-04', performer: 'AlphaKlinik Berlin, Kardiologie (fictional)',
   conclusion: 'Sinus rhythm, normal intervals, no repolarisation abnormality.',
   rows: [
     {code: '8867-4', display: 'Heart rate', value: 72, unit: '/min', category: 'vital-signs', low: 60, high: 100},
     {code: '8625-6', display: 'P-R Interval', value: 158, unit: 'ms', category: 'procedure', low: 120, high: 200},
     {code: '8633-0', display: 'QRS duration', value: 92, unit: 'ms', category: 'procedure', low: 70, high: 110},
     {code: '8634-8', display: 'Q-T interval', value: 384, unit: 'ms', category: 'procedure', low: null, high: null},
     {code: '8636-3', display: 'Q-T interval corrected', value: 402, unit: 'ms', category: 'procedure', low: null, high: 460},
     {code: '8632-2', display: 'QRS axis', value: 45, unit: 'deg', category: 'procedure', low: -30, high: 90}
   ]},
  {patient: 'fhir-pat-1002', id: 'dr-ecg-1002-2025-11-18', at: '2025-11-18', performer: 'AlphaKlinik Berlin, Kardiologie (fictional)',
   conclusion: 'Sinus bradycardia with first-degree AV block, no sign of acute ischaemia.',
   rows: [
     {code: '8867-4', display: 'Heart rate', value: 54, unit: '/min', category: 'vital-signs', low: 60, high: 100},
     {code: '8625-6', display: 'P-R Interval', value: 212, unit: 'ms', category: 'procedure', low: 120, high: 200},
     {code: '8633-0', display: 'QRS duration', value: 98, unit: 'ms', category: 'procedure', low: 70, high: 110},
     {code: '8634-8', display: 'Q-T interval', value: 428, unit: 'ms', category: 'procedure', low: null, high: null},
     {code: '8636-3', display: 'Q-T interval corrected', value: 406, unit: 'ms', category: 'procedure', low: null, high: 450},
     {code: '8632-2', display: 'QRS axis', value: -10, unit: 'deg', category: 'procedure', low: -30, high: 90}
   ]}
] AS r
MATCH (p:Patient {resourceId: r.patient})
MERGE (dr:DiagnosticReport {resourceId: r.id})
SET dr.code = '11524-6',
    dr.codeSystem = 'http://loinc.org',
    dr.display = 'EKG study',
    dr.name = 'Resting ECG ' + r.at,
    dr.category = 'EC',
    dr.categoryDisplay = 'Electrocardiac (e.g., EKG, EEC, Holter)',
    dr.status = 'final',
    dr.effectiveDate = date(r.at),
    dr.issued = r.at + 'T10:00:00Z',
    dr.performer = r.performer,
    dr.conclusion = r.conclusion,
    dr.fictional = true
MERGE (p)-[:HAS_DIAGNOSTIC_REPORT]->(dr)
WITH p, dr, r
UNWIND r.rows AS o
MERGE (obs:Observation {resourceId: r.id + '-' + o.code})
SET obs.code = o.code,
    obs.codeSystem = 'http://loinc.org',
    obs.display = o.display,
    obs.name = o.display + ' ' + toString(o.value) + ' ' + o.unit,
    obs.status = 'final',
    obs.category = o.category,
    obs.valueQuantity = o.value,
    obs.value = o.value,
    obs.unit = o.unit,
    obs.valueUnit = o.unit,
    obs.referenceLow = o.low,
    obs.referenceHigh = o.high,
    obs.referenceText = CASE
      WHEN o.low IS NULL AND o.high IS NULL THEN null
      WHEN o.low IS NULL THEN '< ' + toString(o.high) + ' ' + o.unit
      WHEN o.high IS NULL THEN '> ' + toString(o.low) + ' ' + o.unit
      ELSE toString(o.low) + ' - ' + toString(o.high) + ' ' + o.unit END,
    obs.effectiveDate = date(r.at),
    obs.dateTime = r.at + 'T10:00:00Z',
    obs.performer = r.performer,
    obs.fictional = true
MERGE (p)-[:HAS_OBSERVATION]->(obs)
MERGE (dr)-[:HAS_RESULT]->(obs)
MERGE (lc:LoincCode {code: o.code})
  ON CREATE SET lc.display = o.display, lc.system = 'http://loinc.org'
MERGE (obs)-[:CODED_BY]->(lc);

// ── 2. Imaging reports: a DiagnosticReport per study (category RAD), with
//       a measured Observation where the study yields one ──────────────────
UNWIND [
  {patient: 'P1', id: 'dr-img-p1-2026-01-22', at: '2026-01-22', code: '36643-5', display: 'XR Chest 2 Views',
   performer: 'AlphaKlinik Berlin, Radiologie (fictional)', modality: 'DX',
   conclusion: 'Lungs clear. Cardiomediastinal silhouette within normal limits. No pleural effusion, no pneumothorax.',
   rows: []},
  {patient: 'fhir-pat-1002', id: 'dr-img-1002-2025-11-18', at: '2025-11-18', code: '34552-0', display: 'Cardiac 2D echo panel',
   performer: 'AlphaKlinik Berlin, Kardiologie (fictional)', modality: 'US',
   conclusion: 'Normal left ventricular size and systolic function. Mild concentric remodelling. No significant valvular disease.',
   rows: [{code: '10230-1', display: 'Left ventricular Ejection fraction', value: 58, unit: '%', category: 'procedure', low: 52, high: 72}]},
  {patient: 'fhir-pat-1005', id: 'dr-img-1005-2026-04-09', at: '2026-04-09', code: '24558-9', display: 'US Abdomen',
   performer: 'Limburg Medical Centre, Radiology (fictional)', modality: 'US',
   conclusion: 'Mild hepatic steatosis. No focal liver lesion. Gallbladder without stones, bile ducts not dilated. Kidneys normal.',
   rows: []}
] AS r
MATCH (p:Patient {resourceId: r.patient})
MERGE (dr:DiagnosticReport {resourceId: r.id})
SET dr.code = r.code,
    dr.codeSystem = 'http://loinc.org',
    dr.display = r.display,
    dr.name = r.display + ' ' + r.at,
    dr.category = 'RAD',
    dr.categoryDisplay = 'Radiology',
    dr.modality = r.modality,
    dr.status = 'final',
    dr.effectiveDate = date(r.at),
    dr.issued = r.at + 'T15:30:00Z',
    dr.performer = r.performer,
    dr.conclusion = r.conclusion,
    dr.fictional = true
MERGE (p)-[:HAS_DIAGNOSTIC_REPORT]->(dr)
WITH p, dr, r
UNWIND r.rows AS o
MERGE (obs:Observation {resourceId: r.id + '-' + o.code})
SET obs.code = o.code,
    obs.codeSystem = 'http://loinc.org',
    obs.display = o.display,
    obs.name = o.display + ' ' + toString(o.value) + ' ' + o.unit,
    obs.status = 'final',
    obs.category = o.category,
    obs.valueQuantity = o.value,
    obs.value = o.value,
    obs.unit = o.unit,
    obs.valueUnit = o.unit,
    obs.referenceLow = o.low,
    obs.referenceHigh = o.high,
    obs.referenceText = toString(o.low) + ' - ' + toString(o.high) + ' ' + o.unit,
    obs.effectiveDate = date(r.at),
    obs.dateTime = r.at + 'T15:30:00Z',
    obs.performer = r.performer,
    obs.fictional = true
MERGE (p)-[:HAS_OBSERVATION]->(obs)
MERGE (dr)-[:HAS_RESULT]->(obs)
MERGE (lc:LoincCode {code: o.code})
  ON CREATE SET lc.display = o.display, lc.system = 'http://loinc.org'
MERGE (obs)-[:CODED_BY]->(lc);

// ── 3. Vaccination record (FHIR Immunization, CVX codes) ────────────────────
UNWIND [
  {patient: 'P1', id: 'imm-p1-2025-10-14-150', code: '150', display: 'Influenza, injectable, quadrivalent, preservative free', at: '2025-10-14', lot: 'FLU25-7731'},
  {patient: 'P1', id: 'imm-p1-2025-10-14-208', code: '208', display: 'COVID-19, mRNA, LNP-S, PF, 30 mcg/0.3 mL dose', at: '2025-10-14', lot: 'CV25-0192'},
  {patient: 'P1', id: 'imm-p1-2024-11-05-216', code: '216', display: 'Pneumococcal conjugate vaccine 20 valent', at: '2024-11-05', lot: 'PCV20-4410'},
  {patient: 'P1', id: 'imm-p1-2019-05-06-115', code: '115', display: 'Tdap', at: '2019-05-06', lot: 'TD19-2208'},
  {patient: 'fhir-pat-1002', id: 'imm-1002-2025-10-21-150', code: '150', display: 'Influenza, injectable, quadrivalent, preservative free', at: '2025-10-21', lot: 'FLU25-8102'},
  {patient: 'fhir-pat-1002', id: 'imm-1002-2024-03-12-187', code: '187', display: 'Zoster vaccine recombinant', at: '2024-03-12', lot: 'RZV24-0377'},
  {patient: 'fhir-pat-1002', id: 'imm-1002-2023-10-10-33', code: '33', display: 'Pneumococcal polysaccharide vaccine, 23 valent', at: '2023-10-10', lot: 'PPSV23-6615'},
  {patient: 'fhir-pat-1002', id: 'imm-1002-2016-08-30-113', code: '113', display: 'Td (adult), 5 Lf tetanus toxoid, preservative free, adsorbed', at: '2016-08-30', lot: 'TD16-1190'},
  {patient: 'fhir-pat-1005', id: 'imm-1005-2025-10-09-150', code: '150', display: 'Influenza, injectable, quadrivalent, preservative free', at: '2025-10-09', lot: 'FLU25-7788'},
  {patient: 'fhir-pat-1005', id: 'imm-1005-2025-10-09-208', code: '208', display: 'COVID-19, mRNA, LNP-S, PF, 30 mcg/0.3 mL dose', at: '2025-10-09', lot: 'CV25-0233'},
  {patient: 'fhir-pat-1005', id: 'imm-1005-2024-09-24-303', code: '303', display: 'RSV, unspecified formulation', at: '2024-09-24', lot: 'RSV24-0051'}
] AS i
MATCH (p:Patient {resourceId: i.patient})
MERGE (imm:Immunization {resourceId: i.id})
SET imm.vaccineCode = i.code,
    imm.codeSystem = 'http://hl7.org/fhir/sid/cvx',
    imm.display = i.display,
    imm.name = i.display + ' ' + i.at,
    imm.status = 'completed',
    imm.occurrenceDate = date(i.at),
    imm.lotNumber = i.lot,
    imm.performer = 'Hausarztpraxis Musterstadt (fictional)',
    imm.fictional = true
MERGE (p)-[:HAS_IMMUNIZATION]->(imm);

// ── 4. Medication plan (FHIR MedicationStatement, ATC codes, dosing in the
//       1-0-1 notation of the German Bundeseinheitlicher Medikationsplan) ───
UNWIND [
  {patient: 'P1', plan: 'bmp-p1-2026-08-21', printed: '2026-08-21', id: 'ms-p1-A10BA02', code: 'A10BA02', display: 'Metformin 500 mg', dosage: '1-0-1', dose: 500, unit: 'mg', reason: 'Diabetes mellitus type 2', since: '2018-04-10'},
  {patient: 'P1', plan: 'bmp-p1-2026-08-21', printed: '2026-08-21', id: 'ms-p1-C09AA03', code: 'C09AA03', display: 'Lisinopril 10 mg', dosage: '1-0-0', dose: 10, unit: 'mg', reason: 'Hypertension', since: '2015-11-02'},
  {patient: 'P1', plan: 'bmp-p1-2026-08-21', printed: '2026-08-21', id: 'ms-p1-C10AA05', code: 'C10AA05', display: 'Atorvastatin 20 mg', dosage: '0-0-1', dose: 20, unit: 'mg', reason: 'LDL cholesterol above target', since: '2024-09-12'},
  {patient: 'P1', plan: 'bmp-p1-2026-08-21', printed: '2026-08-21', id: 'ms-p1-R03AC02', code: 'R03AC02', display: 'Salbutamol 100 mcg inhaler', dosage: 'as needed, at most 8 puffs a day', dose: 100, unit: 'ug', reason: 'Asthma', since: '2009-02-27'},
  {patient: 'fhir-pat-1002', plan: 'bmp-1002-2025-12-01', printed: '2025-12-01', id: 'ms-1002-C09AA03', code: 'C09AA03', display: 'Lisinopril 10 mg', dosage: '1-0-0', dose: 10, unit: 'mg', reason: 'Hypertension', since: '2023-10-01'},
  {patient: 'fhir-pat-1002', plan: 'bmp-1002-2025-12-01', printed: '2025-12-01', id: 'ms-1002-C07AB07', code: 'C07AB07', display: 'Bisoprolol 2.5 mg', dosage: '1-0-0', dose: 2.5, unit: 'mg', reason: 'Hypertension', since: '2025-11-18'},
  {patient: 'fhir-pat-1002', plan: 'bmp-1002-2025-12-01', printed: '2025-12-01', id: 'ms-1002-B01AC06', code: 'B01AC06', display: 'Acetylsalicylic acid 100 mg', dosage: '1-0-0', dose: 100, unit: 'mg', reason: 'Cardiovascular prevention', since: '2025-11-18'},
  {patient: 'fhir-pat-1005', plan: 'bmp-1005-2026-04-09', printed: '2026-04-09', id: 'ms-1005-H03AA01', code: 'H03AA01', display: 'Levothyroxine 75 mcg', dosage: '1-0-0', dose: 75, unit: 'ug', reason: 'Hypothyroidism', since: '2012-03-01'},
  {patient: 'fhir-pat-1005', plan: 'bmp-1005-2026-04-09', printed: '2026-04-09', id: 'ms-1005-A02BC02', code: 'A02BC02', display: 'Pantoprazole 20 mg', dosage: '1-0-0', dose: 20, unit: 'mg', reason: 'Reflux', since: '2024-06-15'},
  {patient: 'fhir-pat-1005', plan: 'bmp-1005-2026-04-09', printed: '2026-04-09', id: 'ms-1005-A11CC05', code: 'A11CC05', display: 'Colecalciferol 1000 IU', dosage: '1-0-0', dose: 1000, unit: '[IU]', reason: 'Vitamin D deficiency', since: '2026-04-09'}
] AS m
MATCH (p:Patient {resourceId: m.patient})
MERGE (ms:MedicationStatement {resourceId: m.id})
SET ms.medicationCode = m.code,
    ms.codeSystem = 'http://www.whocc.no/atc',
    ms.display = m.display,
    ms.name = m.display + ' ' + m.dosage,
    ms.status = 'active',
    ms.dosageText = m.dosage,
    ms.dose = m.dose,
    ms.doseUnit = m.unit,
    ms.reason = m.reason,
    ms.effectiveStart = date(m.since),
    ms.planId = m.plan,
    ms.planPrinted = date(m.printed),
    ms.source = 'Bundeseinheitlicher Medikationsplan (fictional)',
    ms.fictional = true
MERGE (p)-[:HAS_MEDICATION_STATEMENT]->(ms);
