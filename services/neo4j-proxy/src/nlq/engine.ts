import neo4j from "neo4j-driver";
import { type RerankCandidate, type RerankDecision } from "../graphrag.js";
import {
  ANTHROPIC_API_KEY,
  ANTHROPIC_MODEL,
  AZURE_OPENAI_API_KEY,
  AZURE_OPENAI_GPT4O_URL,
  OLLAMA_MODEL,
  OLLAMA_URL,
  OPENAI_API_KEY,
  OPENAI_MODEL,
} from "../config.js";
import { driver } from "../db.js";

// ---- Phase 5c: Natural Language Query (Text2Cypher) -------------------------

/**
 * Template-based query patterns for common health data questions.
 * Each pattern has a regex matcher, a Cypher template, and a parameter extractor.
 */
/**
 * Knowledge-graph layer identifier. See CLAUDE.md § 5-Layer Neo4j Knowledge Graph
 * for the canonical description. Used by the NLQ handler to show a researcher
 * which layers a given question traverses.
 */
export type GraphLayer = "L1" | "L2" | "L3" | "L4" | "L5";

/**
 * A labelled section of the generated Cypher — the UI renders each section
 * with its own header so the researcher can see what each clause is doing
 * (e.g. "cohort: indication filter", "side-effect projection").
 */
export interface CypherSection {
  label: string;
  cypher: string;
  layer?: GraphLayer;
}

interface QueryTemplate {
  name: string;
  patterns: RegExp[];
  cypher: string;
  extractParams: (
    match: RegExpMatchArray,
    question: string,
  ) => Record<string, any>;
  description: string;
  /**
   * Which of the 5 Neo4j graph layers this template traverses. Surfaced
   * in the UI so the researcher sees the business question mapped to the
   * dataspace's 5-layer model. Order is arbitrary; layers are de-duped.
   */
  graphLayers?: GraphLayer[];
  /**
   * Optional structured breakdown of the Cypher. When set, the UI renders
   * each section with a heading + colour-coded border. When absent, the
   * raw `cypher` string is shown unannotated.
   */
  cypherSections?: CypherSection[];
}

