/**
 * The document rules of FHIR R4 (Bundle, `type = document`) that a builder
 * must keep and an import (#1173) checks before anything else: an
 * identifier and a timestamp, the Composition as the first entry, every
 * entry with a fullUrl, every reference inside the Bundle resolvable, and
 * every section holding text, entries or sub-sections (cmp-1) and an
 * emptyReason only when it has no entries (cmp-2).
 *
 * This is not profile validation; the HL7 validator does that
 * (scripts/eehrxf/validate.py, and `$validate` on import). It catches what a
 * document builder or a sender can get wrong in shape. Returns the problems,
 * empty when there are none.
 */

type Json = Record<string, unknown>;
const obj = (v: unknown): Json =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {};

/** Every `reference` string anywhere inside a value. */
function referencesIn(value: unknown, out: string[] = []): string[] {
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

/** The keys an entry is found under: its fullUrl and `Type/id`. */
function keysOf(entry: Json): string[] {
  const r = obj(entry.resource);
  const keys: string[] = [];
  if (typeof entry.fullUrl === "string") keys.push(entry.fullUrl);
  if (typeof r.resourceType === "string" && typeof r.id === "string") {
    keys.push(`${r.resourceType}/${r.id}`);
  }
  return keys;
}

function entriesOf(bundle: unknown): Json[] {
  const b = obj(bundle);
  return Array.isArray(b.entry) ? b.entry.map(obj) : [];
}

function indexOf(entries: Json[]): Map<string, Json> {
  const byKey = new Map<string, Json>();
  for (const e of entries) {
    for (const key of keysOf(e)) byKey.set(key, obj(e.resource));
  }
  return byKey;
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
  const entries = entriesOf(bundle);
  if (entries.length === 0) return [...problems, "the Bundle has no entries"];
  const composition = obj(entries[0].resource);
  if (composition.resourceType !== "Composition") {
    problems.push("the first entry is not a Composition");
  }

  entries.forEach((e, i) => {
    if (typeof e.fullUrl !== "string") {
      problems.push(`entry[${i}] has no fullUrl`);
    }
  });
  const byKey = indexOf(entries);
  entries.forEach((e, i) => {
    // A local reference (#id) names a resource contained in this entry, as a
    // prescription's Medication is; it never needs an entry of its own.
    const contained = new Set(
      (Array.isArray(obj(e.resource).contained)
        ? (obj(e.resource).contained as unknown[])
        : []
      ).map((c) => `#${String(obj(c).id)}`),
    );
    for (const ref of referencesIn(e.resource)) {
      if (ref.startsWith("#") ? !contained.has(ref) : !byKey.has(ref)) {
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
    const title = typeof s.title === "string" ? s.title : "untitled";
    const has = (k: string) =>
      Array.isArray(s[k]) ? (s[k] as unknown[]).length > 0 : !!s[k];
    if (!has("text") && !has("entry") && !has("section")) {
      problems.push(`section "${title}" has no text, entries or sections`);
    }
    if (has("entry") && s.emptyReason) {
      problems.push(`section "${title}" has entries and an emptyReason`);
    }
  }
  return problems;
}

/**
 * Entries no reference leads to from the Composition, a Provenance aside
 * (it points at the others). FHIR only warns about these; the hub's own
 * documents have none, and its tests hold it to that.
 */
export function unreachableEntries(bundle: unknown): string[] {
  const entries = entriesOf(bundle);
  if (entries.length === 0) return [];
  const byKey = indexOf(entries);
  const composition = obj(entries[0].resource);
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
  return entries
    .map((e, i) => ({ r: obj(e.resource), i }))
    .filter(({ r }) => !reached.has(r) && r.resourceType !== "Provenance")
    .map(({ r, i }) => `entry[${i}] (${String(r.resourceType)})`);
}
