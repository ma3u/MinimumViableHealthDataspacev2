import { NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import { NEO4J_PROXY_URL } from "@/lib/proxy";

export const dynamic = "force-dynamic";

/**
 * Phase 26 diagnostic proxy — an operator's read-only summary of whether the
 * federated-discovery plumbing applied correctly: crawler target count,
 * federated dataset count, glossary row count.
 *
 * Gated to EDC_ADMIN (#377). It used to be open, on the reasoning that it
 * carries no PII and no per-dataset payload, so an operator could verify a
 * deploy from a curl. That reasoning was about disclosure, and it missed the
 * other half: the API collection files this route under `05 Dataspace
 * Operator`, so the code and the persona model disagreed about who it is
 * for. That disagreement is the same defect #357 was, and this is the last
 * instance the anonymous sweep found. An operator verifying a deploy has a
 * session; anyone who does not is not an operator.
 *
 * @see .claude/rules/api-conventions.md — the role matrix this now matches
 */
export async function GET() {
  const auth = await requireAuth(["EDC_ADMIN"]);
  if (isAuthError(auth)) return auth;

  try {
    const resp = await fetch(`${NEO4J_PROXY_URL}/debug/phase26`, {
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
