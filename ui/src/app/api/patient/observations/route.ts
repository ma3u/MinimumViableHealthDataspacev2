import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { runQuery } from "@/lib/neo4j";
import { rowsToBundle, type ObservationRow } from "@/lib/overview/observations";
import { ownPatientId } from "@/lib/overview/patient";

export const dynamic = "force-dynamic";

/**
 * GET /api/patient/observations?patientId=<id>[&code=<loinc>]
 *
 * Regulation (EU) 2025/327 Art. 3 (access to one's own electronic health
 * data) and Art. 14 (priority category: laboratory results). Returns the
 * patient's Observations as a FHIR R4 searchset Bundle, each with the
 * reference range the laboratory printed, grouped by nothing: one entry per
 * measurement, oldest first per code.
 *
 * Requires PATIENT or EDC_ADMIN. A PATIENT reads their own record only
 * (issue #271 M1); the demo users patient1 and patient2 own P1 and P2.
 */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const roles = (session as { roles?: string[] } | null)?.roles ?? [];
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!roles.includes("PATIENT") && !roles.includes("EDC_ADMIN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const url = new URL(req.url);
  const patientId = url.searchParams.get("patientId");
  const code = url.searchParams.get("code");
  if (!patientId) {
    return NextResponse.json(
      { error: "patientId is required" },
      { status: 400 },
    );
  }
  if (roles.includes("PATIENT") && !roles.includes("EDC_ADMIN")) {
    const own = ownPatientId(session.user?.name);
    if (!own || own !== patientId) {
      return NextResponse.json(
        {
          error: "Forbidden",
          reason: "Art. 3: a patient reads their own record only",
        },
        { status: 403 },
      );
    }
  }

  try {
    const [patientRows, rows] = await Promise.all([
      runQuery<{ id: string; name: string }>(
        `MATCH (p:Patient)
         WHERE coalesce(p.id, p.resourceId, elementId(p)) = $patientId
         RETURN coalesce(p.id, p.resourceId, elementId(p)) AS id,
                coalesce(p.name, 'Anonymous') AS name
         LIMIT 1`,
        { patientId },
      ),
      runQuery<ObservationRow>(
        `MATCH (p:Patient)-[:HAS_OBSERVATION]->(o:Observation)
         WHERE coalesce(p.id, p.resourceId, elementId(p)) = $patientId
           AND o.valueQuantity IS NOT NULL
           AND ($code IS NULL OR o.code = $code)
         RETURN coalesce(o.resourceId, elementId(o)) AS id,
                coalesce(o.code, '') AS code,
                coalesce(o.display, o.name, o.code, 'Unknown') AS display,
                toFloat(o.valueQuantity) AS value,
                coalesce(o.unit, o.valueUnit, '') AS unit,
                o.referenceLow AS low,
                o.referenceHigh AS high,
                o.referenceText AS rangeText,
                o.category AS category,
                coalesce(toString(o.effectiveDate), o.dateTime, '') AS effective,
                o.performer AS performer
         ORDER BY code, effective
         LIMIT 2000`,
        { patientId, code },
      ),
    ]);
    if (patientRows.length === 0) {
      return NextResponse.json({ error: "Patient not found" }, { status: 404 });
    }
    const bundle = rowsToBundle(
      rows.filter((r) => r.code && Number.isFinite(r.value)),
      patientRows[0],
      `${url.pathname}${url.search}`,
    );
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
