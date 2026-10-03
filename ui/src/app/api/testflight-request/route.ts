import { NextRequest, NextResponse } from "next/server";
import { acsEmailConfig, sendAcsEmail } from "@/lib/acs-email";
import { createRateLimiter } from "@/lib/rate-limit";

/**
 * POST /api/testflight-request: the Klarbefund TestFlight request from the
 * start page, mailed to Matthias in the background (ADR-048).
 *
 * Answers without a session, the one exception ADR-048 adds to ADR-044: the
 * people asking for the preview have no account on the hub. What keeps it
 * from being a relay for anyone: the recipient is fixed by the deployment,
 * the visitor only fills three bounded fields, a hidden honeypot field drops
 * bots, and each replica takes at most three requests per address and twenty
 * in all per hour.
 *
 * 202 queued · 400 invalid · 429 too many · 503 mail not configured or
 * refused (the form then offers the mailto draft instead).
 */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const testflightRateLimit = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  perKey: 3,
  inTotal: 20,
});

function field(body: Record<string, unknown>, key: string, max: number) {
  const v = body[key];
  if (typeof v !== "string") return "";
  // One line for the name and Apple ID; the note keeps its line breaks.
  const s = key === "note" ? v.trim() : v.replace(/[\r\n]+/g, " ").trim();
  return s.length > max ? null : s;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object") throw new Error();
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Bots fill every field; people never see this one. Pretend it worked.
  if (typeof body.website === "string" && body.website !== "") {
    return NextResponse.json({ status: "queued" }, { status: 202 });
  }

  const name = field(body, "name", 100);
  const appleId = field(body, "appleId", 254);
  const note = field(body, "note", 1000);
  if (!name || !appleId || !EMAIL.test(appleId) || note === null) {
    return NextResponse.json(
      { error: "Name and a valid Apple ID email are required" },
      { status: 400 },
    );
  }

  const config = acsEmailConfig();
  const to = process.env.TESTFLIGHT_REQUEST_TO ?? "";
  if (!config || !to) {
    return NextResponse.json(
      { error: "Mail is not configured on this deployment" },
      { status: 503 },
    );
  }

  const address =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  if (!testflightRateLimit.allow(address)) {
    return NextResponse.json(
      { error: "Too many requests, please try again later" },
      { status: 429 },
    );
  }

  const plainText = [
    "A TestFlight request from the EHDS demo start page.",
    "",
    `Name: ${name}`,
    `Apple ID (for the TestFlight invitation): ${appleId}`,
    ...(note ? ["", note] : []),
    "",
    "Reply goes to the visitor.",
  ].join("\n");

  try {
    const queued = await sendAcsEmail(config, {
      to,
      subject: `Klarbefund TestFlight: ${name}`,
      plainText,
      replyTo: { address: appleId, displayName: name },
    });
    if (!queued) throw new Error("not queued");
  } catch (err) {
    console.error(
      "[testflight-request] mail not sent:",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json(
      { error: "The mail service did not take the request" },
      { status: 503 },
    );
  }
  return NextResponse.json({ status: "queued" }, { status: 202 });
}
