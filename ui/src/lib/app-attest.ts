import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
  X509Certificate,
} from "crypto";
import { APPLE_APP_ATTEST_ROOT_CA } from "@/lib/apple-app-attest-root";

/**
 * Apple App Attest, checked on the hub (ADR-054).
 *
 * The Klarbefund app creates an account on the hub without a session, so the
 * request has to prove where it comes from. iOS generates a key in the Secure
 * Enclave and asks Apple to certify it, binding the certificate to this team
 * and bundle id and to a value the hub chose. A script cannot produce that; a
 * genuine build of the app on a real device can.
 *
 * The steps are Apple's, "Validating apps that connect to your server":
 * https://developer.apple.com/documentation/devicecheck/validating-apps-that-connect-to-your-server
 */

/** Team id and bundle id: the relying party an attestation names. */
const APP_ID = "38R8Z4P7S8.red.mabu.meinbefund";

/** How long a challenge may be answered. */
const CHALLENGE_MS = 5 * 60_000;

function challengeKey(): string {
  const key = process.env.APP_ATTEST_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!key) throw new Error("APP_ATTEST_SECRET or NEXTAUTH_SECRET must be set");
  return key;
}

const b64url = (bytes: Buffer) => bytes.toString("base64url");

/**
 * A challenge any replica can check: expiry, random bytes, and an HMAC over
 * both. Nothing is stored; the in-memory pairing of #511 is why.
 */
export function issueChallenge(now: number = Date.now()): string {
  const body = `${now + CHALLENGE_MS}.${b64url(randomBytes(24))}`;
  const mac = createHmac("sha256", challengeKey()).update(body).digest();
  return `${body}.${b64url(mac)}`;
}

/** True when the hub issued this challenge and it has not expired. */
export function checkChallenge(
  challenge: string,
  now: number = Date.now(),
): boolean {
  const parts = challenge.split(".");
  if (parts.length !== 3) return false;
  const [expiry, nonce, mac] = parts;
  const expected = createHmac("sha256", challengeKey())
    .update(`${expiry}.${nonce}`)
    .digest();
  const given = Buffer.from(mac, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return false;
  }
  return Number(expiry) > now;
}

/** What the phone hashes as the attestation's client data. */
export function clientData(challenge: string, deviceId: string): string {
  return `${challenge}|${deviceId}`;
}

// ---- CBOR, as much as an attestation object uses ----

type Cbor =
  | number
  | bigint
  | string
  | Buffer
  | boolean
  | null
  | Cbor[]
  | Map<Cbor, Cbor>;

export class AttestError extends Error {}

/** Decodes one CBOR item (RFC 8949): integers, strings, arrays, maps, simple values. */
export function decodeCbor(data: Buffer): Cbor {
  let at = 0;
  const need = (n: number) => {
    if (at + n > data.length) throw new AttestError("truncated CBOR");
  };
  const length = (info: number): number => {
    if (info < 24) return info;
    const size = { 24: 1, 25: 2, 26: 4, 27: 8 }[info];
    if (!size) throw new AttestError("unsupported CBOR length");
    need(size);
    if (size === 8) {
      const big = data.readBigUInt64BE(at);
      at += 8;
      if (big > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new AttestError("CBOR length too large");
      }
      return Number(big);
    }
    const value = data.readUIntBE(at, size);
    at += size;
    return value;
  };
  const item = (depth: number): Cbor => {
    if (depth > 16) throw new AttestError("CBOR nested too deeply");
    need(1);
    const head = data[at++];
    const major = head >> 5;
    const info = head & 0x1f;
    switch (major) {
      case 0:
        return length(info);
      case 1:
        return -1 - length(info);
      case 2: {
        const n = length(info);
        need(n);
        const bytes = data.subarray(at, at + n);
        at += n;
        return Buffer.from(bytes);
      }
      case 3: {
        const n = length(info);
        need(n);
        const text = data.toString("utf8", at, at + n);
        at += n;
        return text;
      }
      case 4: {
        const n = length(info);
        return Array.from({ length: n }, () => item(depth + 1));
      }
      case 5: {
        const n = length(info);
        const map = new Map<Cbor, Cbor>();
        for (let i = 0; i < n; i++) map.set(item(depth + 1), item(depth + 1));
        return map;
      }
      case 7:
        if (info === 20) return false;
        if (info === 21) return true;
        if (info === 22) return null;
        throw new AttestError("unsupported CBOR simple value");
      default:
        throw new AttestError("unsupported CBOR type");
    }
  };
  const value = item(0);
  if (at !== data.length) throw new AttestError("trailing bytes after CBOR");
  return value;
}

// ---- The attestation ----

/** The AAGUIDs Apple sets: a development build's key, and a distributed one's. */
const ENVIRONMENTS: Record<string, "development" | "production"> = {
  [Buffer.from("appattestdevelop").toString("hex")]: "development",
  [Buffer.concat([Buffer.from("appattest"), Buffer.alloc(7)]).toString("hex")]:
    "production",
};

/** OID 1.2.840.113635.100.8.2, Apple's nonce extension, DER-encoded. */
const NONCE_OID = Buffer.from("06092a864886f763640802", "hex");

