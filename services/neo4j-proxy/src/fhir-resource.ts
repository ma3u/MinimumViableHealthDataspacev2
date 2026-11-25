import { claimedProfiles } from "./fhir-profiles.js";
import { UCUM, ucumQuantity } from "./ucum.js";

// ---------------------------------------------------------------------------
// A graph node as a FHIR R4 resource (#876, #1144)
// ---------------------------------------------------------------------------
//
// The FHIR routes once answered a node's properties as they are: a code as a
// string where R4 wants a CodeableConcept, a value as a bare number, dates as
// the driver's objects, and graph-only properties (`fictional`, `pvCohort`,
// `name` as a label) as unknown elements. Matchbox found 20 errors against
// base R4 in one served Observation (#1176). Each type now has a mapper that
// writes the R4 elements and nothing else.
//
// The mapping decisions follow the document builders in
// ui/src/lib/fhir-documents/ (whose samples validate) and the shared FHIR
// writer (services/epa-ingest): codes with their system and the graph's
// display as text, UCUM quantities, references to the patient, status values
// from the R4 value sets, and our own extension URLs for what R4 has no
// element for.
//
// Two node shapes coexist: the seeds (`resourceId`, `codeSystem`,
// `valueQuantity`, `effectiveDate`) and scripts/load_fhir_neo4j.py (`id`,
// `system`, `value` as a string, `performedStart`). Both are read.

type Props = Record<string, unknown>;
export type Resource = Record<string, unknown>;

export const LOINC = "http://loinc.org";
export const SNOMED = "http://snomed.info/sct";
export const RXNORM = "http://www.nlm.nih.gov/research/umls/rxnorm";
const DATA_ABSENT_REASON =
  "http://hl7.org/fhir/StructureDefinition/data-absent-reason";
/** The shared FHIR writer's extension for where a value came from. */
export const EXT_SOURCE_KIND =
  "https://ehds.mabu.red/fhir/StructureDefinition/epa-ingest-source-kind";

/**
 * A driver value as JSON: integers as numbers, temporals (Date, DateTime,
 * Time, Duration) as the ISO 8601 their toString() prints. Recognised by
 * shape, so a test's driver stub needs none of the driver's type guards.
 */
function plain(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(plain);
  if (!v || typeof v !== "object") return v;
  const o = v as Record<string, unknown>;
  if (typeof o.toNumber === "function" && "low" in o && "high" in o) {
    return (o.toNumber as () => number)();
  }
  const temporal = "year" in o || "hour" in o || "months" in o;
  if (temporal && o.toString !== Object.prototype.toString) return String(v);
  return v;
}

/** A non-empty string, or undefined. */
function str(v: unknown): string | undefined {
  const p = plain(v);
  if (typeof p === "number" && Number.isFinite(p)) return String(p);
  if (typeof p !== "string") return undefined;
  const t = p.trim();
  return t === "" ? undefined : t;
}

/** A finite number, from a number or a numeric string (the loader's `value`). */
function num(v: unknown): number | undefined {
  const p = plain(v);
  if (typeof p === "number") return Number.isFinite(p) ? p : undefined;
  if (typeof p === "string" && /^\s*-?\d+(\.\d+)?\s*$/.test(p)) {
    return Number(p);
  }
  return undefined;
}

/** The first property of `keys` that holds a string. */
function first(props: Props, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = str(props[k]);
    if (v !== undefined) return v;
  }
  return undefined;
}

const DATE_TIME =
  /^(\d{4}(?:-(?:0[1-9]|1[0-2])(?:-(?:0[1-9]|[12]\d|3[01]))?)?)(?:[T ]([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d|60)(\.\d+)?)?(Z|[+-](?:0\d|1[0-4]):?[0-5]\d)?)?$/;

/**
 * A FHIR dateTime. A time without a zone names no instant, and R4 refuses
 * one, so it is cut to its date; a driver DateTime's `[Europe/Berlin]` is
 * dropped after its offset; `T10:00` gets its seconds.
 */
