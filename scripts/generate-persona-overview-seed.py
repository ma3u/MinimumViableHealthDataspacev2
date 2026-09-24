#!/usr/bin/env python3
"""Generate the persona overview seed (discussion #265, issue #271).

Writes, from one set of fictional figures:

  neo4j/seed-persona-overview.cypher        idempotent MERGE seed
  ui/public/mock/patient_observations.json  the FHIR bundle the future
                                            /api/patient/observations serves
  ui/public/poc/persona-3d/data/*-series.json
                                            the prototype's monthly numbers,
                                            so seed and prototype agree

Run from the repository root:

  python3 scripts/generate-persona-overview-seed.py

Everything here is fictional: AlphaKlinik Berlin, PharmaCo Research AG,
MedReg DE, Limburg Medical Centre, Institut de Recherche Santé and the demo
patient Maria Schmidt (P1, the patient1 login). No real organisation, person or record.
"""

from __future__ import annotations

import json
from datetime import date, datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SEED = ROOT / "neo4j" / "seed-persona-overview.cypher"
POC = ROOT / "ui" / "public" / "poc" / "persona-3d" / "data"
MOCK = ROOT / "ui" / "public" / "mock"

AS_OF = date(2026, 9, 23)
# The last ePA transfer into the portal: the evening before AS_OF, so the
# patient page can show when the record was last synced.
EHR_SYNCED_AT = "2026-09-22T18:05:00Z"
EHR_SYNC_SOURCE = "ePA transfer, GesundheitsID-authenticated"

# ── Participants (DIDs from .claude/rules/api-conventions.md) ────────────────
ALPHA = "did:web:alpha-klinik.de:participant"
PHARMACO = "did:web:pharmaco.de:research"
MEDREG = "did:web:medreg.de:hdab"
LMC = "did:web:lmc.nl:clinic"
IRS = "did:web:irs.fr:hdab"

SYNTHEA = "dataset:synthea-fhir-r4-mvd"
OMOP = "dataset:omop-cdm-v54-analytics"
PROSTATE = "dataset:prostate-cancer-registry"

PERMIT_PHARMACO = "hdab-decision-medreg-2025-001"
PERMIT_LMC = "hdab-irs-lmc-2026-001"
CONTRACT_PHARMACO = "contract-fhir-t2d-001"

# ── 1. The demo patient's measurements ──────────────────────────────────────
# Eight parameters, six visits. Reference ranges as a fictional lab prints
# them. Values move the way the risk scores in patient_profile_patient1.json
# say they do: HbA1c and glucose drifting up, LDL down under atorvastatin,
# blood pressure improving under lisinopril, eGFR slowly falling.
VISITS = [
    "2024-09-12",
    "2025-01-20",
    "2025-05-15",
    "2025-09-18",
    "2026-02-10",
    "2026-08-21",
]

PARAMETERS = [
    # code, display, unit, low, high (None = open), category, values per visit
    ("4548-4", "Hemoglobin A1c/Hemoglobin.total in Blood", "%", 4.0, 6.0,
     "laboratory", [6.4, 6.6, 6.9, 7.1, 7.3, 7.6]),
    ("2339-0", "Glucose [Mass/volume] in Blood", "mg/dL", 70, 99,
     "laboratory", [118, 124, 131, 129, 138, 142]),
    ("2089-1", "Cholesterol in LDL [Mass/volume] in Serum or Plasma", "mg/dL",
     0, 116, "laboratory", [158, 149, 141, 136, 134, 132]),
    ("2093-3", "Cholesterol [Mass/volume] in Serum or Plasma", "mg/dL", 0, 200,
     "laboratory", [232, 221, 214, 208, 206, 205]),
    ("8480-6", "Systolic blood pressure", "mm[Hg]", 100, 130, "vital-signs",
     [146, 142, 139, 141, 137, 138]),
    ("8462-4", "Diastolic blood pressure", "mm[Hg]", 60, 85, "vital-signs",
     [92, 90, 88, 89, 86, 87]),
    ("39156-5", "Body mass index (BMI) [Ratio]", "kg/m2", 18.5, 25.0,
     "vital-signs", [30.4, 30.8, 31.0, 31.2, 31.2, 31.2]),
    ("33914-3", "Glomerular filtration rate/1.73 sq M.predicted",
     "mL/min/{1.73_m2}", 90, None, "laboratory", [96, 94, 93, 91, 90, 88]),
]

