import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";

// ---------------------------------------------------------------------------
// The sealed extract: AES-256-GCM under a key per permit (ADR-068, #774)
// ---------------------------------------------------------------------------
//
//   "MVHDSPE1" | uint32 BE header length | header JSON | ciphertext | 16-byte tag
//
// The header says which SPE, permit and Trustee resource the extract belongs
// to, and is the GCM additional data: change one byte of it and the key no
// longer opens the extract. The plaintext is the gzipped JSON lines of
// extract.ts. The key is 32 random bytes made for one extract; it goes to
// Trustee and nowhere else (no file, no log, no environment variable).

export const MAGIC = Buffer.from("MVHDSPE1", "ascii");
export const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

export interface EnvelopeHeader {
  alg: "AES-256-GCM";
  compression: "gzip";
  speId: string;
  permitId: string;
  /** The Trustee resource the key is released from, default/spe-<n>/extract-key. */
  keyPath: string;
  /** null until the workload is fixed (ACI: the ccePolicy is generated after the extract is built). */
  policyHash: string | null;
  iv: string;
  createdAt: string;
  /** SHA-256 of the gzipped plaintext, so a load can say what it opened. */
  plaintextSha256: string;
}

export class ExtractKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExtractKeyError";
  }
}

export function newExtractKey(): Buffer {
  return randomBytes(KEY_BYTES);
}

function checkKey(key: Buffer): void {
  if (key.length !== KEY_BYTES) {
    throw new ExtractKeyError(
      `an extract key is ${KEY_BYTES} bytes, this one is ${key.length}`,
    );
  }
}

export function seal(
  plaintext: Buffer,
  key: Buffer,
  meta: Omit<EnvelopeHeader, "alg" | "compression" | "iv" | "plaintextSha256">,
): Buffer {
  checkKey(key);
  const compressed = gzipSync(plaintext);
  const iv = randomBytes(IV_BYTES);
  const header: EnvelopeHeader = {
    alg: "AES-256-GCM",
    compression: "gzip",
    ...meta,
    iv: iv.toString("base64"),
    plaintextSha256: createHash("sha256").update(compressed).digest("hex"),
  };
  const headerBytes = Buffer.from(JSON.stringify(header), "utf8");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(headerBytes.length);
  const cipher = createCipheriv("aes-256-gcm", key, iv, {
    authTagLength: TAG_BYTES,
  });
  cipher.setAAD(headerBytes);
  const body = Buffer.concat([cipher.update(compressed), cipher.final()]);
  return Buffer.concat([MAGIC, length, headerBytes, body, cipher.getAuthTag()]);
}

/** The header, readable without the key (it says which key to ask for). */
export function readHeader(envelope: Buffer): {
  header: EnvelopeHeader;
  headerBytes: Buffer;
  offset: number;
} {
  if (
    envelope.length < MAGIC.length + 4 ||
    !envelope.subarray(0, MAGIC.length).equals(MAGIC)
  ) {
    throw new Error("not a sealed SPE extract");
  }
  const length = envelope.readUInt32BE(MAGIC.length);
  const start = MAGIC.length + 4;
  if (length > 65536 || start + length + TAG_BYTES > envelope.length) {
    throw new Error("sealed extract is truncated");
  }
  const headerBytes = envelope.subarray(start, start + length);
  const header = JSON.parse(headerBytes.toString("utf8")) as EnvelopeHeader;
  if (header.alg !== "AES-256-GCM" || header.compression !== "gzip") {
    throw new Error(
      `unsupported extract envelope ${header.alg}/${header.compression}`,
    );
  }
  return { header, headerBytes, offset: start + length };
}

/**
 * Opens a sealed extract. A wrong key, or a header or body changed by a
 * single byte, fails GCM's tag check and throws ExtractKeyError: nothing of
 * the plaintext is returned.
 */
export function open(
  envelope: Buffer,
  key: Buffer,
): { header: EnvelopeHeader; plaintext: Buffer } {
  checkKey(key);
  const { header, headerBytes, offset } = readHeader(envelope);
  const body = envelope.subarray(offset, envelope.length - TAG_BYTES);
  const tag = envelope.subarray(envelope.length - TAG_BYTES);
  // The tag length is fixed, so a shortened tag is refused, not checked.
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(header.iv, "base64"),
    { authTagLength: TAG_BYTES },
  );
  decipher.setAAD(headerBytes);
  decipher.setAuthTag(tag);
  let compressed: Buffer;
  try {
    compressed = Buffer.concat([decipher.update(body), decipher.final()]);
  } catch {
    throw new ExtractKeyError(
      "the key does not open this extract (or the extract was changed)",
    );
  }
  return { header, plaintext: gunzipSync(compressed) };
}
