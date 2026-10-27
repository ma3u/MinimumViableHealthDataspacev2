/**
 * Adapter for the EU reference OpenID4VP Verifier backend
 * (eu-digital-identity-wallet/eudi-srv-verifier-endpoint), as hosted at
 * https://verifier-backend.eudiw.dev (the REST backend; the verifier.eudiw.dev
 * host is the frontend UI and returns 405 on the API paths).
 *
 * Contract pinned against the reference backend README and its source:
 *   - POST /ui/presentations           — initialise a cross-device transaction
 *       body: { dcql_query, nonce, response_mode, jar_mode, request_uri_method,
 *               profile, intended_use_id | registration_certificate }
 *       resp: { transaction_id, client_id, request_uri, request_uri_method }
 *   - GET  /ui/presentations/{txId}     — the wallet's response once posted:
 *       { vp_token: { <credential query id>: [presentation, ...] } }
 *       or { error, error_description } when the wallet declined
 *   - POST /utilities/validations/msoMdoc/deviceResponse — validates an mdoc
 *       DeviceResponse and returns its attributes
 *
 * Implementing Regulation (EU) 2026/2099 and the OpenID4VC High Assurance
 * Interoperability Profile (HAIP) 1.0 shape the defaults (#708): the PID is
 * asked for as SD-JWT VC or mdoc, whichever the wallet holds, and the wallet's
 * response is encrypted (`direct_post.jwt`). The hosted verifier refuses a
 * request without a relying-party registration certificate; it offers a
 * public test intended use, `TEST-01`. A self-hosted verifier with our own
 * certificate (the German d-you path, #182) is the same request with
 * `EUDI_REGISTRATION_CERTIFICATE` set.
 *
 * Everything is configurable via env, read at call time. See ADR-028.
 * Cryptographic verification of a presentation is DELEGATED to the verifier
 * backend; this module only reads the claims of a presentation the backend
 * has accepted, and checks that each SD-JWT disclosure is one the issuer
 * signed.
 */
import { createHash } from "crypto";
import type { VerifiedPid } from "@/lib/eudi-patient-map";

/** The DCQL credential query ids; the wallet's vp_token is keyed by them. */
export const PID_SD_JWT_QUERY = "pid_sd_jwt";
export const PID_MDOC_QUERY = "pid_mdoc";

function settings() {
  const env = process.env;
  return {
    base: (
      env.EUDI_VERIFIER_BASE_URL ?? "https://verifier-backend.eudiw.dev"
    ).replace(/\/+$/, ""),
    /** QR / wallet deep-link scheme. The EU reference wallet reads openid4vp://; haip-vp:// and eudi-openid4vp:// are alternatives. */
    scheme: env.EUDI_VERIFIER_SCHEME ?? "openid4vp://",
    doctype: env.EUDI_PID_DOCTYPE ?? "eu.europa.ec.eudi.pid.1",
    /**
     * The SD-JWT VC types of the PID, comma-separated: `urn:eudi:pid:1` (PID
     * rulebook, EU reference wallet), `urn:eudi:pid:de:1` (German PID, d-you).
     * List only what the registration certificate declares.
     */
    vct: (env.EUDI_PID_VCT || "urn:eudi:pid:1")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean),
    /** "haip" needs "direct_post.jwt"; "openid4vp" also allows cleartext. */
    profile: env.EUDI_VERIFIER_PROFILE ?? "haip",
    /** "get" (wallet GETs the signed request — broadest compat) or "post". */
    requestUriMethod: env.EUDI_REQUEST_URI_METHOD ?? "get",
    /** "direct_post.jwt" (encrypted, HAIP) or "direct_post" (cleartext, compose only). */
    responseMode: env.EUDI_RESPONSE_MODE ?? "direct_post.jwt",
    /** Our own registration certificate (JWS), when we have one; it wins over the intended use. */
    registrationCertificate: env.EUDI_REGISTRATION_CERTIFICATE || undefined,
    /** An intended use configured at the verifier; TEST-01 is the hosted verifier's public one. */
    intendedUseId: env.EUDI_INTENDED_USE_ID || "TEST-01",
  };
}

export interface StartedPresentation {
  transactionId: string;
  clientId: string;
  requestUri: string;
  /** the full openid4vp deep link to render as a QR / tap on the same device */
  walletLink: string;
}

