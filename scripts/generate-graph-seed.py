#!/usr/bin/env python3
"""Generate a large-scale Cypher seed for the Health Dataspace graph.

Uses real codes from public clinical ontologies:
  - SNOMED CT  (browser.ihtsdotools.org)
  - LOINC      (loinc.org)
  - ICD-10-CM  (icd10data.com / WHO)
  - RxNorm     (nlm.nih.gov/research/umls/rxnorm)

Target: 3 000+ nodes across all five layers of the graph schema.

Usage:
  python3 scripts/generate-graph-seed.py | \
    docker exec -i health-dataspace-neo4j \
      cypher-shell -u neo4j -p healthdataspace
"""

from __future__ import annotations

import hashlib
import random
import textwrap

random.seed(42)  # reproducible

# ─── Real public ontology codes ──────────────────────────────────────────────

SNOMED = [
    (73211009,  "Type 2 Diabetes Mellitus"),
    (38341003,  "Essential Hypertension"),
    (195967001, "Asthma"),
    (13645005,  "COPD"),
    (84114007,  "Heart Failure"),
    (709044004, "CKD Stage 3"),
    (414545008, "Ischemic Heart Disease"),
    (44054006,  "Type 2 DM with Neuropathy"),
    (49436004,  "Atrial Fibrillation"),
    (73211009,  "Type 2 Diabetes Mellitus"),  # dup filtered
    (40930008,  "Hypothyroidism"),
    (35489007,  "Depression"),
    (197480006, "Anxiety Disorder"),
    (267036007, "Iron Deficiency Anaemia"),
    (396275006, "Osteoarthritis"),
    (22298006,  "Myocardial Infarction"),
    (230690007, "Stroke"),
    (44054006,  "Diabetic Neuropathy"),
    (399068003, "Malignant Neoplasm of Prostate"),
    (254637007, "Non-small Cell Lung Cancer"),
    (93761005,  "Primary Malignant Neoplasm of Colon"),
    (90708001,  "Kidney Disease"),
    (367498001, "Seasonal Allergic Rhinitis"),
    (266356007, "Chronic Low Back Pain"),
    (34000006,  "Crohn Disease"),
    (64572001,  "Disease"),  # parent concept
    (128462008, "Metastatic Disease"),
    (239720000, "Psoriatic Arthritis"),
    (69896004,  "Rheumatoid Arthritis"),
    (46635009,  "Type 1 Diabetes"),
    (363406005, "Malignant Neoplasm of Breast"),
    (235856003, "Hepatitis C"),
    (86406008,  "HIV"),
    (56717001,  "Tuberculosis"),
    (398254007, "Pre-eclampsia"),
    (371631005, "Panic Disorder"),
    (66857006,  "Hemophilia"),
    (73211009,  "T2D"),  # dup
    (190828008, "Hyperlipidaemia"),
    (414916001, "Obesity"),
]
# Deduplicate by concept ID
SNOMED = list({c[0]: c for c in SNOMED}.values())

LOINC = [
    ("4548-4",  "HbA1c"),
    ("2345-7",  "Glucose [Mass/vol] in Serum"),
    ("2160-0",  "Creatinine [Mass/vol] in Serum"),
    ("33914-3", "eGFR CKD-EPI"),
    ("2093-3",  "Total Cholesterol [Mass/vol]"),
    ("2571-8",  "Triglycerides [Mass/vol]"),
    ("2085-9",  "HDL Cholesterol"),
    ("13457-7", "LDL Cholesterol (calc)"),
    ("8480-6",  "Systolic Blood Pressure"),
    ("8462-4",  "Diastolic Blood Pressure"),
    ("39156-5", "BMI"),
    ("718-7",   "Hemoglobin [Mass/vol]"),
    ("4544-3",  "Hematocrit"),
    ("6690-2",  "WBC Count"),
    ("777-3",   "Platelet Count"),
    ("2823-3",  "Potassium [Moles/vol]"),
    ("2951-2",  "Sodium [Moles/vol]"),
    ("1742-6",  "ALT [U/L]"),
    ("1920-8",  "AST [U/L]"),
    ("1975-2",  "Total Bilirubin [Mass/vol]"),
    ("2532-0",  "LDH [U/L]"),
    ("14959-1", "Microalbumin [Mass/vol] Urine"),
    ("5902-2",  "Prothrombin Time"),
    ("3016-3",  "TSH [Milli-int-unit/L]"),
    ("3026-2",  "Free T4 [Mass/vol]"),
    ("2276-4",  "Ferritin [Mass/vol]"),
    ("49765-1", "Calcium [Mass/vol]"),
    ("14627-4", "Bicarbonate [Moles/vol]"),
    ("6768-6",  "Alkaline Phosphatase [U/L]"),
    ("30313-1", "Hemoglobin A1"),
    ("2028-9",  "CO2 Total"),
    ("26464-8", "WBC differential"),
    ("48065-7", "D-Dimer"),
    ("1751-7",  "Albumin [Mass/vol]"),
    ("2157-6",  "CK (Creatine Kinase)"),
    ("30341-2", "ESR (Erythrocyte Sed Rate)"),
    ("71426-1", "CRP [Mass/vol] High Sensitivity"),
    ("14937-7", "Uric Acid"),
    ("2744-1",  "Blood pH"),
    ("33762-6", "NT-proBNP"),
]

ICD10 = [
    ("E11",   "Type 2 Diabetes Mellitus"),
    ("E11.9", "T2D without complications"),
    ("E11.65","T2D with hyperglycaemia"),
    ("E11.40","T2D with diabetic neuropathy"),
    ("I10",   "Essential Hypertension"),
    ("I25.10","Atherosclerotic Heart Disease"),
    ("I48.91","Atrial Fibrillation, unspecified"),
    ("I50.9", "Heart Failure, unspecified"),
    ("J45.20","Mild Intermittent Asthma"),
    ("J44.1", "COPD with Acute Exacerbation"),
    ("N18.3", "CKD Stage 3"),
    ("N18.4", "CKD Stage 4"),
    ("E03.9", "Hypothyroidism, unspecified"),
    ("F32.1", "Major Depressive Episode, moderate"),
    ("F41.1", "Generalised Anxiety Disorder"),
    ("D50.9", "Iron Deficiency Anaemia"),
    ("M17.11","Primary Osteoarthritis, Right Knee"),
    ("I21.3", "ST-elevation MI, unspecified"),
    ("I63.9", "Cerebral Infarction, unspecified"),
    ("C61",   "Malignant Neoplasm of Prostate"),
    ("C34.90","Non-small Cell Lung Cancer"),
    ("C18.9", "Colon Cancer, unspecified"),
    ("C50.911","Breast Cancer, Right, Female"),
    ("B18.2", "Chronic Hepatitis C"),
    ("B20",   "HIV"),
    ("K50.90","Crohn Disease, unspecified"),
    ("M05.79","Rheumatoid Arthritis"),
    ("L40.50","Psoriatic Arthritis"),
    ("E78.5", "Hyperlipidaemia, unspecified"),
    ("E66.01","Morbid Obesity, BMI ≥40"),
]

