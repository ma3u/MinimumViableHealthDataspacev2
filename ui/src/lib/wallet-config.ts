/**
 * The citizen's wallet, as the demo names it.
 *
 * d-you is the German national EUDI Wallet (BMDS / SPRIND), launching on
 * 2 January 2027. The demo shows it by name because it is the wallet a German
 * patient will hold. The protocol underneath is the same for every certified
 * EUDI wallet (OpenID4VP for sign-in, OpenID4VCI for credentials), and a
 * relying party must accept any of them (eIDAS 2.0), so nothing here is
 * wallet-specific code: a name, a colour for the simulated phone's chip, and
 * one sentence. Issue #182 has the plan behind it.
 */
export const CITIZEN_WALLET = {
  name: "d-you",
  /** one line for subtitles */
  description: "d-you, the German EUDI Wallet",
  /** accent of the simulated phone: the demo's own, not an official brand colour */
  color: "#5b3df5",
  /** the honest footnote: we accept every certified wallet, not only this one */
  alternatives: "or any other certified EUDI wallet",
} as const;
