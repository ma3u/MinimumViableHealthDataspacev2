/**
 * The document rules of FHIR R4 (Bundle, `type = document`) that a builder
 * must keep and an import (#1173) checks before anything else: an
 * identifier and a timestamp, the Composition as the first entry, every
 * entry with a fullUrl, every reference inside the Bundle resolvable, and
 * every entry reachable from the Composition except a Provenance, which
 * points at the others rather than the other way round.
 *
 * This is not profile validation; the HL7 validator does that
 * (scripts/eehrxf/validate.py). It catches what a document builder or a
 * sender can get wrong in shape. Returns the problems, empty when there are
 * none.
 */

type Json = Record<string, unknown>;
const obj = (v: unknown): Json =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {};

/** Every `reference` string anywhere inside a value. */
export function referencesIn(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) {
    value.forEach((v) => referencesIn(v, out));
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Json)) {
      if (k === "reference" && typeof v === "string") out.push(v);
      else referencesIn(v, out);
    }
  }
  return out;
}

/** The key an entry is found under: its fullUrl and `Type/id`. */
function keysOf(entry: Json): string[] {
  const r = obj(entry.resource);
  const keys: string[] = [];
  if (typeof entry.fullUrl === "string") keys.push(entry.fullUrl);
  if (typeof r.resourceType === "string" && typeof r.id === "string") {
    keys.push(`${r.resourceType}/${r.id}`);
  }
  return keys;
}

export function documentProblems(bundle: unknown): string[] {
  const b = obj(bundle);
  const problems: string[] = [];
  if (b.resourceType !== "Bundle") return ["not a FHIR Bundle"];
  if (b.type !== "document") {
    problems.push(`Bundle.type is ${String(b.type)}, not document`);
  }
  const identifier = obj(b.identifier);
  if (!identifier.system || !identifier.value) {
    problems.push("Bundle.identifier needs a system and a value");
  }
  if (typeof b.timestamp !== "string") {
    problems.push("Bundle.timestamp is missing");
  }
  const entries = Array.isArray(b.entry) ? b.entry.map(obj) : [];
  if (entries.length === 0) return [...problems, "the Bundle has no entries"];
  const composition = obj(entries[0].resource);
  if (composition.resourceType !== "Composition") {
    problems.push("the first entry is not a Composition");
  }

  const byKey = new Map<string, Json>();
  entries.forEach((e, i) => {
    if (typeof e.fullUrl !== "string") {
      problems.push(`entry[${i}] has no fullUrl`);
    }
    for (const key of keysOf(e)) byKey.set(key, obj(e.resource));
  });

  entries.forEach((e, i) => {
    for (const ref of referencesIn(e.resource)) {
      if (!byKey.has(ref)) {
        problems.push(
          `entry[${i}] refers to ${ref}, which is not in the Bundle`,
        );
      }
    }
  });

  const sections = (s: unknown): Json[] =>
    (Array.isArray(s) ? s.map(obj) : []).flatMap((x) => [
      x,
      ...sections(x.section),
    ]);
  for (const s of sections(composition.section)) {
    const hasEntries = Array.isArray(s.entry) && s.entry.length > 0;
    if (!hasEntries && !s.emptyReason) {
      const title = typeof s.title === "string" ? s.title : "untitled";
      problems.push(
        `section "${title}" has neither entries nor an emptyReason`,
      );
    }
  }

  // Reachable from the Composition by following references forwards.
  const reached = new Set<Json>([composition]);
  const queue: Json[] = [composition];
  while (queue.length) {
    for (const ref of referencesIn(queue.shift())) {
      const target = byKey.get(ref);
      if (target && !reached.has(target)) {
        reached.add(target);
        queue.push(target);
      }
    }
  }
  entries.forEach((e, i) => {
    const r = obj(e.resource);
    if (!reached.has(r) && r.resourceType !== "Provenance") {
      problems.push(
        `entry[${i}] (${String(
          r.resourceType,
        )}) is not reachable from the Composition`,
      );
    }
  });
  return problems;
}