RXNORM = [
    (860975,  "Metformin 500 mg Oral Tab"),
    (316672,  "Lisinopril 10 mg Oral Tab"),
    (197361,  "Amlodipine 5 mg Oral Tab"),
    (259255,  "Atorvastatin 20 mg Oral Tab"),
    (198211,  "Omeprazole 20 mg Oral Cap"),
    (310798,  "Metoprolol Succinate 50 mg Tab"),
    (1861634, "Empagliflozin 10 mg Oral Tab"),
    (1598339, "Dapagliflozin 10 mg Oral Tab"),
    (213169,  "Rosuvastatin 10 mg Tab"),
    (352272,  "Clopidogrel 75 mg Tab"),
    (855332,  "Warfarin 5 mg Oral Tab"),
    (1049630, "Apixaban 5 mg Oral Tab"),
    (197381,  "Levothyroxine 50 mcg Tab"),
    (312938,  "Sertraline 50 mg Oral Tab"),
    (197591,  "Furosemide 40 mg Oral Tab"),
    (197770,  "Hydrochlorothiazide 25 mg Tab"),
    (198405,  "Prednisone 10 mg Oral Tab"),
    (311671,  "Gabapentin 300 mg Oral Cap"),
    (198240,  "Pantoprazole 40 mg Tab"),
    (197696,  "Glipizide 5 mg Oral Tab"),
    (197884,  "Insulin Glargine 100 U/mL"),
    (261222,  "Semaglutide 0.5 mg Inj"),
    (1546356, "Tirzepatide 5 mg Inj"),
    (198013,  "Losartan 50 mg Tab"),
    (308136,  "Simvastatin 20 mg Tab"),
    (562251,  "Ramipril 5 mg Cap"),
    (197807,  "Ibuprofen 400 mg Tab"),
    (310429,  "Acetaminophen 500 mg Tab"),
    (897122,  "Salbutamol 100 mcg Inhaler"),
    (1245689, "Budesonide/Formoterol Inhaler"),
]

# Procedures (SNOMED procedure codes)
PROCEDURES = [
    (103693007, "Diagnostic Procedure"),
    (71388002,  "Surgical Procedure"),
    (127786006, "Serum Creatinine Test"),
    (173160006, "Diabetic Eye Screening"),
    (252160004, "ECG Recording"),
    (241217004, "Coronary Angiography"),
    (232717009, "Coronary Artery Bypass Graft"),
    (18286008,  "Catheterisation"),
    (387713003, "Knee Replacement"),
    (105355006, "Hip Replacement"),
    (440383008, "MRI Brain"),
    (77477000,  "CT Scan"),
    (371572003, "Elective Cholecystectomy"),
    (80146002,  "Appendicectomy"),
    (174041007, "Lung Biopsy"),
    (176795006, "Breast Lumpectomy"),
    (116140006, "Total Colectomy"),
    (35025007,  "Manual Defibrillation"),
    (710824005, "Pulmonary Function Test"),
    (23426006,  "Dialysis"),
]

# ── Fictional patients (Synthea-inspired realistic names) ───────────────────
FIRST_NAMES_M = [
    "Lukas", "Stefan", "Markus", "Andreas", "Thomas", "Michael", "Daniel",
    "Florian", "Alexander", "Christian", "Jan", "Peter", "Matthias", "Felix",
    "Sebastian", "Tobias", "Patrick", "Benjamin", "Niklas", "Maximilian",
    "Erik", "Sven", "Olaf", "Hans", "Klaus", "Dirk", "Werner", "Uwe",
    "Friedrich", "Karl", "Georg", "Heinrich", "Wolfgang", "Helmut", "Gerhard",
    "Rainer", "Dieter", "Bernd", "Jürgen", "Manfred", "Hartmut", "Detlef",
    "Axel", "Volker", "Norbert", "Siegfried", "Günter", "Ernst", "Horst",
    "Otto",
]
FIRST_NAMES_F = [
    "Anna", "Maria", "Sophie", "Laura", "Katharina", "Julia", "Lena",
    "Sarah", "Lisa", "Eva", "Petra", "Monika", "Renate", "Ingrid",
    "Gabriela", "Heike", "Claudia", "Birgit", "Margit", "Ursula",
    "Hanna", "Charlotte", "Elisabeth", "Frieda", "Johanna", "Nina",
    "Nadine", "Simone", "Andrea", "Susanne", "Martina", "Sabine",
    "Christine", "Angela", "Brigitte", "Helga", "Gertrud", "Erika",
    "Ilse", "Doris", "Anneliese", "Hildegard", "Elfriede", "Margarete",
    "Rosa", "Karla", "Dagmar", "Gisela", "Waltraud", "Lieselotte",
]
LAST_NAMES = [
    "Müller", "Schmidt", "Schneider", "Fischer", "Weber", "Meyer", "Wagner",
    "Becker", "Schulz", "Hoffmann", "Koch", "Richter", "Wolf", "Schröder",
    "Neumann", "Schwarz", "Zimmermann", "Braun", "Krüger", "Hartmann",
    "Lange", "Schmitt", "Werner", "Krause", "Meier", "Lehmann", "Schmid",
    "Schulze", "Maier", "Köhler", "Herrmann", "König", "Walter", "Mayer",
    "Kaiser", "Fuchs", "Peters", "Lang", "Scholz", "Möller", "Gross",
    "Jung", "Hahn", "Frank", "Vogel", "Roth", "Schreiber", "Weiß",
    "Jansen", "Brandt",
]

# ── Condition-to-ontology mapping ───────────────────────────────────────────
# Each condition profile: (name, snomed_id, icd10, common_loinc_tests, common_rx)
CONDITION_PROFILES = [
    ("Type 2 Diabetes", 73211009, "E11", ["4548-4","2345-7","33914-3","2160-0"], [860975,1861634,197696,197884]),
    ("Essential Hypertension", 38341003, "I10", ["8480-6","8462-4","2160-0","2823-3"], [316672,197361,198013,197770]),
    ("Asthma", 195967001, "J45.20", ["71426-1","6690-2","718-7"], [897122,1245689]),
    ("COPD", 13645005, "J44.1", ["2744-1","71426-1","718-7","2028-9"], [897122,1245689,198405]),
    ("Heart Failure", 84114007, "I50.9", ["33762-6","2093-3","2823-3","2951-2"], [197591,310798,1049630]),
    ("CKD Stage 3", 709044004, "N18.3", ["2160-0","33914-3","14959-1","2823-3"], [316672,197361]),
    ("Atrial Fibrillation", 49436004, "I48.91", ["33762-6","5902-2","48065-7"], [855332,1049630,310798]),
    ("Hypothyroidism", 40930008, "E03.9", ["3016-3","3026-2","2093-3"], [197381]),
    ("Depression", 35489007, "F32.1", ["3016-3","718-7","2276-4"], [312938]),
    ("Anxiety Disorder", 197480006, "F41.1", ["3016-3","718-7"], [312938]),
    ("Iron Deficiency Anaemia", 267036007, "D50.9", ["718-7","4544-3","2276-4"], []),
    ("Osteoarthritis", 396275006, "M17.11", ["30341-2","71426-1"], [197807,311671]),
    ("Ischemic Heart Disease", 414545008, "I25.10", ["2093-3","2571-8","2085-9","13457-7"], [259255,352272,310798]),
    ("Hyperlipidaemia", 190828008, "E78.5", ["2093-3","2571-8","2085-9","13457-7"], [259255,213169,308136]),
    ("Obesity", 414916001, "E66.01", ["39156-5","4548-4","2093-3","2571-8"], [860975,261222,1546356]),
    ("Prostate Cancer", 399068003, "C61", ["14937-7","718-7","1751-7","71426-1"], []),
    ("Breast Cancer", 363406005, "C50.911", ["718-7","777-3","6690-2","71426-1"], []),
    ("Colon Cancer", 93761005, "C18.9", ["718-7","777-3","48065-7","1751-7"], []),
    ("Rheumatoid Arthritis", 69896004, "M05.79", ["71426-1","30341-2","6690-2"], [198405,197807]),
    ("Hepatitis C", 235856003, "B18.2", ["1742-6","1920-8","1975-2","777-3"], []),
    ("Crohn Disease", 34000006, "K50.90", ["71426-1","718-7","1751-7","30341-2"], [198405]),
]

