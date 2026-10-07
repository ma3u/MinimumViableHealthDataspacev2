"use client";

import { useCallback, useEffect, useState } from "react";
import { Smartphone, QrCode, ShieldCheck, Unplug } from "lucide-react";
import { fetchApi } from "@/lib/api";
import { IS_STATIC } from "@/lib/static-export";

/**
 * "Connect the Klarbefund app": the patient screen's half of #473 (ADR-049).
 *
 * The patient asks for a QR code, scans it with Klarbefund, and approves on
 * Keycloak's own consent page in this browser. The phone fetches its token
 * from Keycloak directly; this card only learns that it worked when the phone
 * registers, and then lists it with Disconnect.
 *
 * On a phone the QR code is useless, so the same link is offered as "Open in
 * Klarbefund". In the static GitHub Pages build there is no Keycloak to ask,
 * so the card says where connecting works instead.
 */

interface Device {
  deviceId: string;
  deviceName: string;
  connectedAt: string;
  lastSeenAt: string | null;
}

interface PairingStart {
  pairingId: string;
  appLink: string;
  qrDataUri: string;
  userCode: string;
  verificationUri: string;
  expiresAt: string;
}

type Phase =
  | { kind: "idle" }
  | { kind: "starting" }
  | { kind: "showing"; pairing: PairingStart }
  | { kind: "connected"; deviceName: string }
  | { kind: "expired" }
  | { kind: "error"; message: string };

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

