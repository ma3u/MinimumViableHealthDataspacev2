// ==============================================================================
// Issue #19 — backfill :CODED_BY edges from clinical nodes to ontology nodes.
//
// The hand-authored demo data in insert-synthetic-schema-data.cypher seeds
// CODED_BY edges for a small set of known conditions/meds. Bulk-imported
// Synthea patients, however, only carry Condition.code / MedicationRequest
// .medicationCode / Observation.code as strings on the node — no edge to
// the corresponding :SnomedConcept / :ICD10Code / :RxNormConcept / :LoincCode
// is created. That is why the Natural Language Query screenshot showed an
// empty `snomedTerm` column (issue #19).
//
// This script MERGEs the missing ontology nodes from the codes already
// present on clinical nodes, then MERGEs the :CODED_BY edges. It pattern-
// matches codes heuristically:
//   - SNOMED   — all-numeric, ≥6 digits (conceptId)
//   - ICD-10   — letter prefix + digits, optional .xx (e.g. K83.0, E11)
//   - RxNorm   — all-numeric, ≤10 digits (rxcui) on MedicationRequest
//   - LOINC    — number-number (e.g. 4548-4) on Observation
//
// Idempotent (MERGE-only, IF NOT EXISTS, safe to re-run).
// ==============================================================================

// ── Conditions ──────────────────────────────────────────────────────────────

// SNOMED Concept backfill (numeric, ≥6 digits)
MATCH (c:Condition)
WHERE c.code IS NOT NULL
  AND c.code =~ '^[0-9]{6,18}$'
  AND NOT EXISTS { (c)-[:CODED_BY]->(:SnomedConcept) }
MERGE (sc:SnomedConcept {conceptId: c.code})
  ON CREATE SET sc.display = coalesce(c.display, c.name, c.code)
MERGE (c)-[:CODED_BY]->(sc);

// ICD-10 backfill (letter + digits, optional .NN)
MATCH (c:Condition)
WHERE c.code IS NOT NULL
  AND c.code =~ '^[A-Z][0-9]+(\\.[0-9]+)?$'
  AND NOT EXISTS { (c)-[:CODED_BY]->(:ICD10Code) }
MERGE (icd:ICD10Code {code: c.code})
  ON CREATE SET icd.display = coalesce(c.display, c.name, c.code)
MERGE (c)-[:CODED_BY]->(icd);

// ── Medication requests ─────────────────────────────────────────────────────

// RxNorm RxCUI backfill (all-numeric, ≤10 digits)
MATCH (m:MedicationRequest)
WHERE m.medicationCode IS NOT NULL
  AND m.medicationCode =~ '^[0-9]{1,10}$'
  AND NOT EXISTS { (m)-[:CODED_BY]->(:RxNormConcept) }
MERGE (rx:RxNormConcept {rxcui: m.medicationCode})
  ON CREATE SET rx.display = coalesce(m.display, m.medicationCode)
MERGE (m)-[:CODED_BY]->(rx);

// ── Observations ────────────────────────────────────────────────────────────

// LOINC backfill (number-number format, e.g. 4548-4)
MATCH (o:Observation)
WHERE o.code IS NOT NULL
  AND o.code =~ '^[0-9]+-[0-9]+$'
  AND NOT EXISTS { (o)-[:CODED_BY]->(:LoincCode) }
MERGE (l:LoincCode {loincNumber: o.code})
  ON CREATE SET l.display = coalesce(o.display, o.name, o.code)
MERGE (o)-[:CODED_BY]->(l);

// ── Verification: count the CODED_BY edges produced by category ─────────────
MATCH (c:Condition)-[:CODED_BY]->(sc:SnomedConcept)
WITH count(*) AS conditionSnomedEdges
MATCH (c:Condition)-[:CODED_BY]->(icd:ICD10Code)
WITH conditionSnomedEdges, count(*) AS conditionIcd10Edges
MATCH (m:MedicationRequest)-[:CODED_BY]->(rx:RxNormConcept)
WITH conditionSnomedEdges, conditionIcd10Edges, count(*) AS medRxnormEdges
MATCH (o:Observation)-[:CODED_BY]->(l:LoincCode)
RETURN conditionSnomedEdges, conditionIcd10Edges, medRxnormEdges,
       count(*) AS obsLoincEdges;