export const QUERY_TEMPLATES: QueryTemplate[] = [
  {
    name: "patient_count",
    patterns: [
      /how many patients/i,
      /(?:total|number of) patients/i,
      /patient count/i,
    ],
    cypher: "MATCH (p:Patient) RETURN count(p) AS patientCount",
    extractParams: () => ({}),
    description: "Count total patients in the knowledge graph",
  },
  {
    name: "patient_by_gender",
    patterns: [
      /patients by gender/i,
      /gender (?:breakdown|distribution|split)/i,
      /(?:male|female) patients/i,
    ],
    cypher: `MATCH (p:Patient)
             RETURN p.gender AS gender, count(p) AS count
             ORDER BY count DESC`,
    extractParams: () => ({}),
    description: "Patient count grouped by gender",
  },
  {
    name: "top_conditions",
    patterns: [
      /(?:top|most common|frequent) (?:\d+ )?conditions/i,
      /what (?:are the |)(?:most common |top |)conditions/i,
      /common diseases/i,
    ],
    cypher: `MATCH (c:Condition)
             RETURN coalesce(c.display, c.name) AS condition, count(*) AS count
             ORDER BY count DESC
             LIMIT $limit`,
    extractParams: (_match, question) => {
      const numMatch = question.match(/(\d+)/);
      return { limit: neo4j.int(numMatch ? parseInt(numMatch[1]) : 10) };
    },
    description: "Most common conditions/diagnoses",
  },
  {
    name: "top_medications",
    patterns: [
      /(?:top|most (?:common|prescribed)) (?:\d+ )?(?:medications|drugs|prescriptions)/i,
      /what (?:are |)(?:the )?(?:most )?(?:common |prescribed |)(?:medications|drugs)/i,
    ],
    cypher: `MATCH (m:MedicationRequest)
             RETURN coalesce(m.display, m.name) AS medication, count(*) AS count
             ORDER BY count DESC
             LIMIT $limit`,
    extractParams: (_match, question) => {
      const numMatch = question.match(/(\d+)/);
      return { limit: neo4j.int(numMatch ? parseInt(numMatch[1]) : 10) };
    },
    description: "Most commonly prescribed medications",
  },
  {
    name: "patient_journey",
    patterns: [
      /(?:patient|person) (?:journey|timeline|history) (?:for |of )?(.+)/i,
      /show (?:me )?(?:the )?(?:journey|timeline|history) (?:for |of )?(.+)/i,
      /what happened to (.+)/i,
    ],
    cypher: `MATCH (p:Patient)
             WHERE toLower(p.name) CONTAINS toLower($name) OR p.id = $name
             OPTIONAL MATCH (p)-[:HAS_ENCOUNTER]->(e:Encounter)
             OPTIONAL MATCH (p)-[:HAS_CONDITION]->(c:Condition)
             RETURN p.name AS patient, p.gender AS gender, p.birthDate AS birthDate,
                    collect(DISTINCT {type: 'Encounter', name: e.name, date: e.date}) AS encounters,
                    collect(DISTINCT {type: 'Condition', name: c.name, onset: c.onsetDate}) AS conditions
             LIMIT 1`,
    extractParams: (match) => ({ name: (match[1] || "").trim() }),
    description: "Patient journey with encounters and conditions",
  },
  {
    name: "condition_prevalence",
    patterns: [
      /(?:prevalence|rate) of (.+)/i,
      /how (?:common|prevalent) is (.+)/i,
      /patients with (.+)/i,
    ],
    cypher: `MATCH (p:Patient)
             WITH count(p) AS total
             MATCH (c:Condition)
             WHERE toLower(coalesce(c.display, c.name, '')) CONTAINS toLower($condition)
             WITH total, coalesce(c.display, c.name) AS condition, count(DISTINCT c) AS occurrences
             RETURN condition, occurrences, total,
                    round(toFloat(occurrences) / total * 100, 2) AS prevalencePercent
             ORDER BY occurrences DESC
             LIMIT 5`,
    extractParams: (match) => ({ condition: (match[1] || "").trim() }),
    description: "Prevalence of a specific condition",
  },
  {
    name: "encounters_by_type",
    patterns: [
      /encounters by (?:type|class)/i,
      /(?:type|class)(?:es)? of encounters/i,
      /encounter (?:types|classes)/i,
    ],
    cypher: `MATCH (e:Encounter)
             RETURN e.class AS encounterClass, count(*) AS count
             ORDER BY count DESC`,
    extractParams: () => ({}),
    description: "Encounters grouped by type/class",
  },
  {
    name: "omop_cohort_stats",
    patterns: [
      /omop (?:cohort |)(?:stats|statistics|overview)/i,
      /research (?:cohort |)(?:overview|stats)/i,
      /secondary use (?:data |)(?:stats|overview)/i,
    ],
    cypher: `MATCH (op:OMOPPerson) WITH count(op) AS persons
             MATCH (ov:OMOPVisitOccurrence) WITH persons, count(ov) AS visits
             MATCH (oc:OMOPConditionOccurrence) WITH persons, visits, count(oc) AS conditions
             MATCH (om:OMOPMeasurement) WITH persons, visits, conditions, count(om) AS measurements
             MATCH (od:OMOPDrugExposure) WITH persons, visits, conditions, measurements, count(od) AS drugs
             RETURN persons, visits, conditions, measurements, drugs`,
    extractParams: () => ({}),
    description: "OMOP CDM aggregate statistics",
  },
  // ── Phase 26d federated-discovery templates ────────────────────────────────
  //
  // These use the :NlqGlossary nodes seeded by neo4j/nlq-glossary.cypher to
  // expand natural-language terms into SNOMED concept IDs + ISO-2 country
  // codes, then filter across the `source: "federated"` HealthDataset rows
  // the catalog-enricher writes. The question text is the only param — the
  // Cypher does the glossary join so new terms are live as soon as ops MERGE
  // them in, without any proxy redeploy.
  {
    name: "federated_dataset_search",
    patterns: [
      // "find/show/list [all] [any words] datasets/studies"
      /(?:find|show|list) (?:all |).*?(?:datasets|studies)/i,
      /datasets (?:across|from|about|in|with)/i,
      /(?:data|studies) (?:available|about|on)/i,
    ],
    cypher: `
      OPTIONAL MATCH (gc:NlqGlossary {kind: 'concept'})
        WHERE toLower($question) CONTAINS gc.term
      WITH collect(DISTINCT gc.code) AS snomedCodes
      OPTIONAL MATCH (gg:NlqGlossary {kind: 'country'})
        WHERE toLower($question) CONTAINS gg.term
      WITH snomedCodes, collect(DISTINCT gg.code) AS countries
      OPTIONAL MATCH (gk:NlqGlossary {kind: 'credential'})
        WHERE toLower($question) CONTAINS gk.term
      WITH snomedCodes, countries, collect(DISTINCT gk.code) AS credentials
      MATCH (d:HealthDataset)
      WHERE coalesce(d.source, 'local') IN ['federated', 'local']
      OPTIONAL MATCH (d)-[:HAS_THEME]->(t)
      OPTIONAL MATCH (d)-[:PUBLISHED_BY]->(p:Participant)
      OPTIONAL MATCH (d)-[:GOVERNED_BY]->(pol:OdrlPolicy)
      WITH d, p, pol, snomedCodes, countries, credentials,
           collect(DISTINCT t.code) AS themeCodes
      WHERE (size(snomedCodes) = 0 OR any(c IN themeCodes WHERE c IN snomedCodes))
        AND (size(countries) = 0 OR coalesce(p.country, d.country) IN countries)
        AND (size(credentials) = 0 OR any(c IN credentials
             WHERE toLower(coalesce(pol.json, '')) CONTAINS toLower(c)))
      RETURN d.datasetId     AS datasetId,
             d.title          AS title,
             coalesce(p.name, d.publisherDid, 'unknown') AS publisher,
             coalesce(p.country, d.country)              AS country,
             d.source         AS source,
             themeCodes       AS themeCodes,
             d.lastSeenAt     AS lastSeenAt
      // Not DESC NULLS LAST: that is Cypher 25, and Neo4j 5.26 rejects it with
      // "Invalid input 'NULLS'", so this template failed on every call.
      ORDER BY lastSeenAt IS NULL, lastSeenAt DESC, title
      LIMIT 50
    `,
    extractParams: (_match, question) => ({ question }),
    description:
      "Find datasets across the dataspace — expands NL terms via glossary (diabetes, German hospitals, DataQualityLabelCredential, ...)",
  },
  {
    name: "participant_count_by_theme",
    patterns: [
      /how many (?:hospitals|organi[sz]ations|participants|clinics|institutes) (?:offer|publish|have)/i,
      /who (?:offers|publishes|has) (?:datasets |data |)(?:about|on|for)/i,
      /(?:count|number) of (?:hospitals|organi[sz]ations|participants) (?:with|offering)/i,
    ],
    cypher: `
      OPTIONAL MATCH (gc:NlqGlossary {kind: 'concept'})
        WHERE toLower($question) CONTAINS gc.term
      WITH collect(DISTINCT gc.code) AS snomedCodes
      MATCH (p:Participant)<-[:PUBLISHED_BY]-(d:HealthDataset)
      OPTIONAL MATCH (d)-[:HAS_THEME]->(t)
      WITH p, snomedCodes, collect(DISTINCT t.code) AS themeCodes
      WHERE size(snomedCodes) = 0
         OR any(c IN themeCodes WHERE c IN snomedCodes)
      RETURN p.name            AS participant,
             p.country          AS country,
             p.walletType       AS walletType,
             count(*)           AS matchingDatasets
      ORDER BY matchingDatasets DESC, p.name
    `,
    extractParams: (_match, question) => ({ question }),
    description:
      "Count participants offering datasets matching a theme (e.g. 'how many hospitals offer oncology datasets')",
  },
  {
    name: "dataset_with_credential",
    patterns: [
      // "find/list/show datasets with/requiring/needing [a] credential|cred|DQL|quality label|DataQualityLabel"
      /(?:find|list|show) (?:datasets|data) (?:with|requiring|needing) (?:a |the |)(?:credential|cred|DQL|DataQualityLabel|quality label)/i,
      /datasets? (?:require|with|needing) (?:the |a |)(?:DataQualityLabel|DQL|quality label)/i,
      /(?:credential-gated|credential required) datasets/i,
    ],
    cypher: `
      OPTIONAL MATCH (gk:NlqGlossary {kind: 'credential'})
        WHERE toLower($question) CONTAINS gk.term
      WITH collect(DISTINCT gk.code) AS credentials
      MATCH (d:HealthDataset)-[:GOVERNED_BY]->(pol:OdrlPolicy)
      WHERE size(credentials) = 0
         OR any(c IN credentials
                WHERE toLower(coalesce(pol.json, '')) CONTAINS toLower(c))
      OPTIONAL MATCH (d)-[:PUBLISHED_BY]->(p:Participant)
      RETURN d.datasetId AS datasetId,
             d.title      AS title,
             coalesce(p.name, d.publisherDid, 'unknown') AS publisher,
             pol.policyId AS policyId
      ORDER BY d.title
      LIMIT 50
    `,
    extractParams: (_match, question) => ({ question }),
    description:
      "Datasets whose ODRL policy requires a credential (e.g. DataQualityLabelCredential)",
  },
  {
    name: "age_distribution",
    patterns: [
      /age (?:distribution|breakdown|range)/i,
      /(?:patients|people) by age/i,
      /how old are (?:the |)patients/i,
    ],
    cypher: `MATCH (p:Patient)
             WHERE p.birthDate IS NOT NULL AND p.deceased IS NULL
             WITH p, duration.between(date(p.birthDate), date()).years AS age
             WITH CASE
               WHEN age < 18 THEN '0-17'
               WHEN age < 30 THEN '18-29'
               WHEN age < 45 THEN '30-44'
               WHEN age < 60 THEN '45-59'
               WHEN age < 75 THEN '60-74'
               ELSE '75+'
             END AS ageGroup, count(*) AS count
             RETURN ageGroup, count ORDER BY ageGroup`,
    extractParams: () => ({}),
    description: "Patient age distribution in ranges",
  },
  // ── Pharmacovigilance (issue #19) ───────────────────────────────────────────
  //
  // Matches questions of the form:
  //   "Is <side-effect> frequently observed in patients treated with <drug>
  //    diagnosed with <indication>?"
  //
  // The Cypher params (drugCode, drugText, indicationCode, indicationText,
  // sideEffectCode, sideEffectText) are resolved by the handler via
  // resolveAdverseEventContext() using the :NlqGlossary kind:'drug' and
  // kind:'concept' rows — do NOT rely on extractParams here. extractParams
  // returns a stub so the generic handler can still call it; the real
  // resolution happens post-match.
  {
    name: "adverse_event_in_cohort",
    patterns: [
      // "is <X> (frequently|commonly|often) (observed|seen|reported) in patients treated with <Y> diagnosed with <Z>"
      /\bis\s+.+?\s+(?:frequently|commonly|often)?\s*(?:observed|seen|reported|prevalent|common|frequent)\s+in\s+patients\s+(?:treated|being\s+treated)\s+with\s+.+?\s+(?:diagnosed|with\s+diagnosis\s+of|who\s+have)\s+.+/i,
      // "how (often|common|frequent) is <X> in patients treated with <Y> diagnosed with <Z>"
      /\bhow\s+(?:often|common|frequent(?:ly)?)\s+(?:is|are)\s+.+?\s+in\s+patients\s+(?:treated|being\s+treated)\s+with\s+.+?\s+(?:diagnosed|with\s+diagnosis\s+of|who\s+have)\s+.+/i,
      // reordered: "is <X> (common|observed|...) in patients (with diagnosis of|who have) <Z> treated with <Y>"
      /\bis\s+.+?\s+(?:frequently|commonly|often)?\s*(?:observed|seen|reported|prevalent|common|frequent)\s+in\s+patients\s+(?:diagnosed|with\s+diagnosis\s+of|who\s+have)\s+.+?\s+(?:treated|being\s+treated)\s+with\s+.+/i,
      // "side effects of <Y> in <Z>" — lightweight alias
      /\b(?:side\s+effects?|adverse\s+events?)\s+of\s+.+?\s+(?:in|for|among)\s+.+/i,
    ],
    // Two-stage Cypher:
    //  1) resolve cohort: patients with indication ∩ patients treated with drug
    //  2) measure side-effect frequency in that cohort
    // Each role is OPTIONAL. When a role is unresolved (both its code and
    // text params are null), that sub-cohort falls back to "all patients",
    // so partial questions still return meaningful rows. The UI's
    // interpretation panel tells the researcher which terms resolved and
    // which fell back to the full population.
    cypher: `
      MATCH (p:Patient)
      WITH collect(DISTINCT p) AS allPatients, count(DISTINCT p) AS populationSize

      // Sub-cohort: patients with the indication, or all patients if
      // no indication was resolved.
      CALL {
        WITH allPatients
        UNWIND allPatients AS p
        OPTIONAL MATCH (p)-[:HAS_CONDITION]->(c:Condition)
        WHERE ($indicationCode IS NOT NULL AND c.code = $indicationCode)
           OR ($indicationText IS NOT NULL
               AND toLower(coalesce(c.display, c.name, '')) CONTAINS $indicationText)
        WITH p, count(c) AS indicationHits
        WHERE ($indicationCode IS NULL AND $indicationText IS NULL)
           OR indicationHits > 0
        RETURN collect(DISTINCT p) AS indicationCohort
      }

      // Sub-cohort: patients treated with the drug, or all patients if
      // no drug was resolved. Synthea seed data uses two relationship
      // names — :HAS_MEDICATION (Synthea-style, ~3.9k edges, code on .code)
      // and :HAS_MEDICATION_REQUEST (FHIR-style, on .medicationCode);
      // match both so the cohort is complete on either backing dataset.
      CALL {
        WITH allPatients
        UNWIND allPatients AS p
        OPTIONAL MATCH (p)-[:HAS_MEDICATION|HAS_MEDICATION_REQUEST]->(m)
        WHERE ($drugCode IS NOT NULL AND
               (m.medicationCode = $drugCode OR m.code = $drugCode))
           OR ($drugText IS NOT NULL
               AND toLower(coalesce(m.display, m.medicationCode, m.code, ''))
                   CONTAINS $drugText)
        WITH p, count(m) AS drugHits
        WHERE ($drugCode IS NULL AND $drugText IS NULL)
           OR drugHits > 0
        RETURN collect(DISTINCT p) AS drugCohort
      }

      WITH populationSize, indicationCohort, drugCohort,
           [p IN indicationCohort WHERE p IN drugCohort] AS cohort
      WITH populationSize,
           size(indicationCohort) AS indicationCohortSize,
           size(drugCohort)       AS drugCohortSize,
           size(cohort)           AS cohortSize,
           cohort

      // Side-effect measurement inside the cohort. OPTIONAL MATCH + WHERE
      // keeps cohort members with no matching side-effect as (cp, se=null)
      // rows, so we count only the cps for which se actually matched
      // via a CASE-gated count below.
      UNWIND (CASE WHEN size(cohort) = 0 THEN [null] ELSE cohort END) AS cp
      OPTIONAL MATCH (cp)-[:HAS_CONDITION|HAS_OBSERVATION]->(se)
      WHERE cp IS NOT NULL
        AND (($sideEffectCode IS NOT NULL AND se.code = $sideEffectCode)
             OR ($sideEffectText IS NOT NULL
                 AND toLower(coalesce(se.display, se.name, '')) CONTAINS $sideEffectText))
      WITH populationSize, indicationCohortSize, drugCohortSize, cohortSize,
           count(DISTINCT CASE WHEN se IS NOT NULL THEN cp END) AS affected
      RETURN populationSize,
             indicationCohortSize,
             drugCohortSize,
             cohortSize        AS cohortWithIndicationAndDrug,
             affected          AS patientsWithSideEffect,
             CASE WHEN cohortSize > 0
                  THEN round(toFloat(affected) / cohortSize * 100, 2)
                  ELSE 0.0 END AS frequencyPct
    `,
    // Real params are injected by the handler after glossary resolution; this
    // stub only seeds $question for tests that bypass the handler.
    extractParams: (_match, question) => ({
      question,
      drugCode: null,
      drugText: null,
      indicationCode: null,
      indicationText: null,
      sideEffectCode: null,
      sideEffectText: null,
    }),
    description:
      "Pharmacovigilance cohort: side-effect frequency in patients treated with a drug for an indication (issue #19)",
    // L3 FHIR clinical (Patient/Condition/MedicationRequest) + L5 ontology
    // via the glossary-resolved codes; the UI renders this as a layer
    // breadcrumb so the researcher sees which layers answer the question.
    graphLayers: ["L3", "L5"],
    // Structured breakdown so the UI can colour-code each clause.
    cypherSections: [
      {
        label: "Population",
        layer: "L3",
        cypher: `MATCH (p:Patient)
WITH collect(DISTINCT p) AS allPatients, count(DISTINCT p) AS populationSize`,
      },
      {
        label: "Indication sub-cohort (or all patients if unresolved)",
        layer: "L3",
        cypher: `CALL {
  WITH allPatients
  UNWIND allPatients AS p
  OPTIONAL MATCH (p)-[:HAS_CONDITION]->(c:Condition)
  WHERE ($indicationCode IS NOT NULL AND c.code = $indicationCode)
     OR ($indicationText IS NOT NULL
         AND toLower(coalesce(c.display, c.name, '')) CONTAINS $indicationText)
  WITH p, count(c) AS indicationHits
  WHERE ($indicationCode IS NULL AND $indicationText IS NULL)
     OR indicationHits > 0
  RETURN collect(DISTINCT p) AS indicationCohort
}`,
      },
      {
        label: "Drug sub-cohort (or all patients if unresolved)",
        layer: "L3",
        cypher: `CALL {
  WITH allPatients
  UNWIND allPatients AS p
  OPTIONAL MATCH (p)-[:HAS_MEDICATION_REQUEST]->(m:MedicationRequest)
  WHERE ($drugCode IS NOT NULL AND m.medicationCode = $drugCode)
     OR ($drugText IS NOT NULL
         AND toLower(coalesce(m.display, m.medicationCode, '')) CONTAINS $drugText)
  WITH p, count(m) AS drugHits
  WHERE ($drugCode IS NULL AND $drugText IS NULL)
     OR drugHits > 0
  RETURN collect(DISTINCT p) AS drugCohort
}`,
      },
      {
        label: "Cohort intersection",
        layer: "L3",
        cypher: `WITH populationSize, indicationCohort, drugCohort,
     [p IN indicationCohort WHERE p IN drugCohort] AS cohort`,
      },
      {
        label: "Side-effect measurement",
        layer: "L3",
        cypher: `UNWIND (CASE WHEN size(cohort) = 0 THEN [null] ELSE cohort END) AS cp
OPTIONAL MATCH (cp)-[:HAS_CONDITION|HAS_OBSERVATION]->(se)
WHERE cp IS NOT NULL
  AND (($sideEffectCode IS NOT NULL AND se.code = $sideEffectCode)
       OR ($sideEffectText IS NOT NULL
           AND toLower(coalesce(se.display, se.name, '')) CONTAINS $sideEffectText))
WITH cohortSize, count(DISTINCT CASE WHEN se IS NOT NULL THEN cp END) AS affected`,
      },
      {
        label: "Aggregate + frequency",
        cypher: `RETURN populationSize,
       indicationCohortSize,
       drugCohortSize,
       cohortSize        AS cohortWithIndicationAndDrug,
       affected          AS patientsWithSideEffect,
       CASE WHEN cohortSize > 0
            THEN round(toFloat(affected) / cohortSize * 100, 2)
            ELSE 0.0 END AS frequencyPct`,
      },
    ],
  },
];

