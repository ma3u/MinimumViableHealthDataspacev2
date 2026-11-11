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
 *
 * The steps are data: their texts stay English here and follow the language
 * picker where they are shown (#782, ADR-070). A body's text goes through
 * <T area="patient">; a button label is translated by WalletFlow; the
 * patient area knows them all (__tests__/unit/lib/i18n-wallet.test.ts).
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
import { T } from "@/lib/i18n/translate";

const ORG = "European Health Dataspace";
/** The purpose our registration certificate declares (the DCQL `purpose`). */
const PURPOSE = "Sign in to the Health Dataspace patient portal";

/** A d-you card: light container, hairline outline, radius 12. */
const card: React.CSSProperties = {
  background: DYOU.surfaceContainer,
  border: `1px solid ${DYOU.outlineVariant}`,
  borderRadius: 12,
};

/**
 * The claims the hub's request asks for (`pidQuery` in `lib/eudi-verifier.ts`),
 * labelled as `pid_presentation.data_consent.label_*`: the name, and the birth
 * date for the secure hash of ADR-067. No age: the hub does not ask for it.
 */
export const PID_CLAIMS = ["Given name(s)", "Family name", "Date of birth"];
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
        <p className="text-[13px] font-bold">
          <T area="patient">{"Digital ID"}</T>
        </p>
        <p className="text-[10px] opacity-90">
          <T area="patient">{"Federal Republic of Germany"}</T>
        </p>
        <Landmark
          size={46}
          strokeWidth={1}
          className="absolute -right-2 -bottom-3 opacity-30"
        />
        <div className="mt-6 flex items-center gap-1.5 text-[10px]">
          <ShieldCheck size={12} />{" "}
          <T area="patient">{"Valid · added with your ID card"}</T>
        </div>
      </div>
      <p
        className="text-[10px] font-semibold tracking-wide uppercase"
        style={muted}
      >
        <T area="patient">{"Last activity"}</T>
      </p>
      <div className="p-2.5 text-[11px] mt-1" style={card}>
        <p className="font-semibold">
          <T area="patient">{ORG}</T>
        </p>
        <p style={muted}>
          <T area="patient">
            {"Verified on 14 May · Credential and data shared"}
          </T>
        </p>
      </div>
      <p className="text-[10px] mt-3 text-center" style={muted}>
        <T area="patient">
          {"Scan the QR code on the website to identify yourself."}
        </T>
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
        <T area="patient">{"This service is requesting data:"}</T>
      </h4>
      <p className="text-[14px] font-medium mt-3">
        <T area="patient">{ORG}</T>
      </p>
      <p
        className="text-[10px] font-semibold tracking-wide uppercase mt-3"
        style={muted}
      >
        <T area="patient">{"Purpose"}</T>
      </p>
      <p className="text-[12px] mt-0.5" style={muted}>
        <T area="patient">{PURPOSE}</T>
      </p>
      <p className="text-[12px] mt-4" style={muted}>
        <T area="patient">
          {"Do you want to share your data with this service?"}
        </T>
      </p>
      <p className="text-[12px] mt-2" style={muted}>
        <T area="patient">
          {"In the next step, you'll see which data will be sent."}
        </T>
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
        <T area="patient">{"These data will be transferred:"}</T>
      </h4>
      <div className="overflow-hidden" style={card}>
        <div
          className="flex items-center justify-between text-white px-3 py-2.5"
          style={{ background: DYOU.pid }}
        >
          <p className="text-[12px] font-bold">
            <T
              area="patient"
              vars={{ n: PID_CLAIMS.length, total: PID_CLAIM_TOTAL }}
            >
              {"{n} out of {total} from Digital ID"}
            </T>
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
              <T area="patient">{c}</T>
            </div>
          ))}
        </div>
      </div>
      <div
        className="mt-3 flex items-center justify-center gap-1.5 rounded-full text-[11px] font-semibold py-2"
        style={{ border: `1.5px solid ${DYOU.onSurface}` }}
      >
        <Eye size={13} /> <T area="patient">{"Show details"}</T>
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
        <T area="patient">{"Enter Digital ID code to confirm"}</T>
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
        <T area="patient">
          {"Your 6-digit code, set when you added your ID to d-you."}
        </T>
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
        <T area="patient">{"Data sent successfully"}</T>
      </h4>
      <p className="text-[12px] mt-3 px-1" style={muted}>
        <T area="patient">
          {
            "Go back to the service where you started the identification to finish the process."
          }
        </T>
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

export const EHR_CATEGORIES = [
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
          <T area="patient">{"Connect your health record"}</T>
        </h4>
        <p className="text-[11px] font-semibold text-gray-700 mt-1 mb-3">
          {insurer.name}
        </p>
        <div className="rounded-xl bg-gray-50 border border-gray-200 p-2.5 text-left text-[11px] text-gray-600">
          <T area="patient" tags={{ b: <strong className="text-gray-800" /> }}>
            {
              "The EHDS portal requests access to your <b>ePA</b> (elektronische Patientenakte)."
            }
          </T>
        </div>
        <p className="text-[10px] text-gray-400 mt-2">
          <T area="patient">{"Authenticate with GesundheitsID"}</T>
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
          <T area="patient">{"Choose what to share"}</T>
        </h4>
        <p className="text-[10px] text-gray-400 mb-2">
          <T area="patient">{"To: European Health Dataspace portal"}</T>
        </p>
        <div className="space-y-1 text-[11px] text-gray-700">
          {EHR_CATEGORIES.map((c) => (
            <div
              key={c}
              className="flex items-center gap-2 rounded-lg bg-gray-50 border border-gray-200 px-2.5 py-1.5"
            >
              <Check size={13} className="text-emerald-600 shrink-0" />
              <T area="patient">{c}</T>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-gray-400 mt-2 text-center">
          <T area="patient">{"Until I revoke · withdraw any time"}</T>
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
          <T area="patient">{"Authorising via GesundheitsID"}</T>
        </h4>
        <p className="text-[11px] text-gray-500 mt-1">
          <T area="patient">{"Secure authentication…"}</T>
        </p>
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
        <h4 className="font-bold text-gray-900 text-[18px]">
          <T area="patient">{"Transferred"}</T>
        </h4>
        <p className="text-[11px] text-gray-500 mt-1.5 px-2">
          <T area="patient" vars={{ insurer: insurer.short }}>
            {
              "Your ePA is now in the EHDS portal as FHIR R4. End-to-end encrypted: {insurer} cannot read it. Withdraw consent any time."
            }
          </T>
        </p>
      </div>
    ),
  },
];