export function fhirDateTime(v: unknown): string | undefined {
  const s = str(v)?.replace(/\[[^\]]*\]$/, "");
  const m = s ? DATE_TIME.exec(s) : null;
  if (!m) return undefined;
  const [, date, hh, mm, ss, frac, zone] = m;
  if (!hh || !zone || date.length !== 10) return date;
  const offset =
    zone === "Z" ? zone : zone.replace(/^([+-]\d{2})(\d{2})$/, "$1:$2");
  return `${date}T${hh}:${mm}:${ss ?? "00"}${frac ?? ""}${offset}`;
}

/** A FHIR date: the date part of a date or a timestamp. */
export function fhirDate(v: unknown): string | undefined {
  const s = str(v)?.replace(/\[[^\]]*\]$/, "");
  const m = s ? DATE_TIME.exec(s) : null;
  return m ? m[1] : undefined;
}

/** A FHIR instant: a dateTime with a time and a zone, or nothing. */
export function fhirInstant(v: unknown): string | undefined {
  const d = fhirDateTime(v);
  return d && d.includes("T") ? d : undefined;
}

/** The R4 code if the graph holds one of `allowed`, else `fallback`. */
function pick<T extends string | undefined>(
  v: unknown,
  allowed: ReadonlySet<string>,
  fallback: T,
): string | T {
  const s = str(v)?.toLowerCase();
  return s && allowed.has(s) ? s : fallback;
}

/** A required element the graph has no value for (R4 data-absent-reason). */
const absent = () => ({
  extension: [{ url: DATA_ABSENT_REASON, valueCode: "unknown" }],
});

/**
 * A CodeableConcept: the code with its system, and the graph's display as
 * text. The display goes into `text`, not `coding.display`: the graph's
 * display is the seed's wording ("HbA1c 8.1%"), not the code system's.
 */
function codeable(
  code: string | undefined,
  system: string | undefined,
  text: string | undefined,
): Resource | undefined {
  if (!code && !text) return undefined;
  return {
    ...(code ? { coding: [{ ...(system ? { system } : {}), code }] } : {}),
    ...(text ? { text } : {}),
  };
}

/**
 * A Quantity: the unit as printed, and its UCUM code beside it only when the
 * unit has one (#1214, ./ucum.ts). An unknown unit stays text, no `system`.
 * A UCUM code the source gave (the loader's `ucumCode`, #1218) wins over the
 * mapping, since the source knew what it meant.
 */
function quantity(
  value: number,
  unit: string | undefined,
  ucum?: string,
): Resource {
  if (ucum) {
    return { value, unit: unit?.trim() || ucum, system: UCUM, code: ucum };
  }
  return ucumQuantity(value, unit);
}

/** A list property as strings, or [] (#1218: codings and components). */
function strings(v: unknown): string[] {
  const p = plain(v);
  return Array.isArray(p) ? p.map((x) => (x == null ? "" : String(x))) : [];
}

/** A list property as numbers; a slot that is not a number is undefined. */
function numbers(v: unknown): (number | undefined)[] {
  const p = plain(v);
  return Array.isArray(p) ? p.map((x) => num(x)) : [];
}

/**
 * The codings the loader kept beside the first (#1218), each once and after
 * the ones `coded` already carries.
 */
function moreCodings(p: Props, coded: Resource | undefined): void {
  if (!coded) return;
  const systems = strings(p.codingSystems);
  const codes = strings(p.codingCodes);
  const displays = strings(p.codingDisplays);
  const have = coded.coding as { system?: string; code: string }[] | undefined;
  if (!have || codes.length < 2) return;
  const seen = new Set(have.map((c) => `${c.system ?? ""}|${c.code}`));
  for (let i = 0; i < codes.length; i++) {
    const key = `${systems[i] ?? ""}|${codes[i]}`;
    if (!codes[i] || seen.has(key)) continue;
    seen.add(key);
    have.push(
      compact({
        system: systems[i] || undefined,
        code: codes[i],
        display: displays[i] || undefined,
      }) as { system?: string; code: string },
    );
  }
}

