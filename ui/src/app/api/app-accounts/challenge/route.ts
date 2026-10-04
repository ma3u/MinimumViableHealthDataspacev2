import { NextResponse } from "next/server";
import { issueChallenge } from "@/lib/app-attest";
import { createRateLimiter } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const limiter = createRateLimiter({
  windowMs: 60_000,
  perKey: 10,
  inTotal: 600,
});

/**
 * POST /api/app-accounts/challenge
 *
 * The value the Klarbefund app has Apple attest before it may create an
 * account (ADR-054). Answers without a session, because the person has no
 * account yet; it hands out nothing but a signed, five-minute challenge.
 */
export async function POST(request: Request) {
  const address = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (!limiter.allow(address || "unknown")) {
    return NextResponse.json(
      { error: "Too many requests, try again in a minute" },
      { status: 429 },
    );
  }
  return NextResponse.json({ challenge: issueChallenge() });
}
