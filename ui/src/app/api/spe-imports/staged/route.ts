import { NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import { NEO4J_PROXY_URL, callerHeaders } from "@/lib/proxy";
import { IMPORT_REVIEW_ROLES } from "@/lib/spe-import";

export const dynamic = "force-dynamic";

/**
 * GET /api/spe-imports/staged
 *
 * The imports that wait in a workspace's staging area for the health data
 * access body (#1236, draft SPE implementing act Art. 4): what, from whom,
 * how many records of which type, never the data. For the access body and
 * the operator. {staged: [...], unreachable: [speIds]}.
 */
export async function GET() {
  const auth = await requireAuth(IMPORT_REVIEW_ROLES);
  if (isAuthError(auth)) return auth;
  try {
    const res = await fetch(`${NEO4J_PROXY_URL}/spe/staged`, {
      headers: callerHeaders(auth.session),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `The workspaces answered ${res.status}` },
        { status: 502 },
      );
    }
    return NextResponse.json(await res.json());
  } catch (err) {
    return NextResponse.json(
      { error: "The workspaces did not answer", detail: String(err) },
      { status: 502 },
    );
  }
}
