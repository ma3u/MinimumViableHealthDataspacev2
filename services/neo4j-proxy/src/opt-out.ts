/**
 * Art. 71 opt-out from secondary use (Regulation (EU) 2025/327), ADR-062.
 *
 * A person who opted out is marked on the holder's side: the UI's opt-out
 * route puts the `OptedOut` label on their Patient, their OMOPPerson and every
 * person-level node of theirs (ui/src/lib/opt-out.ts keeps it in step). Every
 * query that serves secondary use is rewritten here so each node pattern on a
 * person-level label excludes that label, whoever wrote the query: a template,
 * full-text, GraphRAG or a model. `releasable()` checks the nodes again before
 * a FHIR resource leaves the proxy.
 *
 * The twin of this rewrite for the UI's own research reads is
 * ui/src/lib/opt-out.ts; the two share their test vectors.
 */
import type { Session, QueryResult } from "neo4j-driver";

/** The marker label the opt-out route sets and the reversal removes. */
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

const PERSON = new Set(PERSON_LABELS);

/** The label names in a label expression such as `Patient`, `A:B` or `(A|B)&C`. */
function labelNames(expr: string): string[] {
  return expr.match(/[A-Za-z_]\w*/g) ?? [];
}

/**
 * The query with every node pattern on a person-level label narrowed to
 * persons who have not opted out: `(p:Patient)` becomes
 * `(p:(Patient)&!OptedOut)`. String literals and comments are left alone, a
 * pattern that already names the marker is left alone, and the legacy `A:B`
 * conjunction is turned into `A&B` so it can be combined.
 *
 * Nodes matched without a label (`()-[:HAS_CONDITION]->(c)`) are not touched:
 * the guard covers the patterns the templates, the full-text tier, GraphRAG
 * and the model write, and the tests pin which ones.
 */
export function secondaryUseView(cypher: string): string {
  let out = "";
  let i = 0;
  const n = cypher.length;
  while (i < n) {
    const ch = cypher[i];
    // string literals
    if (ch === "'" || ch === '"') {
      let j = i + 1;
      while (j < n && cypher[j] !== ch) j += cypher[j] === "\\" ? 2 : 1;
      out += cypher.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    // comments
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
    // A node pattern: "(" ws [variable] ws ":" label-expression
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
        // `A :B` is still one expression
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
      const joined = expr.replace(/:/g, "&");
      out += `(${head[1] ?? ""}:(${joined})&!${OPTED_OUT_LABEL}`;
    } else {
      out += cypher.slice(i, j);
    }
    i = j;
  }
  return out;
}

/** Where a secondary-use query may include persons who opted out. */
export interface OptOutScope {
  /** An approved Art. 71(4) exception on the permit the query runs under. */
  art71Exception?: boolean;
}

/** The Cypher to run for secondary use: narrowed unless an exception applies. */
export function forSecondaryUse(cypher: string, scope?: OptOutScope): string {
  return scope?.art71Exception ? cypher : secondaryUseView(cypher);
}

/** session.run for secondary use: the same query, without persons who opted out. */
export function runSecondaryUse(
  session: Session,
  cypher: string,
  params?: Record<string, unknown>,
  scope?: OptOutScope,
): Promise<QueryResult> {
  return session.run(forSecondaryUse(cypher, scope), params);
}

/**
 * A session whose every run is narrowed the same way, for helpers that run
 * their own secondary-use queries on a session they are handed.
 */
export function secondaryUseSession(
  session: Session,
  scope?: OptOutScope,
): Session {
  return new Proxy(session, {
    get(target, prop, receiver) {
      if (prop === "run") {
        return (cypher: string, params?: Record<string, unknown>) =>
          target.run(forSecondaryUse(cypher, scope), params);
      }
      const v = Reflect.get(target, prop, receiver);
      return typeof v === "function" ? v.bind(target) : v;
    },
  });
}

/**
 * The check before release: false for a node that carries the marker. A node
 * reaches here only if a query slipped past the rewrite, so it is dropped
 * rather than sent.
 */
export function releasable(
  node: { labels?: readonly string[] } | null,
): boolean {
  return !node?.labels?.includes(OPTED_OUT_LABEL);
}