CONDITIONS = [
    ("73211009", "http://snomed.info/sct", "Diabetes mellitus type 2", "2018-04-10"),
    ("38341003", "http://snomed.info/sct", "Hypertension", "2015-11-02"),
    ("73595000", "http://snomed.info/sct", "Stress (finding)", "2020-01-15"),
    ("E11.9", "http://hl7.org/fhir/sid/icd-10", "T2D without complications", "2018-04-10"),
    ("414916001", "http://snomed.info/sct", "Obesity (BMI 31.2)", "2017-06-20"),
    ("271825005", "http://snomed.info/sct", "Respiratory distress", "2021-03-08"),
    ("40055000", "http://snomed.info/sct", "Chronic sinusitis", "2013-09-14"),
    ("195967001", "http://snomed.info/sct", "Asthma", "2009-02-27"),
]

MEDICATIONS = [
    ("860975", "Metformin 500 mg oral tablet", "2018-04-10"),
    ("197361", "Lisinopril 10 mg oral tablet", "2015-11-02"),
    ("308460", "Salbutamol 100 mcg inhaler", "2009-02-27"),
    ("209459", "Atorvastatin 20 mg oral tablet", "2024-09-12"),
]

# ── 2. Studies, enrolment and the patient's consents ────────────────────────
STUDIES = [
    {
        "studyId": "STUDY-CARDIO-2024",
        "name": "European Cardiovascular Risk Study",
        "institution": PHARMACO,
        "status": "open",
        "dataNeeded": "FHIR Conditions, Observations (blood pressure, cholesterol), Medications",
        "countries": ["DE", "NL", "FR", "ES"],
        "ethicsApproval": "EK-Berlin-2024-0041",
        "enrolment": [600, 1100, 1500, 2100, 2700, 3300, 3900, 4400, 4700, 4821],
    },
    {
        "studyId": "STUDY-DIAB-2023",
        "name": "T2D Progression Biomarkers",
        "institution": IRS,
        "status": "open",
        "dataNeeded": "OMOP Drug Exposures, Condition Occurrences, Measurements (HbA1c, eGFR)",
        "countries": ["FR", "DE", "BE"],
        "ethicsApproval": "CPP-IDF-2023-0178",
        "enrolment": [400, 800, 1100, 1400, 1700, 1900, 2000, 2080, 2100, 2103],
    },
    {
        "studyId": "STUDY-RESP-2025",
        "name": "Respiratory EHDS Cohort",
        "institution": MEDREG,
        "status": "recruiting",
        "dataNeeded": "FHIR Conditions (asthma, COPD), Observation spirometry values",
        "countries": ["DE", "AT", "CH"],
        "ethicsApproval": "MedReg-EK-2025-0022",
        "enrolment": [0, 0, 0, 0, 0, 0, 120, 340, 610, 890],
    },
]
ENROLMENT_DATES = [
    "2024-06-30", "2024-09-30", "2024-12-31", "2025-03-31", "2025-06-30",
    "2025-09-30", "2025-12-31", "2026-03-31", "2026-06-30", "2026-09-23",
]

CONSENTS = [
    # id, study, granted, scope, trust centre, revoked at (Art. 71 opt-out)
    ("CONSENT-001", "STUDY-CARDIO-2024", "2024-03-10T09:00:00Z",
     "FHIR Conditions + Observations", "MedReg DE Trust Centre", None),
    ("CONSENT-002", "STUDY-DIAB-2023", "2023-11-15T14:30:00Z",
     "OMOP Drug Exposures + Conditions", "Limburg Trust Centre NL", None),
    ("CONSENT-003", "STUDY-RESP-2025", "2026-01-12T10:00:00Z",
     "FHIR Conditions + spirometry Observations", "MedReg DE Trust Centre",
     "2026-05-01T08:00:00Z"),
]

# ── 3. Twelve months of access events ───────────────────────────────────────
# October 2025 to September 2026. Per consumer and dataset, the count per
# month. The stories the numbers carry:
#   PharmaCo: rising use; its purpose credential expired on 2026-06-20, so
#             the accesses from July on happen without a valid one.
#   Limburg:  permit hdab-irs-lmc-2026-001 issued 2026-02-20, accesses start
#             in March, no contract on file.
#   IRS:      application refused on 2026-03-01, keeps trying the registry,
#             every attempt refused with 403.
MONTHS = [date(2025, 10, 1) + timedelta(days=31 * i) for i in range(12)]
MONTHS = [date(m.year, m.month, 1) for m in MONTHS]

FLOWS = [
    # consumer, provider, dataset, permit, contract, status, purpose, counts
    (PHARMACO, ALPHA, SYNTHEA, PERMIT_PHARMACO, CONTRACT_PHARMACO, 200,
     "SCIENTIFIC_RESEARCH", [3, 4, 4, 4, 5, 6, 5, 5, 6, 7, 7, 8]),
    (PHARMACO, ALPHA, OMOP, PERMIT_PHARMACO, CONTRACT_PHARMACO, 200,
     "SCIENTIFIC_RESEARCH", [1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 4, 4]),
    (LMC, ALPHA, SYNTHEA, PERMIT_LMC, None, 200,
     "SCIENTIFIC_RESEARCH", [0, 0, 0, 0, 0, 1, 2, 2, 3, 3, 4, 4]),
    (IRS, ALPHA, PROSTATE, None, None, 403,
     "PUBLIC_HEALTH", [0, 0, 0, 0, 0, 0, 1, 0, 2, 1, 3, 2]),
]

