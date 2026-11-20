/**
 * The FHIR facade's search semantics (#1174): token, date, reference and
 * string values read as R4 section 3.1.1 reads them, and the parameters a
 * route does not declare never ignored silently.
 */
import { describe, it, expect } from "vitest";
import { FhirError } from "../src/fhir-outcome.js";
import {
  DATE_RULES,
  dateMatch,
  dateParam,
  parseDate,
  parseSearch,
  parseToken,
  referenceIds,
  splitEscaped,
  tokenMatch,
  tokenParam,
  type SearchParamDef,
} from "../src/fhir-search.js";

const DEFS: SearchParamDef[] = [
  { name: "code", type: "token", documentation: "" },
  { name: "date", type: "date", documentation: "" },
];
const LIMITS = { defaultCount: 200, maxCount: 2000 };
const utc = (s: string) => Date.parse(s);

describe("parseSearch", () => {
  it("applies the declared parameters and names the others", () => {
    const s = parseSearch(
      { code: ["a", "b"], date: "2024", foo: "1", "code:text": "x" },
      DEFS,
      LIMITS,
    );
    expect(s.params).toEqual([
      { name: "code", value: "a" },
      { name: "code", value: "b" },
      { name: "date", value: "2024" },
    ]);
    expect(s.ignored).toEqual(["foo", "code:text"]);
    expect([s.count, s.offset]).toEqual([200, 0]);
  });

  it("refuses an undeclared parameter under strict handling", () => {
    expect(() => parseSearch({ foo: "1" }, DEFS, LIMITS, true)).toThrow(
      FhirError,
    );
  });

  it("ignores an empty value (R4 3.1.1.5)", () => {
    expect(parseSearch({ code: "" }, DEFS, LIMITS).params).toEqual([]);
  });

  it("reads _count and _offset, capping _count at the route's maximum", () => {
    const s = parseSearch({ _count: "5000", _offset: "40" }, DEFS, LIMITS);
    expect([s.count, s.offset]).toEqual([2000, 40]);
  });

  it.each(["-1", "abc", "1.5"])("refuses _count=%s with 400", (v) => {
    try {
      parseSearch({ _count: v }, DEFS, LIMITS);
      expect.unreachable();
    } catch (err) {
      expect((err as FhirError).status).toBe(400);
      expect((err as FhirError).code).toBe("value");
    }
  });
});

describe("token", () => {
  it.each([
    ["4548-4", { system: undefined, code: "4548-4" }],
    ["http://loinc.org|4548-4", { system: "http://loinc.org", code: "4548-4" }],
    ["|4548-4", { system: null, code: "4548-4" }],
    ["http://loinc.org|", { system: "http://loinc.org", code: undefined }],
    ["a\\|b", { system: undefined, code: "a|b" }],
  ])("%s", (value, expected) => {
    expect(parseToken(value)).toEqual(expected);
  });

  it("passes each occurrence as a list of its alternatives", () => {
    expect(tokenParam(["http://loinc.org|1,2", "|3"])).toEqual([
      [
        { code: "1", system: "http://loinc.org", anySystem: false },
        { code: "2", system: null, anySystem: true },
      ],
      [{ code: "3", system: null, anySystem: false }],
    ]);
  });

  it("matches every occurrence and any alternative, in fixed Cypher", () => {
    expect(tokenMatch("code", "o.code", "sys")).toBe(
      "all(g IN $code WHERE any(t IN g WHERE (t.code IS NULL OR o.code = t.code) AND (t.anySystem OR (t.system IS NULL AND sys IS NULL) OR sys = t.system)))",
    );
  });

  it("splits on unescaped separators only", () => {
    expect(splitEscaped("a\\,b,c", ",")).toEqual(["a,b", "c"]);
  });
});

