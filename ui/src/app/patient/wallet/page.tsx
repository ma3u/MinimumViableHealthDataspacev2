"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Unplug,
  Wallet,
} from "lucide-react";
import PageIntro from "@/components/PageIntro";
import { EudiQrPanel } from "@/components/wallet/EudiQrPanel";
import { fetchApi } from "@/lib/api";
import { IS_STATIC } from "@/lib/static-export";
import { useEudiPresentation } from "@/lib/use-eudi-presentation";
import { CITIZEN_WALLET } from "@/lib/wallet-config";

/** What `GET /api/patient/wallet-link` answers. Never the hash itself. */
interface LinkState {
  /** a sandbox account (`kb-`), the only kind a PID links to */
  eligible: boolean;
  /** the hub has the hash key and the account service */
  available: boolean;
  linked: boolean;
}

const WALLET = CITIZEN_WALLET;
const LINK_BODY = { purpose: "link" } as const;

/**
 * "Connect your EUDI wallet" (ADR-067): a signed-in sandbox patient presents
 * their PID once, and from then on signs in to this account with the wallet,
 * at assurance level high. The hub keeps a secure hash of the PID's name and
 * birth date on the account, nothing else; "Disconnect wallet" removes it.
 */
export default function PatientWalletPage() {
  const [state, setState] = useState<LinkState | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    if (IS_STATIC) return;
    fetchApi("/api/patient/wallet-link")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("load"))))
      .then((d: LinkState) => {
        setState(d);
        setLoadError(false);
      })
      .catch(() => setLoadError(true));
  }, []);

  useEffect(load, [load]);

  const presentation = useEudiPresentation({
    startBody: LINK_BODY,
    onDone: () => {
      setNotice(`${WALLET.name} is now connected to this account.`);
      setState((s) => (s ? { ...s, linked: true } : s));
    },
  });
  const { phase, setPhase, start, refusal } = presentation;

  const disconnect = useCallback(async () => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/patient/wallet-link", {
        method: "DELETE",
      });
      if (res.ok) {
        setState((s) => (s ? { ...s, linked: false } : s));
        setPhase("idle");
        setNotice(
          `${WALLET.name} is disconnected. The hub no longer keeps anything of your PID.`,
        );
      } else {
        setNotice("The hub could not disconnect the wallet. Try again.");
      }
    } finally {
      setBusy(false);
    }
  }, [setPhase]);

  return (
    <div className="min-h-screen bg-(--bg)">
      <div className="max-w-3xl mx-auto px-6 py-10">
        <PageIntro
          title="Connect your EUDI wallet"
          icon={Wallet}
          description="EHDS Art. 16 / eIDAS: sign in to this account with your EUDI Wallet's PID, at assurance level high."
          prevStep={{ href: "/patient/profile", label: "Health Profile" }}
          infoText="Connecting asks your wallet for your name and birth date once. The hub computes a secure hash of them, keeps that hash on your account and forgets the name and the date. At the next sign-in the wallet's PID is hashed again and opens this account."
          docLink={{ href: "/hub/privacy.html", label: "Privacy notice" }}
        />

        <section
          className="rounded-lg border border-(--border) bg-(--surface) p-6 text-center"
          aria-labelledby="wallet-link-heading"
          data-testid="wallet-link-card"
        >
          <h2
            id="wallet-link-heading"
            className="text-lg font-semibold flex items-center justify-center gap-2 mb-2"
          >
            <Wallet size={18} className="text-(--accent)" aria-hidden />
            {state?.linked
              ? `${WALLET.name} is connected`
              : `Connect ${WALLET.name}`}
          </h2>

          {IS_STATIC && (
            <p className="text-sm text-(--text-secondary)">
              Connecting a wallet works on the live deployment only, not in the
              static demo.
            </p>
          )}

          {!IS_STATIC && !state && !loadError && (
            <p className="text-sm text-(--text-secondary)">Loading…</p>
          )}

          {!IS_STATIC && loadError && (
            <p role="alert" className="text-sm text-amber-600">
              The hub could not say whether a wallet is connected.
            </p>
          )}

          {state && !state.eligible && (
            <p className="text-sm text-(--text-secondary)">
              Only an account the Klarbefund app or a wallet created can be
              connected to a wallet. The demo patients sign in with a wallet by
              the name on their PID.
            </p>
          )}

          {state?.eligible && !state.available && (
            <p className="text-sm text-(--text-secondary)">
              This hub does not connect wallets to accounts.
            </p>
          )}

          {notice && (
            <p
              role="status"
              className="text-sm text-green-700 dark:text-green-400 mb-3"
            >
              {notice}
            </p>
          )}

          {state?.eligible && state.available && state.linked && (
            <div className="flex flex-col items-center gap-3">
              <p className="text-sm text-(--text-secondary)">
                Sign in with {WALLET.name} and your PID opens this account. The
                hub keeps one secure hash on it, never your name or birth date.
              </p>
              <button
                onClick={disconnect}
                disabled={busy}
                className="inline-flex items-center gap-2 px-4 py-2 border border-(--border) rounded-lg text-sm hover:bg-(--surface-2) disabled:opacity-60"
              >
                <Unplug size={16} /> Disconnect wallet
              </button>
            </div>
          )}

          {state?.eligible && state.available && !state.linked && (
            <div className="flex flex-col items-center gap-3">
              {phase === "idle" && (
                <>
                  <p className="text-sm text-(--text-secondary) max-w-md">
                    Your wallet will show what it is asked for: your name and
                    birth date. By connecting you consent to the hub keeping a
                    secure hash of them on this account until you disconnect or
                    delete the account (GDPR Art. 6(1)(a)).
                  </p>
                  <button
                    onClick={() => void start()}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-(--accent) hover:bg-(--accent-hover) text-white dark:text-gray-900 rounded-lg font-medium"
                  >
                    <Wallet size={16} /> Connect your EUDI wallet
                  </button>
                </>
              )}
              {phase === "loading" && (
                <p className="text-sm text-(--text-secondary)">
                  Preparing a secure request…
                </p>
              )}
              {phase === "scanning" && presentation.qr && (
                <EudiQrPanel
                  qr={presentation.qr}
                  walletLink={presentation.walletLink}
                  walletOpened={presentation.walletOpened}
                  walletSilent={presentation.walletSilent}
                />
              )}
              {phase === "done" && (
                <CheckCircle2
                  size={36}
                  className="text-green-600 dark:text-green-400"
                />
              )}
              {(phase === "error" ||
                phase === "expired" ||
                phase === "refused") && (
                <>
                  <AlertTriangle size={32} className="text-amber-500" />
                  <p role="alert" className="text-sm text-(--text-secondary)">
                    {phase === "expired"
                      ? "This request expired."
                      : phase === "refused"
                        ? refusal?.error
                        : presentation.startError ??
                          "Could not reach the EUDI verifier."}
                  </p>
                  <button
                    onClick={() => void start()}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-(--accent) hover:bg-(--accent-hover) text-white dark:text-gray-900 rounded-lg font-medium"
                  >
                    <RefreshCw size={16} /> Try again
                  </button>
                </>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