# ── Dataset specifications ──────────────────────────────────────────────────
EXTRA_DATASETS = [
    ("dataset:cardiac-outcomes-eu-2025",   "EU Cardiac Outcomes Registry 2025",         "Federated cardiac events registry, EuroHeart + EHDS pilot.",           "Cardiology",           "CC-BY-SA-4.0",   45200,  "RegistryData"),
    ("dataset:lung-cancer-screening-nl",   "NL Lung Cancer Screening Cohort",           "Low-dose CT screening cohort (NELSON follow-up), FHIR R4.",           "Oncology",             "CC-BY-NC-4.0",   18700,  "ClinicalTrial"),
    ("dataset:geriatric-falls-de-2024",    "Geriatric Falls Prevention Study DE",       "Multicentre fall-risk assessment dataset in FHIR R4.",                 "Geriatrics",           "CC-BY-SA-4.0",   9800,   "ObservationalStudy"),
    ("dataset:rare-disease-erdera-2026",   "ERDERA Rare Disease Compendium",            "EU Reference Network rare disease phenotype data.",                   "Rare Diseases",        "CC-BY-NC-ND-4.0",3400,   "RegistryData"),
    ("dataset:mental-health-eu-pilot",     "EU Mental Health Secondary Use Pilot",      "EHDS Art. 53 mental-health cohort across 5 Member States.",           "Psychiatry",           "CC-BY-SA-4.0",   22100,  "SecondaryUse"),
    ("dataset:antimicrobial-resist-ecdc",  "ECDC Antimicrobial Resistance 2025",        "EU-wide AMR surveillance data, EARS-Net FHIR export.",                "Infectious Disease",   "CC-BY-4.0",      87000,  "SurveillanceData"),
    ("dataset:maternal-health-who-afro",   "WHO AFRO Maternal Health Dataset",          "Maternal-neonatal outcomes from 12 African countries.",                "Maternal Health",      "CC-BY-4.0",      134000, "ResourceData"),
    ("dataset:diabetes-retinopathy-uk",    "UK Diabetic Retinopathy Screening",         "Retinal image + FHIR Observation data from NHS screening.",           "Ophthalmology",        "OGL-UK-3.0",     56000,  "ImagingData"),
    ("dataset:covid-long-haulers-be",      "Belgian Long COVID Registry",               "Post-COVID symptom tracking, 18-month follow-up, FHIR R4.",          "Infectious Disease",   "CC-BY-SA-4.0",   11200,  "CohortStudy"),
    ("dataset:paediatric-asthma-scand",    "Scandinavian Paediatric Asthma Cohort",     "Birth-cohort study of childhood asthma in DK/SE/NO.",                 "Paediatrics",          "CC-BY-4.0",      27500,  "CohortStudy"),
    ("dataset:stroke-rehab-fr-2025",       "French Stroke Rehabilitation Outcomes",     "Post-stroke motor-recovery trajectories, FHIR + ICF.",               "Neurology",            "CC-BY-NC-4.0",   7600,   "OutcomeStudy"),
    ("dataset:organ-transplant-eurotx",    "EuroTransplant Organ Allocation Dataset",   "Post-transplant outcome data across 8 countries.",                    "Transplant Medicine",  "CC-BY-NC-ND-4.0",4200,   "RegistryData"),
    ("dataset:pharmacovigilance-ema",      "EMA Pharmacovigilance Signal Data",         "Adverse drug reaction signal data from EudraVigilance.",              "Pharmacovigilance",    "EU-ODP-1.0",     290000, "SafetyData"),
    ("dataset:genomics-1m-genomes",        "1M Genomes Reference Cohort",               "Genomic variants + phenotype from the EU 1+Million Genomes.",         "Genomics",             "CC-BY-NC-4.0",   105000, "GenomicData"),
    ("dataset:occupational-health-eu",     "EU Occupational Health Registry",           "Workplace exposure and health outcome data, FHIR + OMOP.",            "Occupational Health",  "CC-BY-SA-4.0",   41000,  "SurveillanceData"),
    ("dataset:dental-health-who-euro",     "WHO EURO Oral Health Survey 2025",          "Oral health examination data from 20 European countries.",            "Dentistry",            "CC-BY-4.0",      63000,  "SurveyData"),
]

# ── Extra EEHRxF profiles ───────────────────────────────────────────────────
EXTRA_PROFILES = [
    ("Condition (EU core)",      "Condition",       "HL7 Europe Base and Core"),
    ("Observation (EU core)",    "Observation",     "HL7 Europe Base and Core"),
    ("AllergyIntolerance (EU)",  "AllergyIntolerance","HL7 Europe Base and Core"),
    ("Procedure (EU core)",      "Procedure",       "HL7 Europe Base and Core"),
    ("MedicationStatement (EU)", "MedicationStatement","HL7 Europe Medication MPD"),
    ("Immunization (EU)",        "Immunization",    "HL7 Europe Base and Core"),
    ("CarePlan (EU)",            "CarePlan",        "HL7 Europe Base and Core"),
    ("ServiceRequest (EU Lab)",  "ServiceRequest",  "HL7 Europe Laboratory"),
    ("Specimen (EU Lab)",        "Specimen",        "HL7 Europe Laboratory"),
]

EXTRA_CATEGORIES = [
    ("Chronic Disease Management",  "Profiles for long-term condition monitoring", "Priority 2", "2027-03-01"),
    ("Emergency Care",              "Emergency department FHIR profiles",          "Priority 3", "2028-03-01"),
    ("Vaccination / Immunisation",  "Immunisation event and certificate profiles", "Priority 2", "2027-03-01"),
]


# ═══════════════════════════════════════════════════════════════════════════════
# GENERATOR
# ═══════════════════════════════════════════════════════════════════════════════

lines: list[str] = []

def emit(cypher: str):
    lines.append(textwrap.dedent(cypher).strip() + ";")


def esc(s: str) -> str:
    """Escape single quotes for Cypher string literals."""
    return s.replace("'", "\\'")



# ── L5: Ontology backbone ──────────────────────────────────────────────────

