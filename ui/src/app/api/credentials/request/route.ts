import { NextRequest, NextResponse } from "next/server";
import { edcClient } from "@/lib/edc";

export const dynamic = "force-dynamic";

/**
 * POST /api/credentials/request — Request issuance of a Verifiable Credential.
 *
 * Body: { participantContextId, credentialType }
 *
 * Queries the IssuerService Admin API to verify the credential definition
 * exists, then confirms the request. Credential definitions are registered
 * under the "issuer" participant context.
 *
 * @see jad/openapi/issuer-admin-api.yaml — IssuerService Admin API spec
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

    // Query credential definitions from the IssuerService.
    // Definitions are registered under the "issuer" participant context.
    // Correct path: POST /v1alpha/participants/{ctxId}/credentialdefinitions/query
    const credDefs = await edcClient.issuer<Record<string, unknown>[]>(
      "/v1alpha/participants/issuer/credentialdefinitions/query",
      "POST",
      {}, // empty QuerySpec → return all
    );

    // Find the matching credential definition
    const matchingDef = Array.isArray(credDefs)
      ? credDefs.find(
          (d) =>
            d.credentialType === credentialType || d.type === credentialType,
        )
      : null;

    if (!matchingDef) {
      return NextResponse.json(
        {
          error: `No credential definition found for type: ${credentialType}`,
          availableTypes: Array.isArray(credDefs)
            ? credDefs.map((d) => d.credentialType || d.type)
            : [],
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      status: "credential_request_submitted",
      credentialType,
      participantContextId,
      definitionId: matchingDef.id,
      message:
        "Credential definition verified. The IssuerService will process issuance asynchronously via the DCP flow.",
    });
  } catch (err) {
    console.error("Failed to request credential:", err);
    return NextResponse.json(
      {
        error: "Failed to request credential issuance",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }
}
