import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import { NEO4J_PROXY_URL, callerHeaders } from "@/lib/proxy";
import {
  DEFAULT_IMPORT_SPE,
  importSpeId,
  proxyRetryAfter,
  toGraphNodes,
} from "@/lib/spe-import";
import { speColdStartResponse, speNotUp, type SpeId } from "@/lib/spe-power";
import { isPlainId } from "@/lib/transfer-data";

export const dynamic = "force-dynamic";

/** Longer than the proxy gives the read (SPE_READ_TIMEOUT_MS, 10 s), so its answer comes first. */
const PROXY_TIMEOUT_MS = 15_000;

/**
 * GET /api/spe-imports/[id]/graph?spe=SPE-1 — an imported transfer as the
 * graph viewer draws it (#876): the dataset, the SPE workspace it was loaded
 * into, its records and how they refer to each other. /graph?dataset=…&spe=…
 * merges it into the view and focuses on the dataset.
 *
 * While ARM reports the workspace stopped or starting (ADR-072) it answers
 * 503 with Retry-After before asking the proxy, and starts nothing: an
 * import lives in the workspace's memory, so a start brings none back.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const speId = importSpeId(
    req.nextUrl.searchParams.get("spe") || DEFAULT_IMPORT_SPE,
  );
  if (!isPlainId(id) || !speId) {
    return NextResponse.json(
      { error: "A dataset id and SPE-1 or SPE-2 are required" },
      { status: 400 },
    );
  }

  const notUp = await speNotUp([speId as SpeId]);
  if (notUp.length) {
    return speColdStartResponse(
      notUp,
      false,
      `${speId} is ${notUp[0].state}. An import lasts only while its workspace runs; import the transfer again once ${speId} runs.`,
    );
  }

  let res: Response;
  try {
    res = await fetch(
      `${NEO4J_PROXY_URL}/spe/${speId}/import/${encodeURIComponent(id)}/graph`,
      {
        headers: callerHeaders(auth.session),
        signal: AbortSignal.timeout(PROXY_TIMEOUT_MS),
        cache: "no-store",
      },
    );
  } catch (err) {
    console.error("Reading an import failed:", { id, speId }, err);
    return NextResponse.json(
      { error: `${speId} did not answer` },
      { status: 502 },
    );
  }
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.status === 404) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (res.status === 503) {
    return NextResponse.json(
      { error: String(body.error ?? `${speId} does not answer`) },
      { status: 503, headers: { "Retry-After": proxyRetryAfter(res) } },
    );
  }
  if (!res.ok || !Array.isArray(body.nodes)) {
    return NextResponse.json(
      { error: String(body.error ?? `${speId} could not draw the import`) },
      { status: 502 },
    );
  }
  return NextResponse.json({
    dataset: body.dataset,
    nodes: toGraphNodes(body.nodes as Parameters<typeof toGraphNodes>[0]),
    links: body.links,
    truncated: body.truncated === true,
  });
}
