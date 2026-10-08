/**
 * Step data for the three wallet flows rendered by WalletFlow (PhoneFrame.tsx).
 *
 * REGISTER_STEPS and LOGIN_STEPS are d-you's own PID presentation flow, screen
 * by screen, with the strings of the 2026-09-16 mirror
 * (`Localizable.xcstrings`, keys `pid_presentation.*`, `overview.*`,
 * `tap_navigation.*`): the dashboard with the scanner, the relying-party
 * screen ("This service is requesting data:"), the consent screen ("These
 * data will be transferred:" with the Digital ID card), the Digital ID code
 * ("Enter Digital ID code to confirm"), and the result ("Data sent
 * successfully"). A returning login is the same presentation; it only starts
 * at the request, the dashboard already behind it.
 *
 * EHR_TRANSFER_STEPS is the ePA data-access authorization via GesundheitsID
 * (NOT an EUDI PID presentation; GesundheitsID is today's real ePA auth) in
 * the insurer's app, the gated config (fictional default; TK only behind
 * NEXT_PUBLIC_DEMO_TK). Illustrative; see docs/planning/eudi-wallet-flows-2026.md.
 */
import {
  CheckCircle2,
  Check,
  ShieldCheck,
  Info,
  Eye,
  Landmark,
} from "lucide-react";
import { DYOU, type WalletStep } from "@/components/wallet/PhoneFrame";
import { insurer } from "@/lib/journey-config";

const ORG = "European Health Dataspace";
/** The purpose our registration certificate declares (the DCQL `purpose`). */
const PURPOSE = "Sign in to the Health Dataspace patient portal";

/** A d-you card: light container, hairline outline, radius 12. */
const card: React.CSSProperties = {
  background: DYOU.surfaceContainer,
  border: `1px solid ${DYOU.outlineVariant}`,
  borderRadius: 12,
};

/** The claims we ask for, labelled as `pid_presentation.data_consent.label_*`. */
const PID_CLAIMS = ["Given name(s)", "Family name", "Age over 18"];
const PID_CLAIM_TOTAL = 14;

const muted = { color: DYOU.onSurfaceVariant };

/** d-you's dashboard with a Digital ID in it: the Overview tab. */
const DASHBOARD: WalletStep = {
  ms: 2600,
  primary: "Scan QR code",
  layout: "dashboard",
  body: (
    <div style={{ color: DYOU.onSurface }}>
      <div
        className="rounded-2xl p-3.5 text-white mb-3 relative overflow-hidden"
        style={{ background: DYOU.pid }}
      >
        <p className="text-[13px] font-bold">Digital ID</p>
        <p className="text-[10px] opacity-90">Federal Republic of Germany</p>
        <Landmark
          size={46}
          strokeWidth={1}
          className="absolute -right-2 -bottom-3 opacity-30"
        />
        <div className="mt-6 flex items-center gap-1.5 text-[10px]">
          <ShieldCheck size={12} /> Valid · added with your ID card
        </div>
      </div>
      <p
        className="text-[10px] font-semibold tracking-wide uppercase"
        style={muted}
      >
        Last activity
      </p>
      <div className="p-2.5 text-[11px] mt-1" style={card}>
        <p className="font-semibold">{ORG}</p>
        <p style={muted}>Verified on 14 May · Credential and data shared</p>
      </div>
      <p className="text-[10px] mt-3 text-center" style={muted}>
        Scan the QR code on the website to identify yourself.
      </p>
    </div>
  ),
};

/** `RPInfoView`: who asks, for what, and whether to go on. */
const RP_INFO: WalletStep = {
  ms: 3200,
  primary: "Next",
  secondary: "Reject",
  header: "close",
  body: (
    <div style={{ color: DYOU.onSurface }}>
      <h4 className="text-[19px] leading-tight font-normal">
        This service is requesting data:
      </h4>
      <p className="text-[14px] font-medium mt-3">{ORG}</p>
      <p
        className="text-[10px] font-semibold tracking-wide uppercase mt-3"
        style={muted}
      >
        Purpose
      </p>
      <p className="text-[12px] mt-0.5" style={muted}>
        {PURPOSE}
      </p>
      <p className="text-[12px] mt-4" style={muted}>
        Do you want to share your data with this service?
      </p>
      <p className="text-[12px] mt-2" style={muted}>
        In the next step, you&apos;ll see which data will be sent.
      </p>
    </div>
  ),
};

