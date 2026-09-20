/**
 * Line parser for German lab reports.
 *
 * Works on plain text, whether that text came from a PDF's own text layer or
 * from OCR, the parser never learns which, so it cannot be tempted to treat a
 * recognised digit as more certain than it is. Provenance is attached later.
 *
 * The shape it recognises is the one every German lab sheet prints:
 *
 *     Analyt            Wert   Einheit   Referenzbereich
 *     LDL-Cholesterin    141   mg/dl     < 116
 *     Kreatinin         0,92   mg/dl     0,70 - 1,20
 *     Ferritin           <10   µg/l      30 - 400
 */
import type { Comparator, RawLabValue } from "./types.js";
import { normaliseUnit } from "./analytes.js";

/**
 * Parses a German-formatted number.
 *
 * German convention rules here because the input is a German lab sheet:
 * `,` is the decimal separator and `.` groups thousands. The one concession to
 * English-formatted digital reports is that a lone `.` followed by one or two
 * digits (`0.92`) is read as a decimal point, since no German grouping ever
 * produces that.
 *
 * Returns `null` when the token is not a number we are prepared to defend.
 */
export function parseNumber(raw: string): number | null {
  const t = raw.trim();
  if (!/^\d[\d.,]*$/.test(t)) return null;

  const hasComma = t.includes(",");
  const hasDot = t.includes(".");

  let normalised: string;
  if (hasComma && hasDot) {
    // Rightmost separator is the decimal one; the other groups.
    const lastComma = t.lastIndexOf(",");
    const lastDot = t.lastIndexOf(".");
    normalised =
      lastComma > lastDot
        ? t.replace(/\./g, "").replace(",", ".")
        : t.replace(/,/g, "");
  } else if (hasComma) {
    normalised = t.replace(/\./g, "").replace(",", ".");
  } else if (hasDot) {
    const lastDot = t.lastIndexOf(".");
    const beforeDot = t.slice(0, lastDot);
    const afterDot = t.slice(lastDot + 1);
    // `.` + exactly three digits is thousands grouping (1.234 -> 1234);
    // anything else is a decimal point (0.92 -> 0.92, 1.2345 -> 1.2345).
    // Except after a lone zero: no grouping produces `0.300`, and a real sheet
    // prints Lp(a) that way, where 300 instead of 0.3 is a thousandfold error.
    normalised =
      afterDot.length === 3 && beforeDot !== "0" ? t.replace(/\./g, "") : t;
  } else {
    normalised = t;
  }

  const n = Number(normalised);
  return Number.isFinite(n) ? n : null;
}

/** Normalises the comparator glyphs a lab may print onto FHIR's four. */
function parseComparator(raw: string | undefined): Comparator | undefined {
  if (!raw) return undefined;
  const t = raw.trim().replace("≤", "<=").replace("≥", ">=");
  if (t === "<" || t === "<=" || t === ">=" || t === ">") return t;
  return undefined;
}

interface ReferenceRange {
  low?: number;
  high?: number;
}

/**
 * Reads the reference-range column.
 *
 * Handles the four forms German labs actually print: an interval
 * (`0,70 - 1,20`, with hyphen, en dash or `bis`), an upper bound (`< 200`,
 * `bis 200`), a lower bound (`> 40`), and nothing at all.
 */
export function parseReferenceRange(raw: string): ReferenceRange {
  const t = raw
    .replace(/referenz(bereich)?\s*:?/i, "")
    .replace(/[()[\]]/g, "")
    .replace(/≤/g, "<")
    .replace(/≥/g, ">")
    .trim();
  if (!t) return {};

  const interval = t.match(/^(\d[\d.,]*)\s*(?:-|–|—|bis)\s*(\d[\d.,]*)/i);
  if (interval) {
    const low = parseNumber(interval[1]);
    const high = parseNumber(interval[2]);
    return {
      ...(low !== null ? { low } : {}),
      ...(high !== null ? { high } : {}),
    };
  }

  const upper = t.match(/^(?:<=?|bis|kleiner)\s*(\d[\d.,]*)/i);
  if (upper) {
    const high = parseNumber(upper[1]);
    return high !== null ? { high } : {};
  }

  const lower = t.match(/^(?:>=?|groesser|größer)\s*(\d[\d.,]*)/i);
  if (lower) {
    const low = parseNumber(lower[1]);
    return low !== null ? { low } : {};
  }

  return {};
}

/**
 * `Analyt  [<]Wert [flag]  Einheit  [Referenz]`.
 *
 * The mandatory whitespace between label and value is what keeps `HbA1c` and
 * `Vitamin B12` from being split at their own digits.
 */
const LINE = new RegExp(
  "^\\s*(?<label>[A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß0-9()/.,'+\\-\\s]*?)" +
    "\\s+(?<cmp>[<>]=?|≤|≥)?\\s*(?<value>\\d[\\d.,]*)" +
    "\\s*(?<flag>[*+!↑↓HL]{0,2})" +
    "\\s+(?<unit>[^\\s]+)" +
    "\\s*(?<rest>.*)$",
);

/** A line that looks like it carries a measurement but did not parse. */
export interface SuspiciousLine {
  line: string;
  lineNumber: number;
}

export interface ParseResult {
  values: RawLabValue[];
  /**
   * Lines containing a digit and a unit-like token that the parser could not
   * read. Surfaced so a human can check them against the paper, a silently
   * dropped line is indistinguishable from a line that was never there.
   */
  suspiciousLines: SuspiciousLine[];
}

/** True when a line carries both a number and something that parses as a unit. */
function looksLikeMeasurement(line: string): boolean {
  if (!/\d/.test(line)) return false;
  return line
    .trim()
    .split(/\s+/)
    .some((token) => normaliseUnit(token) !== null);
}

export function parseLabReport(text: string): ParseResult {
  const values: RawLabValue[] = [];
  const suspiciousLines: SuspiciousLine[] = [];

  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;
    if (!line.trim()) continue;

    const m = LINE.exec(line);
    const groups = m?.groups;
    if (!groups) {
      if (looksLikeMeasurement(line))
        suspiciousLines.push({ line, lineNumber });
      continue;
    }

    const value = parseNumber(groups.value);
    const unitRaw = groups.unit.trim();
    // The unit column must actually be a unit; otherwise we have matched the
    // reference range or a free-text comment and should not pretend otherwise.
    if (value === null || normaliseUnit(unitRaw) === null) {
      if (looksLikeMeasurement(line))
        suspiciousLines.push({ line, lineNumber });
      continue;
    }

    const range = parseReferenceRange(groups.rest ?? "");
    const comparator = parseComparator(groups.cmp);

    values.push({
      label: groups.label.trim(),
      value,
      unitRaw,
      ...(comparator ? { comparator } : {}),
      ...(range.low !== undefined ? { referenceLow: range.low } : {}),
      ...(range.high !== undefined ? { referenceHigh: range.high } : {}),
      line: line.trimEnd(),
      lineNumber,
    });
  }

  return { values, suspiciousLines };
}
