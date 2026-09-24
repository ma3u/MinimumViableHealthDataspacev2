import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { runQuery } from "@/lib/neo4j";
import { ownPatientIdForSession } from "@/lib/overview/patient";
import { EHR_SYNC_SOURCE, ehrSyncFromRow } from "@/lib/patient/ehr-sync";

export const dynamic = "force-dynamic";

/**
 * POST /api/patient/ehr-sync
 *
 * Records that the patient's ePA was just transferred into the portal
 * (the "Request EHR data" flow on /patient, EHDS Art. 3): stamps
 * ehrSyncedAt and ehrSyncSource on the record the login owns and answers
 * with the new sync. Only a PATIENT may stamp, and only their own record.
 */
export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const roles = (session as { roles?: string[] }).roles ?? [];
    if (!roles.includes("PATIENT")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const patientId = ownPatientIdForSession(session);
    if (!patientId) {
      return NextResponse.json(
        { error: "No record is assigned to this login" },
        { status: 404 },
      );
    }
    const rows = await runQuery<{
      ehrSyncedAt: string | null;
      ehrSyncSource: string | null;
    }>(
      `MATCH (p:Patient)
       WHERE coalesce(p.id, p.resourceId) = $patientId
       SET p.ehrSyncedAt = datetime.truncate('second', datetime()),
           p.ehrSyncSource = $source
       RETURN toString(p.ehrSyncedAt) AS ehrSyncedAt,
              p.ehrSyncSource         AS ehrSyncSource`,
      { patientId, source: EHR_SYNC_SOURCE },
    );
    const sync = ehrSyncFromRow(rows[0]);
    if (!sync) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ patientId, lastEhrSync: sync });
  } catch (err) {
    console.error("POST /api/patient/ehr-sync error:", err);
    return NextResponse.json({ error: "Neo4j unavailable" }, { status: 502 });
  }
}
