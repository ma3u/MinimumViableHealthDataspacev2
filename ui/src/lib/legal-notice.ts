/**
 * The provider of this website, as the legal notice (§ 5 DDG) and the privacy
 * policy (Art. 13 GDPR) name him. One place, so both pages and the structured
 * data agree.
 *
 * The address must be one that can receive legal mail (no PO box), and § 5
 * DDG asks for a second quick way to reach the provider besides email.
 * `isComplete()` stays false while a placeholder is left, and
 * `legal-notice.test.ts` fails in CI while one is, so a placeholder cannot be
 * merged and published.
 */
export const PROVIDER = {
  name: "Matthias Buchhorn",
  street: "[Straße und Hausnummer]",
  postalCode: "[PLZ]",
  city: "[Ort]",
  country: "Deutschland",
  email: "[E-Mail-Adresse]",
  phone: "[Telefonnummer]",
} as const;

/** The date the two pages were last changed, shown on both. */
export const LEGAL_LAST_UPDATED = "2026-11-08";

export const PLACEHOLDER = /^\[.*\]$/;

export function isComplete(): boolean {
  return !Object.values(PROVIDER).some((v) => PLACEHOLDER.test(v));
}
