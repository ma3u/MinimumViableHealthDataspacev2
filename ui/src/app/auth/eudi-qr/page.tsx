"use client";

import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import {
  ShieldCheck,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  UserPlus,
  KeyRound,
} from "lucide-react";
import { WalletFlow } from "@/components/wallet/PhoneFrame";
import { REGISTER_STEPS, LOGIN_STEPS } from "@/components/wallet/flows";
import { EudiApprovalFlow } from "@/components/wallet/EudiApprovalFlow";
import { EudiQrPanel } from "@/components/wallet/EudiQrPanel";
import { setDemoPersona } from "@/lib/use-demo-persona";
import { useEudiPresentation } from "@/lib/use-eudi-presentation";
import { CITIZEN_WALLET } from "@/lib/wallet-config";

const WALLET = CITIZEN_WALLET;

/** The account a PID created (ADR-067), shown once and then never again. */
interface NewAccount {
  username: string;
  password: string;
}

function EudiQrContent() {
  // Read at render-time (not module load) so it is deterministic in tests and
  // immune to test-ordering env pollution; NEXT_PUBLIC_* is build-inlined anyway.
  const IS_STATIC = process.env.NEXT_PUBLIC_STATIC_EXPORT === "true";
  const searchParams = useSearchParams();
  const router = useRouter();
  const callbackUrl = searchParams.get("callbackUrl") || "/overview";
  const mode = searchParams.get("mode") === "login" ? "login" : "register";

  const [demoHint, setDemoHint] = useState<string | null>(null);
  const [account, setAccount] = useState<NewAccount | null>(null);
  const [registering, setRegistering] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);

  const presentation = useEudiPresentation({
    onDone: async (_answer, sid) => {
      await signIn("eudi-wallet", { sid, callbackUrl });
    },
  });
  const { phase, setPhase, start, refusal, sid } = presentation;

  const restart = useCallback(() => {
    setRegisterError(null);
    void start();
  }, [start]);

  useEffect(() => {
    if (!IS_STATIC) void start();
  }, [IS_STATIC, start]);

  // ADR-067: a PID on no account may create one. The password is answered
  // once; the page shows it until the person goes on, then signs in.
  const register = useCallback(async () => {
    if (!sid) return;
    setRegistering(true);
    setRegisterError(null);
    try {
      const res = await fetch("/api/auth/eudi/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sid }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        username?: string;
        password?: string;
        error?: string;
        reason?: string;
      };
      if (!res.ok || !data.username || !data.password) {
        setRegisterError(
          data.reason ?? data.error ?? "The hub could not create the account.",
        );
        return;
      }
      setAccount({ username: data.username, password: data.password });
    } catch {
      setRegisterError("The hub could not create the account.");
    } finally {
      setRegistering(false);
    }
  }, [sid]);

  const continueSignedIn = useCallback(async () => {
    if (!sid) return;
    setAccount(null);
    setPhase("done");
    await signIn("eudi-wallet", { sid, callbackUrl });
  }, [sid, callbackUrl, setPhase]);

  // The simulated phone next to the real QR. Approving it asks the server for a
  // demo transaction (allowed only where EUDI_DEMO_WALLET=true) and signs in as
  // the demo patient through the same Credentials provider a real presentation
  // uses. Where the deployment refuses, the phone stays a picture and says so.
  const approveSimulated = useCallback(async () => {
    const simulationOnly = `Simulation only on this deployment. Scan the QR code with ${WALLET.name} to sign in.`;
    try {
      const res = await fetch("/api/auth/eudi/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ demo: true }),
      });
      if (!res.ok) {
        setDemoHint(simulationOnly);
        return;
      }
      const data = (await res.json()) as { sid: string };
      setPhase("done");
      await signIn("eudi-wallet", { sid: data.sid, callbackUrl });
    } catch {
      setDemoHint(simulationOnly);
    }
  }, [callbackUrl, setPhase]);

  const title = `${mode === "login" ? "Sign in" : "Register"} with ${
    WALLET.name
  }`;

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
            Scan the QR with {WALLET.description}, {WALLET.alternatives}, or
            approve on the simulated phone (OpenID4VP).
            <br />
            <span className="text-xs">
              Synthetic demo · signs you in as the demo patient
            </span>
          </p>
        </div>
        <EudiApprovalFlow
          mode={mode}
          onComplete={onComplete}
          onCancel={() => router.push("/")}
        />
        <a
          href="/auth/signin"
          className="text-xs text-(--text-secondary) hover:text-(--accent) underline"
        >
          ← Back to other sign-in options
        </a>
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
            Scan the QR code with {WALLET.description}, {WALLET.alternatives},
            to prove who you are (OpenID4VP).
            <br />
            <span className="text-xs">
              Synthetic records · your PID opens the one in your name
            </span>
          </p>

          {(phase === "idle" || phase === "loading") && (
            <div className="py-10 text-(--text-secondary)">
              Preparing a secure request…
            </div>
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
            <div className="py-8 flex flex-col items-center gap-2 text-green-600 dark:text-green-400">
              <CheckCircle2 size={40} />
              <p className="font-medium">Verified — signing you in…</p>
            </div>
          )}

          {account && (
            <div
              className="py-4 text-left"
              role="region"
              aria-label="Your new account"
            >
              <div className="flex items-center gap-2 mb-2 text-green-600 dark:text-green-400">
                <KeyRound size={20} />
                <p className="font-medium">Your account is ready</p>
              </div>
              <p className="text-sm text-(--text-secondary) mb-3">
                Keep this username and password somewhere safe. The hub shows
                the password only now and cannot show it again. Next time you
                can sign in with {WALLET.name} or with these.
              </p>
              <dl className="text-sm mb-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                <dt className="text-(--text-secondary)">Username</dt>
                <dd
                  className="font-mono text-(--text-primary) break-all"
                  data-testid="new-account-username"
                >
                  {account.username}
                </dd>
                <dt className="text-(--text-secondary)">Password</dt>
                <dd
                  className="font-mono text-(--text-primary) break-all"
                  data-testid="new-account-password"
                >
                  {account.password}
                </dd>
              </dl>
              <button
                onClick={continueSignedIn}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-(--accent) hover:bg-(--accent-hover) text-white dark:text-gray-900 rounded-lg font-medium transition-colors"
              >
                I have saved them, sign me in
              </button>
            </div>
          )}

          {!account &&
            (phase === "error" ||
              phase === "expired" ||
              phase === "refused") && (
              <div className="py-6">
                <AlertTriangle
                  size={36}
                  className="mx-auto mb-2 text-amber-500"
                />
                <p className="text-sm text-(--text-secondary) mb-4">
                  {phase === "expired"
                    ? "This sign-in request expired."
                    : phase === "refused"
                      ? refusal?.error
                      : "Could not reach the EUDI verifier."}
                </p>
                {phase === "refused" && refusal?.canRegister && (
                  <div className="mb-4">
                    <p className="text-xs text-(--text-secondary) mb-3">
                      You can create a sandbox account with this PID. The hub
                      keeps only a secure hash of your name and birth date on
                      it, never the name or the date (
                      <a
                        href="/hub/privacy.html"
                        className="text-(--accent) underline"
                      >
                        privacy notice
                      </a>
                      ).
                    </p>
                    <button
                      onClick={register}
                      disabled={registering}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-(--accent) hover:bg-(--accent-hover) text-white dark:text-gray-900 rounded-lg font-medium transition-colors disabled:opacity-60"
                    >
                      <UserPlus size={16} />
                      {registering
                        ? "Creating your account…"
                        : "Create an account with this PID"}
                    </button>
                    {registerError && (
                      <p
                        role="alert"
                        className="text-xs text-amber-600 dark:text-amber-400 mt-2"
                      >
                        {registerError}
                      </p>
                    )}
                  </div>
                )}
                <button
                  onClick={restart}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-(--accent) hover:bg-(--accent-hover) text-white dark:text-gray-900 rounded-lg font-medium transition-colors"
                >
                  <RefreshCw size={16} /> Try again
                </button>
              </div>
            )}
        </div>

        <div className="flex flex-col items-center gap-2 shrink-0">
          <WalletFlow
            interactive
            loop={false}
            theme="dyou"
            ariaLabel={`Simulated ${WALLET.name} ${mode}`}
            steps={mode === "login" ? LOGIN_STEPS : REGISTER_STEPS}
            onComplete={approveSimulated}
            onCancel={() => router.push("/auth/signin")}
          />
          <p className="text-xs text-(--text-secondary) max-w-[280px] text-center">
            What happens on your phone. No {WALLET.name} yet? Approve here to
            sign in as the demo patient.
          </p>
          {demoHint && (
            <p
              role="status"
              className="text-xs text-amber-600 dark:text-amber-400 max-w-[280px] text-center"
            >
              {demoHint}
            </p>
          )}
        </div>
      </div>

      <a
        href="/auth/signin"
        className="text-xs text-(--text-secondary) hover:text-(--accent) underline"
      >
        ← Back to other sign-in options
      </a>
    </div>
  );
}

export default function EudiQrPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[60vh] flex items-center justify-center">
          <div className="text-(--text-secondary)">Loading…</div>
        </div>
      }
    >
      <EudiQrContent />
    </Suspense>
  );
}
