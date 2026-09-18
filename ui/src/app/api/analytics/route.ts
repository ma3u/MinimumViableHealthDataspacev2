import { NextResponse } from "next/server";
import { runQuery } from "@/lib/neo4j";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import { userToParticipantId } from "@/lib/odrl-engine";
import { gateSecondaryUse } from "@/lib/permit-gate";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  // The cohort statistics are secondary use; a data user sees them only
  // under a data permit (Art. 61(1), issue #206 M3). The response names the
  // permit it ran under so the page can show it.
  const { session } = auth;
  const participantId = userToParticipantId(
    session.user.email ?? session.user.name ?? session.user.id,
    session.roles,
  );
  const gate = await gateSecondaryUse({
    consumerDid: participantId,
    roles: session.roles,
    what: "analysis",
  });
  if (!gate.allowed) {
    return NextResponse.json(gate.body, { status: gate.status });
  }
  const permit = gate.check
    ? {
        permitId: gate.check.permitId,
        datasetId: gate.check.datasetId,
        purpose: gate.check.purpose,
        validUntil: gate.check.validUntil,
        article: gate.check.article,
      }
    : null;

  try {
    const [
      summary,
      topConditions,
      topDrugs,
      topMeasurements,
      topProcedures,
      genderBreakdown,
    ] = await Promise.all([
      runQuery<{
        persons: number;
        conditions: number;
        drugs: number;
        measurements: number;
        procedures: number;
        visits: number;
      }>(
        `MATCH (op:OMOPPerson)
         WITH count(op) AS persons
         MATCH (oc:OMOPConditionOccurrence)
         WITH persons, count(oc) AS conditions
         MATCH (od:OMOPDrugExposure)
         WITH persons, conditions, count(od) AS drugs
         MATCH (om:OMOPMeasurement)
         WITH persons, conditions, drugs, count(om) AS measurements
         OPTIONAL MATCH (opo:OMOPProcedureOccurrence)
         WITH persons, conditions, drugs, measurements, count(opo) AS procedures
         MATCH (ov:OMOPVisitOccurrence)
         RETURN persons, conditions, drugs, measurements, procedures, count(ov) AS visits`,
      ),

      runQuery<{ label: string; count: number }>(
        `MATCH (oc:OMOPConditionOccurrence)
         RETURN oc.name AS label, count(oc) AS count
         ORDER BY count DESC LIMIT 15`,
      ),

      runQuery<{ label: string; count: number }>(
        `MATCH (od:OMOPDrugExposure)
         RETURN od.name AS label, count(od) AS count
         ORDER BY count DESC LIMIT 15`,
      ),

      runQuery<{ label: string; count: number }>(
        `MATCH (om:OMOPMeasurement)
         RETURN om.name AS label, count(om) AS count
         ORDER BY count DESC LIMIT 15`,
      ),

      runQuery<{ label: string; count: number }>(
        `MATCH (opo:OMOPProcedureOccurrence)
         RETURN opo.name AS label, count(opo) AS count
         ORDER BY count DESC LIMIT 15`,
      ),

      runQuery<{ gender: string; count: number }>(
        `MATCH (op:OMOPPerson)
         RETURN CASE op.genderConceptId
                  WHEN 8507 THEN 'Male'
                  WHEN 8532 THEN 'Female'
                  ELSE 'Unknown'
                END AS gender,
                count(op) AS count
         ORDER BY count DESC`,
      ),
    ]);

    return NextResponse.json({
      summary: summary[0] ?? {
        persons: 0,
        conditions: 0,
        drugs: 0,
        measurements: 0,
        procedures: 0,
        visits: 0,
      },
      topConditions,
      topDrugs,
      topMeasurements,
      topProcedures,
      genderBreakdown,
      permit,
    });
  } catch (err) {
    console.error("GET /api/analytics error:", err);
    return NextResponse.json({ error: "Neo4j unavailable" }, { status: 502 });
  }
}
