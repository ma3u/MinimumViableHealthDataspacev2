import { NextResponse } from "next/server";
import { edcClient } from "@/lib/edc";

export const dynamic = "force-dynamic";

/**
 * GET /api/credentials/definitions — List available credential definitions.
 *
 * Queries the IssuerService Admin API for all credential definitions
 * registered under the "issuer" participant context. These define which
 * Verifiable Credential types can be issued.
 *
 * @see jad/openapi/issuer-admin-api.yaml — IssuerService Admin API spec
 */
export async function GET() {
  try {
    const credDefs = await edcClient.issuer<Record<string, unknown>[]>(
      "/v1alpha/participants/issuer/credentialdefinitions/query",
      "POST",
      {}, // empty QuerySpec → return all
    );

    const definitions = Array.isArray(credDefs)
      ? credDefs.map((d) => ({
          id: d.id,
          credentialType: d.credentialType || d.type,
          format: d.format,
          attestations: d.attestations,
          validity: d.validity,
        }))
      : [];

    return NextResponse.json({ definitions });
  } catch (err) {
    console.error("Failed to fetch credential definitions:", err);
    return NextResponse.json(
      {
        definitions: [],
        error: "Could not reach IssuerService",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }
}
