import { NextResponse } from "next/server";
import type { AuthSession } from "@/lib/auth-guard";
import { runQuery } from "@/lib/neo4j";
import { userToParticipantId } from "@/lib/odrl-engine";
import { refuseForeignRecord } from "@/lib/patient/own-record";
import type { Importer } from "./store";

/**
 * Who may import a document into a record (#1173):
 *
 * - the person, into their own record (`refuseForeignRecord`, EHDS Art. 3
 *   and Art. 15(4));
 * - a data holder, into the record of a patient it treats: the graph's
 *   `(:Patient)-[:TREATED_AT]->(:Participant)`, matched on the participant
 *   DID the session maps to (`userToParticipantId`, as the permit and
 *   transfer routes do);
 * - the operator (`EDC_ADMIN`), into any record of the demo.
 *
 * The audit trail names the importer by that DID, or by the record for the
 * person themselves: never by a name or a mail address.
 */
export async function importerFor(
  session: AuthSession,
  patientId: string,
): Promise<Importer | NextResponse> {
  const { roles, user } = session;
  if (roles.includes("EDC_ADMIN")) {
    return {
      role: "EDC_ADMIN",
      id: userToParticipantId(user.email ?? user.name ?? user.id, roles),
    };
  }
  if (roles.includes("DATA_HOLDER")) {
    const did = userToParticipantId(user.email ?? user.name ?? user.id, roles);
    const treated = await runQuery<{ treated: boolean }>(
      `MATCH (p:Patient)
       WHERE coalesce(p.id, p.resourceId, elementId(p)) = $patientId
       RETURN EXISTS {
         (p)-[:TREATED_AT]->(:Participant {participantId: $did})
       } AS treated`,
      { patientId, did },
    );
    if (!treated[0]?.treated) {
      return NextResponse.json(
        {
          error: "Forbidden",
          reason:
            "a data holder imports into the records of its own patients only",
        },
        { status: 403 },
      );
    }
    return { role: "DATA_HOLDER", id: did };
  }
  const foreign = await refuseForeignRecord(roles, patientId);
  if (foreign) return foreign;
  return { role: "PATIENT", id: `patient-record:${patientId}` };
}
