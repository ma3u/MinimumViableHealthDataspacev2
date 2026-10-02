import { NextResponse } from "next/server";
import { NEO4J_PROXY_URL } from "@/lib/proxy";

export const dynamic = "force-dynamic";

/**
 * Phase 25f (Issue #13) — proxy for /nlq/backend.
 *
 * Returns the NLP backend detection result from neo4j-proxy: which chat and
 * embeddings providers are wired, which vector indexes exist, and whether
 * GraphRAG is ready.
 *
 * Deliberately unauthenticated, decided in #377 alongside gating
 * /api/debug/phase26. The earlier note here said the /query page renders a
 * badge from it; that is no longer true, nothing under ui/src calls this
 * route at all. The reason to leave it open is a different one, and it is
 * about tests rather than pages:
 *
 * `__tests__/e2e/journeys/33-graphrag-nlp.spec.ts` probes this route with no
 * session, seven times, to decide which GraphRAG branches its environment
 * can run. Its `fetchBackend()` returns null on any non-200, and several
 * cases feed that into `test.skip(...)`. Gating the route would not make
 * those tests fail, it would make them quietly stop running, which is the
 * failure mode ADR-031 exists to prevent. Section A of that spec is also
 * deliberately Keycloak-free so it runs in environments where no login is
 * available.
 *
 * What it discloses is provider and index names, no secrets and no data. So
 * the trade is a real loss of coverage against a small disclosure, and the
 * coverage wins. Revisit if the spec gains an authenticated request context.
 */
export async function GET() {
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