emit("// ═══ LARGE-SCALE SEED: Ontology backbone (SNOMED) ═══")
for cid, name in SNOMED:
    emit(f"""
        MERGE (s:SnomedConcept {{conceptId: {cid}}})
        SET s.name = '{esc(name)} (SNOMED)',
            s.active = true
    """)

emit("// ═══ LARGE-SCALE SEED: Ontology backbone (LOINC) ═══")
for code, name in LOINC:
    emit(f"""
        MERGE (l:LoincCode {{code: '{code}'}})
        SET l.display = '{esc(name)}',
            l.system = 'http://loinc.org'
    """)

emit("// ═══ LARGE-SCALE SEED: Ontology backbone (ICD-10) ═══")
for code, name in ICD10:
    emit(f"""
        MERGE (i:ICD10Code {{code: '{code}'}})
        SET i.display = '{esc(name)}',
            i.system = 'http://hl7.org/fhir/sid/icd-10-cm'
    """)

emit("// ═══ LARGE-SCALE SEED: Ontology backbone (RxNorm) ═══")
for rxcui, name in RXNORM:
    emit(f"""
        MERGE (r:RxNormConcept {{rxcui: {rxcui}}})
        SET r.display = '{esc(name)}',
            r.system = 'http://www.nlm.nih.gov/research/umls/rxnorm'
    """)

emit("// ═══ Ontology IS_A hierarchy ═══")
# All disease SNOMED concepts → parent "Disease"
for cid, name in SNOMED:
    if cid != 64572001:
        emit(f"""
            MATCH (c:SnomedConcept {{conceptId: {cid}}}),
                  (parent:SnomedConcept {{conceptId: 64572001}})
            MERGE (c)-[:IS_A]->(parent)
        """)

# SNOMED → ICD-10 cross-mapping
SNOMED_ICD_MAP = [
    (73211009,  "E11"), (38341003, "I10"), (195967001, "J45.20"),
    (13645005,  "J44.1"), (84114007, "I50.9"), (709044004, "N18.3"),
    (49436004,  "I48.91"), (40930008, "E03.9"), (35489007, "F32.1"),
    (197480006, "F41.1"), (267036007, "D50.9"), (396275006, "M17.11"),
    (414545008, "I25.10"), (190828008, "E78.5"), (414916001, "E66.01"),
    (399068003, "C61"), (363406005, "C50.911"), (93761005, "C18.9"),
    (69896004,  "M05.79"), (235856003, "B18.2"), (34000006, "K50.90"),
]
emit("// ═══ SNOMED → ICD-10 STANDARD_CONCEPT mappings ═══")
for sid, icd in SNOMED_ICD_MAP:
    emit(f"""
        MATCH (s:SnomedConcept {{conceptId: {sid}}}),
              (i:ICD10Code {{code: '{icd}'}})
        MERGE (s)-[:STANDARD_CONCEPT]->(i)
    """)

emit("// ═══ Procedure codes ═══")
for pid, name in PROCEDURES:
    emit(f"""
        MERGE (p:SnomedConcept {{conceptId: {pid}}})
        SET p.name = '{esc(name)} (SNOMED)',
            p.active = true
    """)


# ── L3 + L4: Generate patients with clinical data ──────────────────────────

NUM_PATIENTS = 200

emit(f"// ═══ LARGE-SCALE SEED: {NUM_PATIENTS} patients + clinical data ═══")

datasets = [
    "urn:uuid:riverside:dataset:diab-001",
    "dataset:synthea-fhir-r4-mvd",
    "dataset:omop-cdm-v54-analytics",
    "dataset:prostate-cancer-registry",
] + [d[0] for d in EXTRA_DATASETS]

def year(age: int) -> int:
    return 2026 - age

node_count = 0