export type PresentationResult =
  | { status: "pending" }
  | { status: "completed"; pid: VerifiedPid }
  /** the wallet declined, or what it sent is not a PID we can read */
  | { status: "failed"; reason: string };

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 300);
  } catch {
    return "";
  }
}

/**
 * The DCQL query: the PID as SD-JWT VC or as mdoc, and of it only the name,
 * which binds the wallet to a record. Nothing else: no birth date (#475,
 * 2026-10-07), and no age, which the hub does not use and which neither the
 * reference verifier's registration (`TEST-01`) nor ours declares; a wallet
 * refuses a request that asks for more than the registration certificate
 * declares (over-asking, ETSI TS 119 472-2). Nothing of it is shown: a
 * patient session sees the record's pseudonym.
 */
function pidQuery(doctype: string, vct: string[]) {
  return {
    credentials: [
      {
        id: PID_SD_JWT_QUERY,
        format: "dc+sd-jwt",
        meta: { vct_values: vct },
        claims: [{ path: ["family_name"] }, { path: ["given_name"] }],
      },
      {
        id: PID_MDOC_QUERY,
        format: "mso_mdoc",
        meta: { doctype_value: doctype },
        claims: [
          { path: [doctype, "family_name"] },
          { path: [doctype, "given_name"] },
        ],
      },
    ],
    credential_sets: [
      {
        options: [[PID_SD_JWT_QUERY], [PID_MDOC_QUERY]],
        purpose: "Sign in to the Health Dataspace patient portal",
      },
    ],
  };
}

/**
 * Initialise an OpenID4VP cross-device presentation request for the PID and
 * return the wallet deep link to encode as a QR code.
 */
export async function startPresentation(
  nonce: string,
): Promise<StartedPresentation> {
  const s = settings();
  const body = {
    dcql_query: pidQuery(s.doctype, s.vct),
    nonce,
    response_mode: s.responseMode,
    jar_mode: "by_reference",
    request_uri_method: s.requestUriMethod,
    profile: s.profile,
    ...(s.registrationCertificate
      ? { registration_certificate: s.registrationCertificate }
      : { intended_use_id: s.intendedUseId }),
  };

  const res = await fetch(`${s.base}/ui/presentations`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(
      `verifier init failed: ${res.status} ${await safeText(res)}`,
    );
  }
  const json = (await res.json()) as {
    transaction_id?: string;
    presentation_id?: string;
    client_id?: string;
    request_uri?: string;
  };
  const transactionId = json.transaction_id ?? json.presentation_id ?? "";
  const clientId = json.client_id ?? "";
  const requestUri = json.request_uri ?? "";
  if (!transactionId || !requestUri) {
    throw new Error("verifier init: missing transaction_id / request_uri");
  }
  const params = new URLSearchParams();
  if (clientId) params.set("client_id", clientId);
  params.set("request_uri", requestUri);
  const walletLink = `${s.scheme}?${params.toString()}`;
  return { transactionId, clientId, requestUri, walletLink };
}

/**
 * Poll the verifier for the wallet's response. A present `vp_token` means the
 * verifier backend has accepted a validated presentation for this
 * transaction; the PID's claims are then read from whichever credential the
 * wallet chose.
 */
export async function getPresentationResult(
  transactionId: string,
): Promise<PresentationResult> {
  const s = settings();
  const res = await fetch(
    `${s.base}/ui/presentations/${encodeURIComponent(transactionId)}`,
    {
      method: "GET",
      headers: { accept: "application/json" },
      cache: "no-store",
    },
  );
  // Until the wallet posts, the verifier has no response yet.
  if (res.status === 404 || res.status === 204) return { status: "pending" };
  const json = (await res.json().catch(() => null)) as {
    vp_token?: Record<string, unknown>;
    error?: string;
  } | null;
  if (res.status === 400 && json?.error === "PresentationNotSubmitted") {
    return { status: "pending" };
  }
  if (!res.ok) throw new Error(`verifier poll failed: ${res.status}`);
  if (json?.error) {
    return { status: "failed", reason: `wallet: ${json.error}` };
  }
  if (!json || json.vp_token == null) return { status: "pending" };

  const sdJwt = firstPresentation(json.vp_token, PID_SD_JWT_QUERY);
  if (sdJwt) return fromClaims(pidFromSdJwt(sdJwt));
  const mdoc = firstPresentation(json.vp_token, PID_MDOC_QUERY);
  if (mdoc) return fromClaims(await pidFromMdoc(s.base, s.doctype, mdoc));
  return { status: "failed", reason: "no PID in the wallet's response" };
}