ENDPOINTS = {
    SYNTHEA: [("/fhir/Patient", "GET", "application/fhir+json", 42, 125000),
              ("/nlq", "POST", "application/json", 1, 412),
              ("/federated/stats", "GET", "application/json", 2, 3100)],
    OMOP: [("/omop/cohort", "GET", "application/json", 127, 45000),
           ("/nlq", "POST", "application/json", 12, 5200)],
    PROSTATE: [("/fhir/Patient", "GET", "application/json", 0, 180)],
}

NAMES = {
    PHARMACO: "PharmaCo Research AG",
    LMC: "Limburg Medical Centre",
    IRS: "Institut de Recherche Santé",
    ALPHA: "AlphaKlinik Berlin",
    MEDREG: "MedReg DE",
}

# ── 4. Quality label assessments, one per quarter ───────────────────────────
ASSESSMENTS = [
    # period, assessedAt, conformance, completeness, timeliness
    ("2024-Q4", "2024-12-31", 0.95, 0.90, 0.94),
    ("2025-Q1", "2025-03-31", 0.94, 0.90, 0.94),
    ("2025-Q2", "2025-06-30", 0.93, 0.89, 0.93),
    ("2025-Q3", "2025-09-30", 0.92, 0.89, 0.93),
    ("2025-Q4", "2025-12-31", 0.91, 0.88, 0.92),
    ("2026-Q1", "2026-03-31", 0.90, 0.88, 0.92),
    ("2026-Q2", "2026-06-30", 0.89, 0.87, 0.91),
    ("2026-Q3", "2026-09-23", 0.88, 0.86, 0.91),
]


def q(s: str | None) -> str:
    if s is None:
        return "null"
    return "'" + s.replace("\\", "\\\\").replace("'", "\\'") + "'"


def events() -> list[dict]:
    out = []
    for consumer, provider, dataset, permit, contract, status, purpose, counts in FLOWS:
        short = consumer.split(":")[2].split(".")[0]
        for month, n in zip(MONTHS, counts):
            for i in range(n):
                ep, method, ct, rows, byts = ENDPOINTS[dataset][i % len(ENDPOINTS[dataset])]
                day = 2 + (i * 7) % 26
                hour = 8 + (i * 3) % 10
                ts = datetime(month.year, month.month, day, hour, 15)
                reads = ["P1"] if ep == "/fhir/Patient" and status == 200 and i % 3 == 0 else []
                out.append({
                    "reads": reads,
                    "id": f"te-m-{short}-{dataset.split(':')[1][:8]}-{month:%Y-%m}-{i + 1:02d}",
                    "ts": ts.strftime("%Y-%m-%dT%H:%M:00Z"),
                    "ep": ep, "m": method, "ct": ct,
                    "sc": status,
                    "n": rows if status == 200 else 0,
                    "b": byts + (i * 137) % 900,
                    "dur": 90 + (i * 53) % 400,
                    "c": consumer, "p": provider, "ds": dataset,
                    "permit": permit, "contract": contract, "purpose": purpose,
                    "name": (f"{NAMES[consumer]} is refused: no permit for the registry"
                             if status == 403 else f"{NAMES[consumer]} reads {ep}"),
                })
    return out