for i in range(NUM_PATIENTS):
    pid = 2000 + i
    is_male = i % 2 == 0
    first = random.choice(FIRST_NAMES_M if is_male else FIRST_NAMES_F)
    last = random.choice(LAST_NAMES)
    name = f"{first} {last}"
    age = random.randint(22, 88)
    birth_year = year(age)
    gender = "male" if is_male else "female"
    ds = random.choice(datasets)

    # Pick 1-3 conditions for this patient
    num_conditions = random.randint(1, 3)
    patient_conditions = random.sample(CONDITION_PROFILES, num_conditions)

    # Patient node
    emit(f"""
        MERGE (p:Patient {{id: 'patient-{pid}'}})
        SET p.name = '{esc(name)}',
            p.birthDate = '{birth_year}-{random.randint(1,12):02d}-{random.randint(1,28):02d}',
            p.gender = '{gender}'
    """)
    node_count += 1

    # FROM_DATASET
    emit(f"""
        MATCH (p:Patient {{id: 'patient-{pid}'}})
        MATCH (d:HealthDataset {{datasetId: '{ds}'}})
        MERGE (p)-[:FROM_DATASET]->(d)
    """)

    # OMOP Person
    emit(f"""
        MERGE (op:OMOPPerson {{personId: {pid}}})
        SET op.name = 'OMOP Person {pid}',
            op.yearOfBirth = {birth_year},
            op.genderConceptId = {8507 if is_male else 8532}
        WITH op
        MATCH (p:Patient {{id: 'patient-{pid}'}})
        MERGE (p)-[:MAPPED_TO]->(op)
    """)
    node_count += 1

    # Encounters (2-4 per patient)
    num_enc = random.randint(2, 4)
    for e in range(num_enc):
        enc_id = f"enc-{pid}-{e}"
        enc_year = random.randint(max(2020, birth_year + 18), 2026)
        enc_month = random.randint(1, 12)
        enc_class = random.choice(["ambulatory", "inpatient", "emergency"])
        emit(f"""
            MERGE (enc:Encounter {{id: '{enc_id}'}})
            SET enc.name = '{enc_class.title()} Visit {enc_year}-{enc_month:02d}',
                enc.date = '{enc_year}-{enc_month:02d}-{random.randint(1,28):02d}',
                enc.class = '{enc_class}',
                enc.status = 'finished'
            WITH enc
            MATCH (p:Patient {{id: 'patient-{pid}'}})
            MERGE (p)-[:HAS_ENCOUNTER]->(enc)
        """)
        node_count += 1

        # OMOP Visit Occurrence
        emit(f"""
            MERGE (vo:OMOPVisitOccurrence {{visitId: '{enc_id}'}})
            SET vo.name = 'Visit {enc_id}',
                vo.visitStartDate = '{enc_year}-{enc_month:02d}-01',
                vo.visitConceptId = {random.choice([9201, 9202, 9203])}
            WITH vo
            MATCH (op:OMOPPerson {{personId: {pid}}})
            MERGE (op)-[:HAS_VISIT_OCCURRENCE]->(vo)
        """)
        node_count += 1

    # Conditions + linked observations/medications
    for cond_name, snomed_id, icd_code, loinc_tests, rx_list in patient_conditions:
        cond_id = f"cond-{pid}-{snomed_id}"
        onset_year = random.randint(max(2018, birth_year + 18), 2025)

        # Condition node
        emit(f"""
            MERGE (c:Condition {{id: '{cond_id}'}})
            SET c.display = '{esc(cond_name)}',
                c.onsetDate = '{onset_year}-{random.randint(1,12):02d}-01',
                c.status = 'active',
                c.code = '{snomed_id}'
            WITH c
            MATCH (p:Patient {{id: 'patient-{pid}'}})
            MERGE (p)-[:HAS_CONDITION]->(c)
        """)
        node_count += 1

        # Code condition with SNOMED
        emit(f"""
            MATCH (c:Condition {{id: '{cond_id}'}})
            MATCH (s:SnomedConcept {{conceptId: {snomed_id}}})
            MERGE (c)-[:CODED_BY]->(s)
        """)

        # OMOP Condition Occurrence
        emit(f"""
            MERGE (co:OMOPConditionOccurrence {{conditionId: '{cond_id}'}})
            SET co.name = 'OMOP {esc(cond_name)}',
                co.conditionConceptId = {snomed_id},
                co.conditionStartDate = '{onset_year}-01-01'
            WITH co
            MATCH (op:OMOPPerson {{personId: {pid}}})
            MERGE (op)-[:HAS_CONDITION_OCCURRENCE]->(co)
        """)
        node_count += 1

        # Observations (from condition's LOINC tests)
        num_obs = min(len(loinc_tests), random.randint(1, 3))
        for loinc_code in random.sample(loinc_tests, num_obs):
            obs_id = f"obs-{pid}-{loinc_code}"
            obs_year = random.randint(onset_year, 2026)
            # Generate realistic values
            value = round(random.uniform(3.0, 200.0), 1)
            emit(f"""
                MERGE (o:Observation {{id: '{obs_id}'}})
                SET o.display = '{loinc_code} result',
                    o.code = '{loinc_code}',
                    o.value = {value},
                    o.date = '{obs_year}-{random.randint(1,12):02d}-{random.randint(1,28):02d}',
                    o.status = 'final'
                WITH o
                MATCH (p:Patient {{id: 'patient-{pid}'}})
                MERGE (p)-[:HAS_OBSERVATION]->(o)
            """)
            node_count += 1

            # Code observation with LOINC
            emit(f"""
                MATCH (o:Observation {{id: '{obs_id}'}})
                MATCH (l:LoincCode {{code: '{loinc_code}'}})
                MERGE (o)-[:CODED_BY]->(l)
            """)

            # OMOP Measurement
            emit(f"""
                MERGE (m:OMOPMeasurement {{measurementId: '{obs_id}'}})
                SET m.name = 'OMOP Meas {loinc_code}',
                    m.valueAsNumber = {value},
                    m.measurementDate = '{obs_year}-01-01'
                WITH m
                MATCH (op:OMOPPerson {{personId: {pid}}})
                MERGE (op)-[:HAS_MEASUREMENT]->(m)
            """)
            node_count += 1

        # Medications
        if rx_list:
            num_rx = min(len(rx_list), random.randint(1, 2))
            for rxcui in random.sample(rx_list, num_rx):
                rx_id = f"rx-{pid}-{rxcui}"
                rx_name = next((n for r, n in RXNORM if r == rxcui), "Medication")
                emit(f"""
                    MERGE (mr:MedicationRequest {{id: '{rx_id}'}})
                    SET mr.display = '{esc(rx_name)}',
                        mr.status = 'active',
                        mr.code = '{rxcui}'
                    WITH mr
                    MATCH (p:Patient {{id: 'patient-{pid}'}})
                    MERGE (p)-[:HAS_MEDICATION_REQUEST]->(mr)
                """)
                node_count += 1

                # Code with RxNorm
                emit(f"""
                    MATCH (mr:MedicationRequest {{id: '{rx_id}'}})
                    MATCH (r:RxNormConcept {{rxcui: {rxcui}}})
                    MERGE (mr)-[:CODED_BY]->(r)
                """)

                # OMOP Drug Exposure
                emit(f"""
                    MERGE (de:OMOPDrugExposure {{drugId: '{rx_id}'}})
                    SET de.name = 'OMOP {esc(rx_name)}',
                        de.drugConceptId = {rxcui}
                    WITH de
                    MATCH (op:OMOPPerson {{personId: {pid}}})
                    MERGE (op)-[:HAS_DRUG_EXPOSURE]->(de)
                """)
                node_count += 1

    # Procedures (0-1 per patient)
    if random.random() < 0.4:
        proc_code, proc_name = random.choice(PROCEDURES)
        proc_id = f"proc-{pid}-{proc_code}"
        emit(f"""
            MERGE (pr:Procedure {{id: '{proc_id}'}})
            SET pr.display = '{esc(proc_name)}',
                pr.code = '{proc_code}',
                pr.status = 'completed',
                pr.date = '{random.randint(2022,2026)}-{random.randint(1,12):02d}-{random.randint(1,28):02d}'
            WITH pr
            MATCH (p:Patient {{id: 'patient-{pid}'}})
            MERGE (p)-[:HAS_PROCEDURE]->(pr)
        """)
        node_count += 1

        # Code with SNOMED procedure
        emit(f"""
            MATCH (pr:Procedure {{id: '{proc_id}'}})
            MATCH (s:SnomedConcept {{conceptId: {proc_code}}})
            MERGE (pr)-[:CODED_BY]->(s)
        """)

        # OMOP Procedure Occurrence
        emit(f"""
            MERGE (po:OMOPProcedureOccurrence {{procedureId: '{proc_id}'}})
            SET po.name = 'OMOP {esc(proc_name)}',
                po.procedureConceptId = {proc_code}
            WITH po
            MATCH (op:OMOPPerson {{personId: {pid}}})
            MERGE (op)-[:HAS_PROCEDURE_OCCURRENCE]->(po)
        """)
        node_count += 1


# ── L2: Extra HealthDCAT-AP datasets + distributions ───────────────────────

emit("// ═══ LARGE-SCALE SEED: Extra datasets + distributions ═══")
for ds_id, title, desc, theme, lic, records, ds_type in EXTRA_DATASETS:
    safe_title = esc(title)
    safe_desc = esc(desc)
    emit(f"""
        MERGE (d:HealthDataset {{datasetId: '{ds_id}'}})
        SET d.title = '{safe_title}',
            d.description = '{safe_desc}',
            d.license = '{lic}',
            d.theme = '{theme}',
            d.conformsTo = 'http://hl7.org/fhir/R4',
            d.hdcatapDatasetType = '{ds_type}',
            d.hdcatapLegalBasisForAccess = 'EHDS Article 53 Secondary Use',
            d.hdcatapNumberOfRecords = {records}
    """)
    node_count += 1

    # Distribution
    dist_id = ds_id.replace("dataset:", "dist:")
    emit(f"""
        MERGE (dist:Distribution {{distributionId: '{dist_id}'}})
        SET dist.title = '{safe_title} (FHIR R4 Bundle)',
            dist.mediaType = 'application/fhir+json',
            dist.format = 'FHIR R4 Bundle'
        WITH dist
        MATCH (d:HealthDataset {{datasetId: '{ds_id}'}})
        MERGE (d)-[:HAS_DISTRIBUTION]->(dist)
    """)
    node_count += 1

    # Link to catalog
    emit(f"""
        MATCH (cat:Catalog), (d:HealthDataset {{datasetId: '{ds_id}'}})
        MERGE (cat)-[:LISTS]->(d)
    """)

    # SUBJECT_TO_PURPOSE
    emit(f"""
        MATCH (ep:EhdsPurpose), (d:HealthDataset {{datasetId: '{ds_id}'}})
        MERGE (d)-[:SUBJECT_TO_PURPOSE]->(ep)
    """)

