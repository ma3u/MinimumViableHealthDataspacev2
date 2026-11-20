import { FhirError, type OperationOutcome } from "./fhir-outcome.js";

// ---------------------------------------------------------------------------
// FHIR R4 search on the facade (#1174): the parameters a route declares, and
// nothing else, with the spec's meaning (https://hl7.org/fhir/R4/search.html).
// ---------------------------------------------------------------------------
//
// What a parameter means here:
//
// - token (`code`, `gender`): `[system]|[code]`, `|[code]` (no system),
//   `[system]|` (any code of the system) or `[code]` (any system). Codes are
//   matched exactly.
// - date (`date`): an optional prefix (eq, ne, gt, lt, ge, le, sa, eb; `ap`
//   is refused) and a FHIR date or dateTime. Both the value searched for and
//   the resource's date are ranges at their precision (2023-06 is all of June
//   2023), compared as R4 section 3.1.1.4.2 says. A value without a time zone
//   is read as UTC.
// - reference (`patient`): `<id>`, `Patient/<id>` or an absolute URL ending
//   in `Patient/<id>`.
// - string (`name`): case-insensitive, starts with, on any part of the name.
//
// A comma inside one value is OR, a repeated parameter is AND.
//
// Unknown parameters, and known ones with a modifier this facade does not
// support (`code:text`), follow R4 section 3.1.1.5: by default they are not
// applied, left out of the Bundle's `self` link and named in an
// OperationOutcome entry (`search.mode: outcome`); with
// `Prefer: handling=strict` the search is refused with 400. They are never
// ignored silently.

export type SearchParamType = "token" | "date" | "reference" | "string";

export interface SearchParamDef {
  name: string;
  type: SearchParamType;
  documentation: string;
}

/** Search result parameters every search takes (not SearchParameters). */
export const RESULT_PARAMS = ["_count", "_offset"] as const;

export interface ParsedSearch {
  /** Applied parameters, in the order they came, each with its raw values. */
  params: Array<{ name: string; value: string }>;
  /** Names (with modifiers) that were not applied. */
  ignored: string[];
  count: number;
  offset: number;
}

export interface PagingLimits {
  defaultCount: number;
  maxCount: number;
}

function nonNegativeInt(name: string, raw: string): number {
  if (!/^\d+$/.test(raw)) {
    throw new FhirError(
      400,
      "value",
      `${name} must be a non-negative integer, got "${raw}"`,
    );
  }
  return Number(raw);
}

/**
 * Reads a request's query against the declared parameters. Throws a
 * FhirError for a value that cannot be read, and, under strict handling, for
 * a parameter that is not supported.
 */
export function parseSearch(
  query: Record<string, unknown>,
  defs: readonly SearchParamDef[],
  limits: PagingLimits,
  strict = false,
): ParsedSearch {
  const known = new Set(defs.map((d) => d.name));
  const params: ParsedSearch["params"] = [];
  const ignored: string[] = [];
  let count = limits.defaultCount;
  let offset = 0;

  for (const [name, raw] of Object.entries(query)) {
    const values = (Array.isArray(raw) ? raw : [raw]).filter(
      (v): v is string => typeof v === "string",
    );
    if (name === "_count" || name === "_offset") {
      const v = values[values.length - 1];
      if (v === undefined || v === "") continue;
      const n = nonNegativeInt(name, v);
      if (name === "_count") count = Math.min(n, limits.maxCount);
      else offset = n;
      continue;
    }
    if (!known.has(name)) {
      if (strict) {
        throw new FhirError(
          400,
          "not-supported",
          `Search parameter "${name}" is not supported here`,
        );
      }
      ignored.push(name);
      continue;
    }
    // R4 3.1.1.5: an empty value is ignored.
    for (const value of values) if (value !== "") params.push({ name, value });
  }
  return { params, ignored, count, offset };
}

/** The values of one applied parameter, each the raw value of one occurrence. */
export function valuesOf(search: ParsedSearch, name: string): string[] {
  return search.params.filter((p) => p.name === name).map((p) => p.value);
}

/** Splits on an unescaped separator and removes the escapes (R4 3.1.1.6). */
export function splitEscaped(value: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch === "\\" && i + 1 < value.length) {
      cur += value[++i];
    } else if (ch === sep) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

/** Splits an unescaped `|` without removing escapes, for one OR alternative. */
function splitPipe(value: string): string[] | null {
  for (let i = 0; i < value.length; i++) {
    if (value[i] === "\\") {
      i++;
    } else if (value[i] === "|") {
      return [value.slice(0, i), value.slice(i + 1)];
    }
  }
  return null;
}

const unescape = (s: string) => s.replace(/\\(.)/g, "$1");

/** The alternatives of a value, split on unescaped commas, escapes kept. */
function alternatives(value: string): string[] {
  const out: string[] = [];
  let start = 0;
  for (let i = 0; i < value.length; i++) {
    if (value[i] === "\\") i++;
    else if (value[i] === ",") {
      out.push(value.slice(start, i));
      start = i + 1;
    }
  }
  out.push(value.slice(start));
  return out;
}

