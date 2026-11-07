import { NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import { listDemo, DEMO_ONBOARDING_SCOPE } from "@/lib/demo-records";
import { listTenantViews } from "@/lib/edc/participants";

export const dynamic = "force-dynamic";

/**
 * GET /api/participants/me — The participants, in the tenant shape the
 * onboarding page reads.
 *
 * In a production system this would look up the participant matching the
 * authenticated user's DID; in the demo it lists every control plane context
 * (ADR-078: a participant is its context, CFM's tenants are gone), each with
 * whether the issuer has delivered its MembershipCredential yet.
 *
 * Registrations this process recorded without provisioning them come first,
 * and an unreachable control plane yields just those rather than a 502
 * (issue #203).
 */
export async function GET() {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const demoTenants = listDemo("participant", DEMO_ONBOARDING_SCOPE);

  try {
    // Newest registration first: the page reloads this list right after
    // submitting, and the one just submitted is the one to show.
    const views = (await listTenantViews()).sort((a, b) =>
      (b.properties.registeredAt ?? "").localeCompare(
        a.properties.registeredAt ?? "",
      ),
    );
    return NextResponse.json([...demoTenants, ...views]);
  } catch (err) {
    // The page renders a non-ok answer as an empty list and says nothing, so
    // returning what we do have, rather than a 502, is both more honest and
    // more useful.
    console.warn("Control plane unavailable, listing demo tenants:", err);
    return NextResponse.json(demoTenants);
  }
}
