import { NextResponse } from "next/server";
import { NEO4J_PROXY_URL } from "@/lib/proxy";

/**
 * Contract and transfer audit, the hub's side (ADR-045 plane 2, #418).
 *
 * The neo4j-proxy keeps the hash-chained trail ("dsp" chain). The hub writes
 * what only it knows: the request it is about to send to the connector, a
 * transfer it refused for want of a permit, a demo record no connector saw.
 * Everything after the request, the connector reports itself through the
 * callback addresses below.
 *
 * A request is written before the connector is asked, and if it cannot be
 * written the negotiation or transfer does not start (fail closed): under
 * Regulation (EU) 2025/327 the access body must be able to show every data
 * user's access, and an access with no record cannot be shown.
 */

export interface DspAuditRecord {
  process: "contract-negotiation" | "transfer-process";
  event: string;
  outcome: "success" | "failure" | "refused";
  processId?: string;
  agreementId?: string;
  assetId?: string;
  datasetId?: string;
  permitId?: string;
  consumerId?: string;
  providerId?: string;
  counterPartyId?: string;
  participantContext?: string;
  reason?: string;
  demo?: boolean;
}

export class AuditUnavailableError extends Error {}

/** Writes one record; rejects unless the proxy committed it (201). */
export async function recordDspEvent(record: DspAuditRecord): Promise<void> {
  const token = process.env.AUDIT_CALLBACK_TOKEN;
  let status = 0;
  try {
    const res = await fetch(`${NEO4J_PROXY_URL}/audit/dsp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { "x-audit-token": token } : {}),
      },
      body: JSON.stringify({ source: "hub-ui", ...record }),
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    status = res.status;
  } catch (err) {
    throw new AuditUnavailableError(
      `audit trail unreachable: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
  if (status !== 201) {
    throw new AuditUnavailableError(`audit trail answered ${status}`);
  }
}

/**
 * Writes a record whose loss must not undo what already happened (the
 * connector accepted the request, or the hub already refused). A failure is
 * logged; the request record written before it still stands.
 */
export async function recordDspEventAfter(
  record: DspAuditRecord,
): Promise<void> {
  try {
    await recordDspEvent(record);
  } catch (err) {
    console.error(
      `audit: ${record.process} ${record.event} not recorded:`,
      err instanceof Error ? err.message : err,
    );
  }
}

/**
 * The connector's callback to the audit trail, for every state change of
 * the negotiation or transfer it is asked to start. Empty unless
 * AUDIT_CALLBACK_URL says where the proxy is, as the connector reaches it
 * (inside the container network).
 */
export function auditCallbackAddresses(
  events: "contract.negotiation" | "transfer.process",
): Record<string, unknown>[] {
  const uri = process.env.AUDIT_CALLBACK_URL;
  if (!uri) return [];
  return [
    {
      "@type": "CallbackAddress",
      uri,
      events: [events],
      transactional: false,
    },
  ];
}

export function auditUnavailableResponse(err: unknown): NextResponse {
  return NextResponse.json(
    {
      error:
        "Not started: the audit record could not be written. Every contract negotiation and data transfer must be on the audit trail (ADR-045).",
      detail: err instanceof Error ? err.message : String(err),
    },
    { status: 503 },
  );
}
