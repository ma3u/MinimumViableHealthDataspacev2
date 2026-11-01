// ==============================================================================
// Dataset descriptions in more than one language (#782, phase 1)
//
// English stays the source: title, description and hdcatapKeywords. A
// translation is a property with the language as suffix (titleDe,
// descriptionDe, hdcatapKeywordsDe; Fr, Nl, Es likewise). The proxy's
// serialiser (services/neo4j-proxy/src/healthdcat-ap.ts) writes each as a
// value tagged with its language, which is what DCAT-AP asks for and what the
// central catalogue reads; /api/catalog hands them to the catalogue page,
// which shows the language the visitor chose and falls back to English.
//
// Every dataset gets German. French and Dutch are given where the dataset
// comes from a country that speaks them: the Belgian registry in both, the
// French ones in French, the Dutch ones in Dutch.
//
// Runs after register-healthdcat-ap-r8.cypher, which sets the English
// keywords the German ones are made from. SET, not coalesce: this file is the
// source of the translations, and a corrected one should reach the graph.
// A dataset that is not in the graph (the federated ones before the enricher
// ran) is skipped by the MATCH. Idempotent.
// ==============================================================================

// ── 1. Titles and descriptions ──
UNWIND [
  {id: 'dataset:antimicrobial-resist-ecdc',
   de: ['ECDC Antibiotikaresistenz 2025', 'EU-weite Surveillance-Daten zu antimikrobiellen Resistenzen, EARS-Net-Export in FHIR.']},
  {id: 'dataset:cardiac-outcomes-eu-2025',
   de: ['EU-Register kardialer Behandlungsergebnisse 2025', 'Föderiertes Register kardialer Ereignisse, EuroHeart und EHDS-Pilot.']},
  {id: 'dataset:covid-long-haulers-be',
   de: ['Belgisches Long-COVID-Register', 'Erfassung von Post-COVID-Symptomen, 18 Monate Nachbeobachtung, FHIR R4.'],
   fr: ['Registre belge du COVID long', 'Suivi des symptômes post-COVID, 18 mois de suivi, FHIR R4.'],
   nl: ['Belgisch register voor long covid', 'Opvolging van post-covidklachten, 18 maanden follow-up, FHIR R4.']},
  {id: 'dataset:dental-health-who-euro',
   de: ['WHO-EURO-Studie zur Mundgesundheit 2025', 'Zahnärztliche Untersuchungsdaten aus 20 europäischen Ländern.']},
  {id: 'dataset:diabetes-retinopathy-uk',
   de: ['Britisches Screening auf diabetische Retinopathie', 'Netzhautbilder und FHIR-Observations aus dem NHS-Screening.']},
  {id: 'dataset:genomics-1m-genomes',
   de: ['Referenzkohorte 1M Genomes', 'Genomische Varianten und Phänotypen aus der EU-Initiative 1+Million Genomes.']},
  {id: 'dataset:geriatric-falls-de-2024',
   de: ['Studie zur Sturzprävention in der Geriatrie DE', 'Multizentrischer Datensatz zur Bewertung des Sturzrisikos in FHIR R4.']},
  {id: 'dataset:lung-cancer-screening-nl',
   de: ['NL-Kohorte Lungenkrebs-Screening', 'Screening-Kohorte mit Niedrigdosis-CT (NELSON-Nachbeobachtung), FHIR R4.'],
   nl: ['Nederlands cohort longkankerscreening', 'Screeningcohort met lagedosis-CT (NELSON-follow-up), FHIR R4.']},
  {id: 'dataset:maternal-health-who-afro',
   de: ['WHO-AFRO-Datensatz Müttergesundheit', 'Behandlungsergebnisse von Müttern und Neugeborenen aus 12 afrikanischen Ländern.']},
  {id: 'dataset:mental-health-eu-pilot',
   de: ['EU-Pilot zur Sekundärnutzung, psychische Gesundheit', 'Kohorte zur psychischen Gesundheit nach EHDS Art. 53 aus 5 Mitgliedstaaten.']},
  {id: 'dataset:occupational-health-eu',
   de: ['EU-Register Arbeitsmedizin', 'Daten zu Expositionen am Arbeitsplatz und ihren gesundheitlichen Folgen, FHIR und OMOP.']},
  {id: 'dataset:omop-cdm-v54-analytics',
   de: ['Analysedatenbank OMOP CDM v5.4', 'Analysedatenbank nach OMOP CDM v5.4 mit standardisierten klinischen Daten aus FHIR R4.']},
  {id: 'dataset:organ-transplant-eurotx',
   de: ['EuroTransplant-Datensatz zur Organzuteilung', 'Daten zu Behandlungsergebnissen nach Transplantation aus 8 Ländern.']},
  {id: 'dataset:paediatric-asthma-scand',
   de: ['Skandinavische Kohorte Asthma bei Kindern', 'Geburtskohortenstudie zu Asthma im Kindesalter in DK, SE und NO.']},
  {id: 'dataset:pharmacovigilance-ema',
   de: ['EMA-Signaldaten Pharmakovigilanz', 'Signaldaten zu Nebenwirkungen von Arzneimitteln aus EudraVigilance.']},
  {id: 'dataset:prostate-cancer-registry',
   de: ['Multizentrisches Prostatakrebsregister', 'Föderiertes Register zu Behandlungsergebnissen bei Prostatakrebs mit TNM-Stadien und Gleason-Scores in FHIR R4.']},
  {id: 'dataset:rare-disease-erdera-2026',
   de: ['ERDERA-Kompendium seltene Erkrankungen', 'Phänotypdaten seltener Erkrankungen aus den Europäischen Referenznetzwerken.']},
  {id: 'dataset:stroke-rehab-fr-2025',
   de: ['Französische Ergebnisse der Schlaganfall-Rehabilitation', 'Verläufe der motorischen Erholung nach einem Schlaganfall, FHIR und ICF.'],
   fr: ['Résultats de la rééducation après AVC en France', 'Trajectoires de récupération motrice après un AVC, FHIR et CIF.']},
  // English has no description for these two; the title stands in, in
  // every language (the serialiser does the same).
  {id: 'dataset:synthea-fhir-r4-mvd',
   de: ['Synthetische FHIR-R4-Patientenkohorte (Synthea)', null]},
  {id: 'urn:uuid:riverside:dataset:diab-001',
   de: ['Synthetischer Patientenverlauf Typ-2-Diabetes', null]},
  // The federated datasets, which the catalogue enricher writes from the
  // participants' DSP catalogues (ui/src/app/api/mock-dsp).
  {id: 'dataset:alpha:t2dm-registry-2026',
   de: ['Typ-2-Diabetes-Register Berlin 2026', 'Längsschnittregister mit 2.400 Patientinnen und Patienten mit Typ-2-Diabetes: HbA1c, BMI, Behandlungsarm und 5 Jahre Nachbeobachtung. Auf OMOP abgebildet.']},
  {id: 'dataset:alpha:cv-icu-2025',
   de: ['Kardiovaskuläre Intensivverläufe AlphaKlinik 2025', 'De-identifizierte Intensivaufnahmen mit kardiovaskulärer Hauptdiagnose, 30-Tage-Mortalität und Verweildauer.']},
  {id: 'dataset:lmc:t2dm-crossborder-2026',
   de: ['Grenzüberschreitende T2DM-Kohorte Limburg 2026', 'Patientinnen und Patienten mit Typ-2-Diabetes, versorgt in der Grenzregion NL/DE/BE, mit Unterlagen zur gemeinsamen Versorgung.'],
   nl: ['Grensoverschrijdend T2DM-cohort Limburg 2026', 'Patiënten met diabetes type 2, behandeld in de grensregio NL/DE/BE, met gegevens over gedeelde zorg.']},
  {id: 'dataset:pharmaco:oncology-phase2-2025',
   de: ['Onkologische Phase-II-Studie, Immuntherapie-Kohorte', 'Daten einer klinischen Phase-II-Studie zu einem PD-L1-Inhibitor, 180 Teilnehmende, 18 Monate Nachbeobachtung, Endpunkte nach RECIST 1.1.']},
  {id: 'dataset:irs:rare-diseases-fr-2026',
   de: ['Auszug aus dem französischen nationalen Register seltener Erkrankungen', 'Pseudonymisierte Kohorte von 4.200 Patientinnen und Patienten mit seltenen Erkrankungen, mit ICD-10- und Orphanet-Codes und Behandlungsverläufen.'],
   fr: ['Extrait du registre national français des maladies rares', 'Cohorte pseudonymisée de 4 200 patients atteints de maladies rares, avec codes CIM-10 et Orphanet et parcours de soins longitudinaux.']}
] AS row
MATCH (d:HealthDataset {datasetId: row.id})
SET d.titleDe = row.de[0],
    d.descriptionDe = row.de[1],
    d.titleFr = row.fr[0],
    d.descriptionFr = row.fr[1],
    d.titleNl = row.nl[0],
    d.descriptionNl = row.nl[1];

