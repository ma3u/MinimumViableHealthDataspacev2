/**
 * Art. 71 opt-out from secondary use (Regulation (EU) 2025/327), ADR-062.
 *
 * Secondary use is the default; a person may opt out at any time, without a
 * reason, and reverse it. The opt-out is not retroactive: what a permit has
 * already made available stays with it, everything after the opt-out leaves
 * the person out.
 *
 * Two things in the graph carry it:
 *
 * - An `OptOutRecord` per opt-out, linked from the Patient with `OPTED_OUT`:
 *   when, from where, and when and from where it was reversed. The records
 *   are never deleted, so who was opted out on any date (a permit's date) can
 *   be reconstructed (TEHDAS2 opt-out guideline).
 * - The `OptedOut` label on the person's Patient, their OMOPPerson and every
 *   person-level node of theirs while an opt-out is open. That is the filter
 *   at the holder: secondary-use queries exclude the label
 *   (`secondaryUseView`), here for the UI's own research reads and in
 *   services/neo4j-proxy/src/opt-out.ts for everything the proxy runs. The
 *   two copies of the rewrite share their test vectors.
 */

/** The marker label secondary-use queries exclude. */
export const OPTED_OUT_LABEL = "OptedOut";

/** Labels that hold data about one person: FHIR R4 resources and OMOP CDM rows. */
export const PERSON_LABELS: readonly string[] = [
  "Patient",
  "Encounter",
  "Condition",
  "Observation",
  "MedicationRequest",
  "MedicationStatement",
  "Procedure",
  "DiagnosticReport",
  "Immunization",
  "AllergyIntolerance",
  "OMOPPerson",
  "OMOPConditionOccurrence",
  "OMOPMeasurement",
  "OMOPDrugExposure",
  "OMOPVisitOccurrence",
  "OMOPProcedureOccurrence",
  "OMOPObservation",
];

export const OPT_OUT_ARTICLE = "Regulation (EU) 2025/327, Art. 71";

const PERSON = new Set(PERSON_LABELS);

function labelNames(expr: string): string[] {
  return expr.match(/[A-Za-z_]\w*/g) ?? [];
}

/**
 * The query with every node pattern on a person-level label narrowed to
 * persons who have not opted out: `(p:Patient)` becomes
 * `(p:(Patient)&!OptedOut)`. The twin of the proxy's secondaryUseView; see
 * there for what it leaves alone.
 */
