import { createHash, randomUUID } from "crypto";
import { runQuery } from "@/lib/neo4j";
import {
  LOINC,
  RXNORM,
  SNOMED,
  datePart,
  documentUuid,
  type Run,
} from "./shared";
import type { ParsedDocument } from "./import";

/**
 * Writes an imported document into layer 3 (#1173), `MERGE` only, in one
 * statement, so a document lands whole or not at all.
 *
 * - **Where it came from.** A `(:DocumentReference)` for the document (its
 *   Bundle.identifier, timestamp, type, title, author and custodian, and the
 *   SHA-256 of its bytes) and one `(:Provenance)` per import, linked with
 *   `TARGET` to every node the import produced or confirmed. The document's
 *   content is not stored in the graph: it names the patient, and the graph
 *   is what secondary use reads.
 * - **One value, two sources.** A value the record already holds (the same
 *   node, by the hub's identifier, or the same code, day, value and unit) is
 *   not written again: the import's Provenance points at the existing node.
 *   It is never counted twice, by the record, by OMOP or by a study.
 * - **The shape the rest reads.** Properties as scripts/load_fhir_neo4j.py
 *   writes them (`id`, `dateTime`, `value`, `unit`, `onsetDate`, `date`,
 *   `performedStart`) and as the seeds do (`resourceId`, `valueQuantity`,
 *   `effectiveDate` aside), so neo4j/fhir-to-omop-transform.cypher maps an
 *   imported record unchanged.
 * - **Art. 71.** A person who opted out stays out: every node an import
 *   writes into their record carries `OptedOut` like the rest (ADR-062).
 */

/** Who imports: the person, or the holder treating them. */
export interface Importer {
  role: "PATIENT" | "DATA_HOLDER" | "EDC_ADMIN";
  id: string;
}

export interface StoreResult {
  documentId: string;
  provenanceId: string;
  imports: number;
  /** Nodes the import wrote, by kind */
  created: Record<string, number>;
  /** Nodes the import found already in the record and linked, by kind */
  linked: Record<string, number>;
}

const LABELS = [
  "Observation",
  "DiagnosticReport",
  "Condition",
  "AllergyIntolerance",
  "MedicationStatement",
  "MedicationRequest",
  "Immunization",
  "Procedure",
];

/**
 * The graph ids a document names that belong to someone else's record (or
 * to no record at all). A document naming one is refused: an import never
 * writes into another person's nodes.
 */
export const FOREIGN_NODES_CYPHER = `
UNWIND $ids AS key
MATCH (n)
WHERE any(l IN labels(n) WHERE l IN $labels)
  AND (n.resourceId = key OR n.id = key)
OPTIONAL MATCH (owner:Patient)-->(n)
WITH key, collect(DISTINCT coalesce(owner.id, owner.resourceId)) AS owners
WHERE NOT $patientId IN owners
RETURN DISTINCT key`;

export async function foreignNodes(
  patientId: string,
  ids: string[],
  run: Run = runQuery,
): Promise<string[]> {
  if (ids.length === 0) return [];
  const rows = await run<{ key: string }>(FOREIGN_NODES_CYPHER, {
    ids,
    patientId,
    labels: LABELS,
  });
  return rows.map((r) => r.key);
}

interface Block {
  /** The parameter holding this kind's rows */
  param: string;
  label: string;
  /** Relationship types from the patient, the first is the one written */
  rels: string[];
  /** Same thing, other source: Cypher over `same` and `r` */
  natural: string;
  /** Properties of a new node, over `n` and `r` */
  create: string;
  /** More after the node is known: coded-by links, report results */
  after?: string;
}

/**
 * Links a node to its code. The graph holds concept nodes in two shapes
 * (the loader's `code`, the ontology seed's constrained key), so an existing
 * one is used whichever it is, and a new one is keyed the constrained way.
 */
const CODED_BY = (label: string, key: string, alt: string) => `
  CALL (n, r) {
    WITH n, r WHERE r.code IS NOT NULL AND r.codedIn = '${label}'
    OPTIONAL MATCH (known:${label}) WHERE known.${key} = r.code OR known.${alt} = r.code
    WITH n, r, head(collect(known)) AS known
    FOREACH (k IN CASE WHEN known IS NULL THEN [] ELSE [known] END |
      MERGE (n)-[:CODED_BY]->(k))
    FOREACH (_ IN CASE WHEN known IS NULL THEN [1] ELSE [] END |
      MERGE (c:${label} {${key}: r.code})
        ON CREATE SET c.${alt} = r.code, c.name = r.display
      MERGE (n)-[:CODED_BY]->(c))
  }`;

