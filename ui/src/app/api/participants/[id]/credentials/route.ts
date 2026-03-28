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

/** Raw IH credential resource — the actual VC is nested deeper */
interface IHCredentialResource {
  id?: string;
  state?: number;
  verifiableCredential?: {
    credential?: {
      id?: string;
      type?: string[];
      issuer?: { id?: string };
      issuanceDate?: string;
      expirationDate?: string;
      credentialSubject?: Array<Record<string, unknown>>;
      credentialStatus?: Array<{ type?: string; statusPurpose?: string }>;
    };
  };
}

function toVC(r: IHCredentialResource): VerifiableCredential {
  const c = r.verifiableCredential?.credential;
  return {
    id: c?.id ?? r.id,
    type: c?.type,
    issuer: c?.issuer?.id,
    issuanceDate: c?.issuanceDate,
    expirationDate: c?.expirationDate,
    credentialSubject: c?.credentialSubject?.[0],
    credentialStatus: c?.credentialStatus?.[0]
      ? {
          type: c.credentialStatus[0].type ?? "",
          status: c.credentialStatus[0].statusPurpose ?? "",
        }
      : undefined,
  };
}

/**
 * GET /api/participants/[id]/credentials
 * Fetches verifiable credentials from IdentityHub for every participant
 * context associated with this tenant.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const profiles = await edcClient.tenant<ParticipantProfile[]>(
      `/v1alpha1/tenants/${id}/participant-profiles`,
    );

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
          const data = await edcClient.identity<IHCredentialResource[]>(
            `/v1alpha/participants/${ctxId}/credentials`,
          );
          const vcs = Array.isArray(data) ? data.map(toVC) : [];
          return {
            profileId: pp.id,
            participantContextId: ctxId,
            did,
            credentials: vcs,
          };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return {
            profileId: pp.id,
            participantContextId: ctxId,
            did,
            credentials: [],
            error: msg,
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
