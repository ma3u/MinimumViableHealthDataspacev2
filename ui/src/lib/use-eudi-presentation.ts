"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * One EUDI Wallet presentation from the browser's side: start it, show the
 * QR, poll the status route until the wallet answers. Shared by the sign-in
 * page (`/auth/eudi-qr`) and the link page (`/patient/wallet`, ADR-067); what
 * happens once the wallet has answered is the page's own business.
 */

const POLL_MS = 2000;
const TIMEOUT_MS = 5 * 60 * 1000;
/** How long a wallet that opened the request may stay silent before we say so. */
const SILENT_MS = 20 * 1000;

/** What `GET /api/auth/eudi/status` answers. Never a claim of the PID. */
export interface EudiStatusAnswer {
  status: string;
  error?: string;
  walletOpened?: boolean;
  /** a sign-in found no account, and this PID may create one (ADR-067) */
  canRegister?: boolean;
}

export type EudiPresentationPhase =
  | "idle"
  | "loading"
  | "scanning"
  | "done"
  | "error"
  | "refused"
  | "expired";

export interface EudiPresentation {
  phase: EudiPresentationPhase;
  setPhase: (p: EudiPresentationPhase) => void;
  sid: string | null;
  qr: string | null;
  walletLink: string | null;
  walletOpened: boolean;
  walletSilent: boolean;
  /** the status answer that refused the presentation */
  refusal: EudiStatusAnswer | null;
  /** the start route's own refusal, when it gave a reason */
  startError: string | null;
  start: () => Promise<void>;
}

export function useEudiPresentation(opts: {
  /** sent to the start route as JSON; none for a plain sign-in */
  startBody?: Record<string, unknown>;
  /** called once, when the status route answers "completed" or "linked" */
  onDone: (answer: EudiStatusAnswer, sid: string) => void | Promise<void>;
}): EudiPresentation {
  const [phase, setPhase] = useState<EudiPresentationPhase>("idle");
  const [sid, setSid] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [walletLink, setWalletLink] = useState<string | null>(null);
  const [walletOpened, setWalletOpened] = useState(false);
  const [walletSilent, setWalletSilent] = useState(false);
  const [refusal, setRefusal] = useState<EudiStatusAnswer | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const sidRef = useRef<string | null>(null);
  const startedAtRef = useRef<number>(0);
  const openedAtRef = useRef<number>(0);
  const onDoneRef = useRef(opts.onDone);
  useEffect(() => {
    onDoneRef.current = opts.onDone;
  });
  const bodyJson = opts.startBody ? JSON.stringify(opts.startBody) : null;

  const start = useCallback(async () => {
    setPhase("loading");
    setQr(null);
    setWalletLink(null);
    setWalletOpened(false);
    setWalletSilent(false);
    setRefusal(null);
    setStartError(null);
    openedAtRef.current = 0;
    sidRef.current = null;
    setSid(null);
    try {
      const res = await fetch(
        "/api/auth/eudi/start",
        bodyJson
          ? {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: bodyJson,
            }
          : { method: "POST" },
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setStartError(typeof data.error === "string" ? data.error : null);
        throw new Error("start failed");
      }
      const data = (await res.json()) as {
        sid: string;
        qrDataUri: string;
        walletLink: string;
      };
      sidRef.current = data.sid;
      setSid(data.sid);
      setQr(data.qrDataUri);
      setWalletLink(data.walletLink);
      startedAtRef.current = Date.now();
      setPhase("scanning");
    } catch {
      setPhase("error");
    }
  }, [bodyJson]);

  // Poll the verifier (via our server) until the wallet answers.
  useEffect(() => {
    if (phase !== "scanning") return;
    let active = true;
    const id = setInterval(async () => {
      const current = sidRef.current;
      if (!current) return;
      if (Date.now() - startedAtRef.current > TIMEOUT_MS) {
        if (active) setPhase("expired");
        return;
      }
      try {
        const res = await fetch(
          `/api/auth/eudi/status?sid=${encodeURIComponent(current)}`,
        );
        if (res.status === 404) {
          if (active) setPhase("expired");
          return;
        }
        const data = (await res.json()) as EudiStatusAnswer;
        // A PID that opens nothing here, a declined wallet, a PID another
        // account holds (#708, ADR-067).
        if ((res.status === 403 || res.status === 409) && active) {
          setRefusal({
            ...data,
            error: data.error ?? "The wallet could not sign you in.",
          });
          setPhase("refused");
          return;
        }
        if (
          (data.status === "completed" || data.status === "linked") &&
          active
        ) {
          setPhase("done");
          await onDoneRef.current(data, current);
          return;
        }
        // The wallet fetched the request but has not answered (#708).
        if (data.walletOpened && active) {
          if (!openedAtRef.current) openedAtRef.current = Date.now();
          setWalletOpened(true);
          setWalletSilent(Date.now() - openedAtRef.current > SILENT_MS);
        }
      } catch {
        /* transient: keep polling */
      }
    }, POLL_MS);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [phase]);

  return {
    phase,
    setPhase,
    sid,
    qr,
    walletLink,
    walletOpened,
    walletSilent,
    refusal,
    startError,
    start,
  };
}