function fromClaims(pid: VerifiedPid | null): PresentationResult {
  return pid
    ? { status: "completed", pid }
    : { status: "failed", reason: "the PID could not be read" };
}

/** OpenID4VP 1.0 sends an array per query; earlier drafts a single value. */
function firstPresentation(
  vpToken: Record<string, unknown>,
  queryId: string,
): string | undefined {
  const v = typeof vpToken === "object" ? vpToken[queryId] : undefined;
  const first = Array.isArray(v) ? v[0] : v;
  return typeof first === "string" && first ? first : undefined;
}

function decodeJson(b64url: string): unknown {
  return JSON.parse(Buffer.from(b64url, "base64url").toString("utf8"));
}

/**
 * The claims of an SD-JWT VC presentation: `<issuer-signed JWT>~<disclosure>~
 * ...~<key binding JWT>`. The verifier has checked the signatures and the key
 * binding; here every disclosure must hash to a digest the issuer signed, and
 * the claims are rebuilt from the payload and those disclosures. Returns null
 * when anything does not fit.
 */
export function pidFromSdJwt(presentation: string): VerifiedPid | null {
  try {
    const [jwt, ...rest] = presentation.split("~");
    const payload = decodeJson(jwt.split(".")[1]) as Record<string, unknown>;
    if ((payload._sd_alg ?? "sha-256") !== "sha-256") return null;
    // The last part is the key binding JWT, empty when there is none.
    const disclosures = rest.slice(0, -1).filter(Boolean);
    const disclosed = new Map<string, [string, unknown]>();
    for (const d of disclosures) {
      const digest = createHash("sha256").update(d).digest("base64url");
      const parts = decodeJson(d) as unknown[];
      // [salt, name, value] for an object property; array elements are not read.
      if (parts.length === 3 && typeof parts[1] === "string") {
        disclosed.set(digest, [parts[1], parts[2]]);
      }
    }
    const used = new Set<string>();
    const reveal = (node: unknown): unknown => {
      if (Array.isArray(node)) return node.map(reveal);
      if (!node || typeof node !== "object") return node;
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node)) {
        if (k !== "_sd" && k !== "_sd_alg") out[k] = reveal(v);
      }
      const digests = (node as { _sd?: unknown })._sd;
      for (const digest of Array.isArray(digests) ? digests : []) {
        const hit = disclosed.get(String(digest));
        if (hit) {
          used.add(String(digest));
          out[hit[0]] = reveal(hit[1]);
        }
      }
      return out;
    };
    const claims = reveal(payload) as Record<string, unknown>;
    // A disclosure the issuer did not sign is a forgery, not an extra.
    if (used.size !== disclosed.size) return null;
    const age = claims.age_equal_or_over as Record<string, unknown> | undefined;
    return pidOf(
      claims.given_name,
      claims.family_name,
      age?.["18"] ?? claims.age_over_18,
    );
  } catch {
    return null;
  }
}

/**
 * The claims of an mdoc DeviceResponse, as the verifier's validation utility
 * returns them (it decodes the CBOR and checks the issuer's signature and
 * validity again). Returns null when it refuses.
 */
async function pidFromMdoc(
  base: string,
  doctype: string,
  deviceResponse: string,
): Promise<VerifiedPid | null> {
  const res = await fetch(
    `${base}/utilities/validations/msoMdoc/deviceResponse`,
    {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body: new URLSearchParams({ device_response: deviceResponse }).toString(),
      cache: "no-store",
    },
  );
  if (!res.ok) return null;
  const docs = (await res.json().catch(() => null)) as Array<{
    docType?: string;
    attributes?: Record<string, Record<string, unknown>>;
  }> | null;
  const attrs = Array.isArray(docs)
    ? docs.find((d) => d.docType === doctype)?.attributes?.[doctype]
    : undefined;
  return attrs
    ? pidOf(attrs.given_name, attrs.family_name, attrs.age_over_18)
    : null;
}

function pidOf(given: unknown, family: unknown, over18: unknown): VerifiedPid {
  return {
    ...(typeof given === "string" ? { givenName: given } : {}),
    ...(typeof family === "string" ? { familyName: family } : {}),
    ...(typeof over18 === "boolean" ? { ageOver18: over18 } : {}),
  };
}