const BLOCKS: Block[] = [
  {
    param: "observations",
    label: "Observation",
    rels: ["HAS_OBSERVATION"],
    natural: `same.code = r.code AND same.unit = r.unit
      AND left(coalesce(same.dateTime, toString(same.effectiveDate), same.date, ''), 10) = r.day
      AND toFloat(coalesce(same.valueQuantity, same.value)) = r.value`,
    create: `n.code = r.code, n.codeSystem = '${LOINC}', n.display = r.display,
      n.name = r.display + ' ' + toString(r.value) + ' ' + r.unit,
      n.value = r.value, n.valueQuantity = r.value, n.unit = r.unit,
      n.dateTime = r.effective, n.category = 'laboratory', n.status = r.status,
      n.performer = r.performer, n.referenceLow = r.low, n.referenceHigh = r.high,
      n.referenceText = r.rangeText, n.sourceKind = r.sourceKind,
      n.sourceLine = r.sourceLine, n.sourceRegion = r.sourceRegion`,
    after: `${CODED_BY("LoincCode", "loincNumber", "code")}
  FOREACH (_ IN CASE WHEN d IS NULL THEN [] ELSE [1] END | MERGE (d)-[:HAS_RESULT]->(n))`,
  },
  {
    param: "conditions",
    label: "Condition",
    rels: ["HAS_CONDITION"],
    natural: `r.code IS NOT NULL AND same.code = r.code`,
    create: `n.code = r.code, n.codeSystem = r.system, n.display = r.display,
      n.name = r.display, n.clinicalStatus = r.clinicalStatus,
      n.onsetDate = r.onset`,
    after: CODED_BY("SnomedConcept", "conceptId", "code"),
  },
  {
    param: "allergies",
    label: "AllergyIntolerance",
    rels: ["HAS_ALLERGY_INTOLERANCE"],
    natural: `r.code IS NOT NULL AND same.code = r.code`,
    create: `n.code = r.code, n.codeSystem = r.system, n.display = r.display,
      n.name = r.display, n.clinicalStatus = r.clinicalStatus,
      n.verificationStatus = r.verificationStatus, n.type = r.type,
      n.category = r.category, n.criticality = r.criticality,
      n.onsetDate = r.onset`,
  },
  {
    param: "statements",
    label: "MedicationStatement",
    rels: ["HAS_MEDICATION_STATEMENT"],
    natural: `r.code IS NOT NULL AND same.medicationCode = r.code`,
    create: `n.medicationCode = r.code, n.codeSystem = r.system,
      n.display = r.display, n.name = r.display, n.status = r.status,
      n.effectiveStart = r.date, n.dosageText = r.dosage, n.reason = r.reason`,
  },
  {
    param: "requests",
    label: "MedicationRequest",
    // The loader's relationship, which the OMOP transform reads, first.
    rels: ["HAS_MEDICATION", "HAS_MEDICATION_REQUEST"],
    natural: `r.code IS NOT NULL AND coalesce(same.medicationCode, same.code) = r.code`,
    create: `n.code = r.code, n.medicationCode = r.code, n.codeSystem = r.system,
      n.display = r.display, n.name = r.display, n.status = r.status,
      n.intent = 'order', n.date = r.date`,
    after: CODED_BY("RxNormConcept", "rxcui", "code"),
  },
  {
    param: "immunizations",
    label: "Immunization",
    rels: ["HAS_IMMUNIZATION"],
    natural: `same.vaccineCode = r.code
      AND left(toString(same.occurrenceDate), 10) = r.day`,
    create: `n.vaccineCode = r.code, n.codeSystem = r.system,
      n.display = r.display, n.name = r.display, n.status = r.status,
      n.occurrenceDate = r.occurrence, n.lotNumber = r.lot,
      n.performer = r.performer`,
  },
  {
    param: "procedures",
    label: "Procedure",
    rels: ["HAS_PROCEDURE"],
    natural: `r.code IS NOT NULL AND same.code = r.code
      AND left(toString(coalesce(same.performedStart, same.date, '')), 10) = coalesce(r.day, '')`,
    create: `n.code = r.code, n.codeSystem = r.system, n.display = r.display,
      n.name = r.display, n.status = r.status, n.performedStart = r.performed,
      n.date = r.performed`,
    after: CODED_BY("SnomedConcept", "conceptId", "code"),
  },
];