/**
 * Graph layer metadata — human labels and accent colours for the 5 layers.
 * The UI uses these to render a breadcrumb above the results.
 */
export const GRAPH_LAYER_META: Record<
  GraphLayer,
  { label: string; short: string }
> = {
  L1: { label: "Dataspace Marketplace", short: "DSP" },
  L2: { label: "HealthDCAT-AP Catalog", short: "DCAT-AP" },
  L3: { label: "FHIR R4 Clinical", short: "FHIR" },
  L4: { label: "OMOP CDM Analytics", short: "OMOP" },
  L5: { label: "Biomedical Ontology", short: "Ontology" },
};

/** Graph schema description for LLM context */
const GRAPH_SCHEMA_CONTEXT = `
Neo4j Health Knowledge Graph Schema (5 layers):

Layer 1 - DSP Marketplace:
  (:Participant {participantId, name, did, participantType})
  (:DataProduct {productId, title, provider, productType})
  (:Contract {contractId, status, signedAt})
  (:HDABApproval {approvalId, status, ehdsArticle, purpose, legalBasis})
  (:OdrlPolicy {policyId, ehdsPermissions, ehdsProhibitions, temporalLimit})

Layer 2 - HealthDCAT-AP Catalog:
  (:HealthDataset {datasetId, title, description, publisher, recordCount, temporalCoverage})
  (:Distribution {distributionId, accessURL, mediaType})
  (:Catalog {catalogId, title})

Layer 3 - FHIR R4 Clinical:
  (:Patient {resourceId, patientId, name, birthDate, gender, deceased, city, country})
  (:Encounter {resourceId, name, date, class, type, status})
  (:Condition {resourceId, code, display, name, onsetDate, clinicalStatus})
  (:Observation {resourceId, code, display, value, unit, effectiveDate})
  (:MedicationRequest {resourceId, medicationCode, display, status})
  (:Procedure {resourceId, code, display, performedStart, status})

Layer 4 - OMOP CDM Research:
  (:OMOPPerson {personId, yearOfBirth, genderConceptId})
  (:OMOPConditionOccurrence {conditionOccurrenceId, conditionConceptId, startDate})
  (:OMOPMeasurement {measurementId, measurementConceptId, valueAsNumber, unit})
  (:OMOPDrugExposure {drugExposureId, drugConceptId, startDate})
  (:OMOPProcedureOccurrence {procedureOccurrenceId, procedureConceptId})

Layer 5 - Ontology:
  (:SnomedConcept {conceptId, display})
  (:LoincCode {loincNumber, display})
  (:ICD10Code {code, display})
  (:RxNormConcept {rxcui, display})

Key relationships:
  (:Patient)-[:HAS_ENCOUNTER]->(:Encounter)
  (:Patient)-[:HAS_CONDITION]->(:Condition)
  (:Patient)-[:HAS_OBSERVATION]->(:Observation)
  (:Patient)-[:HAS_MEDICATION_REQUEST]->(:MedicationRequest)
  (:Patient)-[:HAS_PROCEDURE]->(:Procedure)
  (:Condition)-[:CODED_BY]->(:SnomedConcept)
  (:Observation)-[:CODED_BY]->(:LoincCode)
  (:MedicationRequest)-[:CODED_BY]->(:RxNormConcept)
  (:OMOPPerson)-[:MAPPED_FROM]->(:Patient)
  (:OMOPConditionOccurrence)-[:CODED_BY]->(:SnomedConcept)
  (:Participant)-[:OFFERS]->(:DataProduct)-[:GOVERNED_BY]->(:OdrlPolicy)
  (:DataProduct)-[:DESCRIBED_BY]->(:HealthDataset)
  (:Contract)-[:COVERS]->(:DataProduct)

Fulltext indexes (use CALL db.index.fulltext.queryNodes):
  clinical_search — Condition.display, Observation.display, MedicationRequest.display, Procedure.display
  catalog_search — HealthDataset.title, HealthDataset.description, DataProduct.name
  ontology_search — SnomedConcept.display, LoincCode.display, ICD10Code.display, RxNormConcept.display
`;

