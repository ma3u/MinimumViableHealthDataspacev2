import { NextResponse } from "next/server";
import { runQuery } from "@/lib/neo4j";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import { refuseForeignRecord } from "@/lib/patient/own-record";
import { validInterests } from "@/lib/patient/interests";

export const dynamic = "force-dynamic";

/**
 * PUT /api/patient/profile/interests  { patientId, interests: string[] }
 *
 * A patient names their own health interests, from the suggested list in
 * lib/patient/interests.ts. Their choice replaces the interests the profile
 * suggests from the record. Only the patient, and only on their own record
 * (EHDS Art. 3; GDPR Art. 16, rectification).
 */
export async function PUT(req: Request) {
  const auth = await requireAuth(["PATIENT"]);
  if (isAuthError(auth)) return auth;

  const body = (await req.json().catch(() => null)) as {
    patientId?: unknown;
    interests?: unknown;
  } | null;
  const patientId = typeof body?.patientId === "string" ? body.patientId : null;
  if (!patientId) {
    return NextResponse.json(
      { error: "patientId is required" },
      { status: 400 },
    );
  }
  const interests = validInterests(body?.interests);
  if (!interests) {
    return NextResponse.json(
      { error: "interests must be a list of ids from the suggested list" },
      { status: 400 },
    );
  }

  const foreign = await refuseForeignRecord(auth.session.roles, patientId);
  if (foreign) return foreign;

  const rows = await runQuery<{ interests: string[] }>(
    `MATCH (p:Patient)
     WHERE coalesce(p.id, p.resourceId, elementId(p)) = $patientId
     SET p.interests = $interests, p.interestsChosenAt = datetime()
     RETURN p.interests AS interests`,
    { patientId, interests },
  );
  if (rows.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ patientId, interests: rows[0].interests });
}
