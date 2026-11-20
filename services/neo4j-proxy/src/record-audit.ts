import { randomUUID } from "node:crypto";
import { appendAuditEvent, type ChainedEvent } from "./audit-chain.js";

// ---------------------------------------------------------------------------
// Primary-use record audit (ADR-045 plane 2, #1173)
// ---------------------------------------------------------------------------
//
// Writes to a person's own record leave a FHIR R4 AuditEvent on their own
// hash chain, "record", next to "query", "dsp" and "spe". The first event is
// the import of a FHIR document into the record (EHDS Art. 15(4)): who
// imported it (the person, or the holder treating them), into which record,
// which document, and whether it was taken or refused.
//
// No health data and no name reaches the record: the patient is the hub's
// record id, the document its Bundle.identifier.

export const RECORD_CHAIN = "record";
const PROXY = "mvhd-neo4j-proxy";
const CODES = "https://ehds.mabu.red/fhir/CodeSystem/record-audit-event";
const PATIENT_RECORD_SYSTEM = "https://ehds.mabu.red/fhir/sid/patient-record";

export const RECORD_EVENTS = ["document-import"] as const;
export type RecordEvent = (typeof RECORD_EVENTS)[number];

export interface RecordAuditInput {
  event: RecordEvent;
  outcome: "success" | "failure" | "refused";
  /** The hub's record id, `P1` or `patient-2000`. */
  patientId: string;
  /** Who acted: a participant DID, or the patient's login. */
  actorId: string;
  /** PATIENT, DATA_HOLDER or EDC_ADMIN */
  actorRole: string;
  /** Bundle.identifier as `system|value` */
  documentId?: string;
  /** LOINC code of the document type (Composition.type) */
  documentType?: string;
  reason?: string;
}

const OUTCOME = { success: "0", failure: "8", refused: "4" } as const;

/** FHIR R4 AuditEvent for one write to a person's record. */
export function buildRecordAuditEvent(
  input: RecordAuditInput,
  meta: { id: string; recorded: string },
): Record<string, unknown> {
  const entities: Record<string, unknown>[] = [
    {
      what: {
        identifier: { system: PATIENT_RECORD_SYSTEM, value: input.patientId },
      },
      type: {
        system: "http://terminology.hl7.org/CodeSystem/audit-entity-type",
        code: "1",
        display: "Person",
      },
      role: {
        system: "http://terminology.hl7.org/CodeSystem/object-role",
        code: "1",
        display: "Patient",
      },
    },
  ];
  if (input.documentId) {
    const [system, ...rest] = input.documentId.split("|");
    entities.push({
      what: {
        identifier: rest.length
          ? { system, value: rest.join("|") }
          : { value: input.documentId },
      },
      type: {
        system: "http://terminology.hl7.org/CodeSystem/audit-entity-type",
        code: "2",
        display: "System Object",
      },
      role: {
        system: "http://terminology.hl7.org/CodeSystem/object-role",
        code: "3",
        display: "Report",
      },
      ...(input.documentType
        ? {
            detail: [{ type: "documentType", valueString: input.documentType }],
          }
        : {}),
    });
  }
  return {
    resourceType: "AuditEvent",
    id: meta.id,
    type: {
      system: "http://terminology.hl7.org/CodeSystem/audit-event-type",
      code: "rest",
      display: "RESTful Operation",
    },
    subtype: [
      {
        system: "http://hl7.org/fhir/restful-interaction",
        code: "create",
        display: "create",
      },
      { system: CODES, code: input.event, display: input.event },
    ],
    action: "C",
    recorded: meta.recorded,
    outcome: OUTCOME[input.outcome],
    ...(input.reason ? { outcomeDesc: input.reason.slice(0, 500) } : {}),
    agent: [
      {
        who: { identifier: { value: input.actorId } },
        requestor: true,
        role: [{ text: input.actorRole }],
      },
      { who: { display: PROXY }, requestor: false },
    ],
    source: {
      observer: { display: PROXY },
      type: [
        {
          system: "http://terminology.hl7.org/CodeSystem/security-source-type",
          code: "4",
          display: "Application Server",
        },
      ],
    },
    entity: entities,
  };
}

/** Appends one record write to the record chain; rejects if not committed. */
export async function appendRecordAudit(
  input: RecordAuditInput,
): Promise<ChainedEvent> {
  const resource = buildRecordAuditEvent(input, {
    id: randomUUID(),
    recorded: new Date().toISOString(),
  });
  return appendAuditEvent(RECORD_CHAIN, resource, {
    participantId: input.actorId,
    outcome: input.outcome,
  });
}

const OUTCOMES = new Set(["success", "failure", "refused"]);
const ROLES = new Set(["PATIENT", "DATA_HOLDER", "EDC_ADMIN"]);
const text = (v: unknown, max: number) =>
  typeof v === "string" && v.length > 0 && v.length <= max ? v : undefined;

/** A request body as an audit input, or null when it is not one. */
export function recordAuditInput(
  body: Record<string, unknown>,
): RecordAuditInput | null {
  const patientId = text(body.patientId, 200);
  const actorId = text(body.actorId, 300);
  if (
    !RECORD_EVENTS.includes(body.event as RecordEvent) ||
    !OUTCOMES.has(String(body.outcome)) ||
    !ROLES.has(String(body.actorRole)) ||
    !patientId ||
    !actorId
  ) {
    return null;
  }
  const documentId = text(body.documentId, 500);
  const documentType = text(body.documentType, 40);
  const reason = text(body.reason, 2000);
  return {
    event: body.event as RecordEvent,
    outcome: body.outcome as RecordAuditInput["outcome"],
    patientId,
    actorId,
    actorRole: String(body.actorRole),
    ...(documentId ? { documentId } : {}),
    ...(documentType ? { documentType } : {}),
    ...(reason ? { reason } : {}),
  };
}
