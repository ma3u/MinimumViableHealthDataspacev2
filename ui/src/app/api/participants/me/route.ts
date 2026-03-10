import { NextResponse } from "next/server";
import { edcClient } from "@/lib/edc";

export const dynamic = "force-dynamic";

/**
 * GET /api/participants/me — Get the current user's tenant profile.
 *
 * Lists all tenants from CFM TenantManager. In a production system this
 * would look up the tenant matching the authenticated user's DID; in the
 * demo we return all tenants with their profiles.
 */
export async function GET() {
  try {
    const tenants = await edcClient.tenant<
      {
        id: string;
        version: number;
        properties: Record<string, string>;
      }[]
    >("/v1alpha1/tenants");

    // Enrich each tenant with its participant profiles
    const enriched = await Promise.all(
      tenants.map(async (t) => {
        try {
          const profiles = await edcClient.tenant<unknown[]>(
            `/v1alpha1/tenants/${t.id}/participant-profiles`,
          );
          return { ...t, participantProfiles: profiles };
        } catch {
          return { ...t, participantProfiles: [] };
        }
      }),
    );

    return NextResponse.json(enriched);
  } catch (err) {
    console.error("Failed to get participant profile:", err);
    return NextResponse.json(
      { error: "Failed to get participant profile" },
      { status: 502 },
    );
  }
}
