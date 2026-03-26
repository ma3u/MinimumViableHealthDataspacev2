import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const PROXY_URL = process.env.NEO4J_PROXY_URL ?? "http://localhost:9090";

export async function GET() {
  try {
    const resp = await fetch(`${PROXY_URL}/trust-center/spe-sessions`);
    const data = await resp.json();
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message ?? "SPE sessions proxy error" },
      { status: 502 },
    );
  }
}
