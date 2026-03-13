import { NextRequest, NextResponse } from "next/server";
import { edcClient } from "@/lib/edc";

export const dynamic = "force-dynamic";

interface ParticipantProfile {
  id: string;
  identifier?: string;
  error?: boolean;
  properties?: {
    "cfm.vpa.state"?: {
      participantContextId?: string;
    };
  };
}

interface VerifiableCredential {
  id?: string;
  type?: string[];
  issuer?: string;
  issuanceDate?: string;
  expirationDate?: string;
  credentialSubject?: Record<string, unknown>;
  credentialStatus?: { type: string; status: string };
}

/**
 * GET /api/participants/[id]/credentials
 * Fetches verifiable credentials from IdentityHub for every participant
 * context associated with this tenant.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const profiles = await edcClient.tenant<ParticipantProfile[]>(
      `/v1alpha1/tenants/${params.id}/participant-profiles`,
    );

    const IH_BASE =
      process.env.EDC_IDENTITYHUB_URL ||
      "http://localhost:11005";

    const results = await Promise.all(
      profiles.map(async (pp) => {
        const ctxId = pp.properties?.["cfm.vpa.state"]?.participantContextId;
        const did = pp.identifier
          ? decodeURIComponent(pp.identifier)
          : undefined;

        if (!ctxId) {
          return {
            profileId: pp.id,
            participantContextId: null,
            did,
            credentials: [],
            error: "No participant context ID",
          };
        }

        try {
          const res = await fetch(
            `${IH_BASE}/v1alpha/participants/${ctxId}/credentials`,
            { headers: { "Content-Type": "application/json" } },
          );
          const data: VerifiableCredential[] = res.ok ? await res.json() : [];
          return {
            profileId: pp.id,
            participantContextId: ctxId,
            did,
            credentials: Array.isArray(data) ? data : [],
          };
        } catch {
          return {
            profileId: pp.id,
            participantContextId: ctxId,
            did,
            credentials: [],
            error: "IdentityHub unreachable",
          };
        }
      }),
    );

    return NextResponse.json(results);
  } catch (err) {
    console.error("Failed to get credentials:", err);
    return NextResponse.json(
      { error: "Failed to get credentials" },
      { status: 502 },
    );
  }
}
