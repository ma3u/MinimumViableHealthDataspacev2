"use client";

import { useState } from "react";
import {
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  UserPlus,
  KeyRound,
  Smartphone,
} from "lucide-react";
import { EudiQrPanel } from "@/components/wallet/EudiQrPanel";
import { BASE_PATH } from "@/lib/static-export";
import { CITIZEN_WALLET } from "@/lib/wallet-config";
import type { WalletSignIn } from "@/lib/use-wallet-sign-in";
import { T, useT } from "@/lib/i18n/translate";

/**
 * Where a wallet sign-in stands: preparing the request, the QR code, signed
 * in, the new account of ADR-067 with its one-time password, or why the
 * wallet could not sign in, with "Create an account with this PID" where the
 * status route allowed it. Shared by the sign-in page and the start page's
 * register dialog, so both offer the same paths.
 *
 * A new account may go on to connect the Klarbefund app (ADR-049): optional,
 * and done on the profile page's card, where Keycloak asks for this login
 * once to approve the phone.
 */
export function WalletSignInStatus({ flow }: { flow: WalletSignIn }) {
  const t = useT("admin");
  const { presentation, account, registering, registerError } = flow;
  const { phase, refusal } = presentation;
  const [connectApp, setConnectApp] = useState(false);
  const walletVars = { wallet: CITIZEN_WALLET.name };

  if (account) {
    return (
      <div
        className="py-4 text-left"
        role="region"
        aria-label={t("Your new account")}
      >
        <div className="flex items-center gap-2 mb-2 text-green-600 dark:text-green-400">
          <KeyRound size={20} />
          <p className="font-medium">{t("Your account is ready")}</p>
        </div>
        <p className="text-sm text-(--text-secondary) mb-3">
          {t(
            "Keep this username and password somewhere safe. The hub shows the password only now and cannot show it again. Next time you can sign in with {wallet} or with these.",
            walletVars,
          )}
        </p>
        <dl className="text-sm mb-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          <dt className="text-(--text-secondary)">{t("Username")}</dt>
          <dd
            className="font-mono text-(--text-primary) break-all"
            data-testid="new-account-username"
          >
            {account.username}
          </dd>
          <dt className="text-(--text-secondary)">{t("Password")}</dt>
          <dd
            className="font-mono text-(--text-primary) break-all"
            data-testid="new-account-password"
          >
            {account.password}
          </dd>
        </dl>
        <label className="flex items-start gap-2 mb-4 rounded-lg border border-(--border) p-3 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={connectApp}
            onChange={(e) => setConnectApp(e.target.checked)}
            className="mt-0.5"
            data-testid="connect-app-next"
          />
          <span>
            <span className="flex items-center gap-1.5 font-medium text-(--text-primary)">
              <Smartphone size={14} aria-hidden />
              {t("Connect the Klarbefund app next (optional)")}
            </span>
            <span className="block text-xs text-(--text-secondary) mt-0.5">
              {t(
                "Klarbefund reads this record on your iPhone. To approve it, Keycloak asks once for this username and password. You can also connect it later on your profile.",
              )}
            </span>
          </span>
        </label>
        <button
          onClick={() => void flow.continueSignedIn({ connectApp })}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-(--accent) hover:bg-(--accent-hover) text-white dark:text-gray-900 rounded-lg font-medium transition-colors"
        >
          {t("I have saved them, sign me in")}
        </button>
      </div>
    );
  }

  if (phase === "idle" || phase === "loading") {
    return (
      <div className="py-10 text-(--text-secondary)">
        {t("Preparing a secure request…")}
      </div>
    );
  }

  if (phase === "scanning" && presentation.qr) {
    return (
      <EudiQrPanel
        qr={presentation.qr}
        walletLink={presentation.walletLink}
        walletOpened={presentation.walletOpened}
        walletSilent={presentation.walletSilent}
      />
    );
  }

  if (phase === "done") {
    return (
      <div className="py-8 flex flex-col items-center gap-2 text-green-600 dark:text-green-400">
        <CheckCircle2 size={40} />
        <p className="font-medium">{t("Verified, signing you in…")}</p>
      </div>
    );
  }

  if (phase === "error" || phase === "expired" || phase === "refused") {
    return (
      <div className="py-6">
        <AlertTriangle size={36} className="mx-auto mb-2 text-amber-500" />
        <p className="text-sm text-(--text-secondary) mb-4">
          {phase === "expired"
            ? t("This sign-in request expired.")
            : phase === "refused"
              ? refusal?.error
              : t("Could not reach the EUDI verifier.")}
        </p>
        {phase === "refused" && refusal?.canRegister && (
          <div className="mb-4">
            <p className="text-xs text-(--text-secondary) mb-3">
              <T
                area="admin"
                tags={{
                  a: (
                    <a
                      href={`${BASE_PATH}/hub/privacy.html`}
                      className="text-(--accent) underline"
                    />
                  ),
                }}
              >
                {
                  "You can create a sandbox account with this PID. The hub keeps only a secure hash of your name and birth date on it, never the name or the date (<a>privacy notice</a>)."
                }
              </T>
            </p>
            <button
              onClick={() => void flow.register()}
              disabled={registering}
              className="inline-flex items-center gap-2 px-4 py-2 bg-(--accent) hover:bg-(--accent-hover) text-white dark:text-gray-900 rounded-lg font-medium transition-colors disabled:opacity-60"
            >
              <UserPlus size={16} />
              {registering
                ? t("Creating your account…")
                : t("Create an account with this PID")}
            </button>
            {registerError && (
              <p
                role="alert"
                className="text-xs text-amber-600 dark:text-amber-400 mt-2"
              >
                {t(registerError)}
              </p>
            )}
          </div>
        )}
        <button
          onClick={flow.restart}
          className="inline-flex items-center gap-2 px-4 py-2 bg-(--accent) hover:bg-(--accent-hover) text-white dark:text-gray-900 rounded-lg font-medium transition-colors"
        >
          <RefreshCw size={16} /> {t("Try again")}
        </button>
      </div>
    );
  }

  return null;
}
