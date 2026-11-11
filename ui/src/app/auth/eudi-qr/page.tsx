"use client";
import Link from "next/link";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { ShieldCheck } from "lucide-react";
import { WalletFlow } from "@/components/wallet/PhoneFrame";
import { REGISTER_STEPS, LOGIN_STEPS } from "@/components/wallet/flows";
import { EudiApprovalFlow } from "@/components/wallet/EudiApprovalFlow";
import { WalletSignInStatus } from "@/components/wallet/WalletSignInStatus";
import { setDemoPersona } from "@/lib/use-demo-persona";
import { useWalletSignIn } from "@/lib/use-wallet-sign-in";
import { CITIZEN_WALLET } from "@/lib/wallet-config";
import { useT } from "@/lib/i18n/translate";

const WALLET = CITIZEN_WALLET;

function EudiQrContent() {
  const t = useT("admin");
  // Read at render-time (not module load) so it is deterministic in tests and
  // immune to test-ordering env pollution; NEXT_PUBLIC_* is build-inlined anyway.
  const IS_STATIC = process.env.NEXT_PUBLIC_STATIC_EXPORT === "true";
  const searchParams = useSearchParams();
  const router = useRouter();
  const callbackUrl = searchParams.get("callbackUrl") || "/overview";
  const mode = searchParams.get("mode") === "login" ? "login" : "register";

  const flow = useWalletSignIn({ callbackUrl });
  const { start } = flow.presentation;

  useEffect(() => {
    if (!IS_STATIC) void start();
  }, [IS_STATIC, start]);

  const title =
    mode === "login"
      ? t("Sign in with {wallet}", { wallet: WALLET.name })
      : t("Register with {wallet}", { wallet: WALLET.name });
  // The wallet's one-line description and the footnote, translated.
  const walletVars = {
    description: t(WALLET.description),
    alternatives: t(WALLET.alternatives),
    wallet: WALLET.name,
  };

  // Static export / demo: no live verifier backend, so drive an interactive
  // QR + wallet-approval simulation; on approval, sign in as the demo patient
  // and forward to their personal health record (the "EHR page").
  if (IS_STATIC) {
    const onComplete = () => {
      setDemoPersona("patient1");
      try {
        localStorage.setItem("demo-persona", "patient1");
      } catch {
        /* storage unavailable — non-fatal for the visual demo */
      }
      router.push(callbackUrl);
    };
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-6 py-10 px-4">
        <div className="text-center max-w-md">
          <ShieldCheck
            size={40}
            className="mx-auto mb-2 text-blue-800 dark:text-blue-300"
          />
          <h1 className="text-2xl font-bold text-(--text-primary) mb-1">
            {title}
          </h1>
          <p className="text-(--text-secondary) text-sm">
            {t(
              "Scan the QR with {description}, {alternatives}, or approve on the simulated phone (OpenID4VP).",
              walletVars,
            )}
            <br />
            <span className="text-xs">
              {t("Synthetic demo · signs you in as the demo patient")}
            </span>
          </p>
        </div>
        <EudiApprovalFlow
          mode={mode}
          onComplete={onComplete}
          onCancel={() => router.push("/")}
        />
        <Link
          href="/auth/signin"
          className="text-xs text-(--text-secondary) hover:text-(--accent) underline"
        >
          ← {t("Back to other sign-in options")}
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-6 py-10 px-4">
      <div className="flex flex-col lg:flex-row items-center justify-center gap-6 w-full max-w-4xl">
        <div className="bg-(--surface-2) rounded-lg p-8 max-w-md w-full text-center">
          <ShieldCheck
            size={44}
            className="mx-auto mb-3 text-blue-800 dark:text-blue-300"
          />
          <h1 className="text-2xl font-bold text-(--text-primary) mb-1">
            {title}
          </h1>
          <p className="text-(--text-secondary) text-sm mb-6">
            {t(
              "Scan the QR code with {description}, {alternatives}, to prove who you are (OpenID4VP).",
              walletVars,
            )}
            <br />
            <span className="text-xs">
              {t("Synthetic records · your PID opens the one in your name")}
            </span>
          </p>

          <WalletSignInStatus flow={flow} />
        </div>

        <div className="flex flex-col items-center gap-2 shrink-0">
          <WalletFlow
            interactive
            loop={false}
            theme="dyou"
            ariaLabel={
              mode === "login"
                ? t("Simulated {wallet} login", walletVars)
                : t("Simulated {wallet} register", walletVars)
            }
            steps={mode === "login" ? LOGIN_STEPS : REGISTER_STEPS}
            onComplete={() => void flow.approveSimulated()}
            onCancel={() => router.push("/auth/signin")}
          />
          <p className="text-xs text-(--text-secondary) max-w-[280px] text-center">
            {t(
              "What happens on your phone. No {wallet} yet? Approve here to sign in as the demo patient.",
              walletVars,
            )}
          </p>
          {flow.demoHint && (
            <p
              role="status"
              className="text-xs text-amber-600 dark:text-amber-400 max-w-[280px] text-center"
            >
              {t(flow.demoHint, walletVars)}
            </p>
          )}
        </div>
      </div>

      <Link
        href="/auth/signin"
        className="text-xs text-(--text-secondary) hover:text-(--accent) underline"
      >
        ← {t("Back to other sign-in options")}
      </Link>
    </div>
  );
}

export default function EudiQrPage() {
  const tc = useT("common");
  return (
    <Suspense
      fallback={
        <div className="min-h-[60vh] flex items-center justify-center">
          <div className="text-(--text-secondary)">{tc("Loading…")}</div>
        </div>
      }
    >
      <EudiQrContent />
    </Suspense>
  );
}
