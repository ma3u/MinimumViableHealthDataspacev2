import { NEO4J_PROXY_URL } from "@/lib/proxy";
import { AuditUnavailableError } from "@/lib/dsp-audit";

/**
 * Writes to a person's record, the hub's side (ADR-045 plane 2, #1173).
 *
 * The neo4j-proxy keeps the hash-chained "record" chain. The hub writes one
 * event before it imports a document into a record, and one when it refuses
 * one. If the event cannot be written, nothing is imported (fail closed): a
 * write to a person's record with no audit record cannot be shown to them
 * (EHDS Art. 9).
 */
export interface RecordAuditRecord {
  event: "document-import";
  outcome: "success" | "failure" | "refused";
  patientId: string;
  actorId: string;
  actorRole: "PATIENT" | "DATA_HOLDER" | "EDC_ADMIN";
  /** Bundle.identifier as `system|value` */
  documentId?: string;
  documentType?: string;
  reason?: string;
}

/** Writes one record; rejects unless the proxy committed it (201). */
export async function recordRecordEvent(
  record: RecordAuditRecord,
): Promise<void> {
  const token = process.env.AUDIT_CALLBACK_TOKEN;
  let status = 0;
  try {
    const res = await fetch(`${NEO4J_PROXY_URL}/audit/record`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { "x-audit-token": token } : {}),
      },
      body: JSON.stringify(record),
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

/** For a refusal or a failure: logged if lost, never undoes the answer. */
export async function recordRecordEventAfter(
  record: RecordAuditRecord,
): Promise<void> {
  try {
    await recordRecordEvent(record);
  } catch (err) {
    console.error(
      `audit: ${record.event} ${record.outcome} not recorded:`,
      err instanceof Error ? err.message : err,
    );
  }
}
