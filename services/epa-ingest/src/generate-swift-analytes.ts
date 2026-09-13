/**
 * Emits the Swift analyte dictionary from the TypeScript one.
 *
 * `clients/ios` and this service do the same job on different devices, and the
 * failure mode the monorepo exists to prevent is **two divergent dictionaries**:
 * an iPhone coding Lp(a) one way and the CLI another, discovered when a value
 * reaches a doctor. So the Swift table is generated, never written, and CI fails
 * when the generated file is out of date with its source.
 *
 *   npm run generate:swift        # write it
 *   npm run generate:swift -- --check   # fail if it would change
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  ANALYTE_KEYS,
  lookupAnalyte,
  normaliseLabel,
  normaliseUnit,
} from "./analytes.js";

const HERE = dirname(fileURLToPath(import.meta.url));
export const SWIFT_TARGET = resolve(
  HERE,
  "../../../clients/ios/Sources/Shared/Analytes.generated.swift",
);
const SOURCE_REL = "services/epa-ingest/src/analytes.ts";

/**
 * Recovers the (label, unit) → coding table by re-reading the source module's
 * own declarations.
 *
 * The dictionary's internal shape is private to `analytes.ts`, and exporting it
 * just to generate from it would widen the module's API for the benefit of a
 * build step. Reading the declarations back keeps the public surface as it is.
 */
async function readDefinitions(): Promise<{
  labels: string[];
  units: string[];
}> {
  const src = await readFile(resolve(HERE, "analytes.ts"), "utf8");

  const labels: string[] = [];
  for (const block of src.matchAll(/labels:\s*\[([^\]]*)\]/g)) {
    for (const quoted of block[1].matchAll(/"([^"]+)"/g))
      labels.push(quoted[1]);
  }

  const units = new Set<string>();
  for (const quoted of src.matchAll(/"([^"]+)":\s*c\(/g)) units.add(quoted[1]);
  // The UCUM codes appear as byUnit keys; the printed forms come from the unit
  // map, so round-trip every printed spelling we know how to normalise.
  for (const quoted of src.matchAll(/"([^"]+)":\s*"([^"]+)",/g)) {
    if (normaliseUnit(quoted[1]) !== null) units.add(quoted[1]);
  }

  return { labels: [...new Set(labels)], units: [...units] };
}

interface SwiftEntry {
  labelKey: string;
  ucum: string;
  loinc: string;
  display: string;
  analyteKey: string;
}

/** Every (normalised label, UCUM unit) pair the TypeScript table resolves. */
export function buildEntries(labels: string[], units: string[]): SwiftEntry[] {
  const entries: SwiftEntry[] = [];
  const seen = new Set<string>();

  for (const label of labels) {
    for (const unit of units) {
      const hit = lookupAnalyte(label, unit);
      if (hit.status !== "ok") continue;
      const key = `${normaliseLabel(label)}|${hit.coding.ucum}`;
      if (seen.has(key)) continue;
      seen.add(key);
      entries.push({
        labelKey: normaliseLabel(label),
        ucum: hit.coding.ucum,
        loinc: hit.coding.loincNumber,
        display: hit.coding.display,
        analyteKey: hit.analyteKey,
      });
    }
  }

  entries.sort(
    (a, b) =>
      a.labelKey.localeCompare(b.labelKey) || a.ucum.localeCompare(b.ucum),
  );
  return entries;
}

