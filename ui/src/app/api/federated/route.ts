import { NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import { userToParticipantId } from "@/lib/odrl-engine";
import { activePermitHeaders } from "@/lib/permit-gate";

export const dynamic = "force-dynamic";

const PROXY_URL = process.env.NEO4J_PROXY_URL ?? "http://localhost:9090";

export async function GET() {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    // The proxy records every request it serves as a TransferEvent, the
    // access log behind /admin/audit. Without this header the entry says
    // "unknown" instead of who asked (issue #205).
    const { session } = auth;
    const participantId = userToParticipantId(
      session.user.email ?? session.user.name ?? session.user.id,
      session.roles,
    );
    const permitHeaders = await activePermitHeaders(participantId);
    const resp = await fetch(`${PROXY_URL}/federated/stats`, {
      headers: { "X-Participant": participantId, ...permitHeaders },
    });
    const data = await resp.json();
    return NextResponse.json(data);
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Federated stats proxy error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
