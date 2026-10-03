/**
 * POST /api/testflight-request (ADR-048): the start page's TestFlight form,
 * mailed through Azure Communication Services without a session.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const KEY = Buffer.from("not-a-real-key").toString("base64");
const ENV = {
  ACS_EMAIL_CONNECTION_STRING: `endpoint=https://acs-test.europe.communication.azure.com/;accesskey=${KEY}`,
  ACS_EMAIL_SENDER: "DoNotReply@example.azurecomm.net",
  TESTFLIGHT_REQUEST_TO: "owner@example.org",
};

type Post = (req: NextRequest) => Promise<Response>;
let POST: Post;
let fetchMock: ReturnType<typeof vi.fn>;

function req(body: unknown, ip = "203.0.113.7") {
  return new NextRequest("http://localhost/api/testflight-request", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const valid = { name: "Ada Tester", appleId: "ada@example.org", note: "" };

beforeEach(async () => {
  for (const [k, v] of Object.entries(ENV)) vi.stubEnv(k, v);
  fetchMock = vi.fn(async () => new Response(null, { status: 202 }));
  vi.stubGlobal("fetch", fetchMock);
  // A fresh module per test, so the rate limit starts empty.
  vi.resetModules();
  ({ POST } = await import("@/app/api/testflight-request/route"));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("POST /api/testflight-request", () => {
  it("queues one mail to the configured recipient, reply to the visitor", async () => {
    const res = await POST(req({ ...valid, note: "iPhone 17\niOS 26" }));
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ status: "queued" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(String(url)).toBe(
      "https://acs-test.europe.communication.azure.com/emails:send?api-version=2023-03-31",
    );
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toMatch(
      /^HMAC-SHA256 SignedHeaders=x-ms-date;host;x-ms-content-sha256&Signature=/,
    );
    const mail = JSON.parse(init.body as string);
    expect(mail.senderAddress).toBe(ENV.ACS_EMAIL_SENDER);
    expect(mail.recipients.to).toEqual([
      { address: ENV.TESTFLIGHT_REQUEST_TO },
    ]);
    expect(mail.replyTo).toEqual([
      { address: "ada@example.org", displayName: "Ada Tester" },
    ]);
    expect(mail.content.subject).toBe("Klarbefund TestFlight: Ada Tester");
    expect(mail.content.plainText).toContain("Apple ID");
    expect(mail.content.plainText).toContain("iPhone 17\niOS 26");
  });

  it("refuses a missing or malformed Apple ID with 400 and sends nothing", async () => {
    for (const body of [
      { name: "Ada" },
      { name: "Ada", appleId: "not-an-email" },
      { name: "", appleId: "ada@example.org" },
      { name: "x".repeat(101), appleId: "ada@example.org" },
      "not json",
    ]) {
      const res = await POST(req(body));
      expect(res.status).toBe(400);
      expect(await res.json()).toHaveProperty("error");
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps a name on one line, so it cannot add lines to the subject", async () => {
    await POST(req({ ...valid, name: "Ada\r\nBcc: x@example.org" }));
    const mail = JSON.parse(
      (fetchMock.mock.calls[0] as [URL, RequestInit])[1].body as string,
    );
    expect(mail.content.subject).toBe(
      "Klarbefund TestFlight: Ada Bcc: x@example.org",
    );
  });

  it("answers a filled honeypot with 202 and sends nothing", async () => {
    const res = await POST(req({ ...valid, website: "https://spam.example" }));
    expect(res.status).toBe(202);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("answers 503 when mail is not configured", async () => {
    vi.stubEnv("ACS_EMAIL_CONNECTION_STRING", "");
    const res = await POST(req(valid));
    expect(res.status).toBe(503);
    expect(await res.json()).toHaveProperty("error");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("answers 503 when the mail service refuses or fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 401 }));
    expect((await POST(req(valid, "198.51.100.1"))).status).toBe(503);
    fetchMock.mockRejectedValueOnce(new Error("network down"));
    expect((await POST(req(valid, "198.51.100.2"))).status).toBe(503);
  });

  it("takes three requests per address per hour, then 429", async () => {
    for (let i = 0; i < 3; i++) {
      expect((await POST(req(valid))).status).toBe(202);
    }
    const res = await POST(req(valid));
    expect(res.status).toBe(429);
    expect(await res.json()).toHaveProperty("error");
    expect((await POST(req(valid, "203.0.113.8"))).status).toBe(202);
  });

  it("takes twenty requests in all per hour, whatever the address", async () => {
    for (let i = 0; i < 20; i++) {
      expect((await POST(req(valid, `192.0.2.${i}`))).status).toBe(202);
    }
    expect((await POST(req(valid, "192.0.2.200"))).status).toBe(429);
  });
});
