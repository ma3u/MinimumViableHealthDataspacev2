/**
 * The secure hash that links a PID to an account (ADR-067, #708).
 *
 * `HMAC-SHA256(key, given name | family name | birth date)`, prefixed with
 * the key id so a rotation is visible. The hub stores this value on the
 * Keycloak account and nothing else of the PID: the name and the birth date
 * exist only in memory while it is computed. Without the key the value can
 * be neither computed nor checked against a guess; the key lives in Key
 * Vault (`pid-fingerprint-key`), apart from Keycloak.
 *
 * Under the GDPR the value is pseudonymised personal data (Art. 4(5),
 * Recital 26): it recognises one person, but reveals nothing about them.
 */
import { createHmac } from "crypto";
import { normalise, type VerifiedPid } from "@/lib/eudi-patient-map";

/** At least 256 bits, base64. Without it the link is switched off. */
const MIN_KEY_BYTES = 32;

function key(): { id: string; bytes: Buffer } | null {
  const raw = process.env.PID_FINGERPRINT_KEY;
  if (!raw) return null;
  const bytes = Buffer.from(raw, "base64");
  if (bytes.length < MIN_KEY_BYTES) return null;
  return { id: process.env.PID_FINGERPRINT_KEY_ID || "k1", bytes };
}

/** Whether this deployment can link a PID to an account at all. */
export function pidLinkEnabled(): boolean {
  return key() !== null;
}

/**
 * The secure hash of a PID, `<key id>:<64 hex>`, or null when the PID lacks
 * a name or a birth date, or the deployment has no key.
 */
export function pidFingerprint(pid: VerifiedPid): string | null {
  const k = key();
  if (!k || !pid.givenName || !pid.familyName || !pid.birthDate) return null;
  const input = [
    normalise(pid.givenName),
    normalise(pid.familyName),
    pid.birthDate.trim(),
  ].join("|");
  return `${k.id}:${createHmac("sha256", k.bytes).update(input).digest("hex")}`;
}