// ---- token ----------------------------------------------------------------

export interface Token {
  /** undefined: any system; null: no system (`|code`). */
  system: string | null | undefined;
  /** undefined: any code of the system (`system|`). */
  code: string | undefined;
}

export function parseToken(alternative: string): Token {
  const parts = splitPipe(alternative);
  if (!parts) return { system: undefined, code: unescape(alternative) };
  const [system, code] = parts.map(unescape);
  if (system === "" && code === "") {
    throw new FhirError(400, "value", `"|" is not a token`);
  }
  return {
    system: system === "" ? null : system,
    code: code === "" ? undefined : code,
  };
}

// The Cypher text of every condition below is fixed: what a caller sends
// reaches the query as parameters only, as lists of alternatives per
// occurrence, so nothing a caller sends shapes the query (semgrep
// cypher-built-from-request-input). An absent parameter is an empty list,
// and all() over an empty list is true.

/** A token value as a parameter: `anySystem` for `code`, `system: null` for `|code`. */
export interface TokenParam {
  code: string | null;
  system: string | null;
  anySystem: boolean;
}

/** One parameter's token values: an occurrence per entry, its alternatives inside. */
export function tokenParam(values: string[]): TokenParam[][] {
  return values.map((value) =>
    alternatives(value).map((alt) => {
      const t = parseToken(alt);
      return {
        code: t.code ?? null,
        system: t.system ?? null,
        anySystem: t.system === undefined,
      };
    }),
  );
}

/**
 * Cypher that is true when the code and system expressions match the token
 * parameter `$param` (from tokenParam): every occurrence, any alternative.
 */
export function tokenMatch(
  param: string,
  codeExpr: string,
  systemExpr: string,
): string {
  return (
    `all(g IN $${param} WHERE any(t IN g WHERE` +
    ` (t.code IS NULL OR ${codeExpr} = t.code) AND` +
    ` (t.anySystem OR (t.system IS NULL AND ${systemExpr} IS NULL) OR ${systemExpr} = t.system)))`
  );
}

// ---- date -----------------------------------------------------------------

export const DATE_PREFIXES = [
  "eq",
  "ne",
  "gt",
  "lt",
  "ge",
  "le",
  "sa",
  "eb",
] as const;
export type DatePrefix = (typeof DATE_PREFIXES)[number];

const FHIR_DATE =
  /^(\d{4})(?:-(\d{2})(?:-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})?)?)?)?$/;

/** A date search value: its prefix and its range [lo, hi) in epoch ms. */
export interface DateRange {
  prefix: DatePrefix;
  lo: number;
  hi: number;
}

export function parseDate(alternative: string): DateRange {
  let prefix: DatePrefix = "eq";
  let rest = alternative;
  const p = /^([a-z]{2})(?=\d)/.exec(alternative);
  if (p) {
    if (p[1] === "ap") {
      throw new FhirError(
        400,
        "not-supported",
        `The date prefix "ap" is not supported here`,
      );
    }
    if (!(DATE_PREFIXES as readonly string[]).includes(p[1])) {
      throw new FhirError(400, "value", `Unknown date prefix "${p[1]}"`);
    }
    prefix = p[1] as DatePrefix;
    rest = alternative.slice(2);
  }
  const m = FHIR_DATE.exec(rest);
  if (!m) {
    throw new FhirError(400, "value", `"${rest}" is not a FHIR date`);
  }
  const [, y, mo, d, h, mi, s, frac, tz] = m;
  const year = Number(y);
  const month = mo ? Number(mo) - 1 : 0;
  const day = d ? Number(d) : 1;
  const hour = h ? Number(h) : 0;
  const minute = mi ? Number(mi) : 0;
  const second = s ? Number(s) : 0;
  const ms = frac ? Math.floor(Number(`0${frac}`) * 1000) : 0;
  const local = Date.UTC(year, month, day, hour, minute, second, ms);
  const check = new Date(local);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month ||
    check.getUTCDate() !== day ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    throw new FhirError(400, "value", `"${rest}" is not a valid date`);
  }
  let offsetMs = 0;
  if (tz && tz !== "Z") {
    const sign = tz[0] === "-" ? -1 : 1;
    offsetMs = sign * (Number(tz.slice(1, 3)) * 60 + Number(tz.slice(4))) * 6e4;
  }
  const lo = local - offsetMs;
  let hi: number;
  if (!mo) hi = Date.UTC(year + 1, 0, 1);
  else if (!d) hi = Date.UTC(year, month + 1, 1);
  else if (!h) hi = Date.UTC(year, month, day + 1);
  else if (!s) hi = lo + 60_000;
  else if (!frac) hi = lo + 1000;
  else hi = lo + 1;
  return { prefix, lo, hi };
}

/**
 * What each prefix means for a resource range [RLO, RHI) against a search
 * range [d.lo, d.hi), as R4 3.1.1.4.2 defines it. dateMatch builds its
 * Cypher from this table, and the unit test evaluates the same table.
 */
