// ==============================================================================
// Phase 26d: hand-curated NL → code glossary.
//
// The NLQ templates in services/neo4j-proxy/src/index.ts read from these
// nodes to expand natural-language terms into SNOMED / ICD-10 / ISO-2
// codes. Deliberately small (≤100 entries) so each row gets a PR review;
// ADR-019's embeddings will replace this when they ship.
//
// Idempotent — MERGE-only. Safe to re-run.
// ==============================================================================

// ── Country aliases: NL terms → ISO-2 country code ──────────────────────────
UNWIND [
  // German-speaking
  {term: 'german', code: 'DE'},
  {term: 'germany', code: 'DE'},
  {term: 'deutschland', code: 'DE'},
  // Dutch-speaking
  {term: 'dutch', code: 'NL'},
  {term: 'netherlands', code: 'NL'},
  {term: 'holland', code: 'NL'},
  // French-speaking
  {term: 'french', code: 'FR'},
  {term: 'france', code: 'FR'},
  // EU baselines
  {term: 'belgian', code: 'BE'},
  {term: 'belgium', code: 'BE'},
  {term: 'austrian', code: 'AT'},
  {term: 'austria',  code: 'AT'},
  {term: 'italian',  code: 'IT'},
  {term: 'italy',    code: 'IT'}
] AS row
MERGE (g:NlqGlossary {kind: 'country', term: row.term})
  SET g.code = row.code;

// ── Clinical concept aliases: NL terms → SNOMED concept ID ─────────────────
// Includes indications (hepatology, diabetes, oncology, ...) AND symptoms that
// surface as side-effects (headache, nausea, ...). The NLQ pharmacovigilance
// template tags the role (indication vs. side-effect) from the surrounding
// question text — a term can play either role depending on phrasing.
UNWIND [
  // Diabetes family — the demo query
  {term: 'diabetes',          code: '73211009',  system: 'snomed', display: 'Diabetes mellitus',        icd10: 'E14'},
  {term: 'type 2 diabetes',   code: '44054006',  system: 'snomed', display: 'Diabetes mellitus type 2', icd10: 'E11'},
  {term: 't2dm',              code: '44054006',  system: 'snomed', display: 'Diabetes mellitus type 2', icd10: 'E11'},
  {term: 'type 1 diabetes',   code: '46635009',  system: 'snomed', display: 'Diabetes mellitus type 1', icd10: 'E10'},
  // Cardiovascular
  {term: 'cardiovascular',    code: '49601007',  system: 'snomed', display: 'Disorder of cardiovascular system', icd10: 'I51'},
  {term: 'cardiac',           code: '49601007',  system: 'snomed', display: 'Disorder of cardiovascular system', icd10: 'I51'},
  {term: 'heart disease',     code: '56265001',  system: 'snomed', display: 'Heart disease',                     icd10: 'I51.9'},
  // Oncology
  {term: 'cancer',            code: '363346000', system: 'snomed', display: 'Malignant neoplastic disease', icd10: 'C80'},
  {term: 'oncology',          code: '363346000', system: 'snomed', display: 'Malignant neoplastic disease', icd10: 'C80'},
  {term: 'tumour',            code: '363346000', system: 'snomed', display: 'Malignant neoplastic disease', icd10: 'C80'},
  // Rare disease
  {term: 'rare disease',      code: '49649001',  system: 'snomed', display: 'Rare disease',  icd10: ''},
  {term: 'orphan disease',    code: '49649001',  system: 'snomed', display: 'Rare disease',  icd10: ''},
  // Infectious disease — indication for the canonical pharmacovigilance demo
  {term: 'uti',               code: '68566005',  system: 'snomed', display: 'Urinary tract infectious disease', icd10: 'N39.0'},
  {term: 'urinary tract infection', code: '68566005', system: 'snomed', display: 'Urinary tract infectious disease', icd10: 'N39.0'},
  // Hepatology
  {term: 'psc',               code: '197441003', system: 'snomed', display: 'Primary sclerosing cholangitis', icd10: 'K83.0'},
  {term: 'primary sclerosing cholangitis', code: '197441003', system: 'snomed', display: 'Primary sclerosing cholangitis', icd10: 'K83.0'},
  {term: 'pbc',               code: '31712002',  system: 'snomed', display: 'Primary biliary cholangitis',    icd10: 'K74.3'},
  {term: 'cholangitis',       code: '82403002',  system: 'snomed', display: 'Cholangitis',                    icd10: 'K83.0'},
  // Adverse-drug-reaction symptoms / side-effects
  {term: 'tendon rupture',     code: '262615006',system: 'snomed', display: 'Rupture of tendon',        icd10: 'M66.9'},
  {term: 'tendinitis',         code: '202882001',system: 'snomed', display: 'Tendinitis',               icd10: 'M77.9'},
  {term: 'tendinopathy',       code: '202882001',system: 'snomed', display: 'Tendinopathy',             icd10: 'M77.9'},
  {term: 'headache',           code: '25064002', system: 'snomed', display: 'Headache',                 icd10: 'R51'},
  {term: 'migraine',           code: '37796009', system: 'snomed', display: 'Migraine',                 icd10: 'G43.9'},
  {term: 'nausea',             code: '422587007',system: 'snomed', display: 'Nausea',                   icd10: 'R11.0'},
  {term: 'vomiting',           code: '422400008',system: 'snomed', display: 'Vomiting',                 icd10: 'R11.1'},
  {term: 'fatigue',            code: '84229001', system: 'snomed', display: 'Fatigue',                  icd10: 'R53'},
  {term: 'dizziness',          code: '404640003',system: 'snomed', display: 'Dizziness',                icd10: 'R42'},
  {term: 'pruritus',           code: '418363000',system: 'snomed', display: 'Itching',                  icd10: 'L29.9'},
  {term: 'itching',            code: '418363000',system: 'snomed', display: 'Itching',                  icd10: 'L29.9'}
] AS row
MERGE (g:NlqGlossary {kind: 'concept', term: row.term})
  SET g.code    = row.code,
      g.system  = row.system,
      g.display = row.display,
      g.icd10   = row.icd10;