/** `ConsentView`: the Digital ID card with the claims to be sent. */
const CONSENT: WalletStep = {
  ms: 3600,
  primary: "Next",
  secondary: "Reject",
  body: (
    <div style={{ color: DYOU.onSurface }}>
      <h4 className="text-[19px] leading-tight font-normal mb-3">
        These data will be transferred:
      </h4>
      <div className="overflow-hidden" style={card}>
        <div
          className="flex items-center justify-between text-white px-3 py-2.5"
          style={{ background: DYOU.pid }}
        >
          <p className="text-[12px] font-bold">
            {PID_CLAIMS.length} out of {PID_CLAIM_TOTAL} from Digital ID
          </p>
          <Info size={14} />
        </div>
        <div className="grid grid-cols-2 gap-x-2 gap-y-2 p-3 text-[11px]">
          {PID_CLAIMS.map((c) => (
            <div key={c} className="flex items-center gap-1.5">
              <Check
                size={12}
                className="shrink-0"
                style={{ color: DYOU.primaryOutline }}
              />
              {c}
            </div>
          ))}
        </div>
      </div>
      <div
        className="mt-3 flex items-center justify-center gap-1.5 rounded-full text-[11px] font-semibold py-2"
        style={{ border: `1.5px solid ${DYOU.onSurface}` }}
      >
        <Eye size={13} /> Show details
      </div>
    </div>
  ),
};

/** The Digital ID code (wallet PIN) that confirms the transfer. */
const DIGITAL_ID_CODE: WalletStep = {
  ms: 2200,
  primary: "Transfer data",
  secondary: "Forgot Digital ID code",
  body: (
    <div style={{ color: DYOU.onSurface }}>
      <h4 className="text-[19px] leading-tight font-normal">
        Enter Digital ID code to confirm
      </h4>
      <div className="flex items-center justify-center gap-1.5 mt-8">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <span
            key={i}
            className="w-6 h-8 rounded-md"
            style={{
              background: DYOU.surfaceContainer,
              border: `1.5px solid ${
                i === 0 ? DYOU.primaryOutline : DYOU.outlineVariant
              }`,
            }}
          />
        ))}
        <span
          className="grid place-items-center w-8 h-8 rounded-full ml-1"
          style={{ border: `1px solid ${DYOU.outlineVariant}` }}
        >
          <Eye size={13} />
        </span>
      </div>
      <p className="text-[10px] mt-6 text-center" style={muted}>
        Your 6-digit code, set when you added your ID to d-you.
      </p>
    </div>
  ),
};

/** `DocumentSuccessView` for a presentation. */
const SENT: WalletStep = {
  ms: 2600,
  primary: "Close",
  layout: "final",
  body: (
    <div className="text-center pt-6" style={{ color: DYOU.onSurface }}>
      <div
        className="mx-auto mb-4 grid place-items-center w-16 h-16 rounded-full"
        style={{ background: DYOU.primaryContainer }}
      >
        <CheckCircle2
          size={34}
          strokeWidth={1.75}
          style={{ color: DYOU.onSuccess }}
        />
      </div>
      <h4 className="text-[19px] leading-tight font-normal">
        Data sent successfully
      </h4>
      <p className="text-[12px] mt-3 px-1" style={muted}>
        Go back to the service where you started the identification to finish
        the process.
      </p>
    </div>
  ),
};

export const REGISTER_STEPS: WalletStep[] = [
  DASHBOARD,
  RP_INFO,
  CONSENT,
  DIGITAL_ID_CODE,
  SENT,
];

export const LOGIN_STEPS: WalletStep[] = [
  RP_INFO,
  CONSENT,
  DIGITAL_ID_CODE,
  SENT,
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