const UNKNOWN = {
  coding: [
    {
      system: "http://terminology.hl7.org/CodeSystem/data-absent-reason",
      code: "unknown",
    },
  ],
};

/**
 * The components the loader kept (#1218): each LOINC-coded, with its value,
 * printed unit and UCUM code; a component the source sent without a value
 * keeps its code and says the value is unknown.
 */
function storedComponents(p: Props): Resource[] | undefined {
  const codes = strings(p.componentCodes);
  const absent = strings(p.componentAbsentCodes);
  if (!codes.length && !absent.length) return undefined;
  const displays = strings(p.componentDisplays);
  const values = numbers(p.componentValues);
  const units = strings(p.componentUnits);
  const ucums = strings(p.componentUcumCodes);
  const coding = (code: string, display?: string) => ({
    coding: [compact({ system: LOINC, code, display: display || undefined })],
  });
  return [
    ...codes.map((code, i) => {
      const v = values[i];
      return v === undefined
        ? { code: coding(code, displays[i]), dataAbsentReason: UNKNOWN }
        : {
            code: coding(code, displays[i]),
            valueQuantity: quantity(v, units[i] || undefined, ucums[i]),
          };
    }),
    ...absent.map((code) => ({
      code: coding(code),
      dataAbsentReason: UNKNOWN,
    })),
  ];
}

/** A reference to a party the graph knows by name only. */
const named = (display: string | undefined) =>
  display ? { display } : undefined;

/** Drops the undefined values, so an absent element is absent. */
function compact(r: Resource): Resource {
  return Object.fromEntries(
    Object.entries(r).filter(([, v]) => v !== undefined),
  );
}

/** The FHIR id of a node: its FHIR id, its id, or the seed's resourceId. */
export function fhirIdOf(props: Props): string | undefined {
  const id = props.fhirId ?? props.id ?? props.resourceId;
  return id == null ? undefined : String(plain(id));
}

// ---- Value sets (R4) -------------------------------------------------------

const set = (...codes: string[]): ReadonlySet<string> => new Set(codes);
const GENDER = set("male", "female", "other", "unknown");
const OBSERVATION_STATUS = set(
  "registered",
  "preliminary",
  "final",
  "amended",
  "corrected",
  "cancelled",
  "entered-in-error",
  "unknown",
);
const OBSERVATION_CATEGORY = new Map([
  ["social-history", "Social History"],
  ["vital-signs", "Vital Signs"],
  ["imaging", "Imaging"],
  ["laboratory", "Laboratory"],
  ["procedure", "Procedure"],
  ["survey", "Survey"],
  ["exam", "Exam"],
  ["therapy", "Therapy"],
  ["activity", "Activity"],
]);
const ENCOUNTER_STATUS = set(
  "planned",
  "arrived",
  "triaged",
  "in-progress",
  "onleave",
  "finished",
  "cancelled",
  "entered-in-error",
  "unknown",
);
/** v3-ActCode encounter classes, by the seeds' words and Synthea's codes. */
const ENCOUNTER_CLASS: Record<string, [string, string]> = {
  ambulatory: ["AMB", "ambulatory"],
  outpatient: ["AMB", "ambulatory"],
  wellness: ["AMB", "ambulatory"],
  urgentcare: ["AMB", "ambulatory"],
  amb: ["AMB", "ambulatory"],
  emergency: ["EMER", "emergency"],
  emer: ["EMER", "emergency"],
  inpatient: ["IMP", "inpatient encounter"],
  imp: ["IMP", "inpatient encounter"],
  acute: ["ACUTE", "inpatient acute"],
  nonac: ["NONAC", "inpatient non-acute"],
  obsenc: ["OBSENC", "observation encounter"],
  prenc: ["PRENC", "pre-admission"],
  ss: ["SS", "short stay"],
  virtual: ["VR", "virtual"],
  vr: ["VR", "virtual"],
  home: ["HH", "home health"],
  hh: ["HH", "home health"],
  fld: ["FLD", "field"],
};
const CONDITION_CLINICAL = set(
  "active",
  "recurrence",
  "relapse",
  "inactive",
  "remission",
  "resolved",
);
const EVENT_STATUS = set(
  "preparation",
  "in-progress",
  "not-done",
  "on-hold",
  "stopped",
  "completed",
  "entered-in-error",
  "unknown",
);
const MED_REQUEST_STATUS = set(
  "active",
  "on-hold",
  "cancelled",
  "completed",
  "entered-in-error",
  "stopped",
  "draft",
  "unknown",
);
const MED_REQUEST_INTENT = set(
  "proposal",
  "plan",
  "order",
  "original-order",
  "reflex-order",
  "filler-order",
  "instance-order",
  "option",
);
const MED_STATEMENT_STATUS = set(
  "active",
  "completed",
  "entered-in-error",
  "intended",
  "stopped",
  "on-hold",
  "unknown",
  "not-taken",
);
const REPORT_STATUS = set(
  "registered",
  "partial",
  "preliminary",
  "final",
  "amended",
  "corrected",
  "appended",
  "cancelled",
  "entered-in-error",
  "unknown",
);
const IMMUNIZATION_STATUS = set("completed", "entered-in-error", "not-done");