// ── 2. Keywords ──
// Made from the English ones (register-healthdcat-ap-r8.cypher section 1).
// A keyword with no entry here is left out of that language rather than
// tagged with a language it is not in.
WITH {
  `Infectious Disease`: 'Infektionskrankheiten', Cardiology: 'Kardiologie',
  Dentistry: 'Zahnmedizin', Ophthalmology: 'Augenheilkunde', Genomics: 'Genomik',
  Geriatrics: 'Geriatrie', Oncology: 'Onkologie', `Maternal Health`: 'Müttergesundheit',
  Psychiatry: 'Psychiatrie', `Occupational Health`: 'Arbeitsmedizin',
  `Clinical Research`: 'Klinische Forschung', `Transplant Medicine`: 'Transplantationsmedizin',
  Paediatrics: 'Pädiatrie', Pharmacovigilance: 'Pharmakovigilanz',
  `Rare Diseases`: 'Seltene Erkrankungen', Neurology: 'Neurologie',
  SurveillanceData: 'Surveillance-Daten', RegistryData: 'Registerdaten',
  CohortStudy: 'Kohortenstudie', SurveyData: 'Befragungsdaten', ImagingData: 'Bilddaten',
  GenomicData: 'Genomdaten', ObservationalStudy: 'Beobachtungsstudie',
  ClinicalTrial: 'Klinische Studie', ResourceData: 'Ressourcendaten',
  SecondaryUse: 'Sekundärnutzung', AnalyticsData: 'Analysedaten',
  OutcomeStudy: 'Ergebnisstudie', SafetyData: 'Sicherheitsdaten',
  `synthetic data`: 'synthetische Daten', `EHDS secondary use`: 'EHDS-Sekundärnutzung'
} AS de, {
  `Infectious Disease`: 'Maladies infectieuses', Neurology: 'Neurologie',
  `Rare Diseases`: 'Maladies rares', CohortStudy: 'Étude de cohorte',
  OutcomeStudy: 'Étude de résultats', RegistryData: 'Données de registre',
  `synthetic data`: 'données synthétiques', `EHDS secondary use`: 'utilisation secondaire EHDS'
} AS fr, {
  `Infectious Disease`: 'Infectieziekten', Oncology: 'Oncologie',
  CohortStudy: 'Cohortonderzoek', ClinicalTrial: 'Klinische studie',
  RegistryData: 'Registergegevens',
  `synthetic data`: 'synthetische gegevens', `EHDS secondary use`: 'secundair gebruik EHDS'
} AS nl
MATCH (d:HealthDataset)
WHERE d.titleDe IS NOT NULL
WITH d, de, fr, nl, coalesce(d.hdcatapKeywords, []) AS en
SET d.hdcatapKeywordsDe = [k IN en WHERE de[k] IS NOT NULL | de[k]],
    d.hdcatapKeywordsFr = CASE WHEN d.titleFr IS NULL THEN null
                               ELSE [k IN en WHERE fr[k] IS NOT NULL | fr[k]] END,
    d.hdcatapKeywordsNl = CASE WHEN d.titleNl IS NULL THEN null
                               ELSE [k IN en WHERE nl[k] IS NOT NULL | nl[k]] END;
