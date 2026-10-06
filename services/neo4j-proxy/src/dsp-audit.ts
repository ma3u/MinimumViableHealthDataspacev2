import { randomUUID } from "node:crypto";
import { appendAuditEvent, type ChainedEvent } from "./audit-chain.js";
import { currentLoadTest } from "./logger.js";

// ---------------------------------------------------------------------------
// Contract and transfer audit (ADR-045 plane 2, #418)
// ---------------------------------------------------------------------------
//
// Every DSP contract negotiation and every data transfer leaves a FHIR R4
// AuditEvent on its own hash chain, "dsp", next to the query chain: the
// request the hub sends, the permit refusal it answers instead, and each state
// the connector reports afterwards through its callback (agreed, finalized,
// started, completed, terminated). Under Regulation (EU) 2025/327 the access
// body has to show which data user received which data, under which permit
// and contract, and when; GDPR Art. 5(2) and 30 ask the same of the holders.
//
// Only named fields are copied from a connector event. A transfer event can
// carry the data address, and with it an endpoint and an access token; none
// of that reaches the record.

export const DSP_CHAIN = "dsp";
const PROXY = "mvhd-neo4j-proxy";
const CODES = "https://ehds.mabu.red/fhir/CodeSystem/dsp-audit-event";

export type DspProcess = "contract-negotiation" | "transfer-process";

export interface DspAuditInput {
  process: DspProcess;
  /** requested, refused, initiated, agreed, finalized, started, completed, terminated, ... */
  event: string;
  outcome: "success" | "failure" | "refused";
  /** "hub-ui" for what the hub did itself, "edc-callback" for what the connector reported. */
  source: "hub-ui" | "edc-callback";
  processId?: string;
  agreementId?: string;
  assetId?: string;
  datasetId?: string;
  permitId?: string;
  /** The participant that asked: the data user, or the hub acting for it. */
  consumerId?: string;
  providerId?: string;
  counterPartyId?: string;
  participantContext?: string;
  reason?: string;
  demo?: boolean;
  /** The k6 run whose request this step belongs to (X-Load-Test, #571). */
  loadTest?: string;
  edcEventType?: string;
  edcEventId?: string;
}

const OUTCOME = { success: "0", failure: "8", refused: "4" } as const;

