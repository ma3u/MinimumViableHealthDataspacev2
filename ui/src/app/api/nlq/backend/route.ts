import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const PROXY_URL = process.env.NEO4J_PROXY_URL ?? "http://localhost:9090";

/**
 * Phase 25f (Issue #13) — proxy for /nlq/backend.
 *
 * Returns the NLP backend detection result from neo4j-proxy so the UI can
 * render a status badge on /query. Unauthenticated on purpose — the result
 * exposes no secrets, just which providers are wired, and it lets the
 * loading page render the badge without waiting for a session.
 */
export async function GET() {
  try {
    const resp = await fetch(`${PROXY_URL}/nlq/backend`, { cache: "no-store" });
    const data = await resp.json();
    return NextResponse.json(data, { status: resp.status });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "NLQ backend proxy error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
