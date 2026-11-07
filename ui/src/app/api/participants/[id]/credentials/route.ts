import { NextRequest, NextResponse } from "next/server";
import { edcClient } from "@/lib/edc";
import { getContext } from "@/lib/edc/participants";
import { requireAuth, isAuthError } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

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
 * Fetches the verifiable credentials IdentityHub holds for one participant.
 * The id is the control plane context id, which IdentityHub shares (ADR-078).
 * Answers a one-element list, the shape the settings page read when a CFM
 * tenant could have several participant profiles.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const { id } = await params;
    const ctx = await getContext(id);
    const did = ctx.identity ? decodeURIComponent(ctx.identity) : undefined;
    const base = { profileId: id, participantContextId: id, did };

    try {
      const data = await edcClient.identity<IHCredentialResource[]>(
        `/v1/participants/${encodeURIComponent(id)}/credentials`,
      );
      const vcs = Array.isArray(data) ? data.map(toVC) : [];
      return NextResponse.json([{ ...base, credentials: vcs }]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return NextResponse.json([{ ...base, credentials: [], error: msg }]);
    }
  } catch (err) {
    // Carry the cause, the way /api/admin/policies already does: without it
    // the bare message says only that something upstream refused, and the
    // next person starts guessing from nothing.
    console.error("Failed to get credentials:", err);
    return NextResponse.json(
      { error: "Failed to get credentials", detail: String(err) },
      { status: 502 },
    );
  }
}
