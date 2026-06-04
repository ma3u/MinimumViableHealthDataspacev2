"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import {
  ShieldCheck,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";

const IS_STATIC = process.env.NEXT_PUBLIC_STATIC_EXPORT === "true";
const POLL_MS = 2000;
const TIMEOUT_MS = 5 * 60 * 1000;

type Phase =
  | "loading"
  | "scanning"
  | "completed"
  | "error"
  | "expired"
  | "unavailable";

function EudiQrContent() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/patient/profile";

  const [phase, setPhase] = useState<Phase>(
    IS_STATIC ? "unavailable" : "loading",
  );
  const [qr, setQr] = useState<string | null>(null);
  const [walletLink, setWalletLink] = useState<string | null>(null);
  const sidRef = useRef<string | null>(null);
  const startedAtRef = useRef<number>(0);

  const start = useCallback(async () => {
    if (IS_STATIC) {
      setPhase("unavailable");
      return;
    }
    setPhase("loading");
    setQr(null);
    setWalletLink(null);
    sidRef.current = null;
    try {
      const res = await fetch("/api/auth/eudi/start", { method: "POST" });
      if (!res.ok) throw new Error("start failed");
      const data = (await res.json()) as {
        sid: string;
        qrDataUri: string;
        walletLink: string;
      };
      sidRef.current = data.sid;
      setQr(data.qrDataUri);
      setWalletLink(data.walletLink);
      startedAtRef.current = Date.now();
      setPhase("scanning");
    } catch {
      setPhase("error");
    }
  }, []);

  useEffect(() => {
    start();
  }, [start]);

  // Poll the verifier (via our server) until the wallet completes the presentation.
  useEffect(() => {
    if (phase !== "scanning") return;
    let active = true;
    const id = setInterval(async () => {
      const sid = sidRef.current;
      if (!sid) return;
      if (Date.now() - startedAtRef.current > TIMEOUT_MS) {
        if (active) setPhase("expired");
        return;
      }
      try {
        const res = await fetch(
          `/api/auth/eudi/status?sid=${encodeURIComponent(sid)}`,
        );
        if (res.status === 404) {
          if (active) setPhase("expired");
          return;
        }
        const data = (await res.json()) as { status: string };
        if (data.status === "completed" && active) {
          setPhase("completed");
          await signIn("eudi-wallet", { sid, callbackUrl });
        }
      } catch {
        /* transient — keep polling */
      }
    }, POLL_MS);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [phase, callbackUrl]);

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-6 py-10 px-4">
      <div className="bg-[var(--surface-2)] rounded-lg p-8 max-w-md w-full text-center">
        <ShieldCheck
          size={44}
          className="mx-auto mb-3 text-blue-800 dark:text-blue-300"
        />
        <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-1">
          Sign in with your EUDI Wallet
        </h1>
        <p className="text-[var(--text-secondary)] text-sm mb-6">
          Scan the QR code with your EU Digital Identity Wallet to verify your
          identity (OpenID4VP).
          <br />
          <span className="text-xs">
            Synthetic demo · maps to a demo patient
          </span>
        </p>

        {phase === "loading" && (
          <div className="py-10 text-[var(--text-secondary)]">
            Preparing a secure request…
          </div>
        )}

        {phase === "scanning" && qr && (
          <>
            <div className="bg-white rounded-lg p-4 inline-block mb-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qr}
                alt="EUDI Wallet OpenID4VP QR code"
                width={256}
                height={256}
                className="block"
              />
            </div>
            <div className="flex items-center justify-center gap-2 text-sm text-[var(--text-secondary)] mb-3">
              <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              Waiting for your wallet…
            </div>
            {walletLink && (
              <a
                href={walletLink}
                className="text-xs text-[var(--accent)] underline break-all"
              >
                On this phone? Tap to open your wallet
              </a>
            )}
          </>
        )}

        {phase === "completed" && (
          <div className="py-8 flex flex-col items-center gap-2 text-green-600 dark:text-green-400">
            <CheckCircle2 size={40} />
            <p className="font-medium">Verified — signing you in…</p>
          </div>
        )}

        {(phase === "error" || phase === "expired") && (
          <div className="py-6">
            <AlertTriangle size={36} className="mx-auto mb-2 text-amber-500" />
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              {phase === "expired"
                ? "This sign-in request expired."
                : "Could not reach the EUDI verifier."}
            </p>
            <button
              onClick={start}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white dark:text-gray-900 rounded-lg font-medium transition-colors"
            >
              <RefreshCw size={16} /> Try again
            </button>
          </div>
        )}

        {phase === "unavailable" && (
          <div className="py-8 text-sm text-[var(--text-secondary)]">
            EUDI Wallet sign-in is only available on the live deployment, not in
            the static demo. Use the demo personas on the{" "}
            <a href="/auth/signin" className="text-[var(--accent)] underline">
              sign-in page
            </a>{" "}
            instead.
          </div>
        )}
      </div>

      <a
        href="/auth/signin"
        className="text-xs text-[var(--text-secondary)] hover:text-[var(--accent)] underline"
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
          <div className="text-[var(--text-secondary)]">Loading…</div>
        </div>
      }
    >
      <EudiQrContent />
    </Suspense>
  );
}