// Trailing ?.!,;: off a word. A loop, because /[?.!,;:]+$/ backtracks
// quadratically on a long run of punctuation not at the end (CodeQL
// js/polynomial-redos) and the word comes from the caller's question.
const TRAILING_PUNCTUATION = new Set(["?", ".", "!", ",", ";", ":"]);
function stripTrailingPunctuation(w: string): string {
  let end = w.length;
  while (end > 0 && TRAILING_PUNCTUATION.has(w[end - 1])) end--;
  return w.slice(0, end);
}

/**
 * Match a natural language question against template patterns.
 * Returns the first matching template with extracted parameters.
 */
export function matchTemplate(
  question: string,
): { template: QueryTemplate; params: Record<string, any> } | null {
  for (const template of QUERY_TEMPLATES) {
    for (const pattern of template.patterns) {
      const match = question.match(pattern);
      if (match) {
        return {
          template,
          params: template.extractParams(match, question),
        };
      }
    }
  }
  return null;
}

/**
 * Call an LLM (OpenAI API or Ollama) to generate Cypher from natural language.
 * Only used when no template matches and an LLM endpoint is configured.
 */
export async function llmText2Cypher(question: string): Promise<string | null> {
  const systemPrompt = `You are a Cypher query generator for a Neo4j health knowledge graph.
Given a natural language question, generate a READ-ONLY Cypher query.
NEVER generate CREATE, MERGE, DELETE, SET, REMOVE, or DROP statements.
Return ONLY the Cypher query, no explanation or markdown.

${GRAPH_SCHEMA_CONTEXT}`;

  // Azure OpenAI (GPT-4o) — preferred when configured
  if (AZURE_OPENAI_GPT4O_URL && AZURE_OPENAI_API_KEY) {
    try {
      const resp = await fetch(AZURE_OPENAI_GPT4O_URL, {
        method: "POST",
        headers: {
          "api-key": AZURE_OPENAI_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: question },
          ],
          temperature: 0,
          max_tokens: 500,
        }),
      });
      const data = (await resp.json()) as any;
      const cypher = data.choices?.[0]?.message?.content?.trim();
      if (cypher)
        return cypher
          .replace(/```cypher\n?/g, "")
          .replace(/```/g, "")
          .trim();
    } catch (err) {
      console.error("[neo4j-proxy] Azure OpenAI Text2Cypher failed:", err);
    }
  }

  if (OPENAI_API_KEY) {
    try {
      const resp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: OPENAI_MODEL,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: question },
          ],
          temperature: 0,
          max_tokens: 500,
        }),
      });
      const data = (await resp.json()) as any;
      const cypher = data.choices?.[0]?.message?.content?.trim();
      if (cypher)
        return cypher
          .replace(/```cypher\n?/g, "")
          .replace(/```/g, "")
          .trim();
    } catch (err) {
      console.error("[neo4j-proxy] OpenAI Text2Cypher failed:", err);
    }
  }

  if (OLLAMA_URL) {
    try {
      const resp = await fetch(`${OLLAMA_URL}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: OLLAMA_MODEL,
          prompt: `${systemPrompt}\n\nQuestion: ${question}\nCypher:`,
          stream: false,
        }),
      });
      const data = (await resp.json()) as any;
      const cypher = data.response?.trim();
      if (cypher)
        return cypher
          .replace(/```cypher\n?/g, "")
          .replace(/```/g, "")
          .trim();
    } catch (err) {
      console.error("[neo4j-proxy] Ollama Text2Cypher failed:", err);
    }
  }

  if (ANTHROPIC_API_KEY) {
    try {
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: ANTHROPIC_MODEL,
          max_tokens: 500,
          system: systemPrompt,
          messages: [{ role: "user", content: question }],
        }),
      });
      const data = (await resp.json()) as any;
      const cypher = data.content?.[0]?.text?.trim();
      if (cypher)
        return cypher
          .replace(/```cypher\n?/g, "")
          .replace(/```/g, "")
          .trim();
    } catch (err) {
      console.error("[neo4j-proxy] Anthropic Text2Cypher failed:", err);
    }
  }

  return null;
}

/* ── ODRL scope type (forwarded from UI auth layer) ──────────── */
export interface OdrlScope {
  participantId: string;
  participantName: string;
  permissions: string[];
  prohibitions: string[];
  accessibleDatasets: string[];
  temporalLimit: string | null;
  policyIds: string[];
  hasActiveContract: boolean;
  hdabApproved: boolean;
}

/**
 * Check ODRL temporal limits — reject if policy has expired.
 */
export function checkOdrlTemporal(scope: OdrlScope): string | null {
  if (scope.temporalLimit) {
    const limit = new Date(scope.temporalLimit);
    if (limit < new Date()) {
      return `ODRL temporal limit expired: ${scope.temporalLimit}`;
    }
  }
  return null;
}

/**
 * Check ODRL re-identification prohibition.
 * Returns true if the query appears to attempt re-identification.
 */
export function checkReIdentification(
  cypher: string,
  scope: OdrlScope,
): boolean {
  if (!scope.prohibitions.includes("re_identification")) return false;
  // Heuristic: queries selecting patient name + birthDate + city together
  const upper = cypher.toUpperCase();
  const hasName = upper.includes(".NAME") || upper.includes(".PATIENTID");
  const hasBirth =
    upper.includes(".BIRTHDATE") || upper.includes(".YEAROFBIRTH");
  const hasGeo =
    upper.includes(".CITY") ||
    upper.includes(".COUNTRY") ||
    upper.includes(".ADDRESS");
  return hasName && hasBirth && hasGeo;
}

/**
 * Whether a query would show who a patient is (#475, first part).
 *
 * Every Cypher about to run for a caller who does not see patient identity
 * passes through here: a template, a full-text query or one an LLM wrote. It
 * looks for a variable bound to `:Patient` (or `:OMOPPerson`, which older
 * transforms gave the patient's name) and refuses when the query reads that
 * variable's name, birth or death date, address or record id, returns the
 * whole node, or projects its properties. Researchers get aggregates and
 * clinical values, never a person (Regulation (EU) 2025/327 Art. 66).
 *
 * A heuristic on the query text, deliberately on the side of refusing: a
 * false refusal costs a researcher a rephrased question, a false pass names
 * a patient.
 */
/** Who someone is: never read, not even in a WHERE (that is a lookup). */
const NAMING_PROPS =
  "name|given|family|address|city|postalCode|telecom|email|phone|ssn|patientId|resourceId";
/** Dates that identify when returned, and are fine to compute an age from. */
const DATING_PROPS = "birthDate|deathDate";

/**
 * The final RETURN of each part of a query (a UNION has several): what reaches
 * the caller. A RETURN inside a CALL { } sub-query feeds the outer query and
 * is not counted, so collecting patients to size a cohort is not refused.
 */
function finalReturns(cypher: string): string[] {
  return cypher.split(/\bUNION(?:\s+ALL)?\b/i).map((part) => {
    const segments = part.split(/\bRETURN\b/i);
    return segments.length > 1 ? segments[segments.length - 1] : "";
  });
}

export function revealsPatientIdentity(cypher: string): boolean {
  const vars = new Set<string>();
  for (const m of cypher.matchAll(
    /\(\s*(\w+)\s*:\s*(?:Patient|OMOPPerson)\b/g,
  )) {
    vars.add(m[1]);
  }
  const returns = finalReturns(cypher);
  for (const v of vars) {
    // v.name, v.address, ... anywhere: a WHERE on a name is a lookup by name
    if (new RegExp(`\\b${v}\\.(${NAMING_PROPS})\\b`, "i").test(cypher))
      return true;
    // properties(v), v {.*}, v{.name} anywhere
    if (
      new RegExp(`properties\\(\\s*${v}\\s*\\)|\\b${v}\\s*\\{`, "i").test(
        cypher,
      )
    ) {
      return true;
    }
    for (const ret of returns) {
      // a birth or death date handed back as it is
      if (new RegExp(`\\b${v}\\.(${DATING_PROPS})\\b`, "i").test(ret))
        return true;
      // the whole node: `RETURN p`, `collect(p)`; counting it returns a number
      const bare = ret.replace(
        new RegExp(`count\\s*\\(\\s*(?:DISTINCT\\s+)?${v}\\s*\\)`, "gi"),
        "",
      );
      if (new RegExp(`(^|[\\s,(])${v}(?![\\w.])`).test(bare)) return true;
    }
  }
  return false;
}

/**
 * Fulltext search — queries Neo4j native fulltext indexes for keyword matches.
 * Tier 2 in the NLQ resolution chain (between template and GraphRAG).
 * Searches clinical_search, catalog_search, and ontology_search indexes.
 */
export async function fulltextSearch(
  question: string,
): Promise<{ cypher: string; params: Record<string, any> } | null> {
  if (!driver) return null;

  const session = driver.session({ database: "neo4j" });
  try {
    // Build Lucene search term: filter stop words, add wildcard for prefix matching
    const STOP_WORDS = new Set([
      "the",
      "a",
      "an",
      "is",
      "are",
      "was",
      "were",
      "be",
      "been",
      "being",
      "have",
      "has",
      "had",
      "do",
      "does",
      "did",
      "will",
      "would",
      "could",
      "should",
      "may",
      "might",
      "shall",
      "can",
      "need",
      "dare",
      "ought",
      "what",
      "which",
      "who",
      "whom",
      "this",
      "that",
      "these",
      "those",
      "how",
      "many",
      "much",
      "where",
      "when",
      "why",
      "all",
      "each",
      "every",
      "both",
      "few",
      "more",
      "most",
      "some",
      "any",
      "no",
      "not",
      "only",
      "own",
      "same",
      "so",
      "than",
      "too",
      "very",
      "just",
      "about",
      "above",
      "after",
      "again",
      "against",
      "between",
      "into",
      "through",
      "during",
      "before",
      "with",
      "from",
      "for",
      "and",
      "but",
      "or",
      "nor",
      "on",
      "at",
      "to",
      "in",
      "of",
      "by",
      "it",
      "its",
      "me",
      "my",
      "per",
      "show",
      "give",
      "get",
      "tell",
      "find",
      "list",
      "average",
      "total",
      "number",
      "count",
      "patient",
      "patients",
      "person",
      "people",
      "encounter",
      "encounters",
      "observation",
      "observations",
      "medication",
      "medications",
      "condition",
      "conditions",
      "procedure",
      "procedures",
      "dataset",
      "datasets",
      "data",
      "result",
      "results",
      "type",
      "types",
      "class",
      "classes",
      "common",
      "prescribed",
    ]);
    const words = question
      .trim()
      .split(/\s+/)
      .map(stripTrailingPunctuation)
      .filter(Boolean)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w.toLowerCase()));
    if (words.length === 0) return null;
    const escaped = words
      .map((w) => w.replace(/[+\-&|!(){}[\]^"~*?:\\/]/g, "\\$&"))
      .map((w) => `${w}* ${w}~`) // wildcard + fuzzy for each word
      .join(" ");
    // Try each fulltext index in priority order
    const indexes = [
      {
        name: "clinical_search",
        query: `CALL db.index.fulltext.queryNodes('clinical_search', $term)
                YIELD node, score WHERE score > 0.5
                WITH labels(node)[0] AS label, node, score
                RETURN label, coalesce(node.display, node.name, node.code) AS name,
                       node.code AS code, score
                ORDER BY score DESC LIMIT 10`,
      },
      {
        name: "catalog_search",
        query: `CALL db.index.fulltext.queryNodes('catalog_search', $term)
                YIELD node, score WHERE score > 0.5
                WITH labels(node)[0] AS label, node, score
                RETURN label, coalesce(node.title, node.name) AS name,
                       node.description AS description, score
                ORDER BY score DESC LIMIT 10`,
      },
      {
        name: "ontology_search",
        query: `CALL db.index.fulltext.queryNodes('ontology_search', $term)
                YIELD node, score WHERE score > 0.5
                WITH labels(node)[0] AS label, node, score
                RETURN label, coalesce(node.display, node.name) AS name, score
                ORDER BY score DESC LIMIT 10`,
      },
    ];

    for (const idx of indexes) {
      try {
        // nosemgrep: cypher-built-from-request-input -- fixed full-text query; the term is a parameter
        const result = await session.run(idx.query, { term: escaped });
        if (result.records.length > 0) {
          const topLabel = result.records[0].get("label");
          const topName = result.records[0].get("name");

          // Build a context-expanding query based on what was found
          if (topLabel === "Condition") {
            // Fall back to a SnomedConcept lookup by conceptId / code when
            // the CODED_BY edge is missing in the synthetic seed data
            // (issue #19 — `snomedTerm` column was empty in the screenshot).
            // Same trick for ICD-10 via the :ICD10Code label.
            return {
              cypher: `CALL db.index.fulltext.queryNodes('clinical_search', $term)
                       YIELD node, score WHERE score > 0.5 AND 'Condition' IN labels(node)
                       WITH node AS c, score
                       MATCH (p:Patient)-[:HAS_CONDITION]->(c)
                       OPTIONAL MATCH (c)-[:CODED_BY]->(s:SnomedConcept)
                       OPTIONAL MATCH (sByCode:SnomedConcept)
                         WHERE s IS NULL AND sByCode.conceptId = c.code
                       OPTIONAL MATCH (c)-[:CODED_BY]->(i:ICD10Code)
                       OPTIONAL MATCH (iByCode:ICD10Code)
                         WHERE i IS NULL AND iByCode.code = c.code
                       RETURN coalesce(c.display, c.name) AS condition,
                              c.code                       AS code,
                              count(DISTINCT p)            AS patients,
                              coalesce(s.display, sByCode.display)  AS snomedTerm,
                              coalesce(i.code, iByCode.code)        AS icd10,
                              score
                       ORDER BY score DESC LIMIT 10`,
              params: { term: escaped },
            };
          } else if (
            topLabel === "Observation" ||
            topLabel === "MedicationRequest" ||
            topLabel === "Procedure"
          ) {
            return {
              cypher: `CALL db.index.fulltext.queryNodes('clinical_search', $term)
                       YIELD node, score WHERE score > 0.5
                       WITH node, score, labels(node)[0] AS label
                       RETURN label AS resourceType, coalesce(node.display, node.name) AS name,
                              node.code AS code, score
                       ORDER BY score DESC LIMIT 10`,
              params: { term: escaped },
            };
          } else if (
            topLabel === "HealthDataset" ||
            topLabel === "DataProduct"
          ) {
            return {
              cypher: `CALL db.index.fulltext.queryNodes('catalog_search', $term)
                       YIELD node, score WHERE score > 0.5
                       WITH node, score, labels(node)[0] AS label
                       RETURN label AS resourceType, coalesce(node.title, node.name) AS name,
                              node.description AS description, score
                       ORDER BY score DESC LIMIT 10`,
              params: { term: escaped },
            };
          } else {
            // Ontology or generic match
            return {
              cypher: `CALL db.index.fulltext.queryNodes('ontology_search', $term)
                       YIELD node, score WHERE score > 0.5
                       WITH node, score, labels(node)[0] AS label
                       RETURN label AS resourceType, coalesce(node.display, node.name) AS name, score
                       ORDER BY score DESC LIMIT 10`,
              params: { term: escaped },
            };
          }
        }
      } catch {
        // Index might not exist yet — continue to next
        continue;
      }
    }

    return null;
  } catch (err) {
    console.error("[neo4j-proxy] Fulltext search error:", err);
    return null;
  } finally {
    await session.close();
  }
}

/**
 * GraphRAG search — vector similarity search + graph context expansion.
 * Requires vector indexes on HealthDataset, Condition, SnomedConcept.
 * Returns a Cypher query + params if a relevant match is found.
 */
async function graphRagSearch(
  question: string,
): Promise<{ cypher: string; params: Record<string, any> } | null> {
  // GraphRAG requires embeddings. Check if vector indexes exist.
  if (!driver) return null;

  const session = driver.session({ database: "neo4j" });
  try {
    // Check if any vector index exists
    const indexResult = await session.run(
      `SHOW INDEXES WHERE type = 'VECTOR' RETURN name LIMIT 1`,
    );
    if (indexResult.records.length === 0) return null;

    // Generate embedding for the question (requires Ollama or OpenAI)
    const embedding = await generateEmbedding(question);
    if (!embedding) return null;

    // Search across all 3 vector indexes: condition, healthdataset, snomed
    const vectorIndexes = [
      {
        name: "condition_embedding",
        expandCypher: (ids: string[]) =>
          `MATCH (c:Condition) WHERE elementId(c) IN $nodeIds
           MATCH (p:Patient)-[:HAS_CONDITION]->(c)
           OPTIONAL MATCH (c)-[:CODED_BY]->(s:SnomedConcept)
           OPTIONAL MATCH (p)-[:HAS_OBSERVATION]->(o:Observation)
           RETURN coalesce(c.display, c.name) AS match, 'Condition' AS type,
                  count(DISTINCT p) AS patients, s.display AS snomedTerm,
                  collect(DISTINCT o.display)[0..5] AS relatedObservations
           ORDER BY patients DESC LIMIT 10`,
      },
      {
        name: "healthdataset_embedding",
        expandCypher: (ids: string[]) =>
          `MATCH (d:HealthDataset) WHERE elementId(d) IN $nodeIds
           OPTIONAL MATCH (d)<-[:CONTAINS]-(cat:Catalog)
           OPTIONAL MATCH (d)-[:HAS_DISTRIBUTION]->(dist:Distribution)
           RETURN d.title AS match, 'HealthDataset' AS type,
                  d.description AS description, cat.name AS catalog,
                  collect(DISTINCT dist.format) AS formats
           LIMIT 10`,
      },
      {
        name: "snomed_embedding",
        expandCypher: (ids: string[]) =>
          `MATCH (s:SnomedConcept) WHERE elementId(s) IN $nodeIds
           OPTIONAL MATCH (c:Condition)-[:CODED_BY]->(s)
           OPTIONAL MATCH (p:Patient)-[:HAS_CONDITION]->(c)
           RETURN s.display AS match, 'SnomedConcept' AS type,
                  s.conceptId AS code, count(DISTINCT p) AS patients
           ORDER BY patients DESC LIMIT 10`,
      },
    ];

    for (const idx of vectorIndexes) {
      try {
        const result = await session.run(
          `CALL db.index.vector.queryNodes($indexName, 5, $embedding)
           YIELD node, score WHERE score > 0.5
           RETURN elementId(node) AS nodeId, score
           ORDER BY score DESC LIMIT 5`,
          { indexName: idx.name, embedding },
        );

        if (result.records.length > 0) {
          const nodeIds = result.records.map((r) => r.get("nodeId"));
          return {
            cypher: idx.expandCypher(nodeIds),
            params: { nodeIds },
          };
        }
      } catch {
        // Vector index might not exist — continue to next
        continue;
      }
    }

    return null;
  } catch (err) {
    console.error("[neo4j-proxy] GraphRAG search error:", err);
    return null;
  } finally {
    await session.close();
  }
}

/**
 * Generate an embedding vector for a text string.
 * Uses Azure OpenAI, Ollama (nomic-embed-text), or OpenAI (text-embedding-3-small).
 */
export async function generateEmbedding(
  text: string,
): Promise<number[] | null> {
  const AZURE_EMBEDDINGS_URL = process.env.AZURE_OPENAI_EMBEDDINGS_URL;
  if (AZURE_EMBEDDINGS_URL && AZURE_OPENAI_API_KEY) {
    try {
      const resp = await fetch(AZURE_EMBEDDINGS_URL, {
        method: "POST",
        headers: {
          "api-key": AZURE_OPENAI_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ input: text }),
      });
      const data = (await resp.json()) as any;
      return data.data?.[0]?.embedding ?? null;
    } catch (err) {
      console.error("[neo4j-proxy] Azure OpenAI embedding error:", err);
    }
  }

  if (OLLAMA_URL) {
    try {
      const resp = await fetch(`${OLLAMA_URL}/api/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "nomic-embed-text", prompt: text }),
      });
      const data = (await resp.json()) as any;
      return data.embedding ?? null;
    } catch (err) {
      console.error("[neo4j-proxy] Ollama embedding error:", err);
    }
  }

  if (OPENAI_API_KEY) {
    try {
      const resp = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "text-embedding-3-small",
          input: text,
          dimensions: 384,
        }),
      });
      const data = (await resp.json()) as any;
      return data.data?.[0]?.embedding ?? null;
    } catch (err) {
      console.error("[neo4j-proxy] OpenAI embedding error:", err);
    }
  }

  return null;
}