def cypher() -> str:
    L: list[str] = []
    w = L.append
    w("// ============================================================")
    w("// Persona overview seed (discussion #265, issue #271): the data the four persona")
    w("// views need, and the relations between the personas.")
    w("//")
    w("//   patient P1 (Maria Schmidt, the patient1 login) -TREATED_AT-> AlphaKlinik Berlin (holder)")
    w("//     -HAS_ENCOUNTER-> one laboratory visit per measurement date")
    w("//     -HAS_OBSERVATION-> 48 LOINC-coded measurements with reference ranges")
    w("//     -HAS_CONDITION / HAS_MEDICATION_REQUEST-> her record")
    w("//     -GAVE_CONSENT-> PatientConsent -FOR_STUDY-> ResearchStudy")
    w("//   ResearchStudy <-CONDUCTS- Participant (PharmaCo, IRS, MedReg)")
    w("//     -HAS_ENROLMENT-> StudyEnrolment, one per quarter")
    w("//   TransferEvent, one per access, twelve months, per consumer and dataset")
    w("//     -READ-> Patient for the reads that touched P1's record (Art. 8 log)")
    w("//     -REQUESTED_BY-> consumer, -PROVIDED_BY-> AlphaKlinik, -ACCESSED-> dataset,")
    w("//     -UNDER_PERMIT-> HDABApproval (issued by MedReg DE / IRS)")
    w("//   VerifiableCredential (quality label) -HAS_ASSESSMENT-> QualityAssessment")
    w("//     -ASSESSES-> dataset, one per quarter")
    w("//")
    w("// Generated by scripts/generate-persona-overview-seed.py. Do not edit by")
    w("// hand; change the generator and run it. Fictional data only. Idempotent")
    w("// MERGE throughout. Run after seed-compliance-matrix.cypher.")
    w("// ============================================================")
    w("")
    w("// ── 1. The demo patient, treated at AlphaKlinik Berlin ──────────────────────")
    w("MERGE (p:Patient {resourceId: 'P1'})")
    w("SET p.id = 'P1',")
    w("    p.name = 'Maria Schmidt',")
    w("    p.gender = 'female',")
    w("    p.birthDate = date('1979-03-15'),")
    w("    p.city = 'Berlin',")
    w("    p.country = 'DE',")
    w("    p.demo = true,")
    w("    p.fictional = true,")
    w("    // when her ePA was last transferred into the portal (Art. 3 record access)")
    w(f"    p.ehrSyncedAt = datetime({q(EHR_SYNCED_AT)}),")
    w(f"    p.ehrSyncSource = {q(EHR_SYNC_SOURCE)}")
    w("WITH p")
    w(f"MATCH (holder:Participant {{participantId: {q(ALPHA)}}})")
    w("MERGE (p)-[:TREATED_AT]->(holder)")
    w("WITH p")
    w(f"MATCH (ds:HealthDataset {{datasetId: {q(SYNTHEA)}}})")
    w("MERGE (p)-[:FROM_DATASET]->(ds);")
    w("")
    w("// ── 2. Her diagnoses and medications (as in patient_profile_patient1.json) ──")
    w("MATCH (p:Patient {resourceId: 'P1'})")
    w("UNWIND [")
    rows = []
    for code, system, display, onset in CONDITIONS:
        rows.append(f"  {{id: 'cond-p1-{code}', code: {q(code)}, system: {q(system)}, display: {q(display)}, onset: {q(onset)}}}")
    w(",\n".join(rows))
    w("] AS c")
    w("MERGE (cond:Condition {resourceId: c.id})")
    w("SET cond.code = c.code,")
    w("    cond.codeSystem = c.system,")
    w("    cond.display = c.display,")
    w("    cond.name = c.display,")
    w("    cond.clinicalStatus = 'active',")
    w("    cond.onsetDate = c.onset,")
    w("    cond.fictional = true")
    w("MERGE (p)-[:HAS_CONDITION]->(cond);")
    w("")
    w("MATCH (p:Patient {resourceId: 'P1'})")
    w("UNWIND [")
    rows = []
    for code, display, since in MEDICATIONS:
        rows.append(f"  {{id: 'med-p1-{code}', code: {q(code)}, display: {q(display)}, since: {q(since)}}}")
    w(",\n".join(rows))
    w("] AS m")
    w("MERGE (med:MedicationRequest {resourceId: m.id})")
    w("SET med.medicationCode = m.code,")
    w("    med.code = m.code,")
    w("    med.codeSystem = 'http://www.nlm.nih.gov/research/umls/rxnorm',")
    w("    med.display = m.display,")
    w("    med.name = m.display,")
    w("    med.status = 'active',")
    w("    med.intent = 'order',")
    w("    med.date = m.since,")
    w("    med.fictional = true")
    w("MERGE (p)-[:HAS_MEDICATION_REQUEST]->(med);")
    w("")
    w("// ── 2b. Her visits: one laboratory visit per measurement date ─────────────")
    w("MATCH (p:Patient {resourceId: 'P1'})")
    w("UNWIND [")
    rows = []
    for i, visit in enumerate(VISITS):
        rows.append(f"  {{id: 'enc-p1-{visit}', at: {q(visit)}, n: {i + 1}}}")
    w(",\n".join(rows))
    w("] AS e")
    w("MERGE (enc:Encounter {resourceId: e.id})")
    w("SET enc.name = 'Laboratory visit ' + toString(e.n) + ' of 6',")
    w("    enc.display = 'Laboratory visit, AlphaKlinik Berlin (fictional)',")
    w("    enc.class = 'ambulatory',")
    w("    enc.status = 'finished',")
    w("    enc.date = e.at + 'T08:00:00Z',")
    w("    enc.period = e.at,")
    w("    enc.serviceProvider = 'AlphaKlinik Berlin',")
    w("    enc.fictional = true")
    w("MERGE (p)-[:HAS_ENCOUNTER]->(enc);")
    w("")
    w("// ── 3. Her measurements: 8 LOINC parameters, 6 visits, lab reference ranges ─")
    w("// The values behind the risk scores of the profile: HbA1c and glucose drift")
    w("// up, LDL falls under atorvastatin, blood pressure improves under lisinopril,")
    w("// eGFR slips below the range. Art. 14 priority category: laboratory results.")
    w("MATCH (p:Patient {resourceId: 'P1'})")
    w("UNWIND [")
    rows = []
    for code, display, unit, low, high, cat, values in PARAMETERS:
        for visit, value in zip(VISITS, values):
            rows.append(
                f"  {{id: 'obs-p1-{code}-{visit}', code: {q(code)}, display: {q(display)}, "
                f"unit: {q(unit)}, value: {value}, low: {low}, high: {'null' if high is None else high}, "
                f"category: {q(cat)}, at: {q(visit)}}}")
    w(",\n".join(rows))
    w("] AS o")
    w("MERGE (obs:Observation {resourceId: o.id})")
    w("SET obs.code = o.code,")
    w("    obs.codeSystem = 'http://loinc.org',")
    w("    obs.display = o.display,")
    w("    obs.name = o.display + ' ' + toString(o.value) + ' ' + o.unit,")
    w("    obs.status = 'final',")
    w("    obs.category = o.category,")
    w("    obs.valueQuantity = o.value,")
    w("    obs.value = o.value,")
    w("    obs.unit = o.unit,")
    w("    obs.valueUnit = o.unit,")
    w("    obs.referenceLow = o.low,")
    w("    obs.referenceHigh = o.high,")
    w("    obs.referenceText = CASE WHEN o.high IS NULL THEN '> ' + toString(o.low) ELSE toString(o.low) + ' - ' + toString(o.high) END + ' ' + o.unit + ' (as printed on the report)',")
    w("    obs.effectiveDate = date(o.at),")
    w("    obs.dateTime = o.at + 'T08:30:00Z',")
    w("    obs.performer = 'AlphaKlinik Berlin, Zentrallabor (fictional)',")
    w("    obs.fictional = true")
    w("MERGE (p)-[:HAS_OBSERVATION]->(obs)")
    w("WITH p, obs, o")
    w("MATCH (enc:Encounter {resourceId: 'enc-p1-' + o.at})")
    w("MERGE (obs)-[:PART_OF]->(enc)")
    w("WITH obs, o")
    w("MERGE (lc:LoincCode {loincNumber: o.code})")
    w("  ON CREATE SET lc.name = o.display + ' (LOINC ' + o.code + ')',")
    w("                lc.longCommonName = o.display")
    w("MERGE (obs)-[:CODED_BY]->(lc);")
    w("")
    w("// ── 4. Studies, who conducts them, enrolment per quarter ────────────────────")
    w("UNWIND [")
    rows = []
    for s in STUDIES:
        countries = ", ".join(q(c) for c in s["countries"])
        rows.append(
            f"  {{id: {q(s['studyId'])}, name: {q(s['name'])}, inst: {q(s['institution'])}, "
            f"status: {q(s['status'])}, dataNeeded: {q(s['dataNeeded'])}, countries: [{countries}], "
            f"ethics: {q(s['ethicsApproval'])}, participants: {s['enrolment'][-1]}}}")
    w(",\n".join(rows))
    w("] AS s")
    w("MERGE (st:ResearchStudy {studyId: s.id})")
    w("SET st.name = s.name,")
    w("    st.studyName = s.name,")
    w("    st.institutionDid = s.inst,")
    w("    st.purpose = 'secondary-use',")
    w("    st.ehdsArticle = 'Art. 53(1)(e)',")
    w("    st.status = s.status,")
    w("    st.dataNeeded = s.dataNeeded,")
    w("    st.countries = s.countries,")
    w("    st.ethicsApproval = s.ethics,")
    w("    st.participantCount = s.participants,")
    w("    st.fictional = true")
    w("WITH st, s")
    w("MATCH (inst:Participant {participantId: s.inst})")
    w("MERGE (inst)-[:CONDUCTS]->(st);")
    w("")
    w("UNWIND [")
    rows = []
    for s in STUDIES:
        for d, n in zip(ENROLMENT_DATES, s["enrolment"]):
            rows.append(f"  {{id: '{s['studyId']}:{d}', study: {q(s['studyId'])}, at: {q(d)}, participants: {n}}}")
    w(",\n".join(rows))
    w("] AS e")
    w("MATCH (st:ResearchStudy {studyId: e.study})")
    w("MERGE (en:StudyEnrolment {enrolmentId: e.id})")
    w("SET en.asOf = date(e.at),")
    w("    en.participants = e.participants,")
    w("    en.studyId = e.study")
    w("MERGE (st)-[:HAS_ENROLMENT]->(en);")
    w("")
    w("// ── 5. The patient's consents (Art. 71 opt-out state per study) ─────────────")
    w("MATCH (p:Patient {resourceId: 'P1'})")
    w("UNWIND [")
    rows = []
    for cid, study, granted, scope, tc, revoked in CONSENTS:
        rows.append(f"  {{id: {q(cid)}, study: {q(study)}, at: {q(granted)}, scope: {q(scope)}, tc: {q(tc)}, revokedAt: {q(revoked)}}}")
    w(",\n".join(rows))
    w("] AS c")
    w("MERGE (pc:PatientConsent {consentId: c.id})")
    w("SET pc.patientId = 'P1',")
    w("    pc.studyId = c.study,")
    w("    pc.grantedAt = datetime(c.at),")
    w("    pc.revoked = c.revokedAt IS NOT NULL,")
    w("    pc.revokedAt = CASE WHEN c.revokedAt IS NULL THEN null ELSE datetime(c.revokedAt) END,")
    w("    pc.purpose = 'secondary-use',")
    w("    pc.dataScope = c.scope,")
    w("    pc.ehdsArticle = 'Art. 71',")
    w("    pc.fictional = true")
    w("MERGE (p)-[:GAVE_CONSENT]->(pc)")
    w("WITH pc, c")
    w("MATCH (st:ResearchStudy {studyId: c.study})")
    w("MERGE (pc)-[:FOR_STUDY]->(st)")
    w("WITH pc, c")
    w("OPTIONAL MATCH (tc:TrustCenter {name: c.tc})")
    w("FOREACH (_ IN CASE WHEN tc IS NOT NULL THEN [1] ELSE [] END | MERGE (pc)-[:RESOLVED_BY]->(tc));")
    w("")
    w("// ── 6. Twelve months of access events (Art. 73(1)(e) log) ───────────────────")
    w("// One TransferEvent per access, October 2025 to September 2026, with the")
    w("// consumer, provider, dataset, permit and contract the audit page reads.")
    w("// PharmaCo's purpose credential expired on 2026-06-20; Limburg's permit was")
    w("// issued on 2026-02-20 and has no contract; IRS was refused on 2026-03-01")
    w("// and keeps attempting the registry (403).")
    w("UNWIND [")
    rows = []
    for e in events():
        rows.append(
            f"  {{id: {q(e['id'])}, ts: {q(e['ts'])}, ep: {q(e['ep'])}, m: {q(e['m'])}, sc: {e['sc']}, "
            f"n: {e['n']}, b: {e['b']}, dur: {e['dur']}, ct: {q(e['ct'])}, c: {q(e['c'])}, p: {q(e['p'])}, "
            f"ds: {q(e['ds'])}, permit: {q(e['permit'])}, contract: {q(e['contract'])}, "
            f"purpose: {q(e['purpose'])}, name: {q(e['name'])}, "
            f"reads: [{', '.join(q(r) for r in e['reads'])}]}}")
    w(",\n".join(rows))
    w("] AS e")
    w("MERGE (te:TransferEvent {eventId: e.id})")
    w("SET te.name = e.name,")
    w("    te.endpoint = e.ep,")
    w("    te.method = e.m,")
    w("    te.timestamp = datetime(e.ts),")
    w("    te.statusCode = e.sc,")
    w("    te.resultCount = e.n,")
    w("    te.responseBytes = e.b,")
    w("    te.duration = e.dur,")
    w("    te.contentType = e.ct,")
    w("    te.protocol = 'HTTP-PULL',")
    w("    te.participant = e.c,")
    w("    te.consumerDid = e.c,")
    w("    te.providerDid = e.p,")
    w("    te.datasetId = e.ds,")
    w("    te.permitId = e.permit,")
    w("    te.contractId = e.contract,")
    w("    te.purpose = e.purpose,")
    w("    te.errorMessage = CASE WHEN e.sc = 403 THEN 'No data permit covers this access (Art. 61(1))' ELSE null END,")
    w("    te.patientIds = e.reads,")
    w("    te.demo = true,")
    w("    te.monthly = true")
    w("FOREACH (pid IN e.reads | MERGE (pat:Patient {resourceId: pid}) MERGE (te)-[:READ]->(pat))")
    w("WITH te, e")
    w("OPTIONAL MATCH (c:Participant {participantId: e.c})")
    w("FOREACH (_ IN CASE WHEN c IS NOT NULL THEN [1] ELSE [] END | MERGE (te)-[:REQUESTED_BY]->(c))")
    w("WITH te, e")
    w("OPTIONAL MATCH (p:Participant {participantId: e.p})")
    w("FOREACH (_ IN CASE WHEN p IS NOT NULL THEN [1] ELSE [] END | MERGE (te)-[:PROVIDED_BY]->(p))")
    w("WITH te, e")
    w("OPTIONAL MATCH (ds:HealthDataset {datasetId: e.ds})")
    w("FOREACH (_ IN CASE WHEN ds IS NOT NULL THEN [1] ELSE [] END | MERGE (te)-[:ACCESSED]->(ds))")
    w("WITH te, e")
    w("OPTIONAL MATCH (permit:HDABApproval) WHERE e.permit IS NOT NULL AND permit.approvalId = e.permit")
    w("FOREACH (_ IN CASE WHEN permit IS NOT NULL THEN [1] ELSE [] END | MERGE (te)-[:UNDER_PERMIT]->(permit))")
    w("WITH te, e")
    w("OPTIONAL MATCH (ctr:Contract) WHERE e.contract IS NOT NULL AND ctr.contractId = e.contract")
    w("FOREACH (_ IN CASE WHEN ctr IS NOT NULL THEN [1] ELSE [] END | MERGE (te)-[:UNDER]->(ctr));")
    w("")
    w("// ── 7. Quality label assessments per quarter (Art. 78) ──────────────────────")
    w("// The assessor renews the label while conformance stays in 0.90 to 1.00.")
    w("// AlphaKlinik's score has fallen below that band; the label expired.")
    w("UNWIND [")
    rows = []
    for period, at, conf, comp, tim in ASSESSMENTS:
        rows.append(f"  {{id: 'qa:clinic-alphaklinik:{period}', period: {q(period)}, at: {q(at)}, conformance: {conf}, completeness: {comp}, timeliness: {tim}}}")
    w(",\n".join(rows))
    w("] AS a")
    w("MERGE (qa:QualityAssessment {assessmentId: a.id})")
    w("SET qa.period = a.period,")
    w("    qa.assessedAt = date(a.at),")
    w("    qa.conformance = a.conformance,")
    w("    qa.completeness = a.completeness,")
    w("    qa.timeliness = a.timeliness,")
    w("    qa.renewalBandLow = 0.90,")
    w("    qa.renewalBandHigh = 1.00,")
    w("    qa.assessor = 'MedReg DE Quality Assessment Unit',")
    w("    qa.ehdsArticle = 'Art. 78',")
    w("    qa.fictional = true")
    w("WITH qa")
    w("MATCH (vc:VerifiableCredential {credentialId: 'vc:data-quality-label:clinic-alphaklinik'})")
    w("MERGE (vc)-[:HAS_ASSESSMENT]->(qa)")
    w("WITH qa")
    w(f"MATCH (ds:HealthDataset {{datasetId: {q(SYNTHEA)}}})")
    w("MERGE (qa)-[:ASSESSES]->(ds);")
    w("")
    w("// ── 8. Repair: a credential past its expiry is not 'active' ────────────────")
    w("// The credential fixtures keep status 'active' after expiresAt; anything that")
    w("// trusts the flag is wrong (discussion #265). Derive it from the date.")
    w("MATCH (vc:VerifiableCredential)")
    w("WHERE vc.expiresAt IS NOT NULL AND datetime(toString(vc.expiresAt)) < datetime()")
    w("  AND coalesce(vc.status, 'active') = 'active'")
    w("SET vc.status = 'expired';")
    w("")
    w("// ── 9. Pin the credential dates the stories rest on ─────────────────────────")
    w("// The credential seed dates expiry relative to its run; the overview stories")
    w("// need PharmaCo's purpose credential expired on 2026-06-20 (accesses after it)")
    w("// and the two quality labels expired on 2026-09-18 (Art. 78 renewal due).")
    w("MATCH (vc:VerifiableCredential {credentialId: 'vc:data-processing-purpose:cro-pharmaco'})")
    w("SET vc.expiresAt = datetime('2026-06-20T00:06:57Z'), vc.status = 'expired';")
    w("MATCH (vc:VerifiableCredential)")
    w("WHERE vc.credentialId IN ['vc:data-quality-label:clinic-alphaklinik', 'vc:data-quality-label:clinic-lmc']")
    w("SET vc.expiresAt = datetime('2026-09-18T00:06:57Z'), vc.status = 'expired';")
    w("")
    return "\n".join(L)


