import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { runQuery } from "@/lib/neo4j";

import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

async function requirePatient(): Promise<NextResponse | null> {
  const session = await getServerSession(authOptions);
  const roles = (session as { roles?: string[] } | null)?.roles ?? [];
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!roles.includes("PATIENT") && !roles.includes("EDC_ADMIN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

/**
 * GET /api/patient/research?patientId=<id>
 *
 * EHDS Art. 10 — Research program discovery and consent management.
 * Returns available research programs (DataProduct nodes with research purpose)
 * and existing patient consents.
 *
 * POST /api/patient/research
 * Body: { patientId, studyId, purpose }
 * Creates a PatientConsent node (EHDS Art. 10 — explicit consent).
 */

export async function GET(req: Request) {
  const authError = await requirePatient();
  if (authError) return authError;

  const { searchParams } = new URL(req.url);
  const patientId = searchParams.get("patientId");

  const [programs, consents] = await Promise.all([
    // Available research programs
    runQuery<{
      studyId: string;
      studyName: string;
      institution: string;
      purpose: string;
      description: string;
      dataNeeded: string;
      status: string;
    }>(
      `MATCH (dp:DataProduct)
       OPTIONAL MATCH (dp)-[:OFFERED_BY|:OFFERED]->(p:Participant)
       RETURN coalesce(dp.productId, elementId(dp)) AS studyId,
              coalesce(dp.name, dp.title, 'Research Study') AS studyName,
              coalesce(p.name, 'Research Institution') AS institution,
              coalesce(dp.purpose, 'RESEARCH') AS purpose,
              coalesce(dp.description, 'Health research study') AS description,
              coalesce(dp.dataNeeded, 'FHIR conditions, medications') AS dataNeeded,
              coalesce(dp.status, 'active') AS status
       ORDER BY dp.name
       LIMIT 10`,
    ),
    // Patient's existing consents
    patientId
      ? runQuery<{
          consentId: string;
          studyId: string;
          grantedAt: string;
          revoked: boolean;
          purpose: string;
        }>(
          `MATCH (pc:PatientConsent {patientId: $patientId})
           RETURN pc.consentId AS consentId,
                  pc.studyId AS studyId,
                  toString(pc.grantedAt) AS grantedAt,
                  pc.revoked AS revoked,
                  coalesce(pc.purpose, 'RESEARCH') AS purpose
           ORDER BY pc.grantedAt DESC`,
          { patientId },
        )
      : Promise.resolve([]),
  ]);

  return NextResponse.json({
    programs,
    consents,
    ehdsArticle: "EHDS Art. 10 — Consent for secondary use of health data",
  });
}

export async function POST(req: Request) {
  const authError = await requirePatient();
  if (authError) return authError;

  const body = (await req.json()) as {
    patientId: string;
    studyId: string;
    purpose?: string;
  };
  const { patientId, studyId, purpose = "RESEARCH" } = body;

  if (!patientId || !studyId) {
    return NextResponse.json(
      { error: "patientId and studyId are required" },
      { status: 400 },
    );
  }

  const result = await runQuery<{ consentId: string }>(
    `MATCH (dp:DataProduct)
     WHERE coalesce(dp.productId, elementId(dp)) = $studyId
     MERGE (pc:PatientConsent {
       patientId: $patientId,
       studyId: $studyId
     })
     ON CREATE SET
       pc.consentId  = randomUUID(),
       pc.purpose    = $purpose,
       pc.grantedAt  = datetime(),
       pc.revoked    = false
     WITH pc, dp
     MERGE (pc)-[:FOR_STUDY]->(dp)
     WITH pc
     OPTIONAL MATCH (p:Patient)
       WHERE coalesce(p.id, p.resourceId, elementId(p)) = $patientId
     FOREACH (_ IN CASE WHEN p IS NOT NULL THEN [1] ELSE [] END |
       MERGE (p)-[:HAS_CONSENT]->(pc)
     )
     RETURN pc.consentId AS consentId`,
    { patientId, studyId, purpose },
  );

  return NextResponse.json({
    consentId: result[0]?.consentId,
    patientId,
    studyId,
    purpose,
    grantedAt: new Date().toISOString(),
    message:
      "EHR donation registered. Your pseudonymised data will be used in this study.",
    ehdsArticle: "EHDS Art. 10",
  });
}

export async function DELETE(req: Request) {
  const authError = await requirePatient();
  if (authError) return authError;

  const { searchParams } = new URL(req.url);
  const consentId = searchParams.get("consentId");
  const patientId = searchParams.get("patientId");

  if (!consentId || !patientId) {
    return NextResponse.json(
      { error: "consentId and patientId are required" },
      { status: 400 },
    );
  }

  const result = await runQuery<{ consentId: string }>(
    `MATCH (pc:PatientConsent {consentId: $consentId, patientId: $patientId})
     SET pc.revoked = true, pc.revokedAt = datetime()
     RETURN pc.consentId AS consentId`,
    { consentId, patientId },
  );

  if (result.length === 0) {
    return NextResponse.json({ error: "Consent not found" }, { status: 404 });
  }

  return NextResponse.json({
    revoked: true,
    consentId,
    revokedAt: new Date().toISOString(),
    gdprArticle: "GDPR Art. 17 — Right to erasure / restriction of processing",
  });
}
