/**
 * Adapter for the EU reference OpenID4VP Verifier backend
 * (eu-digital-identity-wallet/eudi-srv-web-verifier-endpoint-23220-4-kt),
 * as hosted at https://verifier.eudiw.dev.
 *
 * Contract pinned against the reference backend README:
 *   - POST /ui/presentations           — initialise a cross-device transaction
 *       body: { dcql_query, nonce, jar_mode, request_uri_method, profile }
 *       resp: { transaction_id, client_id, request_uri, request_uri_method }
 *   - GET  /ui/presentations/{txId}     — retrieve the wallet's vp_token once posted
 *
 * Everything is configurable via env so a self-hosted verifier — or the German
 * EUDI sandbox path (signing the request object with the RP access certificate
 * so the German wallet trusts it) — can be switched in without code changes.
 * See ADR-028. Cryptographic verification of the vp_token is DELEGATED to the
 * verifier backend; this module never trusts an unverified credential.
 */
import { randomUUID } from "crypto";
import type { VerifiedPid } from "@/lib/eudi-patient-map";

const BASE = (
  process.env.EUDI_VERIFIER_BASE_URL ?? "https://verifier.eudiw.dev"
).replace(/\/+$/, "");
/** QR / wallet deep-link scheme. EU reference wallet historically uses openid4vp://; haip-vp:// and eudi-openid4vp:// are alternatives. */
const SCHEME = process.env.EUDI_VERIFIER_SCHEME ?? "openid4vp://";
const DOCTYPE = process.env.EUDI_PID_DOCTYPE ?? "eu.europa.ec.eudi.pid.1";
const PROFILE = process.env.EUDI_VERIFIER_PROFILE ?? "openid4vp";
/** "get" (wallet GETs the signed request — broadest compat) or "post". */
const REQUEST_URI_METHOD = process.env.EUDI_REQUEST_URI_METHOD ?? "get";
/** "direct_post" (cleartext) or "direct_post.jwt" (encrypted). Cleartext keeps polling simple. */
const RESPONSE_MODE = process.env.EUDI_RESPONSE_MODE ?? "direct_post";

/** PID claims we request — name + birth date are enough to prove a real wallet. */
const PID_CLAIMS = ["family_name", "given_name", "birth_date"];

export interface StartedPresentation {
  transactionId: string;
  clientId: string;
  requestUri: string;
  /** the full openid4vp deep link to render as a QR / tap on the same device */
  walletLink: string;
}

export type PresentationResult =
  | { status: "pending" }
  | { status: "completed"; pid: VerifiedPid };

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 300);
  } catch {
    return "";
  }
}

/**
 * Initialise an OpenID4VP cross-device presentation request for the PID and
 * return the wallet deep link to encode as a QR code.
 */
export async function startPresentation(
  nonce: string,
): Promise<StartedPresentation> {
  const credId = randomUUID();
  const body = {
    dcql_query: {
      credentials: [
        {
          id: credId,
          format: "mso_mdoc",
          meta: { doctype_value: DOCTYPE },
          claims: PID_CLAIMS.map((c) => ({ path: [DOCTYPE, c] })),
        },
      ],
      credential_sets: [
        {
          options: [[credId]],
          purpose: "Sign in to the Health Dataspace patient portal",
        },
      ],
    },
    nonce,
    response_mode: RESPONSE_MODE,
    jar_mode: "by_reference",
    request_uri_method: REQUEST_URI_METHOD,
    profile: PROFILE,
  };

  const res = await fetch(`${BASE}/ui/presentations`, {
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
  const walletLink = `${SCHEME}?${params.toString()}`;
  return { transactionId, clientId, requestUri, walletLink };
}

/**
 * Poll the verifier for the wallet's response. A present `vp_token` means the
 * verifier backend has accepted a validated presentation for this transaction.
 * We do NOT decode the mdoc vp_token here (no hand-rolled CBOR/crypto); the
 * disclosed name is cosmetic for this demo, so PID is returned empty and the
 * patient mapping falls back to a friendly label.
 */
export async function getPresentationResult(
  transactionId: string,
): Promise<PresentationResult> {
  const res = await fetch(
    `${BASE}/ui/presentations/${encodeURIComponent(transactionId)}`,
    {
      method: "GET",
      headers: { accept: "application/json" },
      cache: "no-store",
    },
  );
  // Until the wallet posts, the verifier has no response yet.
  if (res.status === 404 || res.status === 204) return { status: "pending" };
  if (!res.ok) throw new Error(`verifier poll failed: ${res.status}`);
  const json = (await res.json().catch(() => null)) as {
    vp_token?: unknown;
  } | null;
  if (!json || json.vp_token == null) return { status: "pending" };
  return { status: "completed", pid: {} };
}