def reference_range(low, high, unit: str) -> dict:
    rr: dict = {"low": {"value": low, "unit": unit}}
    if high is None:
        rr["text"] = f"> {low} {unit} (as printed on the report)"
    else:
        rr["high"] = {"value": high, "unit": unit}
        rr["text"] = f"{low} - {high} {unit} (as printed on the report)"
    return rr


def observations_bundle() -> dict:
    entries = []
    for code, display, unit, low, high, cat, values in PARAMETERS:
        for visit, value in zip(VISITS, values):
            rid = f"obs-p1-{code}-{visit}"
            entries.append({
                "fullUrl": f"urn:uuid:{rid}",
                "resource": {
                    "resourceType": "Observation",
                    "id": rid,
                    "meta": {"tag": [{"system": "https://ehds.mabu.red/tag", "code": "fictional"}]},
                    "status": "final",
                    "category": [{"coding": [{
                        "system": "http://terminology.hl7.org/CodeSystem/observation-category",
                        "code": cat}]}],
                    "code": {"coding": [{"system": "http://loinc.org", "code": code, "display": display}],
                             "text": display},
                    "subject": {"reference": "Patient/P1", "display": "Maria Schmidt"},
                    "effectiveDateTime": f"{visit}T08:30:00Z",
                    "performer": [{"display": "AlphaKlinik Berlin, Zentrallabor (fictional)"}],
                    "valueQuantity": {"value": value, "unit": unit, "system": "http://unitsofmeasure.org", "code": unit},
                    "referenceRange": [reference_range(low, high, unit)],
                },
            })
    return {
        "resourceType": "Bundle",
        "id": "observations-p1",
        "type": "searchset",
        "meta": {"tag": [{"system": "https://ehds.mabu.red/tag", "code": "fictional"}]},
        "total": len(entries),
        "link": [{"relation": "self", "url": "/api/patient/observations?patientId=P1"}],
        "entry": entries,
    }


