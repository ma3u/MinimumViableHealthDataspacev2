import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import { NEO4J_PROXY_URL, loadTestHeaders } from "@/lib/proxy";

export const dynamic = "force-dynamic";

/**
 * GET /api/catalog/jsonld?id=<datasetId>
 *
 * A dataset's description in HealthDCAT-AP Release 8 JSON-LD (#700), or the
 * whole catalogue without `id`. The proxy writes it (services/neo4j-proxy/src/
 * healthdcat-ap.ts) and CI validates that output with the official SHACL, so
 * the UI passes it through rather than writing its own.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const id = req.nextUrl.searchParams.get("id");
  const url = id
    ? `${NEO4J_PROXY_URL}/catalog/datasets/${encodeURIComponent(id)}`
    : `${NEO4J_PROXY_URL}/catalog/datasets`;
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/ld+json", ...loadTestHeaders(req) },
      cache: "no-store",
    });
    if (res.status === 404) {
      return NextResponse.json(
        { error: `Dataset ${id} not found` },
        { status: 404 },
      );
    }
    if (!res.ok) {
      return NextResponse.json(
        { error: `Catalogue unavailable (${res.status})` },
        { status: 502 },
      );
    }
    return NextResponse.json(await res.json(), {
      headers: { "Content-Type": "application/ld+json" },
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Catalogue unavailable", detail: String(err) },
      { status: 502 },
    );
  }
}
