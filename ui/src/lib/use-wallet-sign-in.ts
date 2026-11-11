"use client";

import { useCallback, useState } from "react";
import { signIn } from "next-auth/react";
import {
  useEudiPresentation,
  type EudiPresentation,
} from "@/lib/use-eudi-presentation";

/**
 * Signing in with the citizen wallet, as the sign-in page (`/auth/eudi-qr`)
 * and the start page's register dialog both do it. Two ways in:
 *
 * - **The QR code**, a real OpenID4VP request from the hub's verifier. A PID
 *   on an account signs in to it; a PID on no account may create one
 *   (ADR-067), and the page shows the new login once before signing in.
 * - **The simulated phone** next to it, for a visitor without the wallet.
 *   Approving it asks the server for a demo transaction (only where
 *   `EUDI_DEMO_WALLET=true`) and signs in as the demo patient `patient1`
 *   through the same `eudi-wallet` provider, at assurance level low.
 *
 * Both end in the `eudi-wallet` Credentials provider of `lib/auth.ts`, so the
 * visitor holds a real session and lands on a page that needs one.
 */

/** Messages kept in state as their English key and translated when shown. */
export const HUB_COULD_NOT_CREATE = "The hub could not create the account.";
export const SIMULATION_ONLY =
  "Simulation only on this deployment. Scan the QR code with {wallet} to sign in.";

/**
 * Where a new account lands when its owner chose to connect Klarbefund next:
 * the card of ADR-049 on the profile page, the one way the app connects to
 * an account the website created.
 */
export const CONNECT_APP_PATH = "/patient/profile#connect-app";

/** The account a PID created (ADR-067), shown once and then never again. */
export interface NewAccount {
  username: string;
  password: string;
}

export interface WalletSignIn {
  presentation: EudiPresentation;
  account: NewAccount | null;
  registering: boolean;
  registerError: string | null;
  /** set when the deployment refuses the simulated phone */
  demoHint: string | null;
  /** creates the account for a PID the status route refused with `canRegister` */
  register: () => Promise<void>;
  /** signs in to the new account, on to Klarbefund when the owner chose it */
  continueSignedIn: (opts?: { connectApp?: boolean }) => Promise<void>;
  /** the simulated phone's approval: signs in as the demo patient */
  approveSimulated: () => Promise<void>;
  restart: () => void;
}

export function useWalletSignIn({
  callbackUrl,
}: {
  /** where a sign-in lands */
  callbackUrl: string;
}): WalletSignIn {
  const [account, setAccount] = useState<NewAccount | null>(null);
  const [registering, setRegistering] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [demoHint, setDemoHint] = useState<string | null>(null);

  const presentation = useEudiPresentation({
    onDone: async (_answer, sid) => {
      await signIn("eudi-wallet", { sid, callbackUrl });
    },
  });
  const { start, sid, setPhase } = presentation;

  const restart = useCallback(() => {
    setRegisterError(null);
    void start();
  }, [start]);

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
        setRegisterError(data.reason ?? data.error ?? HUB_COULD_NOT_CREATE);
        return;
      }
      setAccount({ username: data.username, password: data.password });
    } catch {
      setRegisterError(HUB_COULD_NOT_CREATE);
    } finally {
      setRegistering(false);
    }
  }, [sid]);

  const continueSignedIn = useCallback(
    async (opts?: { connectApp?: boolean }) => {
      if (!sid) return;
      setAccount(null);
      setPhase("done");
      await signIn("eudi-wallet", {
        sid,
        callbackUrl: opts?.connectApp ? CONNECT_APP_PATH : callbackUrl,
      });
    },
    [sid, callbackUrl, setPhase],
  );

  // Where the deployment refuses the demo transaction, the phone stays a
  // picture and says so.
  const approveSimulated = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/eudi/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ demo: true }),
      });
      if (!res.ok) {
        setDemoHint(SIMULATION_ONLY);
        return;
      }
      const data = (await res.json()) as { sid: string };
      setPhase("done");
      await signIn("eudi-wallet", { sid: data.sid, callbackUrl });
    } catch {
      setDemoHint(SIMULATION_ONLY);
    }
  }, [callbackUrl, setPhase]);

  return {
    presentation,
    account,
    registering,
    registerError,
    demoHint,
    register,
    continueSignedIn,
    approveSimulated,
    restart,
  };
}
