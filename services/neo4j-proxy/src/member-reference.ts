import { createHash } from "node:crypto";

// ---------------------------------------------------------------------------
// The reference a program's answer is tied to (#934 step 8, ADR-091).
//
// The hub sends an insurer neither a name nor an insurance number. Each
// consent to a program has a reference instead: the member reads it in the
// portal and gives it to the insurer, and the answer the insurer collects
// carries the same one. It is derived from the consent id, so a new join
// after a withdrawal has a new reference, and nothing is stored for it.
//
// The portal shows what this file computes: ui/src/lib/patient/member-reference.ts
// is the second copy, and both run the vectors in
// __tests__/fixtures/member-reference-vectors.json.
// ---------------------------------------------------------------------------

/** Crockford base32: no I, L, O or U, so a reference survives being read out. */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const LENGTH = 12;

export function memberReference(consentId: string): string {
  const digest = createHash("sha256")
    .update(`mvhd:programme-reference:${consentId}`)
    .digest();
  let out = "";
  let acc = 0;
  let bits = 0;
  for (const byte of digest) {
    acc = (acc << 8) | byte;
    bits += 8;
    while (bits >= 5 && out.length < LENGTH) {
      out += ALPHABET[(acc >>> (bits - 5)) & 31];
      bits -= 5;
    }
    acc &= (1 << bits) - 1;
    if (out.length === LENGTH) break;
  }
  return `${out.slice(0, 4)}-${out.slice(4, 8)}-${out.slice(8)}`;
}
