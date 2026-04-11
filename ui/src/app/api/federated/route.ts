import { NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

const PROXY_URL = process.env.NEO4J_PROXY_URL ?? "http://localhost:9090";

export async function GET() {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const resp = await fetch(`${PROXY_URL}/federated/stats`);
    const data = await resp.json();
    return NextResponse.json(data);
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Federated stats proxy error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