export default function ConnectAppCard() {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [devices, setDevices] = useState<Device[]>([]);
  const [secondsLeft, setSecondsLeft] = useState(0);

  const loadDevices = useCallback(() => {
    fetchApi("/api/patient/app-devices")
      .then((r) => (r.ok ? r.json() : { devices: [] }))
      .then((d) => setDevices(d.devices ?? []))
      .catch(() => setDevices([]));
  }, []);

  useEffect(loadDevices, [loadDevices]);

  // While the QR code shows: count down, and ask whether the phone arrived.
  useEffect(() => {
    if (phase.kind !== "showing") return;
    const { pairing } = phase;
    const expires = new Date(pairing.expiresAt).getTime();
    const tick = setInterval(() => {
      setSecondsLeft(Math.max(0, Math.round((expires - Date.now()) / 1000)));
    }, 1000);
    const poll = setInterval(async () => {
      try {
        const r = await fetch(`/api/patient/app-pairing/${pairing.pairingId}`);
        if (!r.ok) return;
        const s = (await r.json()) as { status: string; deviceName?: string };
        if (s.status === "connected") {
          setPhase({ kind: "connected", deviceName: s.deviceName ?? "iPhone" });
          loadDevices();
        } else if (s.status === "expired") {
          setPhase({ kind: "expired" });
        }
      } catch {
        // a missed poll is retried on the next tick
      }
    }, 3000);
    return () => {
      clearInterval(tick);
      clearInterval(poll);
    };
  }, [phase, loadDevices]);

  async function start() {
    setPhase({ kind: "starting" });
    try {
      const r = await fetch("/api/patient/app-pairing", { method: "POST" });
      const body = await r.json();
      if (!r.ok) {
        setPhase({ kind: "error", message: body.error ?? `HTTP ${r.status}` });
        return;
      }
      const pairing = body as PairingStart;
      setSecondsLeft(
        Math.round((new Date(pairing.expiresAt).getTime() - Date.now()) / 1000),
      );
      setPhase({ kind: "showing", pairing });
    } catch {
      setPhase({ kind: "error", message: "The hub could not be reached" });
    }
  }

  async function disconnect(deviceId: string) {
    const r = await fetch(`/api/patient/app-devices/${deviceId}`, {
      method: "DELETE",
    });
    if (r.ok || r.status === 404) loadDevices();
  }

  // A connected patient sees their phones first, and the QR code only on
  // request: it pairs a further phone, not the one already connected.
  const connected = devices.length > 0;

  return (
    <section
      className="mb-6 rounded-lg border border-(--border) bg-(--surface) p-4"
      data-testid="connect-app-card"
      aria-labelledby="connect-app-heading"
    >
      <h2
        id="connect-app-heading"
        className="text-lg font-semibold flex items-center gap-2 mb-1"
      >
        <Smartphone size={18} className="text-(--accent)" aria-hidden />
        {connected ? "Klarbefund is connected" : "Connect the Klarbefund app"}
      </h2>
      {connected ? (
        <p className="text-sm text-(--text-secondary) mb-3">
          Your iPhone reads your record here and sends the values you allowed in
          the app. Nothing to scan: a QR code is needed only to connect another
          phone.
        </p>
      ) : (
        <p className="text-sm text-(--text-secondary) mb-3">
          Klarbefund turns your paper lab reports into structured values on your
          iPhone. Connected, it can read your record here. In the app, choose{" "}
          <strong>More, Connect to EHDS</strong> and scan the code.
        </p>
      )}

      {devices.length > 0 && (
        <div className="mb-3" data-testid="connected-devices">
          <h3 className="text-sm font-semibold mb-2">Connected phones</h3>
          <ul className="space-y-2">
            {devices.map((d) => (
              <li
                key={d.deviceId}
                className="flex items-center justify-between gap-3 rounded border border-(--border) px-3 py-2 text-sm"
              >
                <span>
                  <strong>{d.deviceName}</strong>
                  <span className="block text-xs text-(--text-secondary)">
                    Connected {formatDate(d.connectedAt)}
                    {d.lastSeenAt
                      ? `, last seen ${formatDate(d.lastSeenAt)}`
                      : ""}
                  </span>
                </span>
                {!IS_STATIC && (
                  <button
                    type="button"
                    onClick={() => disconnect(d.deviceId)}
                    className="inline-flex items-center gap-1 rounded border border-(--border) px-2 py-1 text-xs hover:bg-(--surface-2)"
                    aria-label={`Disconnect ${d.deviceName}`}
                  >
                    <Unplug size={14} aria-hidden /> Disconnect
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {IS_STATIC ? (
        <p className="text-sm" data-testid="connect-app-static">
          Connecting needs the live demo, where you sign in as a patient:{" "}
          <a
            className="underline text-(--accent)"
            href="https://ehds.mabu.red/patient/profile"
          >
            ehds.mabu.red/patient/profile
          </a>
          .
        </p>
      ) : (
        <PairingPanel
          phase={phase}
          secondsLeft={secondsLeft}
          onStart={start}
          onReset={() => setPhase({ kind: "idle" })}
          another={connected}
        />
      )}
    </section>
  );
}

function PairingPanel({
  phase,
  secondsLeft,
  onStart,
  onReset,
  another = false,
}: {
  phase: Phase;
  secondsLeft: number;
  onStart: () => void;
  onReset: () => void;
  /** A phone is connected already: offer the code for another one, quietly. */
  another?: boolean;
}) {
  switch (phase.kind) {
    case "idle":
    case "starting":
      return (
        <button
          type="button"
          onClick={onStart}
          disabled={phase.kind === "starting"}
          className={
            another
              ? "inline-flex items-center gap-2 rounded border border-(--border) px-3 py-1.5 text-sm hover:bg-(--surface-2) disabled:opacity-60"
              : "inline-flex items-center gap-2 rounded bg-(--accent) px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
          }
          data-testid="connect-app-start"
        >
          <QrCode size={16} aria-hidden />
          {phase.kind === "starting"
            ? "Preparing..."
            : another
              ? "Connect another phone"
              : "Show QR code"}
        </button>
      );
    case "showing": {
      const { pairing } = phase;
      return (
        <div className="grid gap-4 sm:grid-cols-[auto_1fr] items-start">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={pairing.qrDataUri}
            alt="QR code that connects the Klarbefund app to your record"
            width={220}
            height={220}
            className="rounded bg-white p-2"
            data-testid="connect-app-qr"
          />
          <div className="text-sm space-y-2">
            <ol className="list-decimal pl-5 space-y-1">
              <li>Scan the code with Klarbefund.</li>
              <li>
                <a
                  href={pairing.verificationUri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline text-(--accent)"
                  data-testid="connect-app-approve"
                >
                  Approve on this computer
                </a>
                , and check the code reads <strong>{pairing.userCode}</strong>.
              </li>
            </ol>
            <p>
              On this phone instead?{" "}
              <a
                href={pairing.appLink}
                className="underline text-(--accent)"
                data-testid="connect-app-open"
              >
                Open in Klarbefund
              </a>
            </p>
            <p className="text-xs text-(--text-secondary)" aria-live="polite">
              The code works for {secondsLeft} more seconds, once. Scan it only
              with your own phone: whoever holds it when you approve gets read
              access to your record.
            </p>
          </div>
        </div>
      );
    }
    case "connected":
      return (
        <p
          className="text-sm flex items-center gap-2"
          data-testid="connect-app-connected"
        >
          <ShieldCheck size={16} className="text-(--accent)" aria-hidden />
          {phase.deviceName} is connected.
        </p>
      );
    case "expired":
      return (
        <p className="text-sm">
          The code expired before a phone connected.{" "}
          <button type="button" className="underline" onClick={onReset}>
            Show a new one
          </button>
        </p>
      );
    case "error":
      return (
        <p className="text-sm" role="alert">
          Connecting failed: {phase.message}.{" "}
          <button type="button" className="underline" onClick={onReset}>
            Try again
          </button>
        </p>
      );
  }
}
