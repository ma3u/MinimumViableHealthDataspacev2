import { createHmac } from "node:crypto";

// ---------------------------------------------------------------------------
// FHIR data as secondary use sees it (#475, ADR-095)
// ---------------------------------------------------------------------------
//
// A pull is pseudonymised by the hub's UI before a data user sees it
// (ui/src/lib/transfer-data.ts, pseudonymiseFhir). A push does not pass
// through the UI: the provider's data plane reads /dataspace/push-source and
// delivers into an SPE, which is secondary use whoever the consumer is. So
// the holder's side, this proxy, pseudonymises what push-source answers.
// This is a port of the UI's functions, kept the same on purpose:
// patientPseudonym and birthYear from ui/src/lib/patient-identity.ts,
// pseudonymiseFhir from ui/src/lib/transfer-data.ts.
//
// The key must equal the UI's (its PATIENT_PSEUDONYM_KEY, or the
// NEXTAUTH_SECRET it falls back to): the pseudonym is an HMAC of the record
// id, and only the same key gives the same record the same pseudonym on a
// pull through the UI and on a push, so a researcher can join the two.

/** The UI's own fallback outside production, so local pulls and pushes agree. */
const LOCAL_KEY = "local-development-only";

/**
 * The pseudonym key, or null when this proxy must not pseudonymise at all:
 * in production without PATIENT_PSEUDONYM_KEY the caller answers 503 rather
 * than serve identity or pseudonyms nobody else can reproduce. Read per call.
 */
export function pseudonymKey(): string | null {
  const key = process.env.PATIENT_PSEUDONYM_KEY;
  if (key) return key;
  return process.env.NODE_ENV === "production" ? null : LOCAL_KEY;
}

function requireKey(): string {
  const key = pseudonymKey();
  if (!key) throw new Error("no pseudonym key configured");
  return key;
}

/**
 * A stable label for one patient, the same every time for the same record,
 * and the same as the UI gives it.
 */
export function patientPseudonym(recordKey: string): string {
  const tag = createHmac("sha256", requireKey())
    .update(`patient-display:${recordKey}`)
    .digest("hex")
    .slice(0, 8);
  return `Patient ${tag}`;
}

/** `1965-04-12` to `1965`; anything else to null. */
export function birthYear(birthDate: unknown): string | null {
  const text =
    typeof birthDate === "string"
      ? birthDate
      : birthDate && typeof birthDate === "object" && "year" in birthDate
        ? String((birthDate as { year: unknown }).year)
        : "";
  const m = /^(\d{4})/.exec(text);
  return m ? m[1] : null;
}

/** A `reference` (or a fullUrl) that points at a Patient. */
const PATIENT_REFERENCE = /\bPatient\/[^/?#]+$/;

/**
 * True when the data holds a Patient resource or a reference to one: what
 * push-source must pseudonymise, even in a window without the Patient.
 */
export function holdsPatientOrReference(data: unknown): boolean {
  if (Array.isArray(data)) return data.some(holdsPatientOrReference);
  if (!data || typeof data !== "object") return false;
  const r = data as Record<string, unknown>;
  if (r.resourceType === "Patient") return true;
  return Object.entries(r).some(([k, v]) =>
    (k === "reference" || k === "fullUrl") && typeof v === "string"
      ? PATIENT_REFERENCE.test(v)
      : holdsPatientOrReference(v),
  );
}

/** True when any object in the data is a Patient resource. */
export function holdsPatient(data: unknown): boolean {
  if (Array.isArray(data)) return data.some(holdsPatient);
  if (!data || typeof data !== "object") return false;
  const r = data as Record<string, unknown>;
  return r.resourceType === "Patient" || Object.values(r).some(holdsPatient);
}

/**
 * FHIR data as a role without identity may see it (#475): every Patient
 * resource keeps gender and birth year; name, contact details, address and
 * identifiers go, and its id becomes the hub's pseudonym, in the resource and
 * in every `Patient/<id>` reference that points at it.
 */
export function pseudonymiseFhir(
  data: unknown,
  opts: { absentPatients?: boolean } = {},
): unknown {
  const ids = new Map<string, string>();
  // The proxy answered graph properties before it gave FHIR ids
  // (fhir-resource.ts): a seeded patient is known by its resourceId, a
  // loaded one by its fhirId.
  const idOf = (r: Record<string, unknown>) => {
    const id = r.id ?? r.fhirId ?? r.resourceId;
    return typeof id === "string" ? id : undefined;
  };
  const collect = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(collect);
    if (!node || typeof node !== "object") return;
    const r = node as Record<string, unknown>;
    const own = idOf(r);
    if (r.resourceType === "Patient" && own) {
      ids.set(own, patientPseudonym(own).replace("Patient ", "p-"));
    }
    Object.values(r).forEach(collect);
  };
  collect(data);

  const rewrite = (node: unknown, key?: string): unknown => {
    if (typeof node === "string") {
      // A relative reference or a fullUrl ending in one.
      const m = /^(.*\bPatient\/)([^/?#]+)$/.exec(node);
      if (m && ids.has(m[2])) return `${m[1]}${ids.get(m[2])}`;
      // Not in the UI's version: a window of a paged dataset refers to a
      // Patient that came in an earlier window, and its id would leave as it
      // is. Only `reference` and `fullUrl` values, the same pseudonym.
      if (
        m &&
        opts.absentPatients &&
        (key === "reference" || key === "fullUrl")
      )
        return `${m[1]}${patientPseudonym(m[2]).replace("Patient ", "p-")}`;
      return node;
    }
    if (Array.isArray(node)) return node.map((v) => rewrite(v, key));
    if (!node || typeof node !== "object") return node;
    const r = node as Record<string, unknown>;
    if (r.resourceType === "Patient") {
      const out: Record<string, unknown> = { resourceType: "Patient" };
      const own = idOf(r);
      if (own) out.id = ids.get(own) ?? own;
      if (r.gender !== undefined) out.gender = r.gender;
      const year = birthYear(r.birthDate);
      if (year) out.birthDate = year;
      return out;
    }
    return Object.fromEntries(
      Object.entries(r).map(([k, v]) => [k, rewrite(v, k)]),
    );
  };
  return rewrite(data);
}
