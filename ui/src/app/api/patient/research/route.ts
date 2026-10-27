import { NextResponse } from "next/server";
import { runQuery } from "@/lib/neo4j";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import { refuseForeignRecord } from "@/lib/patient/own-record";

export const dynamic = "force-dynamic";

/**
 * PATIENT or EDC_ADMIN, and a patient only for their own record: reading
 * another patient's consents, or consenting or withdrawing in their name, is
 * refused (#475; EHDS Art. 3, GDPR Art. 7).
 */
async function requirePatient(
  patientId: string | null,
): Promise<NextResponse | null> {
  const auth = await requireAuth(["PATIENT", "EDC_ADMIN"]);
  if (isAuthError(auth)) return auth;
  return patientId ? refuseForeignRecord(auth.session.roles, patientId) : null;
}

/**
 * GET /api/patient/research?patientId=<id>
 *
 * Research programme discovery and study consent. Joining a study is a
 * consent under GDPR Art. 6(1)(a) and 9(2)(a), withdrawable at any time
 * (Art. 7(3)); it is separate from the EHDS, where secondary use under a
 * permit is the default and the person may opt out (Art. 71,
 * /api/patient/opt-out). Returns the programmes (DataProduct nodes with a
 * research purpose) and the patient's study consents.
 *
 * POST /api/patient/research
 * Body: { patientId, studyId, purpose }
 * Creates a PatientConsent node: consent to one study (GDPR Art. 9(2)(a)).
 */

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const patientId = searchParams.get("patientId");
  const authError = await requirePatient(patientId);
  if (authError) return authError;

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
          revokedAt: string | null;
          purpose: string;
          dataScope: string | null;
        }>(
          `MATCH (pc:PatientConsent {patientId: $patientId})
           RETURN pc.consentId AS consentId,
                  pc.studyId AS studyId,
                  toString(pc.grantedAt) AS grantedAt,
                  coalesce(pc.revoked, false) AS revoked,
                  toString(pc.revokedAt) AS revokedAt,
                  coalesce(pc.purpose, 'RESEARCH') AS purpose,
                  pc.dataScope AS dataScope
           ORDER BY pc.grantedAt DESC`,
          { patientId },
        )
      : Promise.resolve([]),
  ]);

  return NextResponse.json({
    programs,
    consents,
    ehdsArticle:
      "Study consent, GDPR Art. 9(2)(a); the EHDS opt-out from secondary use is Art. 71",
  });
}

export async function POST(req: Request) {
  const gate = await requirePatient(null);
  if (gate) return gate;

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
  const authError = await requirePatient(patientId);
  if (authError) return authError;

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

  // The MATCH above yields no rows when no DataProduct carries this studyId, so
  // the MERGE never runs and nothing is written. This route used to answer 200
  // with a "registered" message anyway, telling a patient their consent was
  // recorded when it was not (#349). A consent for a study that does not exist
  // is a 404, not a silent success.
  if (result.length === 0 || !result[0]?.consentId) {
    return NextResponse.json(
      { error: `No research programme found for studyId '${studyId}'` },
      { status: 404 },
    );
  }

  return NextResponse.json({
    consentId: result[0].consentId,
    patientId,
    studyId,
    purpose,
    grantedAt: new Date().toISOString(),
    message:
      "EHR donation registered. Your pseudonymised data will be used in this study.",
    ehdsArticle: "GDPR Art. 9(2)(a), study consent",
  });
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const consentId = searchParams.get("consentId");
  const patientId = searchParams.get("patientId");
  const authError = await requirePatient(patientId);
  if (authError) return authError;

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
    gdprArticle: "GDPR Art. 7(3) — withdrawal of consent",
  });
}
