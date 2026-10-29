"use client";

import { CITIZEN_WALLET } from "@/lib/wallet-config";

/**
 * The QR code of a running EUDI Wallet presentation, what the wallet has
 * done so far, and the deep link for a person already on their phone. Used
 * by the sign-in page and the link page (ADR-067).
 */
export function EudiQrPanel({
  qr,
  walletLink,
  walletOpened,
  walletSilent,
}: {
  qr: string;
  walletLink: string | null;
  walletOpened: boolean;
  walletSilent: boolean;
}) {
  const wallet = CITIZEN_WALLET;
  return (
    <>
      <div className="bg-white rounded-lg p-4 inline-block mb-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={qr}
          alt={`${wallet.name} OpenID4VP QR code`}
          width={256}
          height={256}
          className="block"
        />
      </div>
      <div className="flex items-center justify-center gap-2 text-sm text-(--text-secondary) mb-3">
        <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse" />
        {walletOpened
          ? "Your wallet opened the request…"
          : "Waiting for your wallet…"}
      </div>
      {walletSilent && (
        <p
          role="status"
          className="text-xs text-amber-600 dark:text-amber-400 mb-3"
        >
          Your wallet opened the request but has not answered. If it says this
          service may not verify your data, this hub is not registered with that
          wallet yet.
        </p>
      )}
      {walletLink && (
        <a
          href={walletLink}
          className="text-xs text-(--accent) underline break-all"
        >
          On this phone? Tap to open {wallet.name}
        </a>
      )}
    </>
  );
}
