import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import { NEO4J_PROXY_URL, callerHeaders } from "@/lib/proxy";
import { isPlainId } from "@/lib/transfer-data";

export const dynamic = "force-dynamic";

const PROXY_TIMEOUT_MS = 5_000;

/**
 * GET /api/spe-imports?ids=<transfer id>,… — the duplicate check (#876):
 * which of these transfers the SPE workspaces hold already, where, since
 * when and with how many records. My data shows it on each transfer and asks
 * before an import would replace one. {imports, unreachable}.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const ids = (req.nextUrl.searchParams.get("ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(isPlainId)
    .slice(0, 100);
  if (!ids.length) {
    return NextResponse.json(
      { error: "ids is required: one or more transfer ids" },
      { status: 400 },
    );
  }

  const qs = new URLSearchParams({ datasetIds: ids.join(",") });
  let res: Response;
  try {
    res = await fetch(`${NEO4J_PROXY_URL}/spe/imports?${qs.toString()}`, {
      headers: callerHeaders(auth.session),
      signal: AbortSignal.timeout(PROXY_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (err) {
    console.error("Reading the SPE imports failed:", err);
    return NextResponse.json(
      { error: "The SPE workspaces did not answer" },
      { status: 502 },
    );
  }
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || !Array.isArray(body.imports)) {
    return NextResponse.json(
      { error: String(body.error ?? "The SPE workspaces did not answer") },
      { status: 502 },
    );
  }
  return NextResponse.json({
    imports: body.imports,
    unreachable: Array.isArray(body.unreachable) ? body.unreachable : [],
  });
}
