import { NextResponse } from "next/server";
import { edcClient } from "@/lib/edc";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/tenants — List all tenants with their participant profiles.
 * Admin-only endpoint used by the operator dashboard.
 */
export async function GET() {
  try {
    // Fetch tenants from CFM
    const tenants = await edcClient.tenant<
      {
        id: string;
        version: number;
        properties: Record<string, string>;
      }[]
    >("/v1alpha1/tenants");

    // Fetch participant contexts from EDC-V
    const participants = await edcClient.management<
      { "@id": string; identity: string; state: string }[]
    >("/v5alpha/participants");

    // Enrich tenants with participant profiles
    const enriched = await Promise.all(
      tenants.map(async (t) => {
        let profiles: unknown[] = [];
        try {
          profiles = await edcClient.tenant<unknown[]>(
            `/v1alpha1/tenants/${t.id}/participant-profiles`,
          );
        } catch {
          /* no profiles yet */
        }

        return {
          ...t,
          participantProfiles: profiles,
        };
      }),
    );

    return NextResponse.json({
      tenants: enriched,
      participants,
      summary: {
        totalTenants: tenants.length,
        totalParticipants: participants.length,
        byRole: tenants.reduce(
          (acc, t) => {
            const role = t.properties?.role || "unknown";
            acc[role] = (acc[role] || 0) + 1;
            return acc;
          },
          {} as Record<string, number>,
        ),
      },
    });
  } catch (err) {
    console.error("Failed to list admin tenants:", err);
    return NextResponse.json(
      { error: "Failed to list tenants" },
      { status: 502 },
    );
  }
}
