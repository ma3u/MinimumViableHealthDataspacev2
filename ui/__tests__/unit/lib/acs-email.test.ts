import { describe, it, expect } from "vitest";
import { createHash, createHmac } from "crypto";
import { acsEmailConfig, signAcsRequest } from "@/lib/acs-email";
import { createRateLimiter } from "@/lib/rate-limit";

const KEY = Buffer.from("not-a-real-key").toString("base64");

describe("acsEmailConfig", () => {
  it("reads the endpoint and key from the connection string", () => {
    expect(
      acsEmailConfig({
        ACS_EMAIL_CONNECTION_STRING: `endpoint=https://a.communication.azure.com/;accesskey=${KEY}==`,
        ACS_EMAIL_SENDER: "DoNotReply@x.azurecomm.net",
      } as NodeJS.ProcessEnv),
    ).toEqual({
      endpoint: "https://a.communication.azure.com",
      // A base64 key ends in "=", which must survive the split on "=".
      accessKey: `${KEY}==`,
      sender: "DoNotReply@x.azurecomm.net",
    });
  });

  it("is null when any part is missing", () => {
    const sender = { ACS_EMAIL_SENDER: "s@x.azurecomm.net" };
    for (const env of [
      {},
      sender,
      { ...sender, ACS_EMAIL_CONNECTION_STRING: "endpoint=https://a" },
      { ACS_EMAIL_CONNECTION_STRING: `endpoint=https://a;accesskey=${KEY}` },
    ]) {
      expect(acsEmailConfig(env as NodeJS.ProcessEnv)).toBeNull();
    }
  });
});

describe("signAcsRequest", () => {
  it("signs method, path with query, date, host and body hash", () => {
    const config = { endpoint: "https://a", accessKey: KEY, sender: "s" };
    const url = new URL(
      "https://a.communication.azure.com/emails:send?api-version=2023-03-31",
    );
    const date = new Date("2026-10-03T12:00:00Z");
    const h = signAcsRequest(config, "POST", url, "{}", date);

    const hash = createHash("sha256").update("{}").digest("base64");
    expect(h["x-ms-content-sha256"]).toBe(hash);
    expect(h["x-ms-date"]).toBe("Sat, 03 Oct 2026 12:00:00 GMT");
    const expected = createHmac("sha256", Buffer.from(KEY, "base64"))
      .update(
        `POST\n/emails:send?api-version=2023-03-31\nSat, 03 Oct 2026 12:00:00 GMT;a.communication.azure.com;${hash}`,
      )
      .digest("base64");
    expect(h.Authorization).toBe(
      `HMAC-SHA256 SignedHeaders=x-ms-date;host;x-ms-content-sha256&Signature=${expected}`,
    );
  });
});

describe("createRateLimiter", () => {
  it("frees a slot once the window has passed", () => {
    const limit = createRateLimiter({ windowMs: 1000, perKey: 1, inTotal: 5 });
    expect(limit.allow("a", 0)).toBe(true);
    expect(limit.allow("a", 500)).toBe(false);
    expect(limit.allow("a", 1000)).toBe(true);
  });
});
