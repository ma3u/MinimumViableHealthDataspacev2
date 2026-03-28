import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { edcClient } from "@/lib/edc";

import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/tenants — List all tenants with their participant profiles.
 * Admin-only endpoint used by the operator dashboard.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  const roles = (session as { roles?: string[] } | null)?.roles ?? [];
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!roles.includes("EDC_ADMIN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    // Fetch tenants from CFM
    const tenants = await edcClient.tenant<
      {
        id: string;
        version: number;
        properties: Record<string, string>;
      }[]
    >("/v1alpha1/tenants");

    // Fetch participant contexts from EDC-V (may fail if auth is unavailable)
    let participants: { "@id": string; identity: string; state: string }[] = [];
    try {
      participants = await edcClient.management<
        { "@id": string; identity: string; state: string }[]
      >("/v5alpha/participants");
    } catch (err) {
      console.warn(
        "Could not fetch participants (auth may be unavailable):",
        err,
      );
    }

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