// ---- One mapper per type ---------------------------------------------------

type Mapper = (props: Props, subject: Resource | undefined) => Resource;

function patient(p: Props): Resource {
  const address = compact({
    city: first(p, "city"),
    state: first(p, "state"),
    country: first(p, "country"),
  });
  const deceased = plain(p.deceased);
  const given = first(p, "firstName");
  const family = first(p, "lastName");
  const text =
    first(p, "name") ??
    ([given, family].filter(Boolean).join(" ") || undefined);
  const birthDate = fhirDate(p.birthDate);
  // The EU core Patient wants a name and a birth date; a node without one
  // says so with a data-absent reason, as the UI's documents do.
  return {
    name: [
      text
        ? compact({ text, family, given: given ? [given] : undefined })
        : absent(),
    ],
    gender: str(p.gender) ? pick(p.gender, GENDER, "unknown") : undefined,
    birthDate,
    _birthDate: birthDate ? undefined : absent(),
    // The loader keeps deceasedDateTime, or false when Synthea wrote none.
    deceasedBoolean: deceased === true ? true : undefined,
    deceasedDateTime: fhirDateTime(deceased),
    address: Object.keys(address).length ? [address] : undefined,
  };
}

function encounter(p: Props, subject: Resource | undefined): Resource {
  const cls = ENCOUNTER_CLASS[str(p.class)?.toLowerCase() ?? ""];
  const typeCode = first(p, "typeCode");
  const typeText = first(p, "type", "display");
  const type = codeable(
    typeCode,
    first(p, "typeSystem") ?? (typeCode ? SNOMED : undefined),
    typeText,
  );
  const start = fhirDateTime(p.date ?? p.period);
  return {
    status: pick(p.status, ENCOUNTER_STATUS, "unknown"),
    class: cls
      ? {
          system: "http://terminology.hl7.org/CodeSystem/v3-ActCode",
          code: cls[0],
          display: cls[1],
        }
      : absent(),
    type: type ? [type] : undefined,
    subject,
    period: start ? { start } : undefined,
    serviceProvider: named(first(p, "serviceProvider")),
  };
}

function condition(p: Props, subject: Resource | undefined): Resource {
  const clinical = pick(
    p.clinicalStatus ?? p.status,
    CONDITION_CLINICAL,
    undefined,
  );
  const code = first(p, "code");
  return {
    clinicalStatus: clinical
      ? {
          coding: [
            {
              system:
                "http://terminology.hl7.org/CodeSystem/condition-clinical",
              code: clinical,
            },
          ],
        }
      : undefined,
    code:
      codeable(
        code,
        first(p, "codeSystem", "system") ?? (code ? SNOMED : undefined),
        first(p, "display", "name"),
      ) ?? absent(),
    subject,
    onsetDateTime: fhirDateTime(p.onsetDate ?? p.onset),
  };
}

