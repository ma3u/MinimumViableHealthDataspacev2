import {
  KLARBEFUND_REPORT_SYSTEM,
  LAB_PROFILES,
  LAB_REPORT_SYSTEM,
  type LabReportInput,
  type LabResultRow,
} from "./lab-report";
import {
  EPS_PROFILES,
  PATIENT_SUMMARY_TYPE,
  type AllergyRow,
  type ConditionRow,
  type ImmunizationRow,
  type MedicationRow,
  type PatientSummaryInput,
  type ProcedureRow,
} from "./patient-summary";
import {
  EXT_SOURCE_KIND,
  EXT_SOURCE_LINE,
  EXT_SOURCE_REGION,
  GRAPH_NODE_SYSTEM,
  LOINC,
  PATIENT_RECORD_SYSTEM,
  SNOMED,
  documentUuid,
} from "./shared";

/**
 * Reading a FHIR document back (#1173, EHDS Art. 15(4)): a laboratory report
 * (HL7 Europe Laboratory Report) or a Patient Summary (HL7 Europe Patient
 * Summary, IPS) as the rows the builders of #1171 take, so what is imported
 * is what the record shows and exports again.
 *
 * Pure: no graph, no validator. The route validates first (the HL7 validator
 * through `$validate`), this maps, `store.ts` writes. A resource the record
 * does not hold (a care plan, a device, a coded rather than numeric result)
 * is listed as skipped with the reason, never stored under a shape it does
 * not have.
 */

export type DocumentKind = "lab-report" | "patient-summary";

const KINDS: Record<string, { kind: DocumentKind; profile: string }> = {
  "11502-2": { kind: "lab-report", profile: LAB_PROFILES.bundle },
  [PATIENT_SUMMARY_TYPE.code]: {
    kind: "patient-summary",
    profile: EPS_PROFILES.bundle,
  },
};

/** A document the hub will not take, with the HTTP status to answer. */
export class DocumentRefusedError extends Error {
  constructor(
    message: string,
    readonly status: 409 | 415 | 422,
    readonly problems: string[] = [],
  ) {
    super(message);
  }
}

export interface DocumentMeta {
  /** Bundle.identifier as `system|value`, the document's key in the graph */
  documentId: string;
  timestamp: string;
  /** LOINC code of Composition.type */
  typeCode: string;
  title: string;
  authors: string[];
  custodian: string | null;
}

export interface Skipped {
  entry: string;
  resourceType: string;
  reason: string;
}

export interface ParsedDocument {
  kind: DocumentKind;
  /** The profile the document is validated against */
  profile: string;
  meta: DocumentMeta;
  /** The hub record the document names, when it names one */
  patientRecordId: string | null;
  lab: LabReportInput | null;
  summary: PatientSummaryInput | null;
  /**
   * Ids of graph nodes the document names (its own identifiers in the hub's
   * systems). The store refuses a document naming another person's node.
   */
  graphIds: string[];
  skipped: Skipped[];
}

type Json = Record<string, unknown>;
const obj = (v: unknown): Json =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {};
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v : null;
const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

interface Entry {
  fullUrl: string;
  resource: Json;
}

function codings(cc: unknown): Json[] {
  return arr(obj(cc).coding)
    .map(obj)
    .filter((c) => str(c.code));
}

/** The first coding, in the given system when there is one. */
function coding(cc: unknown, prefer?: string): Json | null {
  const all = codings(cc);
  return all.find((c) => c.system === prefer) ?? all[0] ?? null;
}

function textOf(cc: unknown, fallback: string): string {
  const c = obj(cc);
  return (
    str(c.text) ?? str(coding(c)?.display) ?? str(coding(c)?.code) ?? fallback
  );
}

function identifierIn(resource: Json, system: string): string | null {
  const ids = Array.isArray(resource.identifier)
    ? resource.identifier
    : resource.identifier
      ? [resource.identifier]
      : [];
  const found = ids.map(obj).find((i) => i.system === system);
  return found ? str(found.value) : null;
}

