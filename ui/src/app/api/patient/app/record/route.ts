import { NextResponse } from "next/server";
import { requireAppToken, isAppAuthError } from "@/lib/app-auth";
import { ownPatientIdForSession } from "@/lib/overview/patient";
import { loadObservationBundle } from "@/lib/patient/observation-bundle";
import { isSandboxUsername } from "@/lib/sandbox-account";
import {
  MAX_OBSERVATIONS,
  parseReportBundle,
  storeReportRows,
} from "@/lib/patient/app-observations";
import { createRateLimiter } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * GET /api/patient/app/record
 *
 * The connected patient's own record for the Klarbefund app (#473 phase 2,
 * EHDS Art. 3): their Observations as a FHIR R4 searchset Bundle, each with
 * the range the laboratory printed. The same Bundle the browser reads from
 * /api/patient/observations, so the two never disagree.
 *
 * App token and a connected device only (ADR-049). The record is the one the
 * login owns; there is no patientId parameter to try someone else's. Every
 * record on this hub is synthetic, and the Bundle's meta tag says so.
 */
export async function GET(request: Request) {
  const auth = await requireAppToken(request, { device: true });
  if (isAppAuthError(auth)) return auth;
  const patientId = ownPatientIdForSession({
    preferredUsername: auth.app.username,
  });
  if (!patientId) {
    return NextResponse.json(
      { error: "No record is assigned to this login" },
      { status: 404 },
    );
  }
  try {
    const bundle = await loadObservationBundle(
      patientId,
      new URL(request.url).pathname,
    );
    if (!bundle) {
      return NextResponse.json({ error: "Patient not found" }, { status: 404 });
    }
    return NextResponse.json(bundle);
  } catch (err) {
    return NextResponse.json(
      {
        error: "Neo4j unavailable",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }
}

/** A phone syncing every report after an update is a burst, not abuse. */
const limiter = createRateLimiter({
  windowMs: 60_000,
  perKey: 60,
  inTotal: 3000,
});

const REPORT_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/patient/app/record
 *
 * The Klarbefund app sends one report's values into the patient's own record
 * (#473 phase 3, EHDS: the right to add information to one's own record). The
 * body is the FHIR R4 document the app writes for the report; the header
 * `X-Klarbefund-Report` names the report, so sending it again replaces its
 * values rather than doubling them. The person decides once, in the app,
 * that their reports go to their record.
 *
 * Only an account the app created: the demo personas' records are synthetic,
 * and a real person's values must never land in one. Only `preliminary`
 * Observations with a LOINC code; the rest is answered as skipped.
 */
export async function POST(request: Request) {
  const auth = await requireAppToken(request, { device: true });
  if (isAppAuthError(auth)) return auth;
  const { username } = auth.app;
  if (!isSandboxUsername(username)) {
    return NextResponse.json(
      {
        error: "Forbidden",
        reason:
          "values go only into a record the app created; a demo record is synthetic",
      },
      { status: 403 },
    );
  }
  const reportId = request.headers.get("x-klarbefund-report") ?? "";
  if (!REPORT_ID.test(reportId)) {
    return NextResponse.json(
      {
        error: "Bad request",
        reason: "X-Klarbefund-Report must be the report's UUID",
      },
      { status: 400 },
    );
  }
  if (!limiter.allow(username)) {
    return NextResponse.json(
      { error: "Too many reports, try again in a minute" },
      { status: 429 },
    );
  }
  const patientId = ownPatientIdForSession({ preferredUsername: username });
  if (!patientId) {
    return NextResponse.json(
      { error: "No record is assigned to this login" },
      { status: 404 },
    );
  }
  let parsed;
  try {
    parsed = parseReportBundle(await request.json(), { patientId, reportId });
  } catch (err) {
    return NextResponse.json(
      {
        error: "Bad request",
        reason: err instanceof Error ? err.message : "not JSON",
      },
      { status: 400 },
    );
  }
  if (parsed.rows.length > MAX_OBSERVATIONS) {
    return NextResponse.json(
      {
        error: "Too large",
        reason: `at most ${MAX_OBSERVATIONS} values per report`,
      },
      { status: 413 },
    );
  }
  try {
    const stored = await storeReportRows({
      patientId,
      reportId,
      rows: parsed.rows,
    });
    return NextResponse.json(
      { stored, skipped: parsed.skipped },
      { status: 201 },
    );
  } catch (err) {
    console.error("POST /api/patient/app/record:", err);
    return NextResponse.json({ error: "Neo4j unavailable" }, { status: 502 });
  }
}
