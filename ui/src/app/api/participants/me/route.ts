import { NextResponse } from "next/server";
import { edcClient } from "@/lib/edc";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import { listDemo, DEMO_ONBOARDING_SCOPE } from "@/lib/demo-records";

export const dynamic = "force-dynamic";

/**
 * GET /api/participants/me — Get the current user's tenant profile.
 *
 * Lists all tenants from CFM TenantManager. In a production system this
 * would look up the tenant matching the authenticated user's DID; in the
 * demo we return all tenants with their profiles.
 *
 * Tenants the demonstrator recorded itself come first, and an unavailable
 * TenantManager yields just those rather than a 502 (issue #203).
 */
export async function GET() {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  // Registrations this process recorded because nothing could provision them
  // (see lib/demo-records.ts). They come first: the newest is the one the user
  // just submitted, and the page reloads this list right after submitting.
  const demoTenants = listDemo("participant", DEMO_ONBOARDING_SCOPE);

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

    return NextResponse.json([...demoTenants, ...enriched]);
  } catch (err) {
    // The Tenant Manager is absent on the Azure deployment (issue #203), which
    // is not a fault of this request. The page renders a non-ok answer as an
    // empty list and says nothing, so returning what we do have, rather than a
    // 502, is both more honest and more useful.
    console.warn("CFM Tenant Manager unavailable, listing demo tenants:", err);
    return NextResponse.json(demoTenants);
  }
}
