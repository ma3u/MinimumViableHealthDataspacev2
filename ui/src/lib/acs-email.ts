import { createHash, createHmac } from "crypto";

/**
 * Sends one plain-text mail through Azure Communication Services Email
 * (ADR-048). Calls the REST API with the HMAC scheme the SDK uses, so the UI
 * carries no extra dependency for a single request.
 *
 * Configured by three variables. The connection string reaches mvhd-ui as a
 * Key Vault reference (scripts/azure/15-communication-email.sh), never as a
 * literal:
 *   ACS_EMAIL_CONNECTION_STRING  endpoint=https://...;accesskey=...
 *   ACS_EMAIL_SENDER             DoNotReply@<guid>.azurecomm.net
 *   TESTFLIGHT_REQUEST_TO        where TestFlight requests go
 */

const API_VERSION = "2023-03-31";

export interface AcsEmailConfig {
  endpoint: string;
  accessKey: string;
  sender: string;
}

export interface AcsEmail {
  to: string;
  subject: string;
  plainText: string;
  replyTo?: { address: string; displayName?: string };
}

/** Null when any part is missing, so the caller can answer 503. */
export function acsEmailConfig(
  env: NodeJS.ProcessEnv = process.env,
): AcsEmailConfig | null {
  const conn = env.ACS_EMAIL_CONNECTION_STRING ?? "";
  const sender = env.ACS_EMAIL_SENDER ?? "";
  const parts = Object.fromEntries(
    conn
      .split(";")
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => {
        const i = p.indexOf("=");
        return [p.slice(0, i).toLowerCase(), p.slice(i + 1)];
      }),
  );
  if (!parts.endpoint || !parts.accesskey || !sender) return null;
  return {
    endpoint: parts.endpoint.replace(/\/+$/, ""),
    accessKey: parts.accesskey,
    sender,
  };
}

/** The headers ACS expects for a request signed with the resource key. */
export function signAcsRequest(
  config: AcsEmailConfig,
  method: string,
  url: URL,
  body: string,
  date: Date = new Date(),
): Record<string, string> {
  const contentHash = createHash("sha256").update(body).digest("base64");
  const xMsDate = date.toUTCString();
  const toSign = `${method}\n${url.pathname}${url.search}\n${xMsDate};${url.host};${contentHash}`;
  const signature = createHmac(
    "sha256",
    Buffer.from(config.accessKey, "base64"),
  )
    .update(toSign)
    .digest("base64");
  return {
    "x-ms-date": xMsDate,
    "x-ms-content-sha256": contentHash,
    Authorization: `HMAC-SHA256 SignedHeaders=x-ms-date;host;x-ms-content-sha256&Signature=${signature}`,
  };
}

/** Queues the mail. ACS answers 202 and delivers on its own; true on 202. */
export async function sendAcsEmail(
  config: AcsEmailConfig,
  mail: AcsEmail,
): Promise<boolean> {
  const url = new URL(
    `${config.endpoint}/emails:send?api-version=${API_VERSION}`,
  );
  const body = JSON.stringify({
    senderAddress: config.sender,
    content: { subject: mail.subject, plainText: mail.plainText },
    recipients: { to: [{ address: mail.to }] },
    ...(mail.replyTo ? { replyTo: [mail.replyTo] } : {}),
  });
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...signAcsRequest(config, "POST", url, body),
    },
    body,
    signal: AbortSignal.timeout(10_000),
  });
  return res.status === 202;
}