export const DATE_RULES: Record<DatePrefix, string> = {
  eq: "RLO >= d.lo AND RHI <= d.hi",
  ne: "NOT (RLO >= d.lo AND RHI <= d.hi)",
  gt: "RHI > d.hi",
  lt: "RLO < d.lo",
  ge: "RHI > d.hi OR (RLO >= d.lo AND RHI <= d.hi)",
  le: "RLO < d.lo OR (RLO >= d.lo AND RHI <= d.hi)",
  sa: "RLO >= d.hi",
  eb: "RHI <= d.lo",
};

/** One parameter's date values: an occurrence per entry, its alternatives inside. */
export function dateParam(values: string[]): DateRange[][] {
  return values.map((value) =>
    alternatives(value).map((alt) => parseDate(unescape(alt))),
  );
}

/**
 * Cypher that is true when the resource range [loExpr, hiExpr) (from
 * dateRangeCypher) matches the date parameter `$param` (from dateParam).
 */
export function dateMatch(
  param: string,
  loExpr: string,
  hiExpr: string,
): string {
  const cases = DATE_PREFIXES.map(
    (prefix) =>
      `WHEN '${prefix}' THEN ${DATE_RULES[prefix]
        .replaceAll("RLO", loExpr)
        .replaceAll("RHI", hiExpr)}`,
  ).join(" ");
  return `all(g IN $${param} WHERE any(d IN g WHERE CASE d.prefix ${cases} END))`;
}

/** What Neo4j's datetime() reads safely: the FHIR date and dateTime forms. */
export const GRAPH_DATE_PATTERN =
  "\\d{4}(-\\d{2}(-\\d{2}(T\\d{2}:\\d{2}(:\\d{2}(\\.\\d+)?)?(Z|[+-]\\d{2}:\\d{2})?)?)?)?";

/**
 * Cypher that turns the string `strExpr` (bound as `str`) into the range
 * `<as>Lo`, `<as>Hi` in epoch ms at its precision, for dateMatch. A
 * value that is not a FHIR date gets no range and so matches no date search.
 * `carry` are the variables to keep.
 */
export function dateRangeCypher(
  strExpr: string,
  as: string,
  carry: string[],
): string {
  const keep = carry.join(", ");
  return [
    `WITH ${keep}, ${strExpr} AS ${as}Str`,
    `WITH ${keep}, ${as}Str, CASE WHEN ${as}Str =~ $graphDatePattern THEN datetime(${as}Str) END AS ${as}Start`,
    `WITH ${keep}, ${as}Start.epochMillis AS ${as}Lo, (CASE`,
    `  WHEN size(${as}Str) = 4 THEN ${as}Start + duration({years: 1})`,
    `  WHEN size(${as}Str) = 7 THEN ${as}Start + duration({months: 1})`,
    `  WHEN size(${as}Str) = 10 THEN ${as}Start + duration({days: 1})`,
    `  WHEN ${as}Str CONTAINS '.' THEN ${as}Start + duration({milliseconds: 1})`,
    `  WHEN size(${as}Str) IN [16, 17, 22] THEN ${as}Start + duration({minutes: 1})`,
    `  ELSE ${as}Start + duration({seconds: 1}) END).epochMillis AS ${as}Hi`,
  ].join("\n");
}

// ---- reference ------------------------------------------------------------

/** The ids a `patient` reference value names; 400 for another type. */
export function referenceIds(values: string[], type: string): string[][] {
  return values.map((value) =>
    alternatives(value).map((alt) => {
      const v = unescape(alt);
      const m = /(?:^|\/)([A-Za-z]+)\/([^/]+)$/.exec(v);
      if (m) {
        if (m[1] !== type) {
          throw new FhirError(
            400,
            "value",
            `A ${type} reference was expected, got "${v}"`,
          );
        }
        return m[2];
      }
      if (v.includes("/")) {
        throw new FhirError(400, "value", `"${v}" is not a reference`);
      }
      return v;
    }),
  );
}

// ---- string ---------------------------------------------------------------

/** The values of a string parameter, lower-cased for a starts-with match. */
export function stringValues(values: string[]): string[][] {
  return values.map((value) =>
    alternatives(value).map((alt) => unescape(alt).toLowerCase()),
  );
}

// ---- Bundle ---------------------------------------------------------------

/** The query string of a page: the applied parameters and the paging. */
export function pageQuery(
  search: ParsedSearch,
  count: number,
  offset: number,
): string {
  const q = new URLSearchParams();
  for (const p of search.params) q.append(p.name, p.value);
  q.set("_count", String(count));
  if (offset > 0) q.set("_offset", String(offset));
  return q.toString();
}

/** The warning entry that names what a search did not apply. */
export function ignoredOutcome(ignored: string[]): {
  resource: OperationOutcome;
  search: { mode: "outcome" };
} | null {
  if (ignored.length === 0) return null;
  return {
    resource: {
      resourceType: "OperationOutcome",
      issue: ignored.map((name) => ({
        severity: "warning" as const,
        code: "not-supported" as const,
        diagnostics: `Search parameter "${name}" is not supported here and was not applied`,
      })),
    },
    search: { mode: "outcome" },
  };
}
