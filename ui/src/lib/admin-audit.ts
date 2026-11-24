import { NextResponse } from "next/server";
import { NEO4J_PROXY_URL } from "@/lib/proxy";
import { AuditUnavailableError } from "@/lib/dsp-audit";

/**
 * Administrative actions on the secure processing environments, the hub's
 * side (#1236; draft SPE implementing act, Art. 16(3)(c), (f)).
 *
 * The neo4j-proxy keeps the hash-chained "admin" chain (src/admin-audit.ts).
 * The hub writes one event before an action takes effect: starting or
 * stopping a workspace, revoking a data permit, deciding a statistical
 * request, reviewing an import. If the event cannot be written, the action
 * does not happen (fail closed).
 */
export interface AdminAuditRecord {
  event:
    | "spe-start"
    | "spe-stop"
    | "permit-revoke"
    | "request-decision"
    | "spe-import"
    | "import-review";
  outcome: "success" | "failure" | "refused";
  actorId: string;
  actorRole: string;
  target: string;
  detail?: string;
  reason?: string;
}

/** The roles the proxy accepts as actors, the strongest the session holds. */
const ROLE_ORDER = [
  "EDC_ADMIN",
  "HDAB_AUTHORITY",
  "DATA_HOLDER",
  "DATA_USER",
] as const;

export function auditRole(roles: string[]): string {
  return ROLE_ORDER.find((r) => roles.includes(r)) ?? "system";
}

/** Writes one record; rejects unless the proxy committed it (201). */
export async function recordAdminEvent(
  record: AdminAuditRecord,
): Promise<void> {
  const token = process.env.AUDIT_CALLBACK_TOKEN;
  let status = 0;
  try {
    const res = await fetch(`${NEO4J_PROXY_URL}/audit/admin`, {
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

/** For an outcome after the fact: logged if lost, never undoes the action. */
export async function recordAdminEventAfter(
  record: AdminAuditRecord,
): Promise<void> {
  try {
    await recordAdminEvent(record);
  } catch (err) {
    console.error(
      `audit: ${record.event} ${record.outcome} not recorded:`,
      err instanceof Error ? err.message : err,
    );
  }
}

/** The answer when the action cannot be recorded, so it is not taken. */
export function auditUnavailableResponse(): NextResponse {
  return NextResponse.json(
    {
      error:
        "The audit trail could not record this action, so it was not taken. Every administrative action on a secure processing environment is recorded first.",
    },
    { status: 503 },
  );
}
