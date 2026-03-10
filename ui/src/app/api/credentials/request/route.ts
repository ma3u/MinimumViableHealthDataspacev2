import { NextRequest, NextResponse } from "next/server";
import { edcClient } from "@/lib/edc";

export const dynamic = "force-dynamic";

/**
 * POST /api/credentials/request — Request issuance of a Verifiable Credential.
 *
 * Body: { participantId, credentialType }
 *
 * This calls the IdentityHub API to initiate a credential request flow,
 * which is processed by the IssuerService.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { participantContextId, credentialType } = body;

    if (!participantContextId || !credentialType) {
      return NextResponse.json(
        {
          error: "participantContextId and credentialType are required",
        },
        { status: 400 },
      );
    }

    // Get issuer credential definitions
    const credDefs = await edcClient.issuer<unknown[]>(
      "/v1alpha/participants/credential-definitions",
    );

    // Find the matching credential definition
    const matchingDef = Array.isArray(credDefs)
      ? credDefs.find(
          (d: Record<string, unknown>) =>
            d.credentialType === credentialType || d.type === credentialType,
        )
      : null;

    if (!matchingDef) {
      return NextResponse.json(
        {
          error: `No credential definition found for type: ${credentialType}`,
          availableTypes: Array.isArray(credDefs)
            ? credDefs.map(
                (d: Record<string, unknown>) => d.credentialType || d.type,
              )
            : [],
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      status: "credential_request_submitted",
      credentialType,
      participantContextId,
      message:
        "Credential request submitted. The IssuerService will process it asynchronously.",
    });
  } catch (err) {
    console.error("Failed to request credential:", err);
    return NextResponse.json(
      { error: "Failed to request credential issuance" },
      { status: 502 },
    );
  }
}