/** FHIR R4 AuditEvent for one step of a negotiation or a transfer. */
export function buildDspAuditEvent(
  input: DspAuditInput,
  meta: { id: string; recorded: string },
): Record<string, unknown> {
  const identifier = (system: string, value: string) => ({ system, value });
  const entity = (
    what: { system: string; value: string },
    role: { code: string; display: string },
  ) => ({
    what: { identifier: what },
    type: {
      system: "http://terminology.hl7.org/CodeSystem/audit-entity-type",
      code: "2",
      display: "System Object",
    },
    role: {
      system: "http://terminology.hl7.org/CodeSystem/object-role",
      ...role,
    },
  });
  const entities: Record<string, unknown>[] = [];
  if (input.processId)
    entities.push(
      entity(identifier(`urn:edc:${input.process}`, input.processId), {
        code: "4",
        display: "Domain Resource",
      }),
    );
  if (input.agreementId)
    entities.push(
      entity(identifier("urn:edc:contract-agreement", input.agreementId), {
        code: "4",
        display: "Domain Resource",
      }),
    );
  if (input.assetId || input.datasetId)
    entities.push(
      entity(
        identifier(
          input.datasetId ? "urn:healthdcat-ap:dataset" : "urn:edc:asset",
          (input.datasetId ?? input.assetId) as string,
        ),
        { code: "3", display: "Report" },
      ),
    );
  if (input.permitId)
    entities.push(
      entity(identifier("urn:ehds:data-permit", input.permitId), {
        code: "13",
        display: "Security Resource",
      }),
    );

  const details = [
    ["source", input.source],
    ["edcEventType", input.edcEventType],
    ["edcEventId", input.edcEventId],
    ["participantContext", input.participantContext],
    ["demo", input.demo ? "true" : undefined],
    ["loadTest", input.loadTest],
  ]
    .filter((d): d is [string, string] => typeof d[1] === "string")
    .map(([type, valueString]) => ({ type, valueString }));
  if (details.length > 0) {
    entities.push({
      type: {
        system: "http://terminology.hl7.org/CodeSystem/audit-entity-type",
        code: "2",
        display: "System Object",
      },
      detail: details,
    });
  }

  const agents: Record<string, unknown>[] = [];
  if (input.consumerId)
    agents.push({
      who: { identifier: { value: input.consumerId } },
      requestor: true,
      role: [{ text: "data user" }],
    });
  if (input.providerId ?? input.counterPartyId)
    agents.push({
      who: { identifier: { value: input.providerId ?? input.counterPartyId } },
      requestor: false,
      role: [{ text: "data holder" }],
    });
  agents.push({ who: { display: PROXY }, requestor: false });

  return {
    resourceType: "AuditEvent",
    id: meta.id,
    type:
      input.process === "transfer-process"
        ? {
            system: "http://dicom.nema.org/resources/ontology/DCM",
            code: "110106",
            display: "Export",
          }
        : {
            system: "http://terminology.hl7.org/CodeSystem/audit-event-type",
            code: "rest",
            display: "RESTful Operation",
          },
    subtype: [
      {
        system: CODES,
        code: `${input.process}.${input.event}`,
        display: `${input.process} ${input.event}`,
      },
    ],
    action: input.event === "requested" ? "C" : "U",
    recorded: meta.recorded,
    outcome: OUTCOME[input.outcome],
    ...(input.reason ? { outcomeDesc: input.reason.slice(0, 500) } : {}),
    agent: agents,
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

/** Appends one negotiation or transfer step to the dsp chain; rejects if not committed. */
export async function appendDspAudit(
  input: DspAuditInput,
): Promise<ChainedEvent> {
  const loadTest = input.loadTest ?? currentLoadTest();
  const resource = buildDspAuditEvent(
    loadTest ? { ...input, loadTest } : input,
    {
      id: randomUUID(),
      recorded: new Date().toISOString(),
    },
  );
  return appendAuditEvent(DSP_CHAIN, resource, {
    participantId: input.consumerId ?? input.participantContext ?? "unknown",
    outcome: input.outcome,
    dedupeKey: input.edcEventId,
  });
}

// ---- Connector callbacks ---------------------------------------------------

const str = (v: unknown): string | undefined =>
  typeof v === "string" && v.length > 0 ? v : undefined;

/**
 * Maps an EDC callback envelope ({id, at, type, payload}) to an audit input.
 * Event types are ContractNegotiation<State> and TransferProcess<State>;
 * anything else answers null. Only named fields are read. Field names checked
 * against the deployed control plane jar (EventEnvelope, ContractNegotiation
 * Event, TransferProcessEvent, ContractAgreement) on 2026-10-04.
 */
export function dspInputFromEdcEvent(
  envelope: Record<string, unknown>,
): DspAuditInput | null {
  const type = str(envelope.type);
  const payload = (envelope.payload ?? {}) as Record<string, unknown>;
  if (!type) return null;
  const match = /^(ContractNegotiation|TransferProcess)([A-Z][A-Za-z]+)$/.exec(
    type,
  );
  if (!match) return null;
  const process: DspProcess =
    match[1] === "ContractNegotiation"
      ? "contract-negotiation"
      : "transfer-process";
  const event = match[2].toLowerCase();
  const failed = event === "terminated" || event === "failed";
  const agreement = (payload.contractAgreement ?? {}) as Record<
    string,
    unknown
  >;
  const reason = str(payload.reason) ?? str(payload.errorDetail);

  if (process === "contract-negotiation") {
    return {
      process,
      event,
      outcome: failed ? "failure" : "success",
      source: "edc-callback",
      processId: str(payload.contractNegotiationId),
      // EDC serialises the agreement with `id` (and newer releases `agreementId`).
      agreementId:
        str(agreement.agreementId) ??
        str(agreement.id) ??
        str(agreement["@id"]),
      assetId: str(agreement.assetId),
      consumerId: str(agreement.consumerId),
      providerId: str(agreement.providerId),
      counterPartyId: str(payload.counterPartyId),
      participantContext: str(payload.participantContextId),
      reason: failed ? reason : undefined,
      edcEventType: type,
      edcEventId: str(envelope.id),
    };
  }
  return {
    process,
    event,
    outcome: failed ? "failure" : "success",
    source: "edc-callback",
    processId: str(payload.transferProcessId),
    agreementId: str(payload.contractId),
    assetId: str(payload.assetId),
    participantContext: str(payload.participantContextId),
    reason: failed ? reason : undefined,
    edcEventType: type,
    edcEventId: str(envelope.id),
  };
}