// ── Drug aliases: NL drug names → RxNorm + generic ─────────────────────────
// kind='drug' rows power the pharmacovigilance template (issue #19).
// Ciprofloxacin + tendon rupture is the canonical teaching example —
// well-known FDA class warning on fluoroquinolones, plenty of synthetic data.
UNWIND [
  {term: 'ciprofloxacin',     rxnorm: '2551',    generic: 'ciprofloxacin', display: 'Ciprofloxacin'},
  {term: 'cipro',             rxnorm: '2551',    generic: 'ciprofloxacin', display: 'Ciprofloxacin'},
  {term: 'levofloxacin',      rxnorm: '82122',   generic: 'levofloxacin',  display: 'Levofloxacin'},
  {term: 'fluoroquinolone',   rxnorm: '2551',    generic: 'fluoroquinolone class', display: 'Fluoroquinolone (class)'},
  {term: 'ursodiol',          rxnorm: '10633',   generic: 'ursodiol',      display: 'Ursodiol (UDCA)'},
  {term: 'udca',              rxnorm: '10633',   generic: 'ursodiol',      display: 'Ursodiol (UDCA)'},
  {term: 'metformin',         rxnorm: '6809',    generic: 'metformin',     display: 'Metformin'},
  {term: 'atorvastatin',      rxnorm: '83367',   generic: 'atorvastatin',  display: 'Atorvastatin'},
  {term: 'ibuprofen',         rxnorm: '5640',    generic: 'ibuprofen',     display: 'Ibuprofen'}
] AS row
MERGE (g:NlqGlossary {kind: 'drug', term: row.term})
  SET g.code    = row.rxnorm,
      g.system  = 'rxnorm',
      g.generic = row.generic,
      g.display = row.display;

// ── Credential aliases ─────────────────────────────────────────────────────
UNWIND [
  {term: 'data quality label',       cred: 'DataQualityLabelCredential'},
  {term: 'data quality',              cred: 'DataQualityLabelCredential'},
  {term: 'dql',                       cred: 'DataQualityLabelCredential'},
  {term: 'dataqualitylabelcredential',cred: 'DataQualityLabelCredential'},
  {term: 'research organisation',    cred: 'ResearchOrganisationCredential'},
  {term: 'data user',                 cred: 'DataUserCredential'}
] AS row
MERGE (g:NlqGlossary {kind: 'credential', term: row.term})
  SET g.code = row.cred;

// Index for sub-millisecond CONTAINS lookup on question text.
CREATE INDEX nlq_glossary_term_idx IF NOT EXISTS FOR (g:NlqGlossary) ON (g.term);
CREATE INDEX nlq_glossary_kind_idx IF NOT EXISTS FOR (g:NlqGlossary) ON (g.kind);
