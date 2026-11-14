/**
 * What the full-screen journeys page (/journeys) says about each box of the
 * two journeys in journey-flows.ts: a description, the articles of
 * Regulation (EU) 2025/327 it serves, who signs in for it, and a second page
 * worth opening. The statuses and gaps are those of
 * docs/ehds/person-journey.md and researcher-journey.md; change both together.
 *
 * Every description is English and a key of the "home" dictionary;
 * __tests__/unit/components/JourneysFullscreen.test.tsx checks every box has
 * one, in every language.
 */
import type { FlowId, FlowNode } from "@/lib/journey-flows";

/** A demo user of jad/keycloak-realm.json, or how the step is reached without one. */
export type SignIn =
  | "researcher"
  | "clinicuser"
  | "regulator"
  | "edcadmin"
  | "patient1"
  | "app"
  | "wallet"
  | "none";

export interface StepInfo {
  detail: string;
  /** Articles of Regulation (EU) 2025/327, as cited: "71", "61(4)". */
  ehds: readonly string[];
  signIn: SignIn;
  /** A second page for the step, with its own user when it needs another. */
  extra?: { label: string; href: string; signIn?: SignIn };
}

/** Where the Klarbefund steps lead on both sites: the app's user guide. */
export const KLARBEFUND_GUIDE = "/docs/klarbefund/klarbefund-user-guide";

/** Keyed by the flow and the box's English title, which is unique per flow. */
const STEPS: Record<FlowId, Record<string, StepInfo>> = {
  primary: {
    "Result on paper": {
      detail:
        "The study centre or laboratory hands the person their result on paper or as a PDF. Nothing can read it: this is where most results still end, and where the journey starts.",
      ehds: ["14"],
      signIn: "none",
    },
    "Scan or import": {
      detail:
        "Klarbefund reads the camera picture or the PDF on the iPhone. Text recognition runs on the device; nothing leaves the phone at this step.",
      ehds: ["4"],
      signIn: "app",
    },
    "Coded, checkable": {
      detail:
        "Each value gets its LOINC code and UCUM unit and keeps the page and line it came from, so the person can check every value against the paper. Rows the reader still misses are tracked in #513.",
      ehds: ["15"],
      signIn: "app",
    },
    "Trend and band": {
      detail:
        "Values from earlier reports become a trend, drawn against the published reference range, with the source of that range named. Klarbefund explains a value; it does not diagnose.",
      ehds: [],
      signIn: "app",
    },
    Export: {
      detail:
        "The app exports a FHIR R4 bundle and a PDF the person can take anywhere, the portability of Art. 7. The hub returns the whole record as a FHIR R4 bundle too.",
      ehds: ["7"],
      signIn: "app",
    },
    "To the ePA, the GP": {
      detail:
        "The person shares the PDF and the bundle with their doctor from the phone. Writing into the real German ePA needs a statutory insurer as partner, planned in #478.",
      ehds: ["5"],
      signIn: "app",
    },
    "Sign in with d-you": {
      detail:
        "The person scans a QR code with d-you, the German EUDI wallet. The wallet presents the PID over OpenID4VP, and the hub opens the record in that name. Implementing Regulation 2026/2099 in full, with SD-JWT VC and encrypted responses, is planned in #708.",
      ehds: ["16"],
      signIn: "wallet",
    },
    "Consent or opt out": {
      detail:
        "The person decides about secondary use. The Art. 71 opt-out is a record and a label, and every research query leaves the person out. Joining a study is a separate consent, which can be withdrawn at any time.",
      ehds: ["71"],
      signIn: "patient1",
    },
    "My EHDS record": {
      detail:
        "The hub holds the record as coded FHIR in the graph and shows it to the person alone: a patient reads only their own record. The access log says who else used it.",
      ehds: ["3", "9"],
      signIn: "patient1",
    },
    "What came back": {
      detail:
        "What research produced comes back to the person as aggregates of five people or more, never as another person's data.",
      ehds: ["58"],
      signIn: "patient1",
    },
  },
  secondary: {
    "Hospital registers": {
      detail:
        "AlphaKlinik Berlin joins the dataspace with a did:web identifier and receives a membership credential over the Decentralized Claims Protocol (DCP 1.0). The other participants check that credential before they answer.",
      ehds: ["55"],
      signIn: "clinicuser",
    },
    "Researcher registers": {
      detail:
        "PharmaCo Research AG gets its did:web identifier and membership credential the same way. A person acting for the organisation with the European Business Wallet is planned in #709.",
      ehds: ["55"],
      signIn: "researcher",
    },
    "HDAB registers": {
      detail:
        "MedReg DE, the health data access body, joins as a participant with its own identity and credential, so the others can verify its decisions.",
      ehds: ["55"],
      signIn: "regulator",
    },
    "Publish data": {
      detail:
        "The hospital describes its datasets in HealthDCAT-AP Release 8, as Implementing Regulation 2026/2098 asks, and publishes them in its catalogue. Every pull request checks the descriptions with SHACL.",
      ehds: ["60", "77"],
      signIn: "clinicuser",
      extra: { label: "The catalogue", href: "/catalog", signIn: "researcher" },
    },
    "Discover data": {
      detail:
        "The researcher searches one catalogue, built from every participant's DSP catalogue by a crawler and an enricher. The European part, HealthData@EU, waits for the Art. 75 implementing act (#713).",
      ehds: ["79"],
      signIn: "researcher",
    },
    "Negotiate contract": {
      detail:
        "The researcher negotiates a contract with the hospital over the Dataspace Protocol 2025-1 on EDC 1.0: offer, accept, finalise, under a standard ODRL policy. The hub refuses any transfer without a data permit.",
      ehds: ["61(1)"],
      signIn: "researcher",
    },
    "Approve data permit": {
      detail:
        "MedReg DE assesses the application against the criteria of Art. 68 within its three-month clock, checks the opt-outs, and issues or refuses the permit. Every decision is published in the public register. The DAAMS model of TEHDAS2 D6.4 is planned in #1031.",
      ehds: ["67", "68"],
      signIn: "regulator",
      extra: {
        label: "The application",
        href: "/applications",
        signIn: "researcher",
      },
    },
    "Extract and upload": {
      detail:
        "Under the permit, the hospital's data is extracted as FHIR, pseudonymised and transferred into a secure processing environment. On Azure, the import as a sealed extract through the Trustee is planned in #915.",
      ehds: ["66", "73"],
      signIn: "researcher",
    },
    "Provision SPE": {
      detail:
        "The SPE workspace runs as a confidential container; the key to the data is released only to a workspace whose attestation checks out. An isolated workspace per permit is planned in #716.",
      ehds: ["73"],
      signIn: "researcher",
      extra: {
        label: "SPE attestation",
        href: "/admin/attestation",
        signIn: "edcadmin",
      },
    },
    "Analyse in the SPE": {
      detail:
        "The researcher analyses the data in OMOP inside the SPE. Only aggregates leave, groups under five are suppressed, opted-out persons are left out, and records are linked by research pseudonyms from the trust centre.",
      ehds: ["66"],
      signIn: "researcher",
      extra: {
        label: "Ask the data",
        href: "/query",
        signIn: "researcher",
      },
    },
    "Share results": {
      detail:
        "Answers come back as OMOP output in plain language. The researcher reports the results, and the access body publishes them in the register, as Art. 61(4) asks.",
      ehds: ["61(4)"],
      signIn: "researcher",
      extra: {
        label: "The public register",
        href: "/permits",
        signIn: "regulator",
      },
    },
    "Audit report": {
      detail:
        "Every step on the chain is logged as a FHIR AuditEvent, and the access body's activity report counts them. A write-once copy and a signed digest are planned in #587.",
      ehds: ["59", "73(1)(e)"],
      signIn: "regulator",
      extra: {
        label: "Activity report",
        href: "/activity-report",
        signIn: "regulator",
      },
    },
  },
};

