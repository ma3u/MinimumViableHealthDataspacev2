// ---------------------------------------------------------------------------
// A graph node as a FHIR R4 resource (#876)
// ---------------------------------------------------------------------------
//
// The FHIR routes used to answer a node's properties as they are: no `id`
// (seeded nodes carry `resourceId`, loaded ones `fhirId`), `Patient/undefined`
// as the fullUrl, dates as the driver's {year: {low, high}, ...} objects and
// no reference from a record to its patient. A consumer that imports a
// transfer could neither key a resource nor relate one to another. The
// properties stay, so nothing that read them breaks; FHIR's own fields are
// added on top.

type Props = Record<string, unknown>;

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

/** The FHIR id of a node: its FHIR id, its id, or the seed's resourceId. */
export function fhirIdOf(props: Props): string | undefined {
  const id = props.fhirId ?? props.id ?? props.resourceId;
  return id == null ? undefined : String(plain(id));
}

/**
 * The node as a resource of `type`. A record of a patient gets
 * `subject: {reference: "Patient/<id>"}` unless it already has one.
 */
export function toFhirResource(
  type: string,
  props: Props,
  patientId?: string,
): Props {
  const out: Props = { resourceType: type };
  for (const [k, v] of Object.entries(props)) out[k] = plain(v);
  const id = fhirIdOf(props);
  if (id) out.id = id;
  if (type !== "Patient" && patientId && out.subject === undefined) {
    out.subject = { reference: `Patient/${patientId}` };
  }
  return out;
}

/** A bundle entry for the resource, with its fullUrl when it has an id. */
export function toFhirEntry(resource: Props): {
  fullUrl?: string;
  resource: Props;
} {
  return resource.id
    ? { fullUrl: `${resource.resourceType}/${resource.id}`, resource }
    : { resource };
}