function swiftString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function renderSwift(
  entries: SwiftEntry[],
  unitMap: [string, string][],
): string {
  const rows = entries
    .map(
      (e) =>
        `    AnalyteCoding(labelKey: ${swiftString(
          e.labelKey,
        )}, ucum: ${swiftString(e.ucum)}, ` +
        `loinc: ${swiftString(e.loinc)}, display: ${swiftString(e.display)}, ` +
        `analyteKey: ${swiftString(e.analyteKey)}),`,
    )
    .join("\n");

  const units = unitMap
    .map(
      ([printed, ucum]) => `    ${swiftString(printed)}: ${swiftString(ucum)},`,
    )
    .join("\n");

  return `// GENERATED FILE, DO NOT EDIT.
//
// Source: ${SOURCE_REL}
// Regenerate: cd services/epa-ingest && npm run generate:swift
//
// The iPhone app and the epa-ingest CLI must code an analyte identically; a
// hand-maintained copy of this table is the divergence the shared repository
// exists to prevent. CI fails when this file is out of date with its source.
//
// The unit selects the LOINC code, never the label: Lp(a) in mg/dL and in
// nmol/L are different measurements with different codes.

import Foundation

public struct AnalyteCoding: Sendable, Equatable, Codable {
  /// Normalised analyte label, see \`normaliseLabel\`.
  public let labelKey: String
  /// UCUM unit code this coding applies to.
  public let ucum: String
  public let loinc: String
  public let display: String
  /// Canonical key of the analyte definition, stable across units.
  public let analyteKey: String
}

public enum Analytes {
  /// Printed unit spelling → UCUM code. Mirrors \`normaliseUnit\`.
  public static let unitMap: [String: String] = [
${units}
  ]

  public static let codings: [AnalyteCoding] = [
${rows}
  ]

  /// Folds case, spacing, punctuation and German diacritics. Mirrors \`normaliseLabel\`.
  public static func normaliseLabel(_ raw: String) -> String {
    let folded = raw.lowercased()
      .replacingOccurrences(of: "ä", with: "ae")
      .replacingOccurrences(of: "ö", with: "oe")
      .replacingOccurrences(of: "ü", with: "ue")
      .replacingOccurrences(of: "ß", with: "ss")
    return String(folded.unicodeScalars.filter { CharacterSet.alphanumerics.contains($0) })
  }

  public static func normaliseUnit(_ raw: String) -> String? {
    let key = raw.replacingOccurrences(of: "µ", with: "u")
      .replacingOccurrences(of: "μ", with: "u")
      .components(separatedBy: .whitespaces).joined()
      .lowercased()
    return unitMap[key]
  }

  /// Resolves a printed label and unit to a coding, or nil, never a guess.
  public static func lookup(label: String, unit: String) -> AnalyteCoding? {
    guard let ucum = normaliseUnit(unit) else { return nil }
    let key = normaliseLabel(label)
    return codings.first { $0.labelKey == key && $0.ucum == ucum }
  }

  /// True when the dictionary knows this analyte in *some* unit.
  ///
  /// Separates "we have never heard of this analyte" from "we know it, but not
  /// in the unit printed", a distinction that decides whether a row is a gap
  /// in the dictionary or a unit the lab reported unusually.
  public static func knowsLabel(_ label: String) -> Bool {
    let key = normaliseLabel(label)
    return codings.contains { $0.labelKey == key }
  }

  /// The units this analyte is defined for, for an actionable error message.
  public static func expectedUnits(forLabel label: String) -> [String] {
    let key = normaliseLabel(label)
    return codings.filter { $0.labelKey == key }.map { $0.ucum }
  }
}
`;
}

export async function generate(): Promise<string> {
  const { labels, units } = await readDefinitions();
  const entries = buildEntries(labels, units);
  if (entries.length === 0) {
    throw new Error(
      "No analyte codings recovered: the source shape changed; fix the generator.",
    );
  }

  const unitMap: [string, string][] = [];
  for (const unit of units) {
    const ucum = normaliseUnit(unit);
    if (ucum)
      unitMap.push([
        unit.replace(/µ|μ/g, "u").replace(/\s+/g, "").toLowerCase(),
        ucum,
      ]);
  }
  unitMap.sort((a, b) => a[0].localeCompare(b[0]));

  return renderSwift(entries, [...new Map(unitMap).entries()]);
}

async function main(): Promise<void> {
  const check = process.argv.includes("--check");
  const rendered = await generate();

  if (check) {
    let current = "";
    try {
      current = await readFile(SWIFT_TARGET, "utf8");
    } catch {
      process.stderr.write(
        `${SWIFT_TARGET} is missing.\nRun: cd services/epa-ingest && npm run generate:swift\n`,
      );
      process.exitCode = 1;
      return;
    }
    if (current !== rendered) {
      process.stderr.write(
        "The generated Swift analyte table is out of date with " +
          `${SOURCE_REL}.\nRun: cd services/epa-ingest && npm run generate:swift\n`,
      );
      process.exitCode = 1;
      return;
    }
    process.stdout.write(`${SWIFT_TARGET} is up to date\n`);
    return;
  }

  await writeFile(SWIFT_TARGET, rendered, "utf8");
  const count = (rendered.match(/AnalyteCoding\(labelKey:/g) ?? []).length;
  process.stdout.write(
    `${count} codings across ${ANALYTE_KEYS.length} analytes → ${SWIFT_TARGET}\n`,
  );
}

const invoked = process.argv[1] ?? "";
if (invoked.includes("generate-swift-analytes")) {
  main().catch((err: unknown) => {
    process.stderr.write(`${(err as Error).message}\n`);
    process.exitCode = 1;
  });
}
