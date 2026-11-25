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

/** The page where a signed-in person connects their wallet to the account (#708). */
export const WALLET_LINK_PATH = "/patient/wallet";

/**
 * Whether a sign-in is on its way to connecting a wallet. Connecting needs the
 * account first, so the sign-in pages point to the password sign-in instead
 * of the wallet's own, which only opens a record already linked (#708).
 */
export function connectsWallet(
  callbackUrl: string | null | undefined,
): boolean {
  if (!callbackUrl) return false;
  let path = callbackUrl;
  try {
    path = new URL(callbackUrl, "http://hub.local").pathname;
  } catch {
    /* not a URL: compare it as it is */
  }
  return path === WALLET_LINK_PATH || path.startsWith(`${WALLET_LINK_PATH}/`);
}