/** The document type and the profile it is checked against, or a refusal. */
export function documentKind(bundle: unknown): {
  kind: DocumentKind;
  profile: string;
  typeCode: string;
} {
  const b = obj(bundle);
  if (b.resourceType !== "Bundle" || b.type !== "document") {
    throw new DocumentRefusedError(
      "only a FHIR document Bundle is imported",
      415,
    );
  }
  const composition = obj(obj(arr(b.entry)[0]).resource);
  const code = codings(composition.type)
    .filter((c) => c.system === LOINC)
    .map((c) => String(c.code))
    .find((c) => c in KINDS);
  if (!code) {
    throw new DocumentRefusedError(
      "only a laboratory report (LOINC 11502-2) or a Patient Summary (LOINC 60591-5) is imported",
      415,
    );
  }
  return { ...KINDS[code], typeCode: code };
}

export function parseDocument(
  bundle: unknown,
  patientId: string,
): ParsedDocument {
  const { kind, profile, typeCode } = documentKind(bundle);
  const b = obj(bundle);
  const entries: Entry[] = arr(b.entry)
    .map(obj)
    .map((e) => ({
      fullUrl: String(e.fullUrl ?? ""),
      resource: obj(e.resource),
    }));
  const byRef = new Map<string, Entry>();
  for (const e of entries) {
    if (e.fullUrl) byRef.set(e.fullUrl, e);
    const { resourceType, id } = e.resource;
    if (typeof resourceType === "string" && typeof id === "string") {
      byRef.set(`${resourceType}/${id}`, e);
    }
  }
  const resolve = (ref: unknown): Entry | null =>
    byRef.get(String(obj(ref).reference ?? "")) ?? null;

  const identifier = obj(b.identifier);
  const documentId = `${String(identifier.system ?? "")}|${String(
    identifier.value ?? "",
  )}`;
  const graphIds = new Set<string>();
  const keyOf = (e: Entry): string => {
    const own = identifierIn(e.resource, GRAPH_NODE_SYSTEM);
    if (own) {
      graphIds.add(own);
      return own;
    }
    return `imp-${documentUuid(`${patientId}|${documentId}|${e.fullUrl}`)}`;
  };

  const nameOf = (ref: unknown): string | null => {
    const target = resolve(ref)?.resource;
    if (target) {
      if (target.resourceType === "Organization" && str(target.name)) {
        return String(target.name);
      }
      const name = obj(arr(target.name)[0]);
      const spelled =
        str(name.text) ??
        str(
          [...arr(name.prefix), ...arr(name.given), name.family]
            .filter((x) => typeof x === "string")
            .join(" "),
        );
      if (spelled) return spelled;
      if (target.resourceType === "PractitionerRole") {
        return nameOf(target.organization) ?? nameOf(target.practitioner);
      }
    }
    return str(obj(ref).display);
  };

  const composition = entries[0].resource;
  const subject = resolve(composition.subject)?.resource ?? {};
  const meta: DocumentMeta = {
    documentId,
    timestamp: String(b.timestamp ?? ""),
    typeCode,
    title:
      str(composition.title) ??
      (kind === "lab-report" ? "Laboratory report" : "Patient Summary"),
    authors: arr(composition.author)
      .map(nameOf)
      .filter((n): n is string => !!n),
    custodian: nameOf(composition.custodian),
  };
  const skipped: Skipped[] = [];
  const skip = (e: Entry, reason: string) =>
    skipped.push({
      entry: e.fullUrl,
      resourceType: String(e.resource.resourceType ?? "unknown"),
      reason,
    });

  const parsed: ParsedDocument = {
    kind,
    profile,
    meta,
    patientRecordId: identifierIn(subject, PATIENT_RECORD_SYSTEM),
    lab: null,
    summary: null,
    graphIds: [],
    skipped,
  };
  if (kind === "lab-report") {
    parsed.lab = labReport(entries, resolve, keyOf, nameOf, skip, meta);
    const reportKey = identifierIn(
      entries.find((e) => e.resource.resourceType === "DiagnosticReport")
        ?.resource ?? {},
      LAB_REPORT_SYSTEM,
    );
    if (reportKey) graphIds.add(reportKey);
  } else {
    parsed.summary = patientSummary(composition, resolve, keyOf, skip);
  }
  parsed.graphIds = [...graphIds];
  return parsed;
}

