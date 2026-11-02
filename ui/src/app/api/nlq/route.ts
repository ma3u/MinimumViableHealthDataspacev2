import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import { resolveOdrlScope, userToParticipantId } from "@/lib/odrl-engine";
import { gateSecondaryUse } from "@/lib/permit-gate";
import { NEO4J_PROXY_URL, callerHeaders, loadTestHeaders } from "@/lib/proxy";
import { seesPatientIdentity } from "@/lib/patient-identity";
import { speColdStartGate } from "@/lib/spe-power";

export const dynamic = "force-dynamic";

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
    // A federated question asks every SPE workspace; a stopped one is
    // started (when the caller may) and the caller told to come back
    // (ADR-072). Without `federated` the hub graph answers, no workspace.
    if (body.federated === true) {
      const coldStart = await speColdStartGate(session.roles);
      if (coldStart) return coldStart;
    }
    const odrlScope = await resolveOdrlScope(participantId);

    // The proxy records the query as a TransferEvent; the gate's headers give
    // the record its permit, dataset and purpose.
    const resp = await fetch(`${NEO4J_PROXY_URL}/nlq`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Participant": participantId,
        // Whether this caller may see who a patient is (#475). The proxy
        // refuses any query that would show it unless this says "shown".
        "X-Patient-Identity": seesPatientIdentity(session.roles)
          ? "shown"
          : "withheld",
        ...gate.headers,
        ...loadTestHeaders(request),
        ...callerHeaders(session),
      },
      body: JSON.stringify({ ...body, odrlScope }),
    });
    const data = await resp.json();
    // A template that asks every SPE (spe_access) goes federated in the
    // proxy without the flag; when that failed, a stopped workspace is the
    // likely cause, and the caller gets the cold-start answer instead.
    if (resp.status >= 500 && body.federated !== true) {
      const coldStart = await speColdStartGate(session.roles);
      if (coldStart) return coldStart;
    }
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
    const resp = await fetch(`${NEO4J_PROXY_URL}/nlq/templates`);
    const data = await resp.json();
    return NextResponse.json(data);
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "NLQ templates proxy error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