/**
 * The R4 vital signs (R4 Observation 2.10.4.1, the `vitalsigns` profiles the
 * validator applies to these LOINC codes by code alone), with the UCUM unit
 * a value of the code is in by definition. A seed that writes the value
 * without a unit gets it; a code whose unit is not fixed (weight, height,
 * temperature) gets none.
 */
const VITAL_SIGNS: Record<string, string | undefined> = {
  "85353-1": undefined,
  "9279-1": "/min",
  "8867-4": "/min",
  "2708-6": "%",
  "59408-5": "%",
  "8310-5": undefined,
  "8302-2": undefined,
  "9843-4": undefined,
  "29463-7": undefined,
  "39156-5": "kg/m2",
  "8480-6": "mm[Hg]",
  "8462-4": "mm[Hg]",
  "85354-9": "mm[Hg]",
  "55284-4": "mm[Hg]",
};
/**
 * Codes R4 wants as a blood pressure panel, values as components: the panels,
 * and a systolic value on its own, which the validator holds to the `bp`
 * profile as well. The graph's code stays, beside the panel code `bp` needs,
 * so a search by the graph's code still finds the resource that carries it.
 */
const BP_PANEL = "85354-9";
const BP_PANELS = new Set([BP_PANEL, "55284-4", "8480-6"]);

const loincCoding = (code: string) => ({ system: LOINC, code });

/**
 * A blood pressure the graph holds one value of (the seeds write "BP 145/92"
 * as 145 mmHg, the generated seed a systolic value alone): the value is the
 * systolic component and the diastolic is absent, which `bp` allows.
 */
function bloodPressure(value: number | undefined, unit: string) {
  const component = (code: string, v: number | undefined) => ({
    code: { coding: [loincCoding(code)] },
    ...(v === undefined
      ? { dataAbsentReason: UNKNOWN }
      : { valueQuantity: quantity(v, unit) }),
  });
  return [component("8480-6", value), component("8462-4", undefined)];
}

