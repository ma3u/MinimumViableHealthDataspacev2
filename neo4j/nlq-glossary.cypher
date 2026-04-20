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
UNWIND [
  // Diabetes family — the demo query
  {term: 'diabetes',          code: '73211009',  system: 'snomed', display: 'Diabetes mellitus'},
  {term: 'type 2 diabetes',   code: '44054006',  system: 'snomed', display: 'Diabetes mellitus type 2'},
  {term: 't2dm',              code: '44054006',  system: 'snomed', display: 'Diabetes mellitus type 2'},
  {term: 'type 1 diabetes',   code: '46635009',  system: 'snomed', display: 'Diabetes mellitus type 1'},
  // Cardiovascular
  {term: 'cardiovascular',    code: '49601007',  system: 'snomed', display: 'Disorder of cardiovascular system'},
  {term: 'cardiac',           code: '49601007',  system: 'snomed', display: 'Disorder of cardiovascular system'},
  {term: 'heart disease',     code: '56265001',  system: 'snomed', display: 'Heart disease'},
  // Oncology
  {term: 'cancer',            code: '363346000', system: 'snomed', display: 'Malignant neoplastic disease'},
  {term: 'oncology',          code: '363346000', system: 'snomed', display: 'Malignant neoplastic disease'},
  {term: 'tumour',            code: '363346000', system: 'snomed', display: 'Malignant neoplastic disease'},
  // Rare disease
  {term: 'rare disease',      code: '49649001',  system: 'snomed', display: 'Rare disease'},
  {term: 'orphan disease',    code: '49649001',  system: 'snomed', display: 'Rare disease'}
] AS row
MERGE (g:NlqGlossary {kind: 'concept', term: row.term})
  SET g.code    = row.code,
      g.system  = row.system,
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
