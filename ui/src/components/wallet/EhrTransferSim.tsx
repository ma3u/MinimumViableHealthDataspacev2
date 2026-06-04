"use client";

/**
 * Simulated ePA (elektronische Patientenakte) data-transfer flow from the
 * patient's Krankenkasse, authorised via GesundheitsID — a sibling of the EUDI
 * WalletSimulation but visually the insurer's app (brand-coloured, not purple).
 *
 * Public default: a synthetic, brand-coloured consent flow (fictional insurer).
 * Live-demo mode (NEXT_PUBLIC_DEMO_TK): shows the real, git-ignored TK ePA
 * screenshot in a phone bezel; falls back to the synthetic flow if the file is
 * absent (so CI / the public build / contributors all still build).
 *
 * ePA data-access via GesundheitsID — NOT an EUDI PID presentation. Illustrative.
 */
import { useState } from "react";
import { WalletFlow } from "@/components/wallet/PhoneFrame";
import { EHR_TRANSFER_STEPS } from "@/components/wallet/flows";
import { insurer } from "@/lib/journey-config";

export function EhrTransferSim() {
  const [imgOk, setImgOk] = useState(true);

  if (insurer.screenshot && imgOk) {
    return (
      <div className="w-[clamp(248px,30vw,300px)] rounded-[2rem] border-[5px] border-gray-900 bg-white shadow-2xl overflow-hidden relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={insurer.screenshot}
          alt={`${insurer.short} ePA — Behandlungsdaten (real screenshot)`}
          onError={() => setImgOk(false)}
          className="block w-full h-auto"
        />
        <span
          className="absolute top-2 left-2 text-[10px] font-bold px-2 py-0.5 rounded-full text-white shadow"
          style={{ background: insurer.brand }}
        >
          {insurer.short} · ePA → EHDS
        </span>
      </div>
    );
  }

  return (
    <WalletFlow
      loop
      ariaLabel={`Simulated ${insurer.short} ePA data transfer`}
      steps={EHR_TRANSFER_STEPS}
      brand={{ name: insurer.name, color: insurer.brand }}
    />
  );
}
