import { NextRequest, NextResponse } from "next/server";
import { runQuery } from "@/lib/neo4j";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import { ownRecordId, refuseForeignRecord } from "@/lib/patient/own-record";
import {
  OPT_OUT_ARTICLE,
  OPT_OUT_CYPHER,
  OPT_OUT_HISTORY_CYPHER,
  PERSON_LABELS,
  REVERSE_OPT_OUT_CYPHER,
  openOptOut,
  type OptOutRecordRow,
} from "@/lib/opt-out";

export const dynamic = "force-dynamic";

/**
 * The person's opt-out from secondary use (Regulation (EU) 2025/327, Art. 71;
 * ADR-062).
 *
 * GET    → whether the person is opted out, since when, and every earlier
 *          opt-out and its reversal
 * POST   → opt out, at once and without a reason; idempotent
 * DELETE → reverse it; secondary use resumes for future permits
 *
 * A PATIENT acts on their own record, named or not; EDC_ADMIN names the
 * record with ?patientId= (GET, DELETE) or in the body (POST).
 */
async function resolvePatient(
  named: string | null,
): Promise<{ patientId: string } | NextResponse> {
  const auth = await requireAuth(["PATIENT", "EDC_ADMIN"]);
  if (isAuthError(auth)) return auth;
  const patientId = named ?? (await ownRecordId());
  if (!patientId) {
    return NextResponse.json(
      { error: "patientId is required" },
      { status: 400 },
    );
  }
  const refused = await refuseForeignRecord(auth.session.roles, patientId);
  return refused ?? { patientId };
}

async function history(patientId: string): Promise<OptOutRecordRow[]> {
  return runQuery<OptOutRecordRow>(OPT_OUT_HISTORY_CYPHER, { patientId });
}

function state(patientId: string, rows: OptOutRecordRow[]) {
  const open = openOptOut(rows);
  return {
    patientId,
    optedOut: open !== null,
    since: open?.optedOutAt ?? null,
    history: rows,
    article: OPT_OUT_ARTICLE,
  };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const who = await resolvePatient(req.nextUrl.searchParams.get("patientId"));
  if (who instanceof NextResponse) return who;
  try {
    return NextResponse.json(
      state(who.patientId, await history(who.patientId)),
    );
  } catch (err) {
    return NextResponse.json(
      { error: "Neo4j unavailable", detail: String(err) },
      { status: 502 },
    );
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = (await req.json().catch(() => ({}))) as {
    patientId?: string;
    source?: string;
  };
  const who = await resolvePatient(body.patientId ?? null);
  if (who instanceof NextResponse) return who;
  try {
    const rows = await runQuery<{ optOutId: string; marked: number }>(
      OPT_OUT_CYPHER,
      {
        patientId: who.patientId,
        source: body.source ?? "patient-portal",
        personLabels: [...PERSON_LABELS],
      },
    );
    if (rows.length === 0) {
      return NextResponse.json(
        { error: `No record found for '${who.patientId}'` },
        { status: 404 },
      );
    }
    return NextResponse.json({
      ...state(who.patientId, await history(who.patientId)),
      message:
        "You have opted out of secondary use. From now on your data is left out of every new extraction; what a permit already received before today is not recalled (Art. 71).",
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Neo4j unavailable", detail: String(err) },
      { status: 502 },
    );
  }
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const who = await resolvePatient(req.nextUrl.searchParams.get("patientId"));
  if (who instanceof NextResponse) return who;
  try {
    const rows = await runQuery<{ optOutId: string }>(REVERSE_OPT_OUT_CYPHER, {
      patientId: who.patientId,
      source: req.nextUrl.searchParams.get("source") ?? "patient-portal",
      personLabels: [...PERSON_LABELS],
    });
    if (rows.length === 0) {
      return NextResponse.json(
        { error: "There is no open opt-out to reverse" },
        { status: 404 },
      );
    }
    return NextResponse.json({
      ...state(who.patientId, await history(who.patientId)),
      message:
        "Your opt-out is reversed. Your data may be used again under future permits; the earlier opt-out stays on record.",
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Neo4j unavailable", detail: String(err) },
      { status: 502 },
    );
  }
}
