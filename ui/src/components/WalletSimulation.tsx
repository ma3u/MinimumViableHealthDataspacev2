"use client";

/**
 * Simulated EUDI Wallet REGISTRATION flow (OpenID4VP), shown next to the QR.
 * Thin shim over the shared WalletFlow engine — the step data lives in
 * ui/src/components/wallet/flows.tsx (REGISTER_STEPS). Kept as a named export so
 * existing call sites (journey, /auth/eudi-qr) and WalletSimulation.test.tsx are
 * unchanged. Illustrative; synthetic data only.
 */
import { WalletFlow } from "@/components/wallet/PhoneFrame";
import { REGISTER_STEPS } from "@/components/wallet/flows";

export function WalletSimulation() {
  return (
    <WalletFlow
      loop
      ariaLabel="Simulated EUDI Wallet registration"
      steps={REGISTER_STEPS}
    />
  );
}