function observation(p: Props, subject: Resource | undefined): Resource {
  const code = first(p, "code");
  const system = first(p, "codeSystem", "system") ?? (code ? LOINC : undefined);
  const vital = system === LOINC && code !== undefined && code in VITAL_SIGNS;
  const bp = vital && BP_PANELS.has(code);
  const graphCategory = str(p.category)?.toLowerCase();
  // A vital sign's category is vital-signs by definition (R4 vs-1).
  const category =
    graphCategory && OBSERVATION_CATEGORY.has(graphCategory)
      ? graphCategory
      : vital
        ? "vital-signs"
        : undefined;
  const categoryDisplay = category && OBSERVATION_CATEGORY.get(category);
  const unit =
    first(p, "unit", "valueUnit") ?? (vital ? VITAL_SIGNS[code] : undefined);
  const coded = codeable(code, system, first(p, "display", "name"));
  moreCodings(p, coded);
  if (bp && coded && code !== BP_PANEL) {
    coded.coding = [...(coded.coding as object[]), loincCoding(BP_PANEL)];
  }
  const value = num(p.valueQuantity) ?? num(p.value);
  const ucum = first(p, "ucumCode");
  // The components the source sent (#1218); only without them does a blood
  // pressure fall back to its one stored value as the systolic component.
  const stored = storedComponents(p);
  const low = num(p.referenceLow);
  const high = num(p.referenceHigh);
  const rangeText = first(p, "referenceText");
  const sourceKind = first(p, "sourceKind");
  // A device's weekly mean covers a week; a measurement is a moment.
  const periodStart = fhirDateTime(p.effectiveStart);
  const end = fhirDateTime(p.effectiveDate ?? p.dateTime);
  const effective = periodStart
    ? undefined
    : fhirDateTime(p.dateTime ?? p.effectiveDate ?? p.date);
  const performer = named(first(p, "performer"));
  return {
    extension: sourceKind
      ? [{ url: EXT_SOURCE_KIND, valueCode: sourceKind }]
      : undefined,
    status: pick(p.status, OBSERVATION_STATUS, "unknown"),
    category: categoryDisplay
      ? [
          {
            coding: [
              {
                system:
                  "http://terminology.hl7.org/CodeSystem/observation-category",
                code: category,
                display: categoryDisplay,
              },
            ],
          },
        ]
      : undefined,
    code: coded ?? absent(),
    subject,
    // R4's vital signs and the EU lab result want a time; one the graph does
    // not hold is unknown, as a Period (vs-1 refuses a dateTime without one).
    effectivePeriod: periodStart
      ? { start: periodStart, ...(end ? { end } : {}) }
      : !effective && (vital || category === "laboratory")
        ? absent()
        : undefined,
    effectiveDateTime: effective,
    // The EU lab result wants its performer; a laboratory value whose
    // laboratory the graph does not name says so.
    performer: performer
      ? [performer]
      : category === "laboratory"
        ? [absent()]
        : undefined,
    valueQuantity:
      value === undefined || bp || stored
        ? undefined
        : quantity(value, unit, ucum),
    referenceRange:
      low !== undefined || high !== undefined || rangeText
        ? [
            compact({
              low: low === undefined ? undefined : quantity(low, unit),
              high: high === undefined ? undefined : quantity(high, unit),
              text: rangeText,
            }),
          ]
        : undefined,
    component:
      stored ?? (bp ? bloodPressure(value, unit ?? "mm[Hg]") : undefined),
  };
}

function procedure(p: Props, subject: Resource | undefined): Resource {
  const code = first(p, "code");
  const start = fhirDateTime(p.performedStart ?? p.date);
  const end = fhirDateTime(p.performedEnd);
  return {
    status: pick(p.status, EVENT_STATUS, "unknown"),
    code: codeable(
      code,
      first(p, "codeSystem", "system") ?? (code ? SNOMED : undefined),
      first(p, "display", "name"),
    ),
    subject,
    performedPeriod: start && end ? { start, end } : undefined,
    performedDateTime: start && !end ? start : undefined,
  };
}

function medicationRequest(p: Props, subject: Resource | undefined): Resource {
  const code = first(p, "code", "medicationCode");
  const authoredOn = fhirDateTime(p.date ?? p.authoredOn);
  return {
    status: pick(p.status, MED_REQUEST_STATUS, "unknown"),
    // A prescription the graph holds is an order (the UI's builders say so too).
    intent: pick(p.intent, MED_REQUEST_INTENT, "order"),
    medicationCodeableConcept:
      codeable(
        code,
        first(p, "codeSystem", "system") ?? (code ? RXNORM : undefined),
        first(p, "display", "name"),
      ) ?? absent(),
    subject,
    authoredOn,
    // The EU prescription (MPD) wants the date and the prescriber; the
    // graph keeps no prescriber, so it says it does not know.
    _authoredOn: authoredOn ? undefined : absent(),
    requester: absent(),
  };
}

function diagnosticReport(p: Props, subject: Resource | undefined): Resource {
  const code = first(p, "code");
  const category = first(p, "category");
  const performer = named(first(p, "performer"));
  return {
    status: pick(p.status, REPORT_STATUS, "unknown"),
    category: category
      ? [
          codeable(
            category,
            "http://terminology.hl7.org/CodeSystem/v2-0074",
            first(p, "categoryDisplay"),
          ),
        ]
      : undefined,
    code:
      codeable(
        code,
        first(p, "codeSystem", "system") ?? (code ? LOINC : undefined),
        first(p, "display", "name"),
      ) ?? absent(),
    subject,
    effectiveDateTime: fhirDateTime(p.effectiveDate ?? p.date),
    issued: fhirInstant(p.issued),
    performer: performer ? [performer] : undefined,
    conclusion: first(p, "conclusion"),
  };
}

