"use client";

/**
 * Simulated ePA (elektronische Patientenakte) data-transfer flow from the
 * patient's Krankenkasse, authorised via GesundheitsID — a sibling of the EUDI
 * WalletSimulation but visually the insurer's app (brand-coloured, not purple).
 *
 * This is an ePA data-access authorization, NOT an EUDI PID presentation, and
 * GesundheitsID (not the EUDI wallet) is today's real ePA auth. Insurer label +
 * brand come from the gated config (fictional default; TK only behind
 * NEXT_PUBLIC_DEMO_TK). Illustrative; synthetic data.
 */
import { WalletFlow } from "@/components/wallet/PhoneFrame";
import { EHR_TRANSFER_STEPS } from "@/components/wallet/flows";
import { insurer } from "@/lib/journey-config";

export function EhrTransferSim() {
  return (
    <WalletFlow
      loop
      ariaLabel={`Simulated ${insurer.short} ePA data transfer`}
      steps={EHR_TRANSFER_STEPS}
      brand={{ name: insurer.name, color: insurer.brand }}
    />
  );
}
