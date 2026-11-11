"use client";

/**
 * The register dialog's two ways in on the hub (not in the static export):
 *
 * - Left, the QR code of a real OpenID4VP request from the hub's verifier.
 *   Scanned with the citizen wallet it signs in to the person's own account,
 *   or creates one from the PID (ADR-067), optionally followed by connecting
 *   the Klarbefund app (ADR-049).
 * - Right, the simulated phone. Approving it signs in as the demo patient
 *   `patient1`, with a real session, and lands on `callbackUrl`.
 *
 * The static export has no verifier and no session: there the dialog keeps
 * `EudiApprovalFlow`, a picture of a QR code and a persona in the browser.
 */
import { useEffect } from "react";
import { ScanLine } from "lucide-react";
import { WalletFlow } from "@/components/wallet/PhoneFrame";
import { REGISTER_STEPS, LOGIN_STEPS } from "@/components/wallet/flows";
import { WalletSignInStatus } from "@/components/wallet/WalletSignInStatus";
import { useWalletSignIn } from "@/lib/use-wallet-sign-in";
import { CITIZEN_WALLET } from "@/lib/wallet-config";
import { useT } from "@/lib/i18n/translate";

export function WalletSignInFlow({
  mode,
  callbackUrl,
  onCancel,
}: {
  mode: "register" | "login";
  /** where a sign-in lands, for the wallet and the simulated phone alike */
  callbackUrl: string;
  onCancel?: () => void;
}) {
  const t = useT("patient");
  // The sign-in page's own texts live in the admin area.
  const ts = useT("admin");
  const flow = useWalletSignIn({ callbackUrl });
  const { start, phase } = flow.presentation;
  const wallet = CITIZEN_WALLET;

  // One request per opening of the dialog; closing it stops the polling.
  useEffect(() => {
    void start();
  }, [start]);

  return (
    <div className="flex flex-col md:flex-row items-center md:items-start justify-center gap-6">
      <div
        className="flex flex-col items-center text-center w-full max-w-[320px]"
        data-testid="wallet-sign-in-qr"
      >
        {phase === "scanning" && !flow.account && (
          <p className="flex items-center gap-1.5 text-sm font-semibold text-(--text-primary) mb-2">
            <ScanLine
              size={16}
              style={{ color: wallet.color }}
              aria-hidden="true"
            />
            {t("Scan with {wallet}", { wallet: wallet.name })}
          </p>
        )}
        <WalletSignInStatus flow={flow} />
        {!flow.account && phase !== "done" && (
          <p className="text-xs text-(--text-secondary) max-w-[260px] mt-2">
            {t("…or approve on the simulated phone →")}
          </p>
        )}
      </div>

      <div className="flex flex-col items-center gap-2 shrink-0">
        <WalletFlow
          interactive
          loop={false}
          theme="dyou"
          steps={[...(mode === "login" ? LOGIN_STEPS : REGISTER_STEPS)]}
          ariaLabel={
            mode === "login"
              ? t("Approve {wallet} login", { wallet: wallet.name })
              : t("Approve {wallet} register", { wallet: wallet.name })
          }
          onComplete={() => void flow.approveSimulated()}
          onCancel={onCancel}
        />
        <p className="text-xs text-(--text-secondary) max-w-[280px] text-center">
          {ts(
            "What happens on your phone. No {wallet} yet? Approve here to sign in as the demo patient.",
            { wallet: wallet.name },
          )}
        </p>
        {flow.demoHint && (
          <p
            role="status"
            className="text-xs text-amber-600 dark:text-amber-400 max-w-[280px] text-center"
          >
            {ts(flow.demoHint, { wallet: wallet.name })}
          </p>
        )}
      </div>
    </div>
  );
}
