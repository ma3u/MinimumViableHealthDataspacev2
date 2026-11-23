import { createHash } from "node:crypto";

/**
 * The key a participant's siglet signs a token renewal with (#888).
 *
 * siglet's access token lives one hour. The consumer's siglet then renews it
 * at the provider's with a proof JWT, signed through Vault's transit engine
 * with the key its "signing-key mapping" names, under the `kid` the mapping
 * names. The provider looks that `kid` up in the consumer's DID document.
 * IdentityHub keeps a participant's own key in Vault's KV store, where siglet
 * cannot sign with it, so each participant gets a second key that never
 * leaves Vault and IdentityHub publishes its public half.
 *
 * The same three things scripts/seed-siglet-key-mappings.sh makes for the
 * seeded participants, with the same names, so the seed finds a participant
 * the hub onboarded complete and changes nothing.
 */

const KEY_PREFIX = process.env.SIGLET_KEY_PREFIX || "siglet-proof";
const TRANSIT_MOUNT = process.env.VAULT_TRANSIT_MOUNT || "transit";

/**
 * Vault's address and token, or null when the hub has no token. Read at call
 * time: a test stubs the variables without reloading the module.
 */
function vault(): { url: string; token: string } | null {
  const token = process.env.VAULT_TOKEN;
  if (!token) return null;
  return {
    url: (process.env.VAULT_URL || "http://vault:8200").replace(/\/$/, ""),
    token,
  };
}

function sigletManagementUrl(): string {
  return (process.env.SIGLET_MANAGEMENT_URL || "http://siglet:8083").replace(
    /\/$/,
    "",
  );
}

/** Whether the hub can make a signing key at all: it needs a Vault token. */
export function signingKeyConfigured(): boolean {
  return vault() !== null;
}

/** What a step reports when it cannot: the hub has no Vault token. */
export const SIGNING_KEY_NOT_CONFIGURED =
  "skipped: the hub has no VAULT_TOKEN, so this participant's transfers stop " +
  "after one hour until scripts/seed-siglet-key-mappings.sh has run";

export interface SigningKey {
  /** The transit key siglet signs with. */
  keyName: string;
  /** The verification method's id in the DID document. */
  kid: string;
  /** The public key, as the JWK member `x`. */
  x: string;
}

/** The transit key of a participant context. */
export function signingKeyName(contextId: string): string {
  return `${KEY_PREFIX}-${contextId}`;
}

/**
 * The key id: the DID and a fingerprint of the public key, so a key that was
 * replaced in Vault gets a new id and never answers to the old one.
 */
export function signingKid(did: string, x: string): string {
  const fingerprint = createHash("sha256").update(x).digest("hex").slice(0, 8);
  return `${did}#siglet-${fingerprint}`;
}

async function vaultCall(
  method: string,
  path: string,
  body?: unknown,
): Promise<Response> {
  const v = vault();
  if (!v) throw new Error("VAULT_TOKEN is not set");
  return fetch(`${v.url}/v1/${TRANSIT_MOUNT}/${path}`, {
    method,
    headers: {
      "X-Vault-Token": v.token,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
}

/**
 * Creates the participant's transit key (ed25519, the only algorithm siglet
 * signs and verifies with) and reads its public half. Creating a key that is
 * already there changes nothing in Vault.
 */
export async function createSigningKey(
  contextId: string,
  did: string,
): Promise<SigningKey> {
  const keyName = signingKeyName(contextId);
  const created = await vaultCall("POST", `keys/${keyName}`, {
    type: "ed25519",
  });
  if (!created.ok) {
    throw new Error(`Vault answered ${created.status} creating ${keyName}`);
  }
  const read = await vaultCall("GET", `keys/${keyName}`);
  if (!read.ok) {
    throw new Error(`Vault answered ${read.status} reading ${keyName}`);
  }
  const { data } = (await read.json()) as {
    data?: {
      type?: string;
      latest_version?: number;
      keys?: Record<string, { public_key?: string }>;
    };
  };
  const publicKey = data?.keys?.[String(data.latest_version)]?.public_key;
  if (data?.type !== "ed25519" || !publicKey) {
    throw new Error(`${keyName} is not an ed25519 key with a public half`);
  }
  const x = Buffer.from(publicKey, "base64").toString("base64url");
  return { keyName, kid: signingKid(did, x), x };
}

/**
 * Removes the transit key. Vault deletes a key only once its configuration
 * allows it, hence the two calls. A key that is not there is done.
 */
export async function deleteSigningKey(contextId: string): Promise<void> {
  const keyName = signingKeyName(contextId);
  const allow = await vaultCall("POST", `keys/${keyName}/config`, {
    deletion_allowed: true,
  });
  // Vault 1.x answers 400 "no existing key named ..." for a missing key here.
  if (allow.status === 404 || allow.status === 400) return;
  if (!allow.ok) {
    throw new Error(`Vault answered ${allow.status} for ${keyName}/config`);
  }
  const removed = await vaultCall("DELETE", `keys/${keyName}`);
  if (!removed.ok && removed.status !== 404) {
    throw new Error(`Vault answered ${removed.status} deleting ${keyName}`);
  }
}

/**
 * The IdentityHub key pair that puts the public key into the DID document.
 * No keyGeneratorParams: IdentityHub takes the public key as given. Usage is
 * sign_credentials only, so IdentityHub never picks this key for an STS token
 * or a presentation, which it could not sign: the private key is in Vault's
 * transit engine, not under the alias.
 */
export function signingKeyDescriptor(key: SigningKey) {
  return {
    keyId: key.kid,
    privateKeyAlias: `transit-${key.keyName}`,
    active: true,
    usage: ["sign_credentials"],
    publicKeyJwk: { kty: "OKP", crv: "Ed25519", x: key.x },
  };
}

/** Writes siglet's mapping for the context, replacing one that is there. */
export async function putKeyMapping(
  contextId: string,
  key: SigningKey,
): Promise<void> {
  const base = sigletManagementUrl();
  const headers = { "Content-Type": "application/json" };
  const created = await fetch(`${base}/key-mappings`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      participantContextId: contextId,
      keyName: key.keyName,
      kid: key.kid,
    }),
    cache: "no-store",
  });
  if (created.ok) return;
  if (created.status !== 409) {
    throw new Error(`siglet answered ${created.status} for the key mapping`);
  }
  const updated = await fetch(
    `${base}/key-mappings/${encodeURIComponent(contextId)}`,
    {
      method: "PUT",
      headers,
      body: JSON.stringify({ keyName: key.keyName, kid: key.kid }),
      cache: "no-store",
    },
  );
  if (!updated.ok) {
    throw new Error(`siglet answered ${updated.status} updating the mapping`);
  }
}

/** Removes siglet's mapping; one that is not there is done. */
export async function deleteKeyMapping(contextId: string): Promise<void> {
  const res = await fetch(
    `${sigletManagementUrl()}/key-mappings/${encodeURIComponent(contextId)}`,
    { method: "DELETE", cache: "no-store" },
  );
  if (!res.ok && res.status !== 404) {
    throw new Error(`siglet answered ${res.status} deleting the mapping`);
  }
}
