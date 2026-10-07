/**
 * Step data for the three wallet flows rendered by WalletFlow (PhoneFrame.tsx).
 * - REGISTER_STEPS: the EUDI registration, drawn the way d-you, the German
 *   wallet, draws a presentation request (its logic-ui design system: white
 *   surface, #F4F4F4 cards with a #B9B9BD outline, the PID card in the wallet's
 *   teal #02818B, mint #96F5AF for success).
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
import { DYOU, type WalletStep } from "@/components/wallet/PhoneFrame";
import { insurer } from "@/lib/journey-config";

const ORG = "European Health Dataspace";

/** A d-you list card: light container, hairline outline, radius 12. */
const card: React.CSSProperties = {
  background: DYOU.surfaceContainer,
  border: `1px solid ${DYOU.outlineVariant}`,
  borderRadius: 12,
};

const PID_CLAIMS = ["First name", "Last name", "Date of birth"];

export const REGISTER_STEPS: WalletStep[] = [
  {
    ms: 3200,
    primary: "Yes, continue",
    body: (
      <div style={{ color: DYOU.onSurface }}>
        <div
          className="mb-3 grid place-items-center w-12 h-12 rounded-full"
          style={card}
        >
          <Building2 size={22} strokeWidth={1.75} />
        </div>
        <h4 className="text-[19px] leading-tight font-normal">
          Do you trust EHDS?
        </h4>
        <p
          className="text-[11px] mt-1.5 mb-3"
          style={{ color: DYOU.onSurfaceVariant }}
        >
          {ORG} wants to request information from you.
        </p>
        <div className="p-2.5 flex items-center gap-2 mb-2" style={card}>
          <BadgeCheck
            size={20}
            className="shrink-0"
            style={{ color: DYOU.primaryOutline }}
          />
          <div>
            <p className="text-[12px] font-semibold">Verified organization</p>
            <p className="text-[10px]" style={{ color: DYOU.onSurfaceVariant }}>
              Verified on 7 Oct 2026 · EU trust list
            </p>
          </div>
        </div>
        <div className="p-2.5 flex items-center gap-2" style={card}>
          <ArrowLeftRight
            size={18}
            className="shrink-0"
            style={{ color: DYOU.onSurfaceVariant }}
          />
          <div>
            <p className="text-[12px] font-semibold">First-time interaction</p>
            <p className="text-[10px]" style={{ color: DYOU.onSurfaceVariant }}>
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
      <div style={{ color: DYOU.onSurface }}>
        <p
          className="text-[10px] font-semibold tracking-wide uppercase"
          style={{ color: DYOU.onSurfaceVariant }}
        >
          Review the request
        </p>
        <h4 className="text-[17px] leading-tight font-normal mt-1 mb-3">
          Do you want to share your data with this service?
        </h4>
        <p
          className="text-[10px] font-semibold tracking-wide uppercase mb-1"
          style={{ color: DYOU.onSurfaceVariant }}
        >
          Purpose
        </p>
        <div className="p-2.5 text-[11px] mb-3" style={card}>
          Sign in &amp; register at the EHDS patient portal.
        </div>
        <div className="overflow-hidden" style={card}>
          <div
            className="text-white text-[12px] font-bold px-3 py-2"
            style={{ background: DYOU.pid }}
          >
            PID · Person Identification Data
          </div>
          <div className="p-2.5 space-y-1 text-[11px]">
            {PID_CLAIMS.map((c) => (
              <div key={c} className="flex items-center gap-2">
                <Check
                  size={13}
                  className="shrink-0"
                  style={{ color: DYOU.primaryOutline }}
                />
                {c}
              </div>
            ))}
          </div>
        </div>
        <p
          className="text-[10px] mt-2 text-center"
          style={{ color: DYOU.onSurfaceVariant }}
        >
          3 of 14 values will be shared. You decide who you share your data
          with.
        </p>
      </div>
    ),
  },
  {
    ms: 2600,
    primary: "Go to wallet",
    body: (
      <div className="text-center pt-4" style={{ color: DYOU.onSurface }}>
        <div
          className="mx-auto mb-3 grid place-items-center w-16 h-16 rounded-full"
          style={{ background: DYOU.primaryContainer }}
        >
          <CheckCircle2
            size={34}
            strokeWidth={1.75}
            style={{ color: DYOU.onSuccess }}
          />
        </div>
        <h4 className="text-[21px] font-normal">Success!</h4>
        <p
          className="text-[12px] mt-1.5 px-2"
          style={{ color: DYOU.onSurfaceVariant }}
        >
          Credential and data shared with {ORG}. You are signed in, no password.
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
      <div style={{ color: DYOU.onSurface }}>
        <div
          className="mb-3 grid place-items-center w-12 h-12 rounded-full"
          style={card}
        >
          <Building2 size={22} strokeWidth={1.75} />
        </div>
        <h4 className="text-[19px] leading-tight font-normal">
          Sign in to EHDS?
        </h4>
        <p
          className="text-[11px] mt-1.5 mb-3"
          style={{ color: DYOU.onSurfaceVariant }}
        >
          {ORG} is asking you to sign in.
        </p>
        <div className="p-2.5 flex items-center gap-2 mb-2" style={card}>
          <BadgeCheck
            size={20}
            className="shrink-0"
            style={{ color: DYOU.primaryOutline }}
          />
          <div>
            <p className="text-[12px] font-semibold">
              You&apos;ve shared with EHDS before
            </p>
            <p className="text-[10px]" style={{ color: DYOU.onSurfaceVariant }}>
              Verified on 14 May · trusted
            </p>
          </div>
        </div>
        <div className="p-2.5 text-[11px]" style={card}>
          Your PID is already in your wallet, just approve. No password.
        </div>
      </div>
    ),
  },
  {
    ms: 1800,
    primary: "Done",
    body: (
      <div className="text-center pt-6" style={{ color: DYOU.onSurface }}>
        <div
          className="mx-auto mb-3 grid place-items-center w-16 h-16 rounded-full"
          style={{ background: DYOU.primaryContainer }}
        >
          <CheckCircle2
            size={34}
            strokeWidth={1.75}
            style={{ color: DYOU.onSuccess }}
          />
        </div>
        <h4 className="text-[21px] font-normal">Welcome back, Maria</h4>
        <p
          className="text-[12px] mt-1.5 px-2"
          style={{ color: DYOU.onSurfaceVariant }}
        >
          Signed in to EHDS, no password.
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