# ── Assign providers + HDABs to extra datasets ─────────────────────────────

emit("// ═══ PUBLISHED_BY + GOVERNS for extra datasets ═══")
_DS_HOLDER_MAP = {
    "dataset:cardiac-outcomes-eu-2025":   "did:web:hus.fi:clinic",
    "dataset:lung-cancer-screening-nl":   "did:web:lmc.nl:clinic",
    "dataset:geriatric-falls-de-2024":    "did:web:alpha-klinik.de:participant",
    "dataset:rare-disease-erdera-2026":   "did:web:chlisboa.pt:clinic",
    "dataset:mental-health-eu-pilot":     "did:web:pcz.pl:clinic",
    "dataset:antimicrobial-resist-ecdc":  "did:web:hus.fi:clinic",
    "dataset:maternal-health-who-afro":   "did:web:chlisboa.pt:clinic",
    "dataset:diabetes-retinopathy-uk":    "did:web:alpha-klinik.de:participant",
    "dataset:covid-long-haulers-be":      "did:web:lmc.nl:clinic",
    "dataset:paediatric-asthma-scand":    "did:web:hus.fi:clinic",
    "dataset:stroke-rehab-fr-2025":       "did:web:chlisboa.pt:clinic",
    "dataset:organ-transplant-eurotx":    "did:web:pcz.pl:clinic",
    "dataset:pharmacovigilance-ema":      "did:web:alpha-klinik.de:participant",
    "dataset:genomics-1m-genomes":        "did:web:hus.fi:clinic",
    "dataset:occupational-health-eu":     "did:web:pcz.pl:clinic",
    "dataset:dental-health-who-euro":     "did:web:lmc.nl:clinic",
}
_DS_HDAB_MAP = {
    "dataset:cardiac-outcomes-eu-2025":   "did:web:ema.europa.eu:authority",
    "dataset:lung-cancer-screening-nl":   "did:web:medreg.de:hdab",
    "dataset:geriatric-falls-de-2024":    "did:web:medreg.de:hdab",
    "dataset:rare-disease-erdera-2026":   "did:web:ema.europa.eu:authority",
    "dataset:mental-health-eu-pilot":     "did:web:irs.fr:hdab",
    "dataset:antimicrobial-resist-ecdc":  "did:web:ecdc.europa.eu:hdab",
    "dataset:maternal-health-who-afro":   "did:web:ema.europa.eu:authority",
    "dataset:diabetes-retinopathy-uk":    "did:web:medreg.de:hdab",
    "dataset:covid-long-haulers-be":      "did:web:irs.fr:hdab",
    "dataset:paediatric-asthma-scand":    "did:web:ecdc.europa.eu:hdab",
    "dataset:stroke-rehab-fr-2025":       "did:web:irs.fr:hdab",
    "dataset:organ-transplant-eurotx":    "did:web:ema.europa.eu:authority",
    "dataset:pharmacovigilance-ema":      "did:web:ema.europa.eu:authority",
    "dataset:genomics-1m-genomes":        "did:web:ecdc.europa.eu:hdab",
    "dataset:occupational-health-eu":     "did:web:medreg.de:hdab",
    "dataset:dental-health-who-euro":     "did:web:ecdc.europa.eu:hdab",
}
for ds_id, _, _, _, _, _, _ in EXTRA_DATASETS:
    holder = _DS_HOLDER_MAP[ds_id]
    hdab = _DS_HDAB_MAP[ds_id]
    # NOTE: emit moved after EXTRA_PARTICIPANTS creation (below) so MATCH can find them

# ── L2: Extra EEHRxF profiles + categories ──────────────────────────────────

emit("// ═══ LARGE-SCALE SEED: Extra EEHRxF profiles + categories ═══")
for pf_name, base_res, ig in EXTRA_PROFILES:
    safe_name = esc(pf_name)
    emit(f"""
        MERGE (p:EEHRxFProfile {{name: '{safe_name}'}})
        SET p.baseResource = '{base_res}',
            p.igName = '{ig}',
            p.fhirVersion = 'R4',
            p.status = 'active'
    """)
    node_count += 1

# Assign new profiles to categories
PROFILE_CATEGORY_MAP = [
    ("Condition (EU core)", "Chronic Disease Management"),
    ("Observation (EU core)", "Laboratory Results"),
    ("AllergyIntolerance (EU)", "Patient Summaries"),
    ("Procedure (EU core)", "Hospital Discharge Reports"),
    ("MedicationStatement (EU)", "ePrescription / eDispensation"),
    ("Immunization (EU)", "Vaccination / Immunisation"),
    ("CarePlan (EU)", "Chronic Disease Management"),
    ("ServiceRequest (EU Lab)", "Laboratory Results"),
    ("Specimen (EU Lab)", "Laboratory Results"),
]

for cat_name, cat_desc, ehds_group, deadline in EXTRA_CATEGORIES:
    safe_name = esc(cat_name)
    emit(f"""
        MERGE (c:EEHRxFCategory {{name: '{safe_name}'}})
        SET c.description = '{esc(cat_desc)}',
            c.ehdsGroup = '{ehds_group}',
            c.ehdsDeadline = '{deadline}',
            c.status = 'active'
    """)
    node_count += 1

for pf_name, cat_name in PROFILE_CATEGORY_MAP:
    emit(f"""
        MATCH (p:EEHRxFProfile {{name: '{esc(pf_name)}'}})
        MATCH (c:EEHRxFCategory {{name: '{esc(cat_name)}'}})
        MERGE (p)-[:PART_OF_CATEGORY]->(c)
    """)


# ── L1: Extra marketplace / governance nodes ────────────────────────────────

emit("// ═══ LARGE-SCALE SEED: Extra marketplace nodes ═══")

EXTRA_PARTICIPANTS = [
    ("Helsinki University Hospital", "did:web:hus.fi:clinic",          "DATA_HOLDER"),
    ("Karolinska Institutet",        "did:web:ki.se:research",         "DATA_USER"),
    ("Centro Hospitalar Lisboa",     "did:web:chlisboa.pt:clinic",     "DATA_HOLDER"),
    ("Polskie Centrum Zdrowia",      "did:web:pcz.pl:clinic",          "DATA_HOLDER"),
    ("European Medicines Agency",    "did:web:ema.europa.eu:authority", "HDAB"),
    ("ECDC Stockholm",               "did:web:ecdc.europa.eu:hdab",    "HDAB"),
]

