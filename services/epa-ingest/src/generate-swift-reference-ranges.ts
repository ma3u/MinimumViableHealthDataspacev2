/**
 * Emits the Swift reference-range table from the TypeScript one.
 *
 * Same reason as the analyte table: the phone and the CLI must quote the same
 * guideline, and a hand-maintained copy diverges silently. Generated, never
 * written, and checked in CI.
 *
 * It also validates what it emits. A range whose analyte the dictionary does
 * not know, or whose unit that analyte is not defined for, is a range that
 * could never be shown next to a value, and it fails the build rather than
 * shipping as a row nobody sees.
 */
import { ANALYTE_KEYS, ANALYTE_UNITS } from "./analytes.js";
import {
  REFERENCE_RANGES,
  RANGE_GROUPS,
  type ReferenceRange,
} from "./reference-ranges.js";

function swiftString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function optional(value: number | undefined): string {
  return value === undefined ? "nil" : String(value);
}

/**
 * Checks every range against the analyte dictionary.
 *
 * The unit is the part that matters: a range in mg/dL against an analyte only
 * defined in mmol/L would sit beside a value it does not describe, which is
 * the same class of error as coding by label alone.
 */
export function validate(ranges: readonly ReferenceRange[]): string[] {
  const problems: string[] = [];
  const keys = new Set(ANALYTE_KEYS);
  for (const range of ranges) {
    if (!keys.has(range.analyteKey)) {
      problems.push(`${range.analyteKey}: no such analyte in the dictionary`);
      continue;
    }
    // Asked of the dictionary directly, in UCUM. Probing with printed
    // spellings instead looks equivalent and is not: `mL/min/{1.73_m2}` is a
    // UCUM code no laboratory prints, so every eGFR range failed a check that
    // was really testing the unit map.
    const units = ANALYTE_UNITS[range.analyteKey] ?? [];
    if (!units.includes(range.ucum)) {
      problems.push(
        `${range.analyteKey}: the dictionary does not define it in ${range.ucum}` +
          ` (it has ${units.join(", ") || "no units"})`,
      );
    }
    const { guidelineLow, guidelineHigh, optimalLow, optimalHigh } = range;
    if (guidelineLow === undefined && guidelineHigh === undefined) {
      problems.push(`${range.analyteKey} (${range.ucum}): no guideline bound`);
    }
    for (const [low, high, which] of [
      [guidelineLow, guidelineHigh, "guideline"],
      [optimalLow, optimalHigh, "optimal"],
    ] as const) {
      if (low !== undefined && high !== undefined && low > high) {
        problems.push(
          `${range.analyteKey} (${range.ucum}): ${which} low is above its high`,
        );
      }
    }
    if (!range.source.url.startsWith("https://")) {
      problems.push(`${range.analyteKey} (${range.ucum}): source is not a URL`);
    }
    if (range.summary.length < 20) {
      problems.push(`${range.analyteKey} (${range.ucum}): summary too short`);
    }
  }
  return problems;
}

export function renderSwift(ranges: readonly ReferenceRange[]): string {
  const rows = ranges
    .map((r) =>
      [
        "    ReferenceRange(",
        `      analyteKey: ${swiftString(r.analyteKey)}, ucum: ${swiftString(
          r.ucum,
        )},`,
        `      group: .${r.group}, sex: .${r.sex},`,
        `      guidelineLow: ${optional(
          r.guidelineLow,
        )}, guidelineHigh: ${optional(r.guidelineHigh)},`,
        `      optimalLow: ${optional(r.optimalLow)}, optimalHigh: ${optional(
          r.optimalHigh,
        )},`,
        `      basis: .${r.basis},`,
        `      summary: ${swiftString(r.summary)},`,
        `      source: RangeSource(`,
        `        label: ${swiftString(r.source.label)},`,
        `        url: ${swiftString(r.source.url)})),`,
      ].join("\n"),
    )
    .join("\n");

  const groups = RANGE_GROUPS.map((g) => `    case ${g}`).join("\n");

  return `// GENERATED FILE, DO NOT EDIT.
//
// Source: services/epa-ingest/src/reference-ranges.ts
// Regenerate: cd services/epa-ingest && npm run generate:swift
//
// Every range here is quoted from a named source and sits **alongside** the
// range the laboratory printed on the report, never in place of it (ADR-033
// rule 1). An analyte with no citable source has no entry.

import Foundation

public struct RangeSource: Sendable, Equatable, Codable {
  public let label: String
  public let url: String

  public init(label: String, url: String) {
    self.label = label
    self.url = url
  }
}

/// What kind of evidence a range rests on.
public enum RangeBasis: String, Sendable, Equatable, Codable {
  /// Stated by a guideline body for the general adult population.
  case guideline
  /// A consensus or expert-opinion statement.
  case consensus
  /// Derived in a named cohort.
  case cohort
}

public enum RangeSex: String, Sendable, Equatable, Codable, CaseIterable {
  case any, male, female
}

/// The panels a reader thinks in.
public enum RangeGroup: String, Sendable, Equatable, Codable, CaseIterable {
${groups}
}

public struct ReferenceRange: Sendable, Equatable, Codable, Identifiable {
  public let analyteKey: String
  public let ucum: String
  public let group: RangeGroup
  public let sex: RangeSex
  /// The general-population threshold the source states.
  public let guidelineLow: Double?
  public let guidelineHigh: Double?
  /// The lowest-risk band the source names, when it names one.
  public let optimalLow: Double?
  public let optimalHigh: Double?
  public let basis: RangeBasis
  public let summary: String
  public let source: RangeSource

  public var id: String { "\\(analyteKey)|\\(ucum)|\\(sex.rawValue)" }

  public init(
    analyteKey: String, ucum: String, group: RangeGroup, sex: RangeSex,
    guidelineLow: Double?, guidelineHigh: Double?, optimalLow: Double?, optimalHigh: Double?,
    basis: RangeBasis, summary: String, source: RangeSource
  ) {
    self.analyteKey = analyteKey
    self.ucum = ucum
    self.group = group
    self.sex = sex
    self.guidelineLow = guidelineLow
    self.guidelineHigh = guidelineHigh
    self.optimalLow = optimalLow
    self.optimalHigh = optimalHigh
    self.basis = basis
    self.summary = summary
    self.source = source
  }
}

public enum ReferenceRanges {
  public static let all: [ReferenceRange] = [
${rows}
  ]

  /// Every range defined for an analyte, in any unit.
  public static func forAnalyte(_ analyteKey: String) -> [ReferenceRange] {
    all.filter { $0.analyteKey == analyteKey }
  }

  /// The range for one analyte in one unit.
  ///
  /// A sex-specific range is used only when the person has said which applies.
  /// Without that, the sex-neutral entry is returned, or none: guessing would
  /// put a man's haemoglobin threshold on a woman's value.
  public static func range(
    analyteKey: String, ucum: String, sex: RangeSex = .any
  ) -> ReferenceRange? {
    let candidates = all.filter { $0.analyteKey == analyteKey && $0.ucum == ucum }
    return candidates.first { $0.sex == sex } ?? candidates.first { $0.sex == .any }
  }

  /// The analytes that have any range at all, in group order.
  public static func groups() -> [(group: RangeGroup, ranges: [ReferenceRange])] {
    RangeGroup.allCases.compactMap { group in
      let ranges = all.filter { $0.group == group }
      return ranges.isEmpty ? nil : (group, ranges)
    }
  }
}
`;
}
