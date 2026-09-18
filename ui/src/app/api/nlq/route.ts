import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import { resolveOdrlScope, userToParticipantId } from "@/lib/odrl-engine";
import { gateSecondaryUse } from "@/lib/permit-gate";

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
    // Art. 61(1): a data user queries the secure processing environment only
    // under a data permit. The access body's refusal or revocation stops the
    // query here, with the article (issue #206, M3). A dataset named in the
    // body is checked strictly, as for a transfer.
    const gate = await gateSecondaryUse({
      consumerDid: participantId,
      roles: session.roles,
      datasetId: typeof body.datasetId === "string" ? body.datasetId : null,
      what: "query",
    });
    if (!gate.allowed) {
      return NextResponse.json(gate.body, { status: gate.status });
    }
    const odrlScope = await resolveOdrlScope(participantId);

    // The proxy records the query as a TransferEvent; the gate's headers give
    // the record its permit, dataset and purpose.
    const resp = await fetch(`${PROXY_URL}/nlq`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Participant": participantId,
        ...gate.headers,
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
