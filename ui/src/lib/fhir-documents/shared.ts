import { createHash } from "crypto";

/**
 * What the two document builders share (#1171): stable `urn:uuid`s, the
 * Patient and Organization entries, narrative, and the code systems.
 *
 * A document is built from the graph alone (discussion #1169: no FHIR
 * server). The same graph rows and the same timestamp always give the same
 * document, so the samples under scripts/eehrxf/samples/documents/ can be
 * compared byte for byte and a round trip (#1173) can be checked.
 */

export const LOINC = "http://loinc.org";
export const SNOMED = "http://snomed.info/sct";
export const RXNORM = "http://www.nlm.nih.gov/research/umls/rxnorm";
export const UCUM = "http://unitsofmeasure.org";
const DATA_ABSENT_REASON =
  "http://hl7.org/fhir/StructureDefinition/data-absent-reason";

/**
 * The identifier system of a graph node: its `resourceId` (or `id`) in the
 * hub's Neo4j graph. Every resource a document carries names the node it
 * came from this way, so an import (#1173) writes back to the same node
 * rather than a copy of it.
 */
export const GRAPH_NODE_SYSTEM = "https://ehds.mabu.red/fhir/sid/graph-node";
/** The hub's patient record id (`P1`, `patient-2000`). */
export const PATIENT_RECORD_SYSTEM =
  "https://ehds.mabu.red/fhir/sid/patient-record";
/** The author and custodian of a document the hub assembles. */
export const HUB_ORGANIZATION_NAME = "EHDS Integration Hub (demo)";

/** Our own extensions, the same URLs the shared FHIR writer uses. */
const EXT_BASE = "https://ehds.mabu.red/fhir/StructureDefinition";
export const EXT_SOURCE_KIND = `${EXT_BASE}/epa-ingest-source-kind`;
export const EXT_SOURCE_LINE = `${EXT_BASE}/epa-ingest-source-line`;
export const EXT_SOURCE_REGION = `${EXT_BASE}/epa-ingest-source-region`;

export type Json = Record<string, unknown>;

/** Runs one Cypher statement: `runQuery`, or a test's transaction. */
export type Run = <T>(
  cypher: string,
  params: Record<string, unknown>,
) => Promise<T[]>;

export interface FhirResource {
  resourceType: string;
  id: string;
  [key: string]: unknown;
}

export interface DocumentBundle {
  resourceType: "Bundle";
  meta?: { profile?: string[] };
  identifier: { system: string; value: string };
  type: "document";
  timestamp: string;
  entry: { fullUrl: string; resource: FhirResource }[];
}

/**
 * A name-based UUID: SHA-256 over the name, cut to 128 bits, with the
 * version set to 8 (RFC 9562, section 5.8, custom) and the RFC variant. The
 * same name gives the same UUID. SHA-256 rather than the SHA-1 of version 5,
 * because graph ids go into the name (CodeQL js/weak-cryptographic-algorithm).
 */
export function documentUuid(name: string): string {
  const b = createHash("sha256")
    .update(`mvhd-fhir-document:${name}`, "utf8")
    .digest()
    .subarray(0, 16);
  b[6] = (b[6] & 0x0f) | 0x80;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(
    16,
    20,
  )}-${h.slice(20)}`;
}

/** A graph id as a FHIR identifier. */
export function graphIdentifier(id: string) {
  return { system: GRAPH_NODE_SYSTEM, value: id };
}

/** The date part of a date or timestamp, or null. */
export function datePart(value: string | null | undefined): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(value ?? "");
  return m ? m[1] : null;
}

const XHTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
};

function escapeXhtml(text: string): string {
  return text.replace(/[&<>"]/g, (c) => XHTML_ESCAPES[c]);
}

/** A section's narrative: one line per entry, or the reason it is empty. */
export function narrative(lines: string[], empty: string) {
  const body =
    lines.length === 0
      ? `<p>${escapeXhtml(empty)}</p>`
      : `<ul>${lines.map((l) => `<li>${escapeXhtml(l)}</li>`).join("")}</ul>`;
  return {
    status: "generated",
    div: `<div xmlns="http://www.w3.org/1999/xhtml">${body}</div>`,
  };
}

/** Who the document shows the patient as (#475, `seesPatientIdentity()`). */
export type IdentityView =
  | { kind: "identified" }
  | { kind: "pseudonymous"; pseudonym: string };

export interface DocumentPatient {
  /** The hub's record id, `P1` or `patient-2000`. */
  id: string;
  name: string | null;
  gender: string | null;
  /** `YYYY-MM-DD` */
  birthDate: string | null;
}

const GENDERS = new Set(["male", "female", "other", "unknown"]);

/**
 * The Patient entry. A role that sees identity gets the name, the birth date
 * and the record id. A patient reading their own record gets the pseudonym
 * and a birth date marked `masked`, the rule `ownRecordView()` keeps for every
 * screen of the demo; the profile wants a birth date, and a data-absent
 * reason is how FHIR says why there is none.
 */
export function patientResource(
  id: string,
  patient: DocumentPatient,
  identity: IdentityView,
  profile: string,
): FhirResource {
  const gender = (patient.gender ?? "").toLowerCase();
  const identified = identity.kind === "identified";
  const birthDate = datePart(patient.birthDate);
  return {
    resourceType: "Patient",
    id,
    meta: { profile: [profile] },
    ...(identified
      ? {
          identifier: [{ system: PATIENT_RECORD_SYSTEM, value: patient.id }],
        }
      : {}),
    name: [
      {
        text: identified
          ? patient.name ?? `Patient ${patient.id}`
          : identity.pseudonym,
      },
    ],
    gender: GENDERS.has(gender) ? gender : "unknown",
    ...(identified && birthDate
      ? { birthDate }
      : {
          _birthDate: {
            extension: [
              {
                url: DATA_ABSENT_REASON,
                valueCode: identified ? "unknown" : "masked",
              },
            ],
          },
        }),
  };
}

export function organizationResource(
  id: string,
  name: string,
  profile?: string,
): FhirResource {
  return {
    resourceType: "Organization",
    id,
    ...(profile ? { meta: { profile: [profile] } } : {}),
    name,
  };
}

/** One entry, with its `urn:uuid` as both the fullUrl and the resource id. */
export function entry(resource: FhirResource) {
  return { fullUrl: `urn:uuid:${resource.id}`, resource };
}

export function ref(resource: FhirResource, display?: string) {
  return {
    reference: `urn:uuid:${resource.id}`,
    ...(display ? { display } : {}),
  };
}

export function codeable(
  code: string | null,
  system: string | null,
  display: string,
) {
  return code
    ? {
        coding: [
          {
            ...(system ? { system } : {}),
            code,
            ...(display ? { display } : {}),
          },
        ],
        text: display,
      }
    : { text: display };
}
