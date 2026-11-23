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

/** True when any object in the data is a Patient resource. */
export function holdsPatient(data: unknown): boolean {
  if (Array.isArray(data)) return data.some(holdsPatient);
  if (!data || typeof data !== "object") return false;
  const r = data as Record<string, unknown>;
  return r.resourceType === "Patient" || Object.values(r).some(holdsPatient);
}

// Not in the UI's version, for a push (`everywhere`): a Patient's id leaves
// pseudonymised wherever it stands, not only in a reference to a Patient of
// the same answer. A window of a paged dataset refers to a Patient that came
// in an earlier window; the facade writes absolute fullUrls
// (http://host/fhir/Patient/<id>); a link or a message can carry
// Patient/<id> mid-string, or a patient search parameter.
// One pass, so an id is pseudonymised once: `Patient/<id>` anywhere in the
// text (also Patient%2F<id>), or the value of a patient or subject parameter.
const PATIENT_ID =
  /(\bPatient(?:\/|%2F))([^/?#&\s"'<>]+)|([?&](?:patient|subject)(?::[A-Za-z]+)?=)(?!Patient(?:\/|%2F))([^&#\s"'<>]+)/g;
const MENTIONS_PATIENT =
  /\bPatient(?:\/|%2F)|[?&](?:patient|subject)(?::[A-Za-z]+)?=/;

const decoded = (id: string) => {
  try {
    return decodeURIComponent(id);
  } catch {
    return id;
  }
};

function everywhere(text: string, pseudonymOf: (id: string) => string) {
  if (!MENTIONS_PATIENT.test(text)) return text;
  return text.replace(
    PATIENT_ID,
    (_m, path?: string, pathId?: string, param?: string, paramId?: string) =>
      path
        ? `${path}${pseudonymOf(decoded(pathId!))}`
        : `${param}${pseudonymOf(decoded(paramId!))}`,
  );
}

/**
 * True when the data holds a Patient resource or names a Patient anywhere
 * in a string: what push-source must pseudonymise. Anything else leaves as
 * the route made it.
 */
export function mentionsPatient(data: unknown): boolean {
  if (typeof data === "string") return MENTIONS_PATIENT.test(data);
  if (Array.isArray(data)) return data.some(mentionsPatient);
  if (!data || typeof data !== "object") return false;
  const r = data as Record<string, unknown>;
  return r.resourceType === "Patient" || Object.values(r).some(mentionsPatient);
}

/**
 * FHIR data as a role without identity may see it (#475): every Patient
 * resource keeps gender and birth year; name, contact details, address and
 * identifiers go, and its id becomes the hub's pseudonym, in the resource and
 * in every `Patient/<id>` reference that points at it.
 */
export function pseudonymiseFhir(
  data: unknown,
  opts: { everywhere?: boolean } = {},
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

  const pseudonymOf = (id: string) =>
    ids.get(id) ?? patientPseudonym(id).replace("Patient ", "p-");

  const rewrite = (node: unknown): unknown => {
    if (typeof node === "string") {
      if (opts.everywhere) return everywhere(node, pseudonymOf);
      // A relative reference or a fullUrl ending in one.
      const m = /^(.*\bPatient\/)([^/?#]+)$/.exec(node);
      return m && ids.has(m[2]) ? `${m[1]}${ids.get(m[2])}` : node;
    }
    if (Array.isArray(node)) return node.map(rewrite);
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
      Object.entries(r).map(([k, v]) => [k, rewrite(v)]),
    );
  };
  return rewrite(data);
}
