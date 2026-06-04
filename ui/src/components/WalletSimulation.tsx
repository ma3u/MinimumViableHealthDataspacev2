"use client";

/**
 * Simulated EUDI Wallet presentation flow (OpenID4VP), shown next to the QR so a
 * demo can play the on-phone steps without a real device. Auto-cycles:
 *   1) Trust the verifier (EHDS — verified, first interaction)
 *   2) Review & share the requested PID claims (selective disclosure)
 *   3) Success
 * Purely illustrative; no real wallet interaction. Synthetic data only.
 */
import { useEffect, useState } from "react";
import {
  Building2,
  BadgeCheck,
  ArrowLeftRight,
  CheckCircle2,
  Wifi,
  BatteryFull,
  SignalHigh,
} from "lucide-react";

const ORG = "European Health Dataspace";
const STEP_MS = [3200, 3600, 2600];

function StatusBar() {
  return (
    <div className="flex items-center justify-between px-4 pt-2 pb-1 text-[10px] font-semibold text-gray-800">
      <span>10:55</span>
      <div className="flex items-center gap-1">
        <SignalHigh size={11} />
        <Wifi size={11} />
        <BatteryFull size={13} />
      </div>
    </div>
  );
}

function Buttons({ primary }: { primary: string }) {
  return (
    <div className="flex gap-2 px-3 pb-3 pt-2">
      <div className="flex-1 text-center rounded-xl bg-gray-100 text-gray-600 text-sm font-semibold py-2.5">
        Stop
      </div>
      <div className="flex-1 text-center rounded-xl bg-gray-900 text-white text-sm font-semibold py-2.5 relative">
        {primary}
        <span className="absolute inset-0 rounded-xl ring-2 ring-[#5b3df5]/60 animate-ping" />
      </div>
    </div>
  );
}

export function WalletSimulation() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setStep((s) => (s + 1) % 3), STEP_MS[step]);
    return () => clearTimeout(t);
  }, [step]);

  return (
    <div className="w-[clamp(248px,30vw,288px)] rounded-[2rem] border-[5px] border-gray-900 bg-white shadow-2xl overflow-hidden flex flex-col">
      <style>{`
        @keyframes wsimReveal { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
        .wsim-step { opacity: 0; animation: wsimReveal 0.45s ease forwards; }
      `}</style>
      <StatusBar />
      {/* progress bar */}
      <div className="px-4">
        <div className="h-1.5 rounded-full bg-gray-200 overflow-hidden">
          <div
            className="h-full bg-[#5b3df5] transition-all duration-500"
            style={{ width: `${((step + 1) / 3) * 100}%` }}
          />
        </div>
      </div>

      <div
        key={step}
        className="flex-1 px-4 pt-4 wsim-step"
        style={{ minHeight: 312 }}
      >
        {step === 0 && (
          <div className="text-center">
            <div className="mx-auto mb-3 grid place-items-center w-14 h-14 rounded-full border border-gray-200">
              <Building2 size={26} className="text-gray-700" />
            </div>
            <h4 className="font-bold text-gray-900 text-[16px] leading-tight">
              Do you trust EHDS?
            </h4>
            <p className="text-[11px] text-gray-500 mt-1 mb-3">
              {ORG} wants to request information from you.
            </p>
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-2.5 flex items-center gap-2 text-left mb-2">
              <BadgeCheck size={20} className="text-emerald-600 shrink-0" />
              <div>
                <p className="text-[12px] font-semibold text-gray-900">
                  Verified organization
                </p>
                <p className="text-[10px] text-gray-500">
                  EU Trust Registry · EHDS
                </p>
              </div>
            </div>
            <div className="rounded-xl bg-gray-50 border border-gray-200 p-2.5 flex items-center gap-2 text-left">
              <ArrowLeftRight size={18} className="text-gray-500 shrink-0" />
              <div>
                <p className="text-[12px] font-semibold text-gray-900">
                  First-time interaction
                </p>
                <p className="text-[10px] text-gray-500">
                  No previous interactions
                </p>
              </div>
            </div>
          </div>
        )}

        {step === 1 && (
          <div>
            <h4 className="font-bold text-gray-900 text-[17px] mb-2">
              Review the request
            </h4>
            <p className="text-[10px] font-semibold tracking-wide text-gray-400 uppercase">
              Purpose
            </p>
            <div className="rounded-xl bg-gray-50 border border-gray-200 p-2.5 text-[11px] text-gray-600 mb-3">
              Sign in &amp; register at the EHDS patient portal.
            </div>
            <p className="text-[10px] font-semibold tracking-wide text-gray-400 uppercase mb-1">
              Requested card
            </p>
            <div className="rounded-xl overflow-hidden border border-gray-200">
              <div className="bg-[#0b3d66] text-white text-[12px] font-bold px-3 py-2">
                PID · Person Identification Data
              </div>
              <div className="grid grid-cols-2 gap-y-1.5 gap-x-2 p-3 text-[11px] text-gray-700">
                <span>First name</span>
                <span>Last name</span>
                <span>Date of birth</span>
                <span className="text-gray-400">— only these</span>
              </div>
            </div>
            <p className="text-[10px] text-gray-400 mt-2 text-center">
              Selective disclosure — nothing else is shared
            </p>
          </div>
        )}

        {step === 2 && (
          <div className="text-center pt-4">
            <div className="mx-auto mb-3 grid place-items-center w-16 h-16 rounded-full bg-emerald-50">
              <CheckCircle2 size={36} className="text-emerald-600" />
            </div>
            <h4 className="font-bold text-gray-900 text-[19px]">Success!</h4>
            <p className="text-[12px] text-gray-500 mt-1.5 px-2">
              Your identity has been shared with {ORG}. You are signed in — no
              password.
            </p>
          </div>
        )}
      </div>

      <Buttons
        primary={
          step === 0 ? "Yes, continue" : step === 1 ? "Share" : "Go to wallet"
        }
      />
    </div>
  );
}
