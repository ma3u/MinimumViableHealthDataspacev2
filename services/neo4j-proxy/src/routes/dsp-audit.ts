import { timingSafeEqual } from "node:crypto";
import { type Request, type Response } from "express";
import { app, auditLimiter } from "../app.js";
import {
  appendDspAudit,
  dspInputFromEdcEvent,
  type DspAuditInput,
} from "../dsp-audit.js";
import { logger } from "../logger.js";

// ---- Contract and transfer audit (ADR-045 plane 2, #418) --------------------

/**
 * POST /audit/dsp
 *
 * Two callers, one chain:
 *  - the connector, through the callbackAddresses the hub sets on every
 *    negotiation and transfer request: an EDC event envelope
 *    {id, at, type: "ContractNegotiationFinalized", payload};
 *  - the hub UI, for what only it knows: the request it is about to send, a
 *    transfer it refused for want of a permit, a demo record:
 *    {source: "hub-ui", process, event, outcome, ...}.
 *
 * 201 with the record's seq and hash once committed; 503 when it could not be
 * written, and the hub then does not start the negotiation or transfer.
 * A retried connector event (same id) is not appended twice.
 *
 * The proxy is reachable inside the container environment only. When
 * AUDIT_CALLBACK_TOKEN is set, a caller must also present it, as the `token`
 * query parameter (the connector's callback URI) or the x-audit-token header.
 */
const TOKEN = process.env.AUDIT_CALLBACK_TOKEN ?? "";

function authorised(req: Request): boolean {
  if (!TOKEN) return true;
  const given = String(req.header("x-audit-token") ?? req.query.token ?? "");
  const a = Buffer.from(given);
  const b = Buffer.from(TOKEN);
  return a.length === b.length && timingSafeEqual(a, b);
}

const PROCESSES = new Set(["contract-negotiation", "transfer-process"]);
const OUTCOMES = new Set(["success", "failure", "refused"]);
const FIELDS = [
  "processId",
  "agreementId",
  "assetId",
  "datasetId",
  "permitId",
  "consumerId",
  "providerId",
  "counterPartyId",
  "participantContext",
  "reason",
] as const;

/** A hub record, with only the fields the audit event holds. */
function hubInput(body: Record<string, unknown>): DspAuditInput | null {
  if (
    !PROCESSES.has(String(body.process)) ||
    !OUTCOMES.has(String(body.outcome)) ||
    !/^[a-z][a-z-]{1,40}$/.test(String(body.event))
  ) {
    return null;
  }
  const input: DspAuditInput = {
    process: body.process as DspAuditInput["process"],
    event: String(body.event),
    outcome: body.outcome as DspAuditInput["outcome"],
    source: "hub-ui",
    demo: body.demo === true,
  };
  for (const field of FIELDS) {
    const value = body[field];
    if (typeof value === "string" && value.length > 0 && value.length <= 500) {
      input[field] = value;
    }
  }
  return input;
}

app.post("/audit/dsp", auditLimiter, async (req: Request, res: Response) => {
  if (!authorised(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const input =
    body.source === "hub-ui" ? hubInput(body) : dspInputFromEdcEvent(body);
  if (!input) {
    res.status(400).json({
      error:
        "Not a contract negotiation or transfer process event, nor a hub audit record",
    });
    return;
  }
  try {
    const event = await appendDspAudit(input);
    res
      .status(201)
      .json({ chain: event.chain, seq: event.seq, hash: event.hash });
  } catch (err) {
    logger.error(
      { err, process: input.process, event: input.event },
      "contract or transfer audit write failed",
    );
    res.status(503).json({
      error:
        "The audit record could not be written. Every contract negotiation and data transfer must be on the audit trail (ADR-045).",
    });
  }
});