function block(b: Block): string {
  return `
CALL (p, prov, d) {
  UNWIND $${b.param} AS r
  OPTIONAL MATCH (p)-[:${b.rels.join("|")}]->(same:${b.label})
    WHERE coalesce(same.resourceId, same.id) = r.key OR (${b.natural})
  WITH p, prov, d, r, collect(DISTINCT same) AS candidates
  WITH p, prov, d, r,
       head([c IN candidates WHERE coalesce(c.resourceId, c.id) = r.key] + candidates) AS same
  CALL (r, same) {
    WITH same WHERE same IS NOT NULL
    SET same.lastImportedAt = datetime()
    RETURN same AS n
    UNION
    WITH r, same WHERE same IS NULL
    MERGE (n:${b.label} {resourceId: r.key})
      ON CREATE SET n.id = r.key, n.imported = true, n.importedAt = datetime(),
        ${b.create}
      ON MATCH SET n.lastImportedAt = datetime()
    RETURN n
  }
  MERGE (p)-[:${b.rels[0]}]->(n)
  MERGE (prov)-[:TARGET]->(n)
  FOREACH (_ IN CASE WHEN p:OptedOut THEN [1] ELSE [] END | SET n:OptedOut)
  WITH p, prov, d, r, n
  ${b.after ?? ""}
  RETURN count(DISTINCT n) AS ${b.param},
         count(DISTINCT CASE WHEN n.importedAt = datetime() THEN n END) AS ${
           b.param
         }Created
}`;
}

/**
 * The import, in one statement. The DiagnosticReport comes first, so the
 * Observations can be linked to it as its results.
 */
export const STORE_DOCUMENT_CYPHER = `
MATCH (p:Patient)
WHERE coalesce(p.id, p.resourceId, elementId(p)) = $patientId
MERGE (doc:DocumentReference {documentId: $doc.documentId})
  ON CREATE SET doc.createdAt = datetime(), doc.importCount = 0
  ON MATCH SET doc.lastImportedAt = datetime()
SET doc.identifierSystem = $doc.identifierSystem,
    doc.identifierValue = $doc.identifierValue,
    doc.timestamp = $doc.timestamp, doc.typeCode = $doc.typeCode,
    doc.title = $doc.title, doc.name = $doc.title,
    doc.authors = $doc.authors, doc.custodian = $doc.custodian,
    doc.profile = $doc.profile, doc.contentSha256 = $doc.contentSha256,
    doc.size = $doc.size, doc.importCount = doc.importCount + 1
MERGE (p)-[:HAS_DOCUMENT_REFERENCE]->(doc)
MERGE (prov:Provenance {provenanceId: $provenanceId})
  ON CREATE SET prov.recorded = datetime(), prov.activity = 'import',
    prov.agentRole = $importer.role, prov.agentId = $importer.id,
    prov.name = 'Import of ' + $doc.title, prov.documentId = $doc.documentId
MERGE (prov)-[:SOURCE]->(doc)
WITH p, doc, prov
CALL (p, prov) {
  UNWIND $reports AS r
  OPTIONAL MATCH (p)-[:HAS_DIAGNOSTIC_REPORT]->(same:DiagnosticReport)
    WHERE coalesce(same.resourceId, same.id) = r.key
  WITH p, prov, r, head(collect(same)) AS same
  CALL (r, same) {
    WITH same WHERE same IS NOT NULL
    SET same.lastImportedAt = datetime()
    RETURN same AS d
    UNION
    WITH r, same WHERE same IS NULL
    MERGE (d:DiagnosticReport {resourceId: r.key})
      ON CREATE SET d.id = r.key, d.imported = true, d.importedAt = datetime(),
        d.code = '11502-2', d.codeSystem = '${LOINC}', d.display = 'Laboratory report',
        d.name = r.title, d.category = 'LAB', d.categoryDisplay = 'Laboratory',
        d.status = r.status, d.effectiveDate = r.effective, d.issued = r.issued,
        d.performer = r.performer, d.conclusion = r.conclusion
      ON MATCH SET d.lastImportedAt = datetime()
    RETURN d
  }
  MERGE (p)-[:HAS_DIAGNOSTIC_REPORT]->(d)
  MERGE (prov)-[:TARGET]->(d)
  FOREACH (_ IN CASE WHEN p:OptedOut THEN [1] ELSE [] END | SET d:OptedOut)
  RETURN head(collect(d)) AS d,
         count(DISTINCT CASE WHEN d.importedAt = datetime() THEN d END) AS reportsCreated,
         count(DISTINCT d) AS reports
}
${BLOCKS.map(block).join("\n")}
RETURN doc.importCount AS imports, reports, reportsCreated,
       ${BLOCKS.map((b) => `${b.param}, ${b.param}Created`).join(", ")}`;