for pname, pdid, prole in EXTRA_PARTICIPANTS:
    safe_name = esc(pname)
    emit(f"""
        MERGE (p:Participant {{participantId: '{pdid}'}})
        SET p.name = '{safe_name}',
            p.role = '{prole}',
            p.status = 'active'
    """)
    node_count += 1

    # VCs for each new participant
    for vc_type in ["MembershipCredential", "EHDSParticipantCredential"]:
        vc_id = hashlib.md5(f"{pdid}-{vc_type}".encode()).hexdigest()[:12]
        emit(f"""
            MERGE (vc:VerifiableCredential {{credentialId: 'vc-{vc_id}'}})
            SET vc.credentialType = '{vc_type}',
                vc.subjectDid = '{pdid}',
                vc.issuerDid = 'did:web:issuerservice%3A10016:issuer',
                vc.status = 'active',
                vc.format = 'jwt_vc',
                vc.issuedAt = '2026-01-15T00:00:00Z',
                vc.expiresAt = '2027-01-15T00:00:00Z'
            WITH vc
            MATCH (part:Participant {{participantId: '{pdid}'}})
            MERGE (vc)-[:ISSUED_TO]->(part)
        """)
        node_count += 1

# ── L1c: Trust Centers — Federated Pseudonym Resolution (Phase 18) ────────

emit("// ═══ Trust Centers (EHDS Art. 50/51 — Phase 18) ═══")

TRUST_CENTERS = [
    ("RKI Trust Center DE", "Robert Koch Institute", "DE", "deterministic-pseudonym-v1", "did:web:medreg.de:hdab"),
    ("RIVM Trust Center NL", "RIVM (Rijksinstituut voor Volksgezondheid en Milieu)", "NL", "key-managed-v1", "did:web:medreg.de:hdab"),
]

for tc_name, operated_by, country, protocol, hdab_did in TRUST_CENTERS:
    safe_name = esc(tc_name)
    safe_op = esc(operated_by)
    emit(f"""
        MERGE (tc:TrustCenter {{name: '{safe_name}'}})
        SET tc.operatedBy = '{safe_op}',
            tc.country = '{country}',
            tc.status = 'active',
            tc.protocol = '{protocol}',
            tc.createdAt = '2026-01-01T00:00:00Z'
    """)
    node_count += 1

    # GOVERNED_BY → HDABApproval (link to nearest HDAB participant)
    emit(f"""
        MATCH (tc:TrustCenter {{name: '{safe_name}'}})
        MATCH (hdab:Participant {{participantId: '{hdab_did}'}})
        MERGE (tc)-[:GOVERNED_BY]->(hdab)
    """)

    # RESOLVES_PSEUDONYMS_FOR → HealthDatasets in the same country
    emit(f"""
        MATCH (tc:TrustCenter {{name: '{safe_name}'}})
        MATCH (d:HealthDataset)
          WHERE d.title CONTAINS '{country}' OR d.title CONTAINS '{country.lower()}'
        MERGE (tc)-[:RESOLVES_PSEUDONYMS_FOR]->(d)
    """)

# Sample SPE Sessions
emit("// ═══ SPE Sessions (Phase 18c) ═══")

SPE_SESSIONS = [
    ("spe-session-001", "active",   "sha256:a1b2c3d4e5f6", "sgx-v3.1", "did:web:medreg.de:hdab"),
    ("spe-session-002", "completed","sha256:f6e5d4c3b2a1", "sgx-v3.1", "did:web:medreg.de:hdab"),
    ("spe-session-003", "active",   "sha256:1a2b3c4d5e6f", "sev-snp-v1","did:web:irs.fr:hdab"),
]

for sess_id, status, code_hash, attestation, hdab_did in SPE_SESSIONS:
    emit(f"""
        MERGE (ss:SPESession {{sessionId: '{sess_id}'}})
        SET ss.status = '{status}',
            ss.approvedCodeHash = '{code_hash}',
            ss.attestationType = '{attestation}',
            ss.kAnonymityThreshold = 5,
            ss.createdAt = '2026-03-{random.randint(1,26):02d}T{random.randint(0,23):02d}:00:00Z'
    """)
    node_count += 1

    emit(f"""
        MATCH (ss:SPESession {{sessionId: '{sess_id}'}})
        MATCH (hdab:Participant {{participantId: '{hdab_did}'}})
        MERGE (ss)-[:CREATED_BY]->(hdab)
    """)

# Sample Provider Pseudonyms and Research Pseudonyms
emit("// ═══ Provider Pseudonyms + Research Pseudonyms (Phase 18) ═══")

PSEUDONYM_MAPPINGS = [
    # (rpsn, provider_psns: [(psn, provider)], trust_center, spe_session)
    ("RPSN-DE-1138", [("PSN-AK-00742", "AlphaKlinik Berlin"), ("PSN-LMC-09451", "Limburg Medical Centre")], "RKI Trust Center DE", "spe-session-001"),
    ("RPSN-DE-2047", [("PSN-AK-01203", "AlphaKlinik Berlin"), ("PSN-HUH-05512", "Helsinki University Hospital")], "RKI Trust Center DE", "spe-session-001"),
    ("RPSN-NL-0891", [("PSN-LMC-03221", "Limburg Medical Centre"), ("PSN-CHL-07744", "Centro Hospitalar Lisboa")], "RIVM Trust Center NL", "spe-session-003"),
]

for rpsn, provider_psns, tc_name, sess_id in PSEUDONYM_MAPPINGS:
    safe_tc = esc(tc_name)
    emit(f"""
        MERGE (rp:ResearchPseudonym {{rpsn: '{rpsn}'}})
        SET rp.status = 'active',
            rp.createdAt = '2026-03-15T10:00:00Z'
    """)
    node_count += 1

    for psn, provider in provider_psns:
        safe_prov = esc(provider)
        emit(f"""
            MERGE (pp:ProviderPseudonym {{psn: '{psn}'}})
            SET pp.provider = '{safe_prov}',
                pp.status = 'active'
            WITH pp
            MATCH (rp:ResearchPseudonym {{rpsn: '{rpsn}'}})
            MERGE (rp)-[:LINKED_FROM]->(pp)
        """)
        node_count += 1

    # RESOLVED_BY → TrustCenter
    emit(f"""
        MATCH (rp:ResearchPseudonym {{rpsn: '{rpsn}'}})
        MATCH (tc:TrustCenter {{name: '{safe_tc}'}})
        MERGE (rp)-[:RESOLVED_BY]->(tc)
    """)

    # USED_IN → SPESession
    emit(f"""
        MATCH (rp:ResearchPseudonym {{rpsn: '{rpsn}'}})
        MATCH (ss:SPESession {{sessionId: '{sess_id}'}})
        MERGE (rp)-[:USED_IN]->(ss)
    """)


# ── PUBLISHED_BY + GOVERNS (must run AFTER participants are created) ────────
emit("// ═══ PUBLISHED_BY + GOVERNS for extra datasets ═══")
for ds_id, _, _, _, _, _, _ in EXTRA_DATASETS:
    holder = _DS_HOLDER_MAP[ds_id]
    hdab = _DS_HDAB_MAP[ds_id]
    emit(f"""
        MATCH (d:HealthDataset {{datasetId: '{ds_id}'}})
        MATCH (prov:Participant {{participantId: '{holder}'}})
        MERGE (d)-[:PUBLISHED_BY]->(prov)
    """)
    emit(f"""
        MATCH (d:HealthDataset {{datasetId: '{ds_id}'}})
        MATCH (auth:Participant {{participantId: '{hdab}'}})
        MERGE (auth)-[:GOVERNS]->(d)
    """)

