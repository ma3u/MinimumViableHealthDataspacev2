// CFM token exchange in front of Keycloak (ADR-085 decision 2.2, #973).
//
// Why this exists: the eclipse-cfm agents obtain every EDC API token by
// RFC 8693 exchange and always send subject_token_type
// urn:ietf:params:oauth:token-type:jwt (cfm v0.0.7,
// common/tokenexchange/tokenprovider.go L123). Keycloak, which our EDC 1.0
// runtimes trust, answers that with 400 "supports access tokens only"
// (measured, scripts/check-cfm-token-exchange.sh). Upstream the exchange is
// jwtlet, which needs a Kubernetes API server. Once eclipse-cfm makes the
// token type configurable, this file can go.
//
// What it does, and nothing else:
//   POST /token (port 8080): rewrites subject_token_type jwt -> access_token,
//     adds the cfm-agents client's credentials as HTTP Basic when the caller
//     sent none (the agents send none), and forwards the form otherwise
//     unchanged to Keycloak. Keycloak's answer goes back unchanged.
//   jwtlet's mapping API (port 8081, /api/v1/mappings...): accepted and not
//     stored. The jwtlet agent registers per-participant mappings there; a
//     Keycloak token is not scoped per participant, so there is nothing to
//     map. The agent's deploy step needs the 2xx to go on.
//   The subject token: the agents read it from a file and expect it rotated.
//     This process writes a fresh client-credentials token of cfm-agents to
//     SUBJECT_TOKEN_FILE at start and at half its lifetime, on a volume the
//     agents mount read-only.
//
// No token or secret is logged.

import { createServer } from "node:http";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const KEYCLOAK_TOKEN_URL =
  process.env.KEYCLOAK_TOKEN_URL ||
  "http://keycloak:8080/realms/edcv/protocol/openid-connect/token";
const CLIENT_ID = process.env.CFM_CLIENT_ID || "cfm-agents";
const CLIENT_SECRET = process.env.CFM_CLIENT_SECRET || "";
const SUBJECT_TOKEN_FILE =
  process.env.SUBJECT_TOKEN_FILE || "/var/run/secrets/cfm/token";
const EXCHANGE_PORT = Number(process.env.EXCHANGE_PORT || 8080);
const MAPPING_PORT = Number(process.env.MAPPING_PORT || 8081);

const JWT_TYPE = "urn:ietf:params:oauth:token-type:jwt";
const ACCESS_TOKEN_TYPE = "urn:ietf:params:oauth:token-type:access_token";
const BASIC = `Basic ${Buffer.from(
  `${encodeURIComponent(CLIENT_ID)}:${encodeURIComponent(CLIENT_SECRET)}`,
).toString("base64")}`;

if (!CLIENT_SECRET) {
  console.error("CFM_CLIENT_SECRET is not set");
  process.exit(1);
}

const log = (msg) => console.log(`${new Date().toISOString()} ${msg}`);

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

// --- the subject token the agents present ---------------------------------

let renewTimer;
async function renewSubjectToken() {
  clearTimeout(renewTimer);
  let next = 30;
  try {
    const res = await fetch(KEYCLOAK_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: BASIC,
      },
      body: new URLSearchParams({ grant_type: "client_credentials" }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.access_token) {
      log(`subject token: Keycloak answered ${res.status} ${body.error || ""}`);
    } else {
      await mkdir(dirname(SUBJECT_TOKEN_FILE), { recursive: true });
      const tmp = `${SUBJECT_TOKEN_FILE}.tmp`;
      await writeFile(tmp, body.access_token, { mode: 0o644 });
      await rename(tmp, SUBJECT_TOKEN_FILE);
      next = Math.max(30, Math.floor((body.expires_in || 300) / 2));
      log(`subject token renewed, next in ${next}s`);
    }
  } catch (err) {
    log(`subject token: ${err.message}`);
  }
  renewTimer = setTimeout(renewSubjectToken, next * 1000);
}

// --- POST /token ------------------------------------------------------------

const exchange = createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end('{"status":"ok"}');
  }
  if (req.method !== "POST" || !req.url.split("?")[0].endsWith("/token")) {
    res.writeHead(404, { "Content-Type": "application/json" });
    return res.end('{"error":"not_found"}');
  }
  const form = new URLSearchParams(await readBody(req));
  const rewritten = form.get("subject_token_type") === JWT_TYPE;
  if (rewritten) form.set("subject_token_type", ACCESS_TOKEN_TYPE);
  const headers = { "Content-Type": "application/x-www-form-urlencoded" };
  headers.Authorization = req.headers.authorization || BASIC;
  try {
    const upstream = await fetch(KEYCLOAK_TOKEN_URL, {
      method: "POST",
      headers,
      body: form,
    });
    const text = await upstream.text();
    let error = "";
    if (!upstream.ok) {
      try {
        error = ` ${JSON.parse(text).error_description || ""}`;
      } catch {
        error = "";
      }
    }
    log(
      `exchange scope="${form.get("scope") || ""}" resource=${
        form.get("resource") || "-"
      } ` +
        `type=${
          rewritten ? "jwt->access_token" : form.get("subject_token_type")
        } -> ${upstream.status}${error}`,
    );
    res.writeHead(upstream.status, {
      "Content-Type":
        upstream.headers.get("content-type") || "application/json",
    });
    res.end(text);
  } catch (err) {
    log(`exchange: Keycloak unreachable: ${err.message}`);
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end('{"error":"temporarily_unavailable"}');
  }
});

// --- jwtlet's mapping API, accepted and not stored ------------------------

const mappings = createServer(async (req, res) => {
  await readBody(req);
  const path = req.url.split("?")[0];
  if (req.method === "GET" && path === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end('{"status":"ok"}');
  }
  if (!path.startsWith("/api/v1/")) {
    res.writeHead(404, { "Content-Type": "application/json" });
    return res.end('{"error":"not_found"}');
  }
  const status = { POST: 201, PUT: 200, DELETE: 204 }[req.method] ?? 404;
  log(`mapping ${req.method} ${path} -> ${status} (not stored)`);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(status === 204 ? undefined : "{}");
});

await renewSubjectToken();
exchange.listen(EXCHANGE_PORT, () =>
  log(`token exchange on :${EXCHANGE_PORT}`),
);
mappings.listen(MAPPING_PORT, () => log(`mapping API on :${MAPPING_PORT}`));
