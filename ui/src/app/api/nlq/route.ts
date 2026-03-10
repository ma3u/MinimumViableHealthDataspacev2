import { NextRequest, NextResponse } from "next/server";

const PROXY_URL = process.env.NEO4J_PROXY_URL ?? "http://localhost:9090";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const resp = await fetch(`${PROXY_URL}/nlq`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await resp.json();
    return NextResponse.json(data, { status: resp.status });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message ?? "NLQ proxy error" },
      { status: 502 },
    );
  }
}

export async function GET() {
  try {
    const resp = await fetch(`${PROXY_URL}/nlq/templates`);
    const data = await resp.json();
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message ?? "NLQ templates proxy error" },
      { status: 502 },
    );
  }
}
