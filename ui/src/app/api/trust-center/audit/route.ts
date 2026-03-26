import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const PROXY_URL = process.env.NEO4J_PROXY_URL ?? "http://localhost:9090";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const qs = searchParams.toString();
    const resp = await fetch(
      `${PROXY_URL}/trust-center/audit${qs ? `?${qs}` : ""}`,
    );
    const data = await resp.json();
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message ?? "Trust Center audit proxy error" },
      { status: 502 },
    );
  }
}
