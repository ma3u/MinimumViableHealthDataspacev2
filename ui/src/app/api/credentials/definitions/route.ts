import { NextResponse } from "next/server";
import { edcClient } from "@/lib/edc";
import { requireAuth, isAuthError } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

/** mvhd-issuerservice scales to zero on Azure. Waking it takes about 25 s
 *  from the first request to a ready replica (2026-10-03: scheduled 10:56:39,
 *  container started 10:57:01), and Container Apps holds the request until
 *  then. The client default of 8 s gave up first and answered 502. */
const ISSUER_COLD_START_TIMEOUT_MS = 45_000;

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
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const credDefs = await edcClient.issuer<Record<string, unknown>[]>(
      "/v1alpha/participants/issuer/credentialdefinitions/query",
      "POST",
      {}, // empty QuerySpec → return all
      { timeoutMs: ISSUER_COLD_START_TIMEOUT_MS },
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
