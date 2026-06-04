"use client";

/**
 * EudiApprovalFlow — the shared QR + interactive wallet-approval surface used by
 * the homepage Register dialog, the /auth/eudi-qr demo page, and the /patient
 * "Request EHR data" flow.
 *
 * Left: a client-generated QR code (the `qrcode` lib runs in the browser, so this
 * works in the fully-static export where the live verifier API is unavailable).
 * Right: an INTERACTIVE WalletFlow — the user clicks the primary button to step
 * through trust → review → done, and the final click fires `onComplete`.
 *
 * This is a simulation of the cross-device OpenID4VP / GesundheitsID approval —
 * synthetic data, illustrative. See docs/planning/eudi-wallet-flows-2026.md.
 */
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { ScanLine } from "lucide-react";
import { WalletFlow } from "@/components/wallet/PhoneFrame";
import {
  REGISTER_STEPS,
  LOGIN_STEPS,
  EHR_TRANSFER_STEPS,
} from "@/components/wallet/flows";
import { insurer } from "@/lib/journey-config";

export type ApprovalMode = "register" | "login" | "ehr";

const FLOWS = {
  register: {
    steps: REGISTER_STEPS,
    qrUrl: "https://ehds.mabu.red/auth/eudi-qr?mode=register",
    scanLabel: "Scan with your EUDI Wallet",
    brand: undefined as { name: string; color: string } | undefined,
  },
  login: {
    steps: LOGIN_STEPS,
    qrUrl: "https://ehds.mabu.red/auth/eudi-qr?mode=login",
    scanLabel: "Scan with your EUDI Wallet",
    brand: undefined as { name: string; color: string } | undefined,
  },
  ehr: {
    steps: EHR_TRANSFER_STEPS,
    qrUrl: "https://ehds.mabu.red/patient/ehr-transfer",
    scanLabel: "Scan with your insurer app",
    brand: { name: insurer.name, color: insurer.brand },
  },
} as const;

export function EudiApprovalFlow({
  mode,
  onComplete,
  onCancel,
}: {
  mode: ApprovalMode;
  onComplete: () => void;
  onCancel?: () => void;
}) {
  const cfg = FLOWS[mode];
  const accent = cfg.brand?.color ?? "#5b3df5";
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    // Promise.resolve wrapper so a synchronous throw (e.g. no <canvas> in jsdom)
    // becomes a rejection we can swallow — the QR is decorative in the demo.
    Promise.resolve()
      .then(() =>
        QRCode.toDataURL(cfg.qrUrl, {
          width: 240,
          margin: 1,
          color: { dark: "#0b1326", light: "#ffffff" },
        }),
      )
      .then((d) => {
        if (active) setQr(d);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [cfg.qrUrl]);

  return (
    <div className="flex flex-col md:flex-row items-center justify-center gap-6">
      {/* QR (cross-device) */}
      <div className="flex flex-col items-center gap-2 shrink-0">
        <div className="bg-white rounded-2xl p-3 shadow-lg w-[clamp(160px,42vw,206px)] aspect-square grid place-items-center">
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qr}
              alt={`${cfg.scanLabel} — OpenID4VP QR code`}
              className="block w-full h-full"
            />
          ) : (
            <span className="animate-pulse text-gray-300 text-xs">
              Generating QR…
            </span>
          )}
        </div>
        <p className="flex items-center gap-1.5 text-sm font-semibold text-[var(--text-primary)]">
          <ScanLine size={16} style={{ color: accent }} aria-hidden="true" />
          {cfg.scanLabel}
        </p>
        <p className="text-xs text-[var(--text-secondary)] text-center max-w-[210px]">
          …or approve on the simulated phone →
        </p>
      </div>

      {/* Interactive phone — user taps Approve */}
      <div className="shrink-0">
        <WalletFlow
          interactive
          loop={false}
          steps={[...cfg.steps]}
          brand={cfg.brand}
          ariaLabel={`Approve EUDI Wallet ${mode}`}
          onComplete={onComplete}
          onCancel={onCancel}
        />
      </div>
    </div>
  );
}
