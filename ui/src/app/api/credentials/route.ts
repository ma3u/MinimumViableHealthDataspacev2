import { NextResponse } from "next/server";
import { runQuery } from "@/lib/neo4j";

export const dynamic = "force-dynamic";

interface Credential {
  credentialId: string;
  credentialType: string;
  subjectDid: string;
  issuerDid: string;
  status: string;
  participantRole: string | null;
  holderName: string | null;
  holderType: string | null;
  issuedAt: string;
  expiresAt: string;
  // Membership fields
  membership: string | null;
  membershipType: string | null;
  // EHDS fields
  jurisdiction: string | null;
  ehdsArticle: string | null;
  // DataProcessingPurpose fields
  purpose: string | null;
  // DataQualityLabel fields
  datasetId: string | null;
  completeness: number | null;
  conformance: number | null;
  timeliness: number | null;
}

export async function GET() {
  const credentials = await runQuery<Credential>(
    `MATCH (vc:VerifiableCredential)
     OPTIONAL MATCH (p:Participant)-[:HOLDS_CREDENTIAL]->(vc)
     OPTIONAL MATCH (vc)-[:ATTESTS_QUALITY]->(ds:HealthDataset)
     RETURN vc.credentialId     AS credentialId,
            vc.credentialType   AS credentialType,
            vc.subjectDid       AS subjectDid,
            vc.issuerDid        AS issuerDid,
            vc.status           AS status,
            vc.participantRole  AS participantRole,
            p.name              AS holderName,
            p.participantType   AS holderType,
            toString(vc.issuedAt)  AS issuedAt,
            toString(vc.expiresAt) AS expiresAt,
            vc.membership       AS membership,
            vc.membershipType   AS membershipType,
            vc.jurisdiction     AS jurisdiction,
            vc.ehdsArticle      AS ehdsArticle,
            vc.purpose          AS purpose,
            vc.datasetId        AS datasetId,
            vc.completeness     AS completeness,
            vc.conformance      AS conformance,
            vc.timeliness       AS timeliness
     ORDER BY p.name, vc.credentialType`,
  );

  return NextResponse.json({ credentials });
}
