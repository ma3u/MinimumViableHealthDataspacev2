/**
 * The provider of this website, as the legal notice (§ 5 DDG) and the privacy
 * policy (Art. 13 GDPR) name him. One place, so both pages agree.
 *
 * The address is one that can receive legal mail (no PO box). § 5 Abs. 1
 * Nr. 2 DDG asks for email and a second quick, direct way to reach the
 * provider; the CJEU (C-298/07) accepts an electronic contact form instead of
 * a telephone, so `phone` is optional and the pages leave the line out
 * without one. `isComplete()` is false while a placeholder is left, and
 * `seo.test.ts` fails in CI while one is, so none can be published.
 */
export const PROVIDER: {
  name: string;
  street: string;
  postalCode: string;
  city: string;
  country: string;
  email: string;
  phone?: string;
} = {
  name: "Matthias Buchhorn-Roth",
  street: "Simplonstrasse 56",
  postalCode: "10245",
  city: "Berlin",
  country: "Deutschland",
  email: "matthias.buchhorn@web.de",
};

/** The date the two pages were last changed, shown on both. */
export const LEGAL_LAST_UPDATED = "2026-11-09";

const PLACEHOLDER = /^\[.*\]$/;

export function isComplete(): boolean {
  return !Object.values(PROVIDER).some(
    (v) => v !== undefined && PLACEHOLDER.test(v),
  );
}