function immunization(p: Props, subject: Resource | undefined): Resource {
  const occurrence = fhirDateTime(p.occurrenceDate ?? p.date);
  const performer = named(first(p, "performer"));
  return {
    status: pick(p.status, IMMUNIZATION_STATUS, "completed"),
    vaccineCode:
      codeable(
        first(p, "vaccineCode", "code"),
        first(p, "codeSystem", "system"),
        first(p, "display", "name"),
      ) ?? absent(),
    patient: subject,
    occurrenceDateTime: occurrence,
    _occurrenceDateTime: occurrence ? undefined : absent(),
    lotNumber: first(p, "lotNumber"),
    performer: performer ? [{ actor: performer }] : undefined,
  };
}

function medicationStatement(
  p: Props,
  subject: Resource | undefined,
): Resource {
  const start = fhirDateTime(p.effectiveStart);
  const dose = num(p.dose);
  const reason = first(p, "reason");
  const text = first(p, "dosageText");
  return {
    status: pick(p.status, MED_STATEMENT_STATUS, "unknown"),
    medicationCodeableConcept:
      codeable(
        first(p, "medicationCode", "code"),
        first(p, "codeSystem", "system"),
        first(p, "display", "name"),
      ) ?? absent(),
    subject,
    effectivePeriod: start ? { start } : undefined,
    // The date the medication plan was printed is when it said so.
    dateAsserted: fhirDateTime(p.planPrinted),
    informationSource: named(first(p, "source")),
    reasonCode: reason ? [{ text: reason }] : undefined,
    dosage:
      text || dose !== undefined
        ? [
            compact({
              text,
              doseAndRate:
                dose === undefined
                  ? undefined
                  : [{ doseQuantity: quantity(dose, first(p, "doseUnit")) }],
            }),
          ]
        : undefined,
  };
}

const MAPPERS: Record<string, Mapper> = {
  Patient: patient,
  Encounter: encounter,
  Condition: condition,
  Observation: observation,
  Procedure: procedure,
  MedicationRequest: medicationRequest,
  DiagnosticReport: diagnosticReport,
  Immunization: immunization,
  MedicationStatement: medicationStatement,
};

/** The resource types the facade maps, in the order $everything lists them. */
export const FACADE_TYPES = Object.keys(MAPPERS);

/**
 * The node as an R4 resource of `type`. A record of a patient refers to it
 * (`subject`, or `patient` for an Immunization) when `patientId` is given.
 * `meta.profile` names the profiles this resource class passed in
 * scripts/eehrxf/validation-report.json (fhir-profiles.ts), and no other.
 */
export function toFhirResource(
  type: string,
  props: Props,
  patientId?: string,
): Resource {
  const mapper = MAPPERS[type];
  if (!mapper) throw new Error(`No FHIR mapping for ${type}`);
  const id = fhirIdOf(props);
  const subject =
    type !== "Patient" && patientId
      ? { reference: `Patient/${patientId}` }
      : undefined;
  const body = compact(mapper(props, subject));
  const resource: Resource = { resourceType: type, ...(id ? { id } : {}) };
  const profiles = claimedProfiles({ ...resource, ...body });
  if (profiles.length) resource.meta = { profile: profiles };
  return { ...resource, ...body };
}

/**
 * A bundle entry for the resource, with its fullUrl when it has an id: an
 * absolute URL under `base` (R4 Bundle.entry.fullUrl), or the relative
 * `Type/id` when no base is known.
 */
export function toFhirEntry(
  resource: Resource,
  base?: string,
): {
  fullUrl?: string;
  resource: Resource;
} {
  if (!resource.id) return { resource };
  const local = `${resource.resourceType}/${resource.id}`;
  return {
    fullUrl: base ? `${base.replace(/\/$/, "")}/${local}` : local,
    resource,
  };
}
