import { randomUUID } from "node:crypto";
import { appendAuditEvent, type ChainedEvent } from "./audit-chain.js";

// ---------------------------------------------------------------------------
// Administrative actions on the secure processing environments (#1236)
// ---------------------------------------------------------------------------
//
// Draft implementing act on secure processing environments, Art. 16(3)(c)
// and (f): the import of artefacts, and administrative actions affecting
// access rights or data availability, are logged. Each action leaves a FHIR
// R4 AuditEvent on its own hash chain, "admin", next to "query", "dsp",
// "spe" and "record": who acted, in which role, on what (a workspace, a
// permit, a statistical request, an import), and the outcome.
//
// No health data reaches the record: the target is an identifier only.

export const ADMIN_CHAIN = "admin";
const PROXY = "mvhd-neo4j-proxy";
const CODES = "https://ehds.mabu.red/fhir/CodeSystem/admin-audit-event";
const TARGETS = "https://ehds.mabu.red/fhir/sid/admin-target";

export const ADMIN_EVENTS = [
  "spe-start",
  "spe-stop",
  "permit-revoke",
  "request-decision",
  "spe-import",
  "import-review",
] as const;
export type AdminEvent = (typeof ADMIN_EVENTS)[number];

/** What each action changes, as FHIR AuditEvent.action. */
const ACTION: Record<AdminEvent, "C" | "U" | "E"> = {
  "spe-start": "E",
  "spe-stop": "E",
  "permit-revoke": "U",
  "request-decision": "U",
  "spe-import": "C",
  "import-review": "U",
};

export interface AdminAuditInput {
  event: AdminEvent;
  outcome: "success" | "failure" | "refused";
  /** Who acted: a user's login or a participant DID. */
  actorId: string;
  /** EDC_ADMIN, HDAB_AUTHORITY, DATA_USER, DATA_HOLDER or system */
  actorRole: string;
  /** What was acted on: "SPE-1", a permit id, a request id, an import id. */
  target: string;
  /** A short value that says what happened, e.g. "APPROVED" or "SPE-2". */
  detail?: string;
  reason?: string;
}

const OUTCOME = { success: "0", failure: "8", refused: "4" } as const;

/** FHIR R4 AuditEvent for one administrative action. */
export function buildAdminAuditEvent(
  input: AdminAuditInput,
  meta: { id: string; recorded: string },
): Record<string, unknown> {
  return {
    resourceType: "AuditEvent",
    id: meta.id,
    type: {
      system: "http://terminology.hl7.org/CodeSystem/audit-event-type",
      code: "rest",
      display: "RESTful Operation",
    },
    subtype: [{ system: CODES, code: input.event, display: input.event }],
    action: ACTION[input.event],
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
    entity: [
      {
        what: { identifier: { system: TARGETS, value: input.target } },
        type: {
          system: "http://terminology.hl7.org/CodeSystem/audit-entity-type",
          code: "2",
          display: "System Object",
        },
        ...(input.detail
          ? { detail: [{ type: "detail", valueString: input.detail }] }
          : {}),
      },
    ],
  };
}

/** Appends one administrative action to the admin chain; rejects if not committed. */
export async function appendAdminAudit(
  input: AdminAuditInput,
): Promise<ChainedEvent> {
  const resource = buildAdminAuditEvent(input, {
    id: randomUUID(),
    recorded: new Date().toISOString(),
  });
  return appendAuditEvent(ADMIN_CHAIN, resource, {
    participantId: input.actorId,
    outcome: input.outcome,
  });
}

const OUTCOMES = new Set(["success", "failure", "refused"]);
const ROLES = new Set([
  "EDC_ADMIN",
  "HDAB_AUTHORITY",
  "DATA_USER",
  "DATA_HOLDER",
  "system",
]);
const text = (v: unknown, max: number) =>
  typeof v === "string" && v.length > 0 && v.length <= max ? v : undefined;

/** A request body as an admin audit input, or null when it is not one. */
export function adminAuditInput(
  body: Record<string, unknown>,
): AdminAuditInput | null {
  const actorId = text(body.actorId, 300);
  const target = text(body.target, 300);
  if (
    !ADMIN_EVENTS.includes(body.event as AdminEvent) ||
    !OUTCOMES.has(String(body.outcome)) ||
    !ROLES.has(String(body.actorRole)) ||
    !actorId ||
    !target
  ) {
    return null;
  }
  const detail = text(body.detail, 200);
  const reason = text(body.reason, 2000);
  return {
    event: body.event as AdminEvent,
    outcome: body.outcome as AdminAuditInput["outcome"],
    actorId,
    actorRole: String(body.actorRole),
    target,
    ...(detail ? { detail } : {}),
    ...(reason ? { reason } : {}),
  };
}
