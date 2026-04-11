import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import { resolveOdrlScope, userToParticipantId } from "@/lib/odrl-engine";

export const dynamic = "force-dynamic";

const PROXY_URL = process.env.NEO4J_PROXY_URL ?? "http://localhost:9090";

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const body = await request.json();

    // Resolve caller's ODRL scope and forward to neo4j-proxy
    const { session } = auth;
    const participantId = userToParticipantId(
      session.user.email ?? session.user.name ?? session.user.id,
      session.roles,
    );
    const odrlScope = await resolveOdrlScope(participantId);

    const resp = await fetch(`${PROXY_URL}/nlq`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Participant": participantId,
      },
      body: JSON.stringify({ ...body, odrlScope }),
    });
    const data = await resp.json();
    return NextResponse.json(data, { status: resp.status });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "NLQ proxy error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function GET() {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const resp = await fetch(`${PROXY_URL}/nlq/templates`);
    const data = await resp.json();
    return NextResponse.json(data);
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "NLQ templates proxy error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