function labReport(
  entries: Entry[],
  resolve: (ref: unknown) => Entry | null,
  keyOf: (e: Entry) => string,
  nameOf: (ref: unknown) => string | null,
  skip: (e: Entry, reason: string) => void,
  meta: DocumentMeta,
): LabReportInput {
  const reports = entries.filter(
    (e) => e.resource.resourceType === "DiagnosticReport",
  );
  if (reports.length !== 1) {
    throw new DocumentRefusedError(
      "a laboratory report document holds exactly one DiagnosticReport",
      422,
    );
  }
  const dr = reports[0];
  const r = dr.resource;
  const reportEffective =
    str(r.effectiveDateTime) ?? str(obj(r.effectivePeriod).start);
  const reportPerformer = nameOf(arr(r.performer)[0]);
  const results: LabResultRow[] = [];
  const seen = new Set<string>();

  const take = (e: Entry) => {
    if (seen.has(e.fullUrl)) return;
    seen.add(e.fullUrl);
    const o = e.resource;
    if (o.resourceType !== "Observation") {
      return skip(e, "a result that is not an Observation");
    }
    const members = arr(o.hasMember)
      .map(resolve)
      .filter((m): m is Entry => !!m);
    if (!o.valueQuantity && members.length) {
      members.forEach(take);
      return;
    }
    const loinc = coding(o.code, LOINC);
    if (!loinc || loinc.system !== LOINC) return skip(e, "no LOINC code");
    const q = obj(o.valueQuantity);
    const value = num(q.value);
    if (value === null) {
      return skip(
        e,
        "not a number with a unit; the record holds numeric results only",
      );
    }
    const effective =
      str(o.effectiveDateTime) ??
      str(obj(o.effectivePeriod).start) ??
      reportEffective;
    if (!effective) return skip(e, "no date");
    const unit = str(q.code) ?? str(q.unit) ?? "1";
    const range = obj(arr(o.referenceRange)[0]);
    const ext = (url: string) =>
      arr(o.extension)
        .map(obj)
        .find((x) => x.url === url);
    results.push({
      id: keyOf(e),
      code: String(loinc.code),
      display: textOf(o.code, String(loinc.code)),
      value,
      unit,
      low: num(obj(range.low).value),
      high: num(obj(range.high).value),
      rangeText: str(range.text),
      effective,
      status: str(o.status),
      performer: nameOf(arr(o.performer)[0]) ?? reportPerformer,
      sourceKind:
        str(ext(EXT_SOURCE_KIND)?.valueCode) ??
        str(ext(EXT_SOURCE_KIND)?.valueString),
      sourceLine: str(ext(EXT_SOURCE_LINE)?.valueString),
      sourceRegion: str(ext(EXT_SOURCE_REGION)?.valueString),
    });
  };
  arr(r.result).forEach((ref) => {
    const e = resolve(ref);
    if (e) take(e);
  });
  if (results.length === 0) {
    throw new DocumentRefusedError(
      "the report has no numeric, LOINC-coded result the record can hold",
      422,
    );
  }
  // The paper a Klarbefund report was read from, as the Provenance names it.
  const sourceReport =
    entries
      .filter((e) => e.resource.resourceType === "Provenance")
      .flatMap((e) => arr(e.resource.entity).map(obj))
      .map((en) => obj(obj(en.what).identifier))
      .filter((id) => id.system === KLARBEFUND_REPORT_SYSTEM)
      .map((id) => str(id.value))
      .find(Boolean) ?? null;
  return {
    reportId: identifierIn(r, LAB_REPORT_SYSTEM) ?? keyOf(dr),
    title: str(obj(r.code).text) ?? meta.title,
    effective: reportEffective ?? results[0].effective,
    issued: str(r.issued),
    performer: reportPerformer ?? results[0].performer,
    conclusion: str(r.conclusion),
    sourceReport,
    results,
  };
}

