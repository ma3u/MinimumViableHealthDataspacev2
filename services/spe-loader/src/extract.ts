import type { Encoded } from "./codec.js";
import type { SpeId } from "./spes.js";

// ---------------------------------------------------------------------------
// The extract: what an SPE workspace is loaded from (ADR-068 decision 3)
// ---------------------------------------------------------------------------
//
// JSON lines. The first line is the header, then one line per node and one
// per relationship. Nodes are keyed on their primary label and `_speKey`, the
// hub node's own id (`id`, `resourceId` or `code`, the elementId only as the
// last resort), so a load merges and a second load of the same extract
// changes nothing. Before it leaves the export the whole thing is gzipped and
// sealed with AES-256-GCM (crypto.ts); only the workspace that Trustee
// releases the key to can read it.

export const EXTRACT_FORMAT = "mvhd-spe-extract/1";
export const KEY = "_speKey";
export const OPTED_OUT_LABEL = "OptedOut";
export const APP_CONTRIBUTION = "klarbefund-app";

/** Person-level FHIR records one hop from a Patient (cf. opt-out.ts in the proxy). */
export const CLINICAL_LABELS = [
  "Encounter",
  "Condition",
  "Observation",
  "MedicationRequest",
  "MedicationStatement",
  "Procedure",
  "DiagnosticReport",
  "Immunization",
  "AllergyIntolerance",
] as const;
/** Person-level OMOP CDM records one hop from an OMOPPerson. */
export const OMOP_LABELS = [
  "OMOPConditionOccurrence",
  "OMOPMeasurement",
  "OMOPDrugExposure",
  "OMOPVisitOccurrence",
  "OMOPProcedureOccurrence",
  "OMOPObservation",
] as const;
/** The label a node is merged on, first match wins. */
export const PRIMARY_LABELS: readonly string[] = [
  "Patient",
  "OMOPPerson",
  ...CLINICAL_LABELS,
  ...OMOP_LABELS,
];

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

export interface ExtractHeader {
  k: "header";
  format: typeof EXTRACT_FORMAT;
  speId: SpeId;
  holder: string;
  permitId: string;
  policyHash: string | null;
  createdAt: string;
  /** Synthetic patients in the hub, before the split. */
  eligible: number;
  patients: number;
  nodes: number;
  relationships: number;
}

export interface ExtractNode {
  k: "node";
  primary: string;
  key: string;
  labels: string[];
  props: Record<string, Encoded>;
}

export interface ExtractRel {
  k: "rel";
  type: string;
  s: { primary: string; key: string };
  e: { primary: string; key: string };
  props: Record<string, Encoded>;
}

export interface Extract {
  header: ExtractHeader;
  nodes: ExtractNode[];
  rels: ExtractRel[];
}

/**
 * A label or relationship type as a backticked Cypher identifier. The names
 * come from the hub's own schema, never from a request; anything that is not
 * a plain identifier is refused rather than escaped.
 */
export function ident(name: string): string {
  if (!IDENTIFIER.test(name)) {
    throw new Error(`refusing to use '${name}' as a label or type`);
  }
  return `\`${name}\``;
}

export function primaryLabel(labels: readonly string[]): string {
  for (const label of PRIMARY_LABELS) if (labels.includes(label)) return label;
  const rest = labels.filter((l) => l !== OPTED_OUT_LABEL).sort();
  if (rest.length === 0)
    throw new Error("a node without a label cannot be keyed");
  return rest[0];
}

export function nodeKey(
  elementId: string,
  props: Record<string, unknown>,
): string {
  for (const name of ["id", "resourceId", "code"]) {
    const value = props[name];
    if (value !== null && value !== undefined && value !== "")
      return String(value);
  }
  return elementId;
}

/** The records a holder never puts into an extract (app and PID data). */
export function isAppContribution(props: Record<string, unknown>): boolean {
  return props.contributedBy === APP_CONTRIBUTION;
}

export function toJsonl(extract: Extract): string {
  const lines = [JSON.stringify(extract.header)];
  for (const n of extract.nodes) lines.push(JSON.stringify(n));
  for (const r of extract.rels) lines.push(JSON.stringify(r));
  return `${lines.join("\n")}\n`;
}

/** Reads an extract back, and refuses one whose counts do not add up. */
export function parseJsonl(text: string): Extract {
  const lines = text.split("\n").filter((l) => l.trim() !== "");
  if (lines.length === 0) throw new Error("empty extract");
  const header = JSON.parse(lines[0]) as ExtractHeader;
  if (header.k !== "header" || header.format !== EXTRACT_FORMAT) {
    throw new Error(`not an ${EXTRACT_FORMAT} extract`);
  }
  const nodes: ExtractNode[] = [];
  const rels: ExtractRel[] = [];
  for (const line of lines.slice(1)) {
    const rec = JSON.parse(line) as ExtractNode | ExtractRel;
    if (rec.k === "node") {
      ident(rec.primary);
      rec.labels.forEach(ident);
      nodes.push(rec);
    } else if (rec.k === "rel") {
      ident(rec.type);
      ident(rec.s.primary);
      ident(rec.e.primary);
      rels.push(rec);
    } else {
      throw new Error("unknown record in extract");
    }
  }
  if (nodes.length !== header.nodes || rels.length !== header.relationships) {
    throw new Error(
      `extract holds ${nodes.length} nodes and ${rels.length} relationships, its header says ${header.nodes} and ${header.relationships}`,
    );
  }
  const patients = nodes.filter((n) => n.primary === "Patient").length;
  if (patients !== header.patients) {
    throw new Error(
      `extract holds ${patients} patients, its header says ${header.patients}`,
    );
  }
  return { header, nodes, rels };
}

/**
 * Statements of a .cypher file, split on `;` outside strings, backticks and
 * `//` comments (a comment such as `// Art. 75; adopted` is not a split).
 * The same rules as seed-spe2.py's split_statements.
 */
export function splitStatements(text: string): string[] {
  const out: string[] = [];
  let buf = "";
  let i = 0;
  const n = text.length;
  while (i < n) {
    const ch = text[i];
    if (ch === "'" || ch === '"' || ch === "`") {
      let j = i + 1;
      while (j < n && text[j] !== ch)
        j += text[j] === "\\" && ch !== "`" ? 2 : 1;
      buf += text.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (ch === "/" && text[i + 1] === "/") {
      const j = text.indexOf("\n", i);
      i = j === -1 ? n : j;
      continue;
    }
    if (ch === ";") {
      if (buf.trim()) out.push(buf.trim());
      buf = "";
      i += 1;
      continue;
    }
    buf += ch;
    i += 1;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}
