import { NextResponse } from "next/server";
import { requireAppToken, isAppAuthError } from "@/lib/app-auth";
import { ownPatientIdForSession } from "@/lib/overview/patient";
import { isSandboxUsername } from "@/lib/sandbox-account";
import {
  MAX_WEARABLE_OBSERVATIONS,
  parseWearableBundle,
  storeWearableRows,
} from "@/lib/patient/app-wearables";
import { createRateLimiter } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** A sync after the switch is turned on, and one now and then after that. */
const limiter = createRateLimiter({
  windowMs: 60_000,
  perKey: 6,
  inTotal: 600,
});

/**
 * POST /api/patient/app/wearables
 *
 * The Klarbefund app sends the person's weekly device values from Apple
 * Health into their own record (ADR-057): resting heart rate, heart rate
 * variability, steps per day and body weight, one mean per week. The person
 * turns this on in the app with its own switch, apart from the lab reports.
 * Each sync replaces the previous one.
 *
 * App token and a connected device only (ADR-049), and only an account the
 * app created: a demo persona's record is synthetic, and a real person's
 * values must never land in one (as POST /api/patient/app/record).
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
  if (!limiter.allow(username)) {
    return NextResponse.json(
      { error: "Too many syncs, try again in a minute" },
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
    parsed = parseWearableBundle(await request.json(), patientId);
  } catch (err) {
    return NextResponse.json(
      {
        error: "Bad request",
        reason: err instanceof Error ? err.message : "not JSON",
      },
      { status: 400 },
    );
  }
  if (parsed.rows.length > MAX_WEARABLE_OBSERVATIONS) {
    return NextResponse.json(
      {
        error: "Too large",
        reason: `at most ${MAX_WEARABLE_OBSERVATIONS} weekly values per sync`,
      },
      { status: 413 },
    );
  }
  try {
    const stored = await storeWearableRows({ patientId, rows: parsed.rows });
    return NextResponse.json(
      { stored, skipped: parsed.skipped },
      { status: 201 },
    );
  } catch (err) {
    console.error("POST /api/patient/app/wearables:", err);
    return NextResponse.json({ error: "Neo4j unavailable" }, { status: 502 });
  }
}