/**
 * Phase 25e (Issue #13) — GraphRAG rerank via gpt-5-mini (or any chat model
 * deployed behind AZURE_OPENAI_GPT4O_URL). Returns { topNodeIds, cypher } or
 * null if the endpoint is not configured. The model is instructed to return
 * READ-ONLY Cypher that references `$topIds` as the parameter name for the
 * selected element ids, so the caller can bind them safely.
 */
export async function graphRagRerank(
  question: string,
  candidates: RerankCandidate[],
): Promise<RerankDecision | null> {
  if (!AZURE_OPENAI_GPT4O_URL || !AZURE_OPENAI_API_KEY) return null;

  const candidateBlock = candidates
    .slice(0, 20)
    .map(
      (c, i) =>
        `${i + 1}. [${c.label}] id=${c.nodeId} score=${c.score.toFixed(3)} :: ${
          c.text
        }`,
    )
    .join("\n");

  const systemPrompt = `You rerank Neo4j graph nodes for a health-data dataspace.
Pick the 3-5 most relevant candidates for the user's question and write a READ-ONLY
Cypher query that (a) returns those candidates with their key properties and
(b) expands 1 hop of context. The parameter name MUST be $topIds (list of elementId
strings). Forbidden keywords: CREATE, MERGE, DELETE, SET, REMOVE, DROP, CALL { ...
any write }. Return ONLY valid JSON of the form:
{"topNodeIds": ["<elementId>", ...], "cypher": "MATCH (n) WHERE elementId(n) IN $topIds ..."}`;

  try {
    const resp = await fetch(AZURE_OPENAI_GPT4O_URL, {
      method: "POST",
      headers: {
        "api-key": AZURE_OPENAI_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Question: ${question}\n\nCandidates:\n${candidateBlock}`,
          },
        ],
        temperature: 0,
        max_tokens: 600,
        response_format: { type: "json_object" },
      }),
    });
    if (!resp.ok) {
      console.warn(
        "[graphrag] rerank HTTP",
        resp.status,
        await resp.text().catch(() => ""),
      );
      return null;
    }
    const body = (await resp.json()) as {
      choices?: [{ message: { content: string } }];
    };
    const raw = body.choices?.[0]?.message?.content;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RerankDecision;
    if (!Array.isArray(parsed.topNodeIds) || typeof parsed.cypher !== "string")
      return null;
    return parsed;
  } catch (err) {
    console.warn("[graphrag] rerank error:", err);
    return null;
  }
}

/* ── Pharmacovigilance role resolver (issue #19) ─────────────────────────────
 *
 * Parses a pharmacovigilance-shaped question into three semantic roles
 * (drug / indication / side-effect) and resolves each to a NlqGlossary row
 * when one matches. Returns both the raw text spans AND the resolved codes
 * so the NLQ response can render a "how we interpreted your question" panel.
 *
 * Heuristic: regex captures the free-text span for each role, then the
 * longest matching glossary term of the expected kind wins. This keeps
 * things deterministic without an LLM.
 */
interface PharmaRole {
  term: string;
  code: string;
  system: string;
  display: string;
  generic?: string;
  icd10?: string;
}

export interface AdverseEventContext {
  drug?: PharmaRole;
  indication?: PharmaRole;
  sideEffect?: PharmaRole;
  raw: {
    drugText?: string;
    indicationText?: string;
    sideEffectText?: string;
  };
}

function extractAdverseEventSpans(
  question: string,
): AdverseEventContext["raw"] {
  const q = question.toLowerCase();
  // side-effect: between "is|are|how ..." and "observed|reported|seen|..."
  const seMatch = q.match(
    /(?:is|are|how\s+(?:often|common|frequent(?:ly)?))\s+([a-z][a-z0-9\s-]{1,40}?)\s+(?:frequently\s+|commonly\s+|often\s+)?(?:observed|seen|reported|prevalent|common|frequent)/,
  );
  // drug: after "treated with" up to comma/diagnosed/who/end
  const drugMatch = q.match(
    /treated\s+with\s+([a-z0-9][a-z0-9\s-]{0,40}?)(?:\s*,|\s+diagnosed|\s+who\s+have|\s+with\s+diagnosis|\s*\?|\s*$)/,
  );
  // indication: after "diagnosed with|with diagnosis of|who have" up to end/comma
  const indMatch = q.match(
    /(?:diagnosed\s+with|with\s+diagnosis\s+of|who\s+have)\s+([a-z0-9][a-z0-9\s-]{0,40}?)(?:\s*\?|\s*$|\s*,|\s+treated)/,
  );
  return {
    sideEffectText: seMatch?.[1]?.trim(),
    drugText: drugMatch?.[1]?.trim(),
    indicationText: indMatch?.[1]?.trim(),
  };
}

export async function resolveAdverseEventContext(
  question: string,
  session: ReturnType<NonNullable<typeof driver>["session"]>,
): Promise<AdverseEventContext> {
  const raw = extractAdverseEventSpans(question);

  // Fetch all drug + concept glossary rows in one round-trip (small set ≤100)
  const glossaryResult = await session.run(
    `MATCH (g:NlqGlossary)
     WHERE g.kind IN ['drug', 'concept']
     RETURN g.kind AS kind, g.term AS term, g.code AS code,
            coalesce(g.system, 'snomed') AS system,
            coalesce(g.display, g.term) AS display,
            g.generic AS generic, g.icd10 AS icd10
     ORDER BY size(g.term) DESC`,
  );
  const glossary = glossaryResult.records.map((r) => ({
    kind: r.get("kind") as string,
    term: r.get("term") as string,
    code: r.get("code") as string,
    system: r.get("system") as string,
    display: r.get("display") as string,
    generic: (r.get("generic") as string | null) ?? undefined,
    icd10: (r.get("icd10") as string | null) ?? undefined,
  }));

  const pickLongest = (
    text: string | undefined,
    wantedKind: "drug" | "concept",
  ): PharmaRole | undefined => {
    if (!text) return undefined;
    const lower = text.toLowerCase();
    // glossary is already sorted by term length desc → first hit wins
    const hit = glossary.find(
      (g) => g.kind === wantedKind && lower.includes(g.term),
    );
    return hit
      ? {
          term: hit.term,
          code: hit.code,
          system: hit.system,
          display: hit.display,
          generic: hit.generic,
          icd10: hit.icd10,
        }
      : undefined;
  };

  return {
    drug: pickLongest(raw.drugText, "drug"),
    indication: pickLongest(raw.indicationText, "concept"),
    sideEffect: pickLongest(raw.sideEffectText, "concept"),
    raw,
  };
}

interface CohortFilterParams {
  drugCode?: string | null;
  drugText?: string | null;
  indicationCode?: string | null;
  indicationText?: string | null;
}

interface DataQualityResult {
  // Global (whole graph) coverage
  snomedCoveragePct: number;
  rxnormCoveragePct: number;
  totalConditions: number;
  totalMedicationRequests: number;
  // Cohort-scoped coverage (null when no cohort filter was supplied)
  cohortSize?: number;
  cohortConditions?: number;
  cohortMedicationRequests?: number;
  cohortSnomedCoveragePct?: number;
  cohortRxnormCoveragePct?: number;
}

export async function computeCohortDataQuality(
  session: ReturnType<NonNullable<typeof driver>["session"]>,
  cohort?: CohortFilterParams,
): Promise<DataQualityResult | null> {
  try {
    // Global coverage first — always computed.
    const globalResult = await session.run(`
      MATCH (c:Condition)
      OPTIONAL MATCH (c)-[:CODED_BY]->(s:SnomedConcept)
      WITH count(DISTINCT c) AS totalConditions,
           count(DISTINCT CASE WHEN s IS NOT NULL THEN c END) AS codedConditions
      MATCH (m:MedicationRequest)
      OPTIONAL MATCH (m)-[:CODED_BY]->(rx:RxNormConcept)
      WITH totalConditions, codedConditions,
           count(DISTINCT m) AS totalMeds,
           count(DISTINCT CASE WHEN rx IS NOT NULL THEN m END) AS codedMeds
      RETURN totalConditions, codedConditions, totalMeds, codedMeds,
             CASE WHEN totalConditions > 0
                  THEN round(toFloat(codedConditions) / totalConditions * 100, 1)
                  ELSE 0.0 END AS snomedCoveragePct,
             CASE WHEN totalMeds > 0
                  THEN round(toFloat(codedMeds) / totalMeds * 100, 1)
                  ELSE 0.0 END AS rxnormCoveragePct
    `);
    const gRec = globalResult.records[0];
    if (!gRec) return null;
    const toNum = (v: unknown) =>
      neo4j.isInt(v) ? (v as neo4j.Integer).toNumber() : (v as number);
    const out: DataQualityResult = {
      snomedCoveragePct: Number(gRec.get("snomedCoveragePct")) || 0,
      rxnormCoveragePct: Number(gRec.get("rxnormCoveragePct")) || 0,
      totalConditions: toNum(gRec.get("totalConditions")),
      totalMedicationRequests: toNum(gRec.get("totalMeds")),
    };

    // Cohort-scoped coverage — only when at least one role resolved.
    const hasCohort =
      !!cohort &&
      (!!cohort.drugCode ||
        !!cohort.drugText ||
        !!cohort.indicationCode ||
        !!cohort.indicationText);
    if (!hasCohort) return out;

    const cohortResult = await session.run(
      `
      // Rebuild the cohort: patients with indication ∩ patients treated with drug.
      MATCH (p:Patient)
      WITH collect(DISTINCT p) AS allPatients
      CALL {
        WITH allPatients
        UNWIND allPatients AS p
        OPTIONAL MATCH (p)-[:HAS_CONDITION]->(c:Condition)
        WHERE ($indicationCode IS NOT NULL AND c.code = $indicationCode)
           OR ($indicationText IS NOT NULL
               AND toLower(coalesce(c.display, c.name, '')) CONTAINS $indicationText)
        WITH p, count(c) AS hits
        WHERE ($indicationCode IS NULL AND $indicationText IS NULL) OR hits > 0
        RETURN collect(DISTINCT p) AS indicationCohort
      }
      CALL {
        WITH allPatients
        UNWIND allPatients AS p
        OPTIONAL MATCH (p)-[:HAS_MEDICATION_REQUEST]->(m:MedicationRequest)
        WHERE ($drugCode IS NOT NULL AND m.medicationCode = $drugCode)
           OR ($drugText IS NOT NULL
               AND toLower(coalesce(m.display, m.medicationCode, '')) CONTAINS $drugText)
        WITH p, count(m) AS hits
        WHERE ($drugCode IS NULL AND $drugText IS NULL) OR hits > 0
        RETURN collect(DISTINCT p) AS drugCohort
      }
      WITH [p IN indicationCohort WHERE p IN drugCohort] AS cohort
      UNWIND (CASE WHEN size(cohort) = 0 THEN [null] ELSE cohort END) AS cp

      // Cohort coverage: share of cohort patients' Conditions/MedRequests
      // that have a CODED_BY edge to the ontology layer.
      OPTIONAL MATCH (cp)-[:HAS_CONDITION]->(cc:Condition)
      OPTIONAL MATCH (cc)-[:CODED_BY]->(cs:SnomedConcept)
      WITH cohort, cp,
           count(DISTINCT cc) AS cpConditions,
           count(DISTINCT CASE WHEN cs IS NOT NULL THEN cc END) AS cpCodedConds
      OPTIONAL MATCH (cp)-[:HAS_MEDICATION_REQUEST]->(cm:MedicationRequest)
      OPTIONAL MATCH (cm)-[:CODED_BY]->(cr:RxNormConcept)
      WITH size(cohort) AS cohortSize,
           sum(cpConditions) AS cohortConditions,
           sum(CASE WHEN cs IS NOT NULL THEN cpConditions ELSE 0 END) AS _unused,
           sum(cpCodedConds) AS cohortSnomedConds,
           count(DISTINCT cm) AS cohortMeds,
           count(DISTINCT CASE WHEN cr IS NOT NULL THEN cm END) AS cohortCodedMeds
      RETURN cohortSize, cohortConditions, cohortSnomedConds, cohortMeds, cohortCodedMeds,
             CASE WHEN cohortConditions > 0
                  THEN round(toFloat(cohortSnomedConds) / cohortConditions * 100, 1)
                  ELSE 0.0 END AS cohortSnomedCoveragePct,
             CASE WHEN cohortMeds > 0
                  THEN round(toFloat(cohortCodedMeds) / cohortMeds * 100, 1)
                  ELSE 0.0 END AS cohortRxnormCoveragePct
      `,
      {
        drugCode: cohort.drugCode ?? null,
        drugText: cohort.drugText ?? null,
        indicationCode: cohort.indicationCode ?? null,
        indicationText: cohort.indicationText ?? null,
      },
    );
    const cRec = cohortResult.records[0];
    if (cRec) {
      out.cohortSize = toNum(cRec.get("cohortSize"));
      out.cohortConditions = toNum(cRec.get("cohortConditions"));
      out.cohortMedicationRequests = toNum(cRec.get("cohortMeds"));
      out.cohortSnomedCoveragePct =
        Number(cRec.get("cohortSnomedCoveragePct")) || 0;
      out.cohortRxnormCoveragePct =
        Number(cRec.get("cohortRxnormCoveragePct")) || 0;
    }

    return out;
  } catch (err) {
    console.warn("[neo4j-proxy] data-quality query failed:", err);
    return null;
  }
}
