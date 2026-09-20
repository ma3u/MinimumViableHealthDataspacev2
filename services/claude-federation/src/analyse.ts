/**
 * The request the phone sends, and the rules it must satisfy before any of it
 * leaves the EU.
 */
import { UnauthorizedError } from "./verify-user.js";

/** One value the user chose to send. Deliberately not the whole store. */
export interface SharedValue {
  label: string;
  value: number;
  unit: string;
  /** Absent for a quantity LOINC does not code, such as visceral fat mass. */
  loinc?: string | null;
  referenceLow?: number;
  referenceHigh?: number;
  /** FHIR Observation status, so the model can see what it is being given. */
  status: "final" | "preliminary";
}

export interface AnalyseRequest {
  consent?: { provider?: string; at?: string };
  values?: SharedValue[];
  question?: string;
}

export class RefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RefusedError";
  }
}

/**
 * The most values one request may carry.
 *
 * A cap is data minimisation made mechanical. "Send the panel you want asked
 * about" is a different act from "sync my record to a US API", and without a
 * limit the second is one loop away from the first.
 */
export const MAX_VALUES = 40;

/**
 * Fields that must never appear. Health values are pseudonymous on their own;
 * a name or an insurance number next to them is what makes the payload
 * identifying, and the local store holds none of these, so their presence means
 * a caller built a request by hand.
 */
const FORBIDDEN_KEYS = [
  "name",
  "givenname",
  "familyname",
  "surname",
  "vorname",
  "nachname",
  "birthdate",
  "geburtsdatum",
  "dob",
  "address",
  "adresse",
  "insurancenumber",
  "versichertennummer",
  "kvnr",
  "email",
  "phone",
  "patientid",
  "patient",
];

/**
 * Validates the request and returns exactly what may be sent onward.
 *
 * Enforced here rather than only in the app, because a check that lives only in
 * the client is a check an attacker skips. The phone shows the consent screen;
 * this decides whether the call happens.
 */
export function vet(request: AnalyseRequest): {
  values: SharedValue[];
  question: string;
  provider: "azure" | "anthropic";
} {
  // Issue #186: on-device by default, and a cloud provider only by an explicit
  // per-call act with the provider named at the moment of use. The named
  // provider travels with the request so this cannot be satisfied by a blanket
  // setting somewhere else.
  //
  // The name must be one this service actually runs. Accepting an unknown one
  // and quietly substituting the default would mean the consent the user gave
  // and the provider that answered were different things, which is the one
  // property this check exists to guarantee.
  const provider = request.consent?.provider;
  if (provider !== "azure" && provider !== "anthropic") {
    throw new RefusedError(
      "refused: the request carries no per-call consent naming a supported " +
        `provider. Expected "azure" or "anthropic", got ${JSON.stringify(
          provider ?? null,
        )}`,
    );
  }

  const values = request.values ?? [];
  if (values.length === 0) {
    throw new RefusedError("refused: no values selected");
  }
  if (values.length > MAX_VALUES) {
    throw new RefusedError(
      `refused: ${values.length} values exceeds the ${MAX_VALUES} a single request may carry`,
    );
  }

  for (const value of values) {
    for (const key of Object.keys(value)) {
      const folded = key.toLowerCase().replace(/[^a-z]/g, "");
      if (FORBIDDEN_KEYS.includes(folded)) {
        throw new RefusedError(
          `refused: a value carries the field "${key}", which identifies a person`,
        );
      }
    }
    if (typeof value.value !== "number" || !Number.isFinite(value.value)) {
      throw new RefusedError("refused: a value is not a finite number");
    }
    // A LOINC code is not required: the dictionary knows quantities LOINC
    // does not code, and refusing them here would mean a person could not ask
    // about a reading their own device produced. The unit and the label are
    // required, because without them there is nothing to explain.
    if (!value.unit || !value.label) {
      throw new RefusedError("refused: a value is missing its unit or label");
    }
  }

  const question = (request.question ?? "").trim();
  if (question.length > 2000) {
    throw new RefusedError("refused: question exceeds 2000 characters");
  }

  return { values, question, provider };
}

/**
 * The system prompt.
 *
 * Written to keep the product on the safe side of the line drawn in issue #186
 * section 5: software that stores, displays and explains is generally not a
 * medical device, while software that interprets results for diagnosis or
 * prognosis is, and because these come from in-vitro samples it is IVDR rather
 * than MDR Rule 11 that would apply. Qualification turns almost entirely on the
 * stated intended purpose, so the intended purpose is stated here, in the
 * request, every time.
 */
export const SYSTEM_PROMPT = [
  "You are helping a person understand their own laboratory results.",
  "",
  "You explain what a measurement is and what its printed reference range means.",
  "You do not diagnose, you do not estimate risk, you do not predict outcomes,",
  "and you do not recommend treatment, medication or dosage. When a question",
  "asks for any of those, say plainly that it is a question for their doctor",
  "and explain the underlying measurement instead.",
  "",
  "Reference ranges are printed by the issuing laboratory and are specific to",
  "its assay. Use the range given with each value. Never substitute a range",
  "from elsewhere and never describe a value as normal or abnormal against a",
  "range that was not supplied.",
  "",
  "Values marked preliminary were transcribed from a photograph by OCR and have",
  "not been verified against the paper. Treat them as possibly misread, and say",
  "so if a preliminary value is central to your answer.",
].join("\n");

/** Renders the selected values as the only health content in the request. */
export function renderValues(values: SharedValue[]): string {
  const lines = values.map((v) => {
    const range =
      v.referenceLow !== undefined && v.referenceHigh !== undefined
        ? `${v.referenceLow} to ${v.referenceHigh}`
        : v.referenceHigh !== undefined
          ? `< ${v.referenceHigh}`
          : v.referenceLow !== undefined
            ? `> ${v.referenceLow}`
            : "none printed";
    // No code is stated rather than an empty one, so the model is not handed
    // a blank LOINC that looks like a lookup failure.
    const code = v.loinc ? ` (LOINC ${v.loinc})` : "";
    return `- ${v.label}${code}: ${v.value} ${v.unit}; printed reference ${range}; ${v.status}`;
  });
  return ["Selected values:", ...lines].join("\n");
}
