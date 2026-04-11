import { NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import { resolveOdrlScope, userToParticipantId } from "@/lib/odrl-engine";

export const dynamic = "force-dynamic";

/**
 * GET /api/odrl/scope
 *
 * Returns the caller's effective ODRL scope: permissions, prohibitions,
 * accessible datasets, temporal limits, and policy IDs. Used by the
 * query page to display the policy scope indicator.
 */
export async function GET() {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const { session } = auth;
  const participantId = userToParticipantId(
    session.user.email ?? session.user.name ?? session.user.id,
    session.roles,
  );

  const scope = await resolveOdrlScope(participantId);
  return NextResponse.json(scope);
}