export function stepInfo(flow: FlowId, node: FlowNode): StepInfo | undefined {
  return STEPS[flow][node.title];
}

/** The users the page names, and how it names the steps that need none. */
export const SIGN_IN_LABEL: Record<SignIn, string> = {
  researcher: "researcher (PharmaCo Research AG, data user)",
  clinicuser: "clinicuser (AlphaKlinik Berlin, data holder)",
  regulator: "regulator (MedReg DE, access body)",
  edcadmin: "edcadmin (the dataspace operator)",
  patient1: "patient1 (a citizen)",
  app: "In the Klarbefund app on the iPhone",
  wallet: "Signed out, with the EUDI wallet",
  none: "No sign-in",
};

export function isDemoUser(s: SignIn): boolean {
  return s !== "app" && s !== "wallet" && s !== "none";
}

/** The page of a step on one site: the app's guide for the Klarbefund steps. */
export function stepPage(node: FlowNode): string {
  if (!node.href || node.href.startsWith("#")) return KLARBEFUND_GUIDE;
  return node.href;
}

/** EUR-Lex anchor of an article as cited: "61(4)" is art_61. */
export function articleUrl(article: string): string {
  return `https://eur-lex.europa.eu/eli/reg/2025/327/oj/eng#art_${
    article.split("(")[0]
  }`;
}

/** Every text of the step data the dictionaries must hold. */
export function stepTexts(): string[] {
  return Object.values(STEPS).flatMap((flow) =>
    Object.values(flow).flatMap((s) => [
      s.detail,
      ...(s.extra ? [s.extra.label] : []),
    ]),
  );
}