# Extra DataProducts for ALL new datasets
emit("// ═══ Extra DataProducts ═══")
for ds_id, title, _, theme, _, _, _ in EXTRA_DATASETS:
    prod_id = ds_id.replace("dataset:", "product-")
    safe_title = esc(title)
    emit(f"""
        MERGE (dp:DataProduct {{productId: '{prod_id}'}})
        SET dp.name = '{safe_title} Product',
            dp.status = 'published'
        WITH dp
        MATCH (d:HealthDataset {{datasetId: '{ds_id}'}})
        MERGE (dp)-[:DESCRIBED_BY]->(d)
    """)
    node_count += 1

# OFFERS / CONSUMES — provider OFFERS the product, consumer CONSUMES it
emit("// ═══ OFFERS / CONSUMES ═══")
for ds_id, _, _, _, _, _, _ in EXTRA_DATASETS:
    prod_id = ds_id.replace("dataset:", "product-")
    holder = _DS_HOLDER_MAP[ds_id]
    # Pick a consumer that is different from the holder
    consumer = random.choice([
        "did:web:pharmaco.de:research",
        "did:web:ki.se:research",
    ])
    emit(f"""
        MATCH (dp:DataProduct {{productId: '{prod_id}'}})
        MATCH (prov:Participant {{participantId: '{holder}'}})
        MERGE (prov)-[:OFFERS]->(dp)
    """)
    emit(f"""
        MATCH (dp:DataProduct {{productId: '{prod_id}'}})
        MATCH (cons:Participant {{participantId: '{consumer}'}})
        MERGE (cons)-[:CONSUMES]->(dp)
    """)

# Contract Negotiations + Data Transfers for ALL new datasets
emit("// ═══ Extra ContractNegotiations + DataTransfers ═══")
for idx, (ds_id, title, _, _, _, _, _) in enumerate(EXTRA_DATASETS):
    neg_id = f"neg-extra-{idx+1}"
    safe_title = esc(title)
    holder = _DS_HOLDER_MAP[ds_id]
    consumer = random.choice([
        "did:web:pharmaco.de:research",
        "did:web:ki.se:research",
    ])
    status = random.choice(["FINALIZED", "AGREED", "REQUESTED"])
    emit(f"""
        MERGE (cn:ContractNegotiation {{negotiationId: '{neg_id}'}})
        SET cn.name = 'Negotiation: {safe_title}',
            cn.status = '{status}',
            cn.startDate = '2026-{random.randint(1,3):02d}-{random.randint(1,28):02d}'
    """)
    node_count += 1

    # FOR_ASSET → HealthDataset (not intermediate Contract)
    emit(f"""
        MATCH (cn:ContractNegotiation {{negotiationId: '{neg_id}'}})
        MATCH (d:HealthDataset {{datasetId: '{ds_id}'}})
        MERGE (cn)-[:FOR_ASSET]->(d)
    """)

    # INITIATED_BY → consumer who requested the data
    emit(f"""
        MATCH (cn:ContractNegotiation {{negotiationId: '{neg_id}'}})
        MATCH (cons:Participant {{participantId: '{consumer}'}})
        MERGE (cn)-[:INITIATED_BY]->(cons)
    """)

    # NEGOTIATED_BY → provider who owns the data
    emit(f"""
        MATCH (cn:ContractNegotiation {{negotiationId: '{neg_id}'}})
        MATCH (prov:Participant {{participantId: '{holder}'}})
        MERGE (cn)-[:NEGOTIATED_BY]->(prov)
    """)

    # Data transfer
    xfer_id = f"xfer-extra-{idx+1}"
    xfer_status = random.choice(["COMPLETED", "STARTED", "REQUESTED"])
    emit(f"""
        MERGE (dt:DataTransfer {{transferId: '{xfer_id}'}})
        SET dt.name = 'Transfer: {safe_title}',
            dt.status = '{xfer_status}',
            dt.transferDate = '2026-{random.randint(1,3):02d}-{random.randint(1,28):02d}'
        WITH dt
        MATCH (d:HealthDataset {{datasetId: '{ds_id}'}})
        MERGE (dt)-[:TRANSFERS]->(d)
    """)
    node_count += 1

    # FROM_PROVIDER → data holder who provides the data
    emit(f"""
        MATCH (dt:DataTransfer {{transferId: '{xfer_id}'}})
        MATCH (prov:Participant {{participantId: '{holder}'}})
        MERGE (dt)-[:FROM_PROVIDER]->(prov)
    """)

    # TO_CONSUMER → research org that receives the data
    emit(f"""
        MATCH (dt:DataTransfer {{transferId: '{xfer_id}'}})
        MATCH (cons:Participant {{participantId: '{consumer}'}})
        MERGE (dt)-[:TO_CONSUMER]->(cons)
    """)


# ── CONFORMS_TO for new datasets ────────────────────────────────────────────
emit("// ═══ CONFORMS_TO links for extra datasets ═══")
for ds_id, _, _, theme, _, _, _ in EXTRA_DATASETS:
    profiles_for_theme = ["Patient (EU core)"]
    if "Oncology" in theme or "Cancer" in theme:
        profiles_for_theme.extend(["Condition (EU core)", "Procedure (EU core)"])
    elif "Disease" in theme or "Diabetes" in theme or "Cardiac" in theme:
        profiles_for_theme.extend(["Condition (EU core)", "Observation (EU core)"])
    elif "Mental" in theme or "Psychiatry" in theme:
        profiles_for_theme.append("Condition (EU core)")
    else:
        profiles_for_theme.append("Observation (EU core)")

    for pf in profiles_for_theme:
        emit(f"""
            MATCH (d:HealthDataset {{datasetId: '{ds_id}'}})
            MATCH (p:EEHRxFProfile {{name: '{pf}'}})
            MERGE (d)-[:CONFORMS_TO]->(p)
        """)

# ── HAS_THEME for new datasets ─────────────────────────────────────────────
emit("// ═══ HAS_THEME links ═══")
THEME_MAP = {
    "Cardiology": "Hospital Discharge Reports",
    "Oncology": "Rare Disease Registration",
    "Geriatrics": "Hospital Discharge Reports",
    "Rare Diseases": "Rare Disease Registration",
    "Psychiatry": "Patient Summaries",
    "Infectious Disease": "Laboratory Results",
    "Maternal Health": "Patient Summaries",
    "Ophthalmology": "Medical Images / Reports",
    "Paediatrics": "Patient Summaries",
    "Neurology": "Hospital Discharge Reports",
    "Transplant Medicine": "Hospital Discharge Reports",
    "Pharmacovigilance": "Patient Summaries",
    "Genomics": "Laboratory Results",
    "Occupational Health": "Laboratory Results",
    "Dentistry": "Patient Summaries",
}
for ds_id, _, _, theme, _, _, _ in EXTRA_DATASETS:
    cat = THEME_MAP.get(theme)
    if cat:
        emit(f"""
            MATCH (d:HealthDataset {{datasetId: '{ds_id}'}})
            MATCH (c:EEHRxFCategory {{name: '{cat}'}})
            MERGE (d)-[:HAS_THEME]->(c)
        """)


# ── Print everything ────────────────────────────────────────────────────────

print("\n".join(lines))

import sys
print(f"\n// Estimated new nodes generated: ~{node_count}", file=sys.stderr)