def monthly(counts_by: dict[str, list[int]], flows=FLOWS) -> None:
    """Fill counts per consumer, dataset, provider bytes into the dict."""
    for consumer, provider, dataset, permit, contract, status, purpose, counts in flows:
        key = ("refused:" if status == 403 else "ok:") + consumer
        counts_by.setdefault(key, [0] * 12)
        counts_by.setdefault("ds:" + dataset, [0] * 12)
        for i, n in enumerate(counts):
            counts_by[key][i] += n
            if status == 200:
                counts_by["ds:" + dataset][i] += n


def refresh_series() -> None:
    by: dict[str, list[int]] = {}
    monthly(by)
    ev = events()
    mb = [0.0] * 12
    pharmaco_omop_mb = [0.0] * 12
    for e in ev:
        if e["sc"] != 200:
            continue
        i = MONTHS.index(date(int(e["ts"][:4]), int(e["ts"][5:7]), 1))
        mb[i] += e["b"] / 1e6
        if e["c"] == PHARMACO and e["ds"] == OMOP:
            pharmaco_omop_mb[i] += e["b"] / 1e6
    dates = [m.isoformat() for m in MONTHS]

    def series(vals):
        return [{"date": d, "value": (round(v, 2) if isinstance(v, float) else v)} for d, v in zip(dates, vals)]

    def pharmaco_on(dataset):
        for f in FLOWS:
            if f[0] == PHARMACO and f[2] == dataset:
                return f[7]
        return [0] * 12

    mapping = {
        "hdab": {
            "p:did:web:pharmaco": series(by["ok:" + PHARMACO]),
            "p:did:web:irs": series(by["refused:" + IRS]),
            "p:did:web:lmc": series(by["ok:" + LMC]),
            "ds:dataset:synthea": series(by["ds:" + SYNTHEA]),
            "ds:dataset:omop": series(by["ds:" + OMOP]),
            "ds:dataset:prostate": series(by["ds:" + PROSTATE]),
        },
        "hospital": {
            "ds:synthea": series(by["ds:" + SYNTHEA]),
            "ds:omop": series(by["ds:" + OMOP]),
            "c:pharmaco": series(by["ok:" + PHARMACO]),
            "c:institut": series(by["refused:" + IRS]),
            "c:limburg": series(by["ok:" + LMC]),
            "me": series(mb),
            "vc:vc:data-quality-label": [{"date": a[1], "value": a[2]} for a in ASSESSMENTS],
        },
        "researcher": {
            "ds:synthea": series(pharmaco_on(SYNTHEA)),
            "ds:omop": series(pharmaco_omop_mb),
        },
    }
    for s in STUDIES:
        mapping["researcher"]["study:" + s["studyId"]] = [
            {"date": d, "value": n} for d, n in zip(ENROLMENT_DATES, s["enrolment"])]

    for persona, items in mapping.items():
        path = POC / f"{persona}-series.json"
        doc = json.loads(path.read_text())
        for item in doc["items"]:
            if item["match"] in items:
                item["series"] = items[item["match"]]
        doc["source"] = "neo4j/seed-persona-overview.cypher via scripts/generate-persona-overview-seed.py"
        path.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n")


def main() -> None:
    SEED.write_text(cypher())
    (MOCK / "patient_observations.json").write_text(
        json.dumps(observations_bundle(), indent=2, ensure_ascii=False) + "\n")
    (POC / "observations-p1.json").write_text(
        json.dumps(observations_bundle(), indent=2, ensure_ascii=False) + "\n")
    refresh_series()
    n_events = len(events())
    print(f"wrote {SEED.relative_to(ROOT)}: {len(PARAMETERS) * len(VISITS)} observations, "
          f"{len(STUDIES)} studies, {n_events} access events, {len(ASSESSMENTS)} assessments")


if __name__ == "__main__":
    main()
