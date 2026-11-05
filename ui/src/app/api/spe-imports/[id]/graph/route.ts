import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import { NEO4J_PROXY_URL, callerHeaders } from "@/lib/proxy";
import {
  DEFAULT_IMPORT_SPE,
  importSpeId,
  toGraphNodes,
} from "@/lib/spe-import";
import { isPlainId } from "@/lib/transfer-data";

export const dynamic = "force-dynamic";

const PROXY_TIMEOUT_MS = 10_000;

/**
 * GET /api/spe-imports/[id]/graph?spe=SPE-1 — an imported transfer as the
 * graph viewer draws it (#876): the dataset, the SPE workspace it was loaded
 * into, its records and how they refer to each other. /graph?dataset=…&spe=…
 * merges it into the view and focuses on the dataset.
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
  if (!res.ok || !Array.isArray(body.nodes)) {
    return NextResponse.json(
      { error: String(body.error ?? `${speId} could not draw the import`) },
      { status: res.status === 503 ? 503 : 502 },
    );
  }
  return NextResponse.json({
    dataset: body.dataset,
    nodes: toGraphNodes(body.nodes as Parameters<typeof toGraphNodes>[0]),
    links: body.links,
    truncated: body.truncated === true,
  });
}