/**
 * The nonce in the leaf certificate's Apple extension.
 *
 * The extension value is `SEQUENCE { [1] { OCTET STRING (32 bytes) } }`,
 * which in DER is always `30 24 a1 22 04 20` and the 32 bytes. Node exposes
 * no arbitrary extensions, so the encoding is found after the OID.
 */
function certificateNonce(leaf: X509Certificate): Buffer {
  const der = leaf.raw;
  const oid = der.indexOf(NONCE_OID);
  if (oid < 0) throw new AttestError("the leaf certificate has no nonce");
  const marker = der.indexOf(
    Buffer.from("3024a1220420", "hex"),
    oid + NONCE_OID.length,
  );
  if (marker < 0 || marker > oid + NONCE_OID.length + 8) {
    throw new AttestError("the nonce extension is not in Apple's form");
  }
  return Buffer.from(der.subarray(marker + 6, marker + 6 + 32));
}

/** The leaf's EC public key as an uncompressed point, whose hash is the key id. */
function uncompressedPoint(leaf: X509Certificate): Buffer {
  const jwk = leaf.publicKey.export({ format: "jwk" }) as {
    x?: string;
    y?: string;
  };
  if (!jwk.x || !jwk.y) throw new AttestError("the leaf key is not EC");
  return Buffer.concat([
    Buffer.from([4]),
    Buffer.from(jwk.x, "base64url"),
    Buffer.from(jwk.y, "base64url"),
  ]);
}

function validAt(cert: X509Certificate, now: number): boolean {
  return (
    new Date(cert.validFrom).getTime() <= now &&
    now <= new Date(cert.validTo).getTime()
  );
}

const sha256 = (...parts: (Buffer | string)[]) => {
  const hash = createHash("sha256");
  for (const p of parts) hash.update(p);
  return hash.digest();
};

export interface Attested {
  environment: "development" | "production";
  /** The attested public key, for checking assertions later. */
  publicKey: string;
}

/**
 * Verifies an App Attest attestation, or throws AttestError with the step
 * that failed. `keyId` and `attestation` are base64 as the phone sends them.
 */
export function verifyAttestation(input: {
  keyId: string;
  attestation: string;
  clientData: string;
  appId?: string;
  root?: string;
  now?: number;
}): Attested {
  const now = input.now ?? Date.now();
  const keyId = Buffer.from(input.keyId, "base64");
  if (keyId.length !== 32) throw new AttestError("the key id is not 32 bytes");

  const object = decodeCbor(Buffer.from(input.attestation, "base64"));
  if (!(object instanceof Map)) throw new AttestError("not an attestation");
  if (object.get("fmt") !== "apple-appattest") {
    throw new AttestError("not an App Attest attestation");
  }
  const statement = object.get("attStmt");
  const authData = object.get("authData");
  if (!(statement instanceof Map) || !Buffer.isBuffer(authData)) {
    throw new AttestError("the attestation is incomplete");
  }
  const x5c = statement.get("x5c");
  if (!Array.isArray(x5c) || x5c.length < 2 || !x5c.every(Buffer.isBuffer)) {
    throw new AttestError("the certificate chain is missing");
  }

  // 1. The chain: leaf, intermediate, Apple's root.
  const leaf = new X509Certificate(x5c[0] as Buffer);
  const intermediate = new X509Certificate(x5c[1] as Buffer);
  const root = new X509Certificate(input.root ?? APPLE_APP_ATTEST_ROOT_CA);
  if (
    !leaf.checkIssued(intermediate) ||
    !leaf.verify(intermediate.publicKey) ||
    !intermediate.checkIssued(root) ||
    !intermediate.verify(root.publicKey)
  ) {
    throw new AttestError("the certificate chain does not lead to Apple");
  }
  if (![leaf, intermediate, root].every((c) => validAt(c, now))) {
    throw new AttestError("a certificate in the chain is not valid now");
  }

  // 2–4. The nonce binds the attestation to this challenge and device.
  const nonce = sha256(authData, sha256(input.clientData));
  if (!certificateNonce(leaf).equals(nonce)) {
    throw new AttestError("the attestation is for another challenge");
  }

  // 5. The key id is the hash of the attested public key.
  if (!sha256(uncompressedPoint(leaf)).equals(keyId)) {
    throw new AttestError("the key id does not match the certified key");
  }

  // 6–9. The authenticator data: this app, a fresh key, its environment.
  if (authData.length < 55) {
    throw new AttestError("authenticator data too short");
  }
  if (!authData.subarray(0, 32).equals(sha256(input.appId ?? APP_ID))) {
    throw new AttestError("the attestation is for another app");
  }
  if (authData.readUInt32BE(33) !== 0) {
    throw new AttestError("the key has been used before");
  }
  const environment = ENVIRONMENTS[authData.subarray(37, 53).toString("hex")];
  if (!environment) throw new AttestError("unknown App Attest environment");
  const idLength = authData.readUInt16BE(53);
  if (!authData.subarray(55, 55 + idLength).equals(keyId)) {
    throw new AttestError("the credential id is not the key id");
  }

  return {
    environment,
    publicKey: leaf.publicKey.export({ format: "pem", type: "spki" }) as string,
  };
}