const codedIn = (system: string | null, label: string, fallback: string) =>
  (system ?? fallback) === fallback ? label : null;

/** The statement's parameters for one parsed document. */
export function storeParams(
  patientId: string,
  parsed: ParsedDocument,
  raw: string,
  importer: Importer,
  provenanceId: string = randomUUID(),
): Record<string, unknown> {
  const [identifierSystem, ...value] = parsed.meta.documentId.split("|");
  const lab = parsed.lab;
  const summary = parsed.summary;
  return {
    patientId,
    provenanceId,
    importer,
    doc: {
      documentId: `doc-${documentUuid(
        `${patientId}|${parsed.meta.documentId}`,
      )}`,
      identifierSystem,
      identifierValue: value.join("|"),
      timestamp: parsed.meta.timestamp,
      typeCode: parsed.meta.typeCode,
      title: parsed.meta.title,
      authors: parsed.meta.authors,
      custodian: parsed.meta.custodian,
      profile: parsed.profile,
      contentSha256: createHash("sha256").update(raw, "utf8").digest("hex"),
      size: Buffer.byteLength(raw, "utf8"),
    },
    reports: lab
      ? [
          {
            key: lab.reportId,
            title: lab.title,
            status: lab.results.some((r) => r.status === "preliminary")
              ? "preliminary"
              : "final",
            effective: lab.effective,
            issued: lab.issued,
            performer: lab.performer,
            conclusion: lab.conclusion,
          },
        ]
      : [],
    observations: (lab?.results ?? []).map((r) => ({
      ...r,
      key: r.id,
      day: datePart(r.effective),
      status: r.status === "preliminary" ? "preliminary" : "final",
      codedIn: "LoincCode",
    })),
    conditions: (summary?.conditions ?? []).map((c) => ({
      ...c,
      key: c.id,
      codedIn: codedIn(c.system, "SnomedConcept", SNOMED),
    })),
    allergies: (summary?.allergies ?? []).map((a) => ({ ...a, key: a.id })),
    statements: (summary?.medications ?? [])
      .filter((m) => m.kind === "statement")
      .map((m) => ({ ...m, key: m.id })),
    requests: (summary?.medications ?? [])
      .filter((m) => m.kind === "request")
      .map((m) => ({
        ...m,
        key: m.id,
        codedIn: codedIn(m.system, "RxNormConcept", RXNORM),
      })),
    immunizations: (summary?.immunizations ?? []).map((i) => ({
      ...i,
      key: i.id,
      day: datePart(i.occurrence),
    })),
    procedures: (summary?.procedures ?? []).map((x) => ({
      ...x,
      key: x.id,
      day: datePart(x.performed),
      codedIn: codedIn(x.system, "SnomedConcept", SNOMED),
    })),
  };
}

const KINDS = ["reports", ...BLOCKS.map((b) => b.param)];

export async function storeDocument(
  patientId: string,
  parsed: ParsedDocument,
  raw: string,
  importer: Importer,
  run: Run = runQuery,
): Promise<StoreResult | null> {
  const params = storeParams(patientId, parsed, raw, importer);
  const rows = await run<Record<string, number>>(STORE_DOCUMENT_CYPHER, params);
  const row = rows[0];
  if (!row) return null;
  const created: Record<string, number> = {};
  const linked: Record<string, number> = {};
  for (const kind of KINDS) {
    created[kind] = Number(row[`${kind}Created`] ?? 0);
    linked[kind] = Number(row[kind] ?? 0) - created[kind];
  }
  return {
    documentId: String((params.doc as { documentId: string }).documentId),
    provenanceId: String(params.provenanceId),
    imports: Number(row.imports ?? 1),
    created,
    linked,
  };
}
