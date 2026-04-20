import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const PROXY_URL = process.env.NEO4J_PROXY_URL ?? "http://localhost:9090";

/**
 * Phase 26 diagnostic proxy — public, read-only summary of whether the
 * federated-discovery plumbing applied correctly. Reports crawler target
 * count, federated dataset count, glossary row count. No PII, no
 * per-dataset payload — safe to expose without auth so operators can
 * verify deploys from a curl.
 */
export async function GET() {
  try {
    const resp = await fetch(`${PROXY_URL}/debug/phase26`, {
      cache: "no-store",
    });
    const data = await resp.json();
    return NextResponse.json(data, { status: resp.status });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "debug/phase26 proxy error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
