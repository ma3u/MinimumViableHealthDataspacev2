/**
 * Step data for the three wallet flows rendered by WalletFlow (PhoneFrame.tsx).
 * - REGISTER_STEPS: the original EUDI registration (kept VERBATIM so
 *   WalletSimulation.test.tsx keeps passing).
 * - LOGIN_STEPS: returning-user login (the wallet skips the trust step — this is
 *   a wallet-UI difference, NOT a protocol/verifier difference).
 * - EHR_TRANSFER_STEPS: ePA data-access authorization via GesundheitsID (NOT an
 *   EUDI PID presentation; GesundheitsID is today's real ePA auth). Insurer is
 *   the gated config (fictional default; TK only behind NEXT_PUBLIC_DEMO_TK).
 * Illustrative; see docs/planning/eudi-wallet-flows-2026.md for what is simplified.
 */
import {
  Building2,
  BadgeCheck,
  ArrowLeftRight,
  CheckCircle2,
  Check,
  ShieldCheck,
} from "lucide-react";
import type { WalletStep } from "@/components/wallet/PhoneFrame";
import { insurer } from "@/lib/journey-config";

const ORG = "European Health Dataspace";

export const REGISTER_STEPS: WalletStep[] = [
  {
    ms: 3200,
    primary: "Yes, continue",
    body: (
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
    ),
  },
  {
    ms: 3600,
    primary: "Share",
    body: (
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
    ),
  },
  {
    ms: 2600,
    primary: "Go to wallet",
    body: (
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
    ),
  },
];

export const LOGIN_STEPS: WalletStep[] = [
  {
    ms: 2400,
    primary: "Approve",
    body: (
      <div className="text-center">
        <div className="mx-auto mb-3 grid place-items-center w-14 h-14 rounded-full border border-gray-200">
          <Building2 size={26} className="text-gray-700" />
        </div>
        <h4 className="font-bold text-gray-900 text-[16px] leading-tight">
          Sign in to EHDS?
        </h4>
        <p className="text-[11px] text-gray-500 mt-1 mb-3">
          {ORG} is asking you to sign in.
        </p>
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-2.5 flex items-center gap-2 text-left mb-2">
          <BadgeCheck size={20} className="text-emerald-600 shrink-0" />
          <div>
            <p className="text-[12px] font-semibold text-gray-900">
              You&apos;ve shared with EHDS before
            </p>
            <p className="text-[10px] text-gray-500">
              Last used 14 May · trusted
            </p>
          </div>
        </div>
        <div className="rounded-xl bg-gray-50 border border-gray-200 p-2.5 text-left text-[11px] text-gray-600">
          Your PID is already in your wallet — just approve. No password.
        </div>
      </div>
    ),
  },
  {
    ms: 1800,
    primary: "Done",
    body: (
      <div className="text-center pt-6">
        <div className="mx-auto mb-3 grid place-items-center w-16 h-16 rounded-full bg-emerald-50">
          <CheckCircle2 size={36} className="text-emerald-600" />
        </div>
        <h4 className="font-bold text-gray-900 text-[19px]">
          Welcome back, Maria
        </h4>
        <p className="text-[12px] text-gray-500 mt-1.5 px-2">
          Signed in to EHDS — no password.
        </p>
      </div>
    ),
  },
];

const EHR_CATEGORIES = [
  "Medications",
  "Lab results",
  "Diagnoses & findings",
  "Doctor's letters",
  "Vaccinations",
];

export const EHR_TRANSFER_STEPS: WalletStep[] = [
  {
    ms: 3000,
    primary: "Authenticate",
    accent: insurer.brand,
    body: (
      <div className="text-center">
        <div
          className="mx-auto mb-3 grid place-items-center w-14 h-14 rounded-full"
          style={{ background: `${insurer.brand}1a` }}
        >
          <ShieldCheck size={26} style={{ color: insurer.brand }} />
        </div>
        <h4 className="font-bold text-gray-900 text-[15px] leading-tight">
          Connect your health record
        </h4>
        <p className="text-[11px] font-semibold text-gray-700 mt-1 mb-3">
          {insurer.name}
        </p>
        <div className="rounded-xl bg-gray-50 border border-gray-200 p-2.5 text-left text-[11px] text-gray-600">
          The EHDS portal requests access to your{" "}
          <strong className="text-gray-800">ePA</strong> (elektronische
          Patientenakte).
        </div>
        <p className="text-[10px] text-gray-400 mt-2">
          Authenticate with GesundheitsID
        </p>
      </div>
    ),
  },
  {
    ms: 3800,
    primary: "Allow access",
    accent: insurer.brand,
    body: (
      <div>
        <h4 className="font-bold text-gray-900 text-[15px] mb-0.5">
          Choose what to share
        </h4>
        <p className="text-[10px] text-gray-400 mb-2">
          To: European Health Dataspace portal
        </p>
        <div className="space-y-1 text-[11px] text-gray-700">
          {EHR_CATEGORIES.map((c) => (
            <div
              key={c}
              className="flex items-center gap-2 rounded-lg bg-gray-50 border border-gray-200 px-2.5 py-1.5"
            >
              <Check size={13} className="text-emerald-600 shrink-0" />
              {c}
            </div>
          ))}
        </div>
        <p className="text-[10px] text-gray-400 mt-2 text-center">
          Until I revoke · withdraw any time
        </p>
      </div>
    ),
  },
  {
    ms: 2200,
    primary: "Authorising…",
    accent: insurer.brand,
    auto: true,
    body: (
      <div className="text-center pt-8">
        <div className="mx-auto mb-3 w-10 h-10 rounded-full border-2 border-gray-200 border-t-gray-700 animate-spin" />
        <h4 className="font-bold text-gray-900 text-[15px]">
          Authorising via GesundheitsID
        </h4>
        <p className="text-[11px] text-gray-500 mt-1">Secure authentication…</p>
      </div>
    ),
  },
  {
    ms: 2600,
    primary: "Done",
    accent: insurer.brand,
    body: (
      <div className="text-center pt-4">
        <div className="mx-auto mb-3 grid place-items-center w-16 h-16 rounded-full bg-emerald-50">
          <CheckCircle2 size={36} className="text-emerald-600" />
        </div>
        <h4 className="font-bold text-gray-900 text-[18px]">Transferred</h4>
        <p className="text-[11px] text-gray-500 mt-1.5 px-2">
          Your ePA is now in the EHDS portal as FHIR R4. End-to-end encrypted —{" "}
          {insurer.short} cannot read it. Withdraw consent any time.
        </p>
      </div>
    ),
  },
];