function patientSummary(
  composition: Json,
  resolve: (ref: unknown) => Entry | null,
  keyOf: (e: Entry) => string,
  skip: (e: Entry, reason: string) => void,
): PatientSummaryInput {
  const out: Required<PatientSummaryInput> = {
    conditions: [],
    allergies: [],
    medications: [],
    immunizations: [],
    procedures: [],
  };
  const seen = new Set<string>();
  const sections = (s: unknown): Json[] =>
    arr(s)
      .map(obj)
      .flatMap((x) => [x, ...sections(x.section)]);
  const code = (cc: unknown, prefer: string) => {
    const c = coding(cc, prefer);
    return {
      code: c ? String(c.code) : null,
      system: c ? str(c.system) ?? null : null,
      display: textOf(cc, "Unnamed"),
    };
  };
  const statusCode = (cc: unknown) => str(coding(cc)?.code);

  for (const section of sections(composition.section)) {
    for (const ref of arr(section.entry)) {
      const e = resolve(ref);
      if (!e || seen.has(e.fullUrl)) continue;
      seen.add(e.fullUrl);
      const r = e.resource;
      switch (r.resourceType) {
        case "Condition":
          out.conditions.push({
            id: keyOf(e),
            ...code(r.code, SNOMED),
            clinicalStatus: statusCode(r.clinicalStatus),
            onset: str(r.onsetDateTime) ?? str(obj(r.onsetPeriod).start),
          } satisfies ConditionRow);
          break;
        case "AllergyIntolerance":
          out.allergies.push({
            id: keyOf(e),
            ...code(r.code, SNOMED),
            clinicalStatus: statusCode(r.clinicalStatus),
            verificationStatus: statusCode(r.verificationStatus),
            type: str(r.type),
            category: str(arr(r.category)[0]),
            criticality: str(r.criticality),
            onset: str(r.onsetDateTime) ?? str(obj(r.onsetPeriod).start),
          } satisfies AllergyRow);
          break;
        case "MedicationStatement":
        case "MedicationRequest": {
          const medication =
            r.medicationCodeableConcept ??
            obj(resolve(r.medicationReference)?.resource).code;
          if (!medication) {
            skip(e, "no medication named");
            break;
          }
          const statement = r.resourceType === "MedicationStatement";
          const dosage = obj(
            arr(statement ? r.dosage : r.dosageInstruction)[0],
          );
          out.medications.push({
            id: keyOf(e),
            kind: statement ? "statement" : "request",
            ...code(medication, "http://www.whocc.no/atc"),
            status: str(r.status),
            date: statement
              ? str(obj(r.effectivePeriod).start) ?? str(r.effectiveDateTime)
              : str(r.authoredOn),
            dosage: str(dosage.text),
            reason: statement
              ? str(obj(arr(r.reasonCode)[0]).text) ??
                str(coding(arr(r.reasonCode)[0])?.display)
              : null,
          } satisfies MedicationRow);
          break;
        }
        case "Immunization": {
          const c = coding(r.vaccineCode);
          const occurrence = str(r.occurrenceDateTime);
          if (!c || !occurrence) {
            skip(e, "no coded vaccine or no date");
            break;
          }
          out.immunizations.push({
            id: keyOf(e),
            code: String(c.code),
            system: str(c.system),
            display: textOf(r.vaccineCode, String(c.code)),
            status: str(r.status),
            occurrence,
            lot: str(r.lotNumber),
            performer: str(obj(obj(arr(r.performer)[0]).actor).display),
          } satisfies ImmunizationRow);
          break;
        }
        case "Procedure":
          out.procedures.push({
            id: keyOf(e),
            ...code(r.code, SNOMED),
            status: str(r.status),
            performed:
              str(r.performedDateTime) ?? str(obj(r.performedPeriod).start),
          } satisfies ProcedureRow);
          break;
        default:
          skip(e, `the record does not hold ${String(r.resourceType)} yet`);
      }
    }
  }
  return out;
}