export function secondaryUseView(cypher: string): string {
  let out = "";
  let i = 0;
  const n = cypher.length;
  while (i < n) {
    const ch = cypher[i];
    if (ch === "'" || ch === '"') {
      let j = i + 1;
      while (j < n && cypher[j] !== ch) j += cypher[j] === "\\" ? 2 : 1;
      out += cypher.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (ch === "/" && cypher[i + 1] === "/") {
      const j = cypher.indexOf("\n", i);
      const end = j === -1 ? n : j;
      out += cypher.slice(i, end);
      i = end;
      continue;
    }
    if (ch === "/" && cypher[i + 1] === "*") {
      const j = cypher.indexOf("*/", i + 2);
      const end = j === -1 ? n : j + 2;
      out += cypher.slice(i, end);
      i = end;
      continue;
    }
    if (ch !== "(") {
      out += ch;
      i++;
      continue;
    }
    const head = /^\(\s*([A-Za-z_]\w*)?\s*:\s*/.exec(cypher.slice(i));
    if (!head) {
      out += ch;
      i++;
      continue;
    }
    const start = i + head[0].length;
    let j = start;
    let depth = 0;
    while (j < n) {
      const c = cypher[j];
      if (c === "(") depth++;
      else if (c === ")") {
        if (depth === 0) break;
        depth--;
      } else if (depth === 0 && (/\s/.test(c) || c === "{")) {
        const rest = /^\s*:\s*/.exec(cypher.slice(j));
        if (c !== "{" && rest) {
          j += rest[0].length;
          continue;
        }
        break;
      }
      j++;
    }
    const expr = cypher.slice(start, j).replace(/\s+/g, "");
    const names = labelNames(expr);
    if (
      expr &&
      names.some((l) => PERSON.has(l)) &&
      !names.includes(OPTED_OUT_LABEL)
    ) {
      out += `(${head[1] ?? ""}:(${expr.replace(
        /:/g,
        "&",
      )})&!${OPTED_OUT_LABEL}`;
    } else {
      out += cypher.slice(i, j);
    }
    i = j;
  }
  return out;
}

/** The roles whose reads of person-level data are secondary use. */
export const SECONDARY_USE_ROLES: readonly string[] = [
  "DATA_USER",
  "HDAB_AUTHORITY",
  "TRUST_CENTER_OPERATOR",
];

/**
 * Whether a session's read is secondary use: it holds a secondary-use role
 * and none of the roles that read records for care (EDC_ADMIN, DATA_HOLDER)
 * or the person's own (PATIENT).
 */
export function isSecondaryUse(roles: readonly string[]): boolean {
  if (roles.some((r) => r === "EDC_ADMIN" || r === "DATA_HOLDER")) {
    return false;
  }
  if (roles.includes("PATIENT")) return false;
  return roles.some((r) => SECONDARY_USE_ROLES.includes(r));
}

/** A query narrowed for secondary use when the session's read is one. */
export function forRoles(cypher: string, roles: readonly string[]): string {
  return isSecondaryUse(roles) ? secondaryUseView(cypher) : cypher;
}

/**
 * Matches the Patient by the key the patient routes use. Shared by the
 * statements below.
 */
const PATIENT_BY_KEY = `MATCH (p:Patient)
   WHERE coalesce(p.id, p.resourceId, elementId(p)) = $patientId`;

/**
 * The person's own nodes: everything person-level reachable from the Patient
 * through person-level nodes only (encounters and their conditions, the OMOP
 * person and its rows), so no other person's node is ever reached.
 */
const PERSON_NODES = `MATCH path = (p)-[*0..3]->(n)
   WHERE all(x IN nodes(path) WHERE any(l IN labels(x) WHERE l IN $personLabels))`;

/** Open an opt-out: the record, then the marker on the person's nodes. */
export const OPT_OUT_CYPHER = `${PATIENT_BY_KEY}
   OPTIONAL MATCH (p)-[:OPTED_OUT]->(open:OptOutRecord)
     WHERE open.reversedAt IS NULL
   WITH p, open
   CALL (p, open) {
     WITH p, open WHERE open IS NULL
     CREATE (o:OptOutRecord {
       optOutId: randomUUID(),
       patientId: $patientId,
       optedOutAt: datetime(),
       source: $source
     })
     CREATE (p)-[:OPTED_OUT]->(o)
     RETURN o
     UNION
     WITH p, open WHERE open IS NOT NULL
     RETURN open AS o
   }
   WITH p, o
   CALL (p) {
     ${PERSON_NODES}
     SET n:${OPTED_OUT_LABEL}
     RETURN count(DISTINCT n) AS marked
   }
   RETURN o.optOutId AS optOutId, toString(o.optedOutAt) AS optedOutAt,
          o.source AS source, marked`;

/** Close the open opt-out: the reversal on the record, the marker off. */
export const REVERSE_OPT_OUT_CYPHER = `${PATIENT_BY_KEY}
   MATCH (p)-[:OPTED_OUT]->(o:OptOutRecord)
   WHERE o.reversedAt IS NULL
   SET o.reversedAt = datetime(), o.reversalSource = $source
   WITH p, o
   CALL (p) {
     ${PERSON_NODES}
     REMOVE n:${OPTED_OUT_LABEL}
     RETURN count(DISTINCT n) AS unmarked
   }
   RETURN o.optOutId AS optOutId, toString(o.optedOutAt) AS optedOutAt,
          toString(o.reversedAt) AS reversedAt, unmarked`;

/** Every opt-out of the person, newest first. */
export const OPT_OUT_HISTORY_CYPHER = `MATCH (o:OptOutRecord {patientId: $patientId})
   RETURN o.optOutId AS optOutId, toString(o.optedOutAt) AS optedOutAt,
          o.source AS source, toString(o.reversedAt) AS reversedAt,
          o.reversalSource AS reversalSource
   ORDER BY o.optedOutAt DESC`;

/**
 * The persons opted out on a given date: an opt-out counts from its start
 * until its reversal. With $asOf = now this is today's list; with a permit's
 * date it is the list that permit's extraction had to respect.
 */
export const OPTED_OUT_AS_OF_CYPHER = `MATCH (o:OptOutRecord)
   WHERE o.optedOutAt <= datetime($asOf)
     AND (o.reversedAt IS NULL OR o.reversedAt > datetime($asOf))
   RETURN count(DISTINCT o.patientId) AS optedOut`;

export interface OptOutRecordRow {
  optOutId: string;
  optedOutAt: string;
  source: string | null;
  reversedAt: string | null;
  reversalSource: string | null;
}

/** Whether a history has an open opt-out, and since when. */
export function openOptOut(
  history: readonly OptOutRecordRow[],
): OptOutRecordRow | null {
  return history.find((r) => !r.reversedAt) ?? null;
}
