import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const PROXY_URL = process.env.NEO4J_PROXY_URL ?? "http://localhost:9090";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const resp = await fetch(`${PROXY_URL}/trust-center/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await resp.json();
    return NextResponse.json(data, { status: resp.status });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message ?? "Trust Center resolve proxy error" },
      { status: 502 },
    );
  }
}