describe("date", () => {
  it.each([
    ["2023", "2023-01-01T00:00:00Z", "2024-01-01T00:00:00Z"],
    ["2023-06", "2023-06-01T00:00:00Z", "2023-07-01T00:00:00Z"],
    ["2023-12-31", "2023-12-31T00:00:00Z", "2024-01-01T00:00:00Z"],
    ["2023-06-15T10:15", "2023-06-15T10:15:00Z", "2023-06-15T10:16:00Z"],
    ["2023-06-15T10:15:00Z", "2023-06-15T10:15:00Z", "2023-06-15T10:15:01Z"],
    [
      "2023-06-15T12:15:00+02:00",
      "2023-06-15T10:15:00Z",
      "2023-06-15T10:15:01Z",
    ],
  ])("%s is the range at its precision", (value, lo, hi) => {
    expect(parseDate(value)).toEqual({
      prefix: "eq",
      lo: utc(lo),
      hi: utc(hi),
    });
  });

  it.each(["2023-13", "2023-02-30", "23-06", "2023-06-15T25:00", "yesterday"])(
    "refuses %s with 400",
    (value) => {
      expect(() => parseDate(value)).toThrow(FhirError);
    },
  );

  it("refuses the ap prefix as not supported", () => {
    try {
      parseDate("ap2023");
      expect.unreachable();
    } catch (err) {
      expect((err as FhirError).code).toBe("not-supported");
    }
  });

  it("builds its Cypher CASE from the rule table", () => {
    const cypher = dateMatch("date", "effLo", "effHi");
    expect(cypher).toMatch(
      /^all\(g IN \$date WHERE any\(d IN g WHERE CASE d\.prefix /,
    );
    for (const [prefix, rule] of Object.entries(DATE_RULES)) {
      const expr = rule.replaceAll("RLO", "effLo").replaceAll("RHI", "effHi");
      expect(cypher).toContain(`WHEN '${prefix}' THEN ${expr}`);
    }
  });

  /**
   * Evaluates the rule each alternative's prefix selects for a resource
   * range [lo, hi), so the prefixes are checked for what they mean, not how
   * they are spelled.
   */
  function matches(search: string, resource: [string, string]): boolean {
    return dateParam([search])[0].some((d) => {
      const js = DATE_RULES[d.prefix]
        .replaceAll("d.lo", String(d.lo))
        .replaceAll("d.hi", String(d.hi))
        .replaceAll("RLO", String(utc(resource[0])))
        .replaceAll("RHI", String(utc(resource[1])))
        .replace(/\bAND\b/g, "&&")
        .replace(/\bOR\b/g, "||")
        .replace(/\bNOT\b/g, "!");
      return Function(`return (${js});`)() as boolean;
    });
  }

  // The resource: 2023-06-15, a day.
  const day: [string, string] = [
    "2023-06-15T00:00:00Z",
    "2023-06-16T00:00:00Z",
  ];
  it.each([
    ["2023-06", true],
    ["eq2023-06-15", true],
    ["eq2023-06-15T10:00", false],
    ["ne2023-06", false],
    ["ne2024", true],
    ["gt2023-06-14", true],
    ["gt2023-06-15", false],
    ["ge2023-06-15", true],
    ["lt2023-06-16", true],
    ["lt2023-06-15", false],
    ["le2023-06-15", true],
    ["le2023-06-14", false],
    ["sa2023-06-14", true],
    ["sa2023-06-15", false],
    ["eb2023-06-16", true],
    ["eb2023-06-15", false],
    ["2022,2023", true],
  ])("a resource dated 2023-06-15 matches %s: %s", (search, expected) => {
    expect(matches(search, day)).toBe(expected);
  });
});

describe("reference", () => {
  it("reads an id, a relative and an absolute reference", () => {
    expect(
      referenceIds(["P1,Patient/P2", "http://x/fhir/Patient/P3"], "Patient"),
    ).toEqual([["P1", "P2"], ["P3"]]);
  });

  it("refuses a reference to another type", () => {
    expect(() => referenceIds(["Group/1"], "Patient")).toThrow(FhirError);
  });
});
