import { NextResponse } from "next/server";
import { NEO4J_PROXY_URL } from "@/lib/proxy";
import { requireAuth, isAuthError } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

/**
 * Phase 25f (Issue #13) — proxy for /nlq/backend.
 *
 * Returns the NLP backend detection result from neo4j-proxy: which chat and
 * embeddings providers are wired, which vector indexes exist, and whether
 * GraphRAG is ready.
 *
 * Any signed-in participant. #377 left this route open because
 * `__tests__/e2e/journeys/33-graphrag-nlp.spec.ts` probed it anonymously to
 * decide which GraphRAG branches to run. Every API route needs a session since #404 (ADR-044); the
 * spec now forges a session from NEXTAUTH_SECRET, fails rather than skips
 * when the session is refused, and asserts the 401 without one (J609).
 */
export async function GET() {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  try {
    const resp = await fetch(`${NEO4J_PROXY_URL}/nlq/backend`, {
      cache: "no-store",
    });
    const data = await resp.json();
    return NextResponse.json(data, { status: resp.status });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "NLQ backend proxy error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
