import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import { NEO4J_PROXY_URL, callerHeaders } from "@/lib/proxy";
import {
  auditRole,
  auditUnavailableResponse,
  recordAdminEvent,
} from "@/lib/admin-audit";
import { IMPORT_REVIEW_ROLES } from "@/lib/spe-import";

export const dynamic = "force-dynamic";

const SPE = /^SPE-[12]$/;
const IMPORT_ID = /^[A-Za-z0-9-]{8,64}$/;

/**
 * POST /api/spe-imports/staged/[importId]/review
 * body {speId, decision: "approve" | "reject", reason?}
 *
 * The health data access body's decision on a staged import (#1236, draft
 * SPE implementing act Art. 4(2), (3)). The review is written on the admin
 * audit chain first (fail closed); approval places the data in the
 * workspace, a refusal removes it. A refusal needs a reason.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ importId: string }> },
) {
  const auth = await requireAuth(IMPORT_REVIEW_ROLES);
  if (isAuthError(auth)) return auth;
  const { importId } = await params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const speId = String(body.speId ?? "");
  const decision = String(body.decision ?? "");
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!SPE.test(speId) || !IMPORT_ID.test(importId)) {
    return NextResponse.json(
      { error: "A known SPE and a staged import id are required" },
      { status: 400 },
    );
  }
  if (decision !== "approve" && decision !== "reject") {
    return NextResponse.json(
      { error: 'decision must be "approve" or "reject"' },
      { status: 400 },
    );
  }
  if (decision === "reject" && !reason) {
    return NextResponse.json(
      { error: "A refusal needs a written reason" },
      { status: 400 },
    );
  }
  try {
    await recordAdminEvent({
      event: "import-review",
      outcome: decision === "approve" ? "success" : "refused",
      target: importId,
      detail: `${speId} ${decision === "approve" ? "APPROVED" : "REJECTED"}`,
      ...(reason ? { reason } : {}),
      actorId:
        auth.session.user.email ??
        auth.session.user.name ??
        auth.session.user.id,
      actorRole: auditRole(auth.session.roles),
    });
  } catch {
    return auditUnavailableResponse();
  }
  let res: Response;
  try {
    res = await fetch(
      `${NEO4J_PROXY_URL}/spe/${speId}/staged/${encodeURIComponent(
        importId,
      )}/${decision}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...callerHeaders(auth.session),
        },
        cache: "no-store",
        signal: AbortSignal.timeout(60_000),
      },
    );
  } catch (err) {
    return NextResponse.json(
      { error: `${speId} did not answer`, detail: String(err) },
      { status: 502 },
    );
  }
  const answer = (await res.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  if (!res.ok) {
    return NextResponse.json(
      { error: String(answer.error ?? `${speId} answered ${res.status}`) },
      { status: [404, 409, 503].includes(res.status) ? res.status : 502 },
    );
  }
  return NextResponse.json(answer);
}
