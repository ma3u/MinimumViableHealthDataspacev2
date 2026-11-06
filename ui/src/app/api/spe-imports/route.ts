import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import { NEO4J_PROXY_URL, callerHeaders } from "@/lib/proxy";
import { SPE_IDS, speNotUp } from "@/lib/spe-power";
import { isPlainId } from "@/lib/transfer-data";

export const dynamic = "force-dynamic";

/** Longer than the proxy gives a workspace (SPE_CONNECT_TIMEOUT_MS, 5 s), so its answer comes first. */
const PROXY_TIMEOUT_MS = 8_000;

/**
 * GET /api/spe-imports?ids=<transfer id>,… — the duplicate check (#876):
 * which of these transfers the SPE workspaces hold already, where, since
 * when and with how many records. My data shows it on each transfer and asks
 * before an import would replace one. {imports, unreachable, notUp}.
 *
 * A workspace ARM reports stopped or starting (ADR-072) is not asked and
 * holds nothing: an import lives in the workspace's memory and goes when it
 * stops. It is listed in `unreachable`, and in `notUp` with its state and
 * when it should answer; reading starts nothing.
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

  const notUp = await speNotUp();
  const skip = notUp.map((e) => e.id);
  if (skip.length === SPE_IDS.length) {
    return NextResponse.json({ imports: [], unreachable: skip, notUp });
  }

  const qs = new URLSearchParams({ datasetIds: ids.join(",") });
  if (skip.length) qs.set("skip", skip.join(","));
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
  const unreachable = Array.isArray(body.unreachable)
    ? (body.unreachable as string[])
    : [];
  return NextResponse.json({
    imports: body.imports,
    unreachable: [...new Set([...skip, ...unreachable])],
    notUp,
  });
}
