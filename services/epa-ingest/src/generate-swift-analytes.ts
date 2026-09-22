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
import { REFERENCE_RANGES } from "./reference-ranges.js";
import {
  renderSwift as renderRanges,
  validate as validateRanges,
} from "./generate-swift-reference-ranges.js";
import {
  ANALYTE_DESCRIPTIONS,
  ANALYTE_DESCRIPTIONS_DE,
  ANALYTE_KEYS,
  ANALYTE_LABELS,
  UNIT_SPELLINGS,
  looseLabelKey,
  lookupAnalyte,
  normaliseLabel,
  normaliseUnit,
} from "./analytes.js";
import type { Taxon } from "./types.js";

const HERE = dirname(fileURLToPath(import.meta.url));
export const SWIFT_TARGET = resolve(
  HERE,
  "../../../clients/ios/Sources/Shared/Analytes.generated.swift",
);
export const RANGES_TARGET = resolve(
  HERE,
  "../../../clients/ios/Sources/Shared/ReferenceRanges.generated.swift",
);
const SOURCE_REL = "services/epa-ingest/src/analytes.ts";

/**
 * The (label, unit) space the table is generated over.
 *
 * Taken from the module's own exports rather than scraped from its source. The
 * scrape looked for quoted keys, Prettier unquoted `fl` and `pg`, and the Swift
 * table silently lost two units while `--check` reported it current, because
 * the generated file matched a generation that was itself wrong. Data cannot
 * be reformatted away.
 */
function readDefinitions(): { labels: string[]; units: string[] } {
  return { labels: [...ANALYTE_LABELS], units: [...UNIT_SPELLINGS] };
}

interface SwiftEntry {
  labelKey: string;
  ucum: string;
  loinc: string | null;
  uncodedReason?: string;
  taxon?: Taxon;
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
        uncodedReason: hit.coding.uncodedReason,
        taxon: hit.coding.taxon,
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
  // An analyte that can say what it measures in English must be able to say it
  // in German too, or a German phone shows one English paragraph among the
  // translated ones. Refused here rather than caught by a reader.
  const english = Object.keys(ANALYTE_DESCRIPTIONS).sort();
  const german = Object.keys(ANALYTE_DESCRIPTIONS_DE).sort();
  const missing = english.filter((k) => !(k in ANALYTE_DESCRIPTIONS_DE));
  const extra = german.filter((k) => !(k in ANALYTE_DESCRIPTIONS));
  if (missing.length || extra.length) {
    throw new Error(
      `description languages disagree:${
        missing.length ? ` no German for ${missing.join(", ")}` : ""
      }` + `${extra.length ? ` German for unknown ${extra.join(", ")}` : ""}`,
    );
  }

  const table = (source: Readonly<Record<string, string>>) =>
    Object.entries(source)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, text]) => `    ${swiftString(key)}: ${swiftString(text)},`)
      .join("\n");
  const descriptions = table(ANALYTE_DESCRIPTIONS);
  const descriptionsDe = table(ANALYTE_DESCRIPTIONS_DE);
  // A codeless coding must say why, or a reader of the data cannot tell a
  // deliberate absence from a lookup nobody got round to.
  for (const e of entries) {
    if (e.loinc === null && !e.uncodedReason) {
      throw new Error(
        `${e.analyteKey} in ${e.ucum} has no LOINC code and no reason for it`,
      );
    }
  }

  const rows = entries
    .map(
      (e) =>
        `    AnalyteCoding(labelKey: ${swiftString(
          e.labelKey,
        )}, ucum: ${swiftString(e.ucum)}, ` +
        `loinc: ${e.loinc === null ? "nil" : swiftString(e.loinc)}, ` +
        `display: ${swiftString(e.display)}, ` +
        `analyteKey: ${swiftString(e.analyteKey)}` +
        `${
          e.uncodedReason
            ? `, uncodedReason: ${swiftString(e.uncodedReason)}`
            : ""
        }` +
        `${
          e.taxon
            ? `, taxon: Taxon(ncbiTaxId: ${swiftString(
                e.taxon.ncbiTaxId,
              )}, scientificName: ${swiftString(
                e.taxon.scientificName,
              )}, rank: ${swiftString(e.taxon.rank)})`
            : ""
        }),`,
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
  /// The LOINC code, or nil where LOINC has none for this quantity.
  ///
  /// Body-composition devices report quantities LOINC has never coded.
  /// Visceral fat is the clearest: LOINC has an area code and nothing for the
  /// mass a bioimpedance scale prints in kilograms, and the two are not
  /// convertible. Putting the area code on a mass would be a wrong code on a
  /// real measurement, so such a value is carried with its unit and no code.
  /// \`uncodedReason\` then says why, and travels with it into the export.
  public let loinc: String?
  public let display: String
  /// Canonical key of the analyte definition, stable across units.
  public let analyteKey: String
  /// Why LOINC has no code. Non-nil exactly when \`loinc\` is nil.
  public let uncodedReason: String?
  /// The organism, where the quantity is the relative abundance of one.
  ///
  /// LOINC names tests, not organisms, so a stool report's taxa have no LOINC
  /// code. NCBI Taxonomy is what names an organism, and its id survives the
  /// renamings taxonomy goes through: the sheet prints Firmicutes, NCBI now
  /// says Bacillota, and id 1239 is both. Set exactly on the microbiome taxa.
  public let taxon: Taxon?

  /// True when a code applies and the app may quote one.
  public var isCoded: Bool { loinc != nil }

  /// Explicit because the synthesised memberwise initialiser is internal, so
  /// another module cannot construct one. The app target needs to.
  public init(
    labelKey: String, ucum: String, loinc: String?, display: String, analyteKey: String,
    uncodedReason: String? = nil, taxon: Taxon? = nil
  ) {
    self.labelKey = labelKey
    self.ucum = ucum
    self.loinc = loinc
    self.display = display
    self.analyteKey = analyteKey
    self.uncodedReason = uncodedReason
    self.taxon = taxon
  }
}

/// One entry of the NCBI Taxonomy database, verified against its API.
public struct Taxon: Sendable, Equatable, Codable {
  /// The numeric NCBI Taxonomy id, e.g. 239935 for Akkermansia muciniphila.
  public let ncbiTaxId: String
  /// NCBI's current scientific name, which may differ from what the sheet prints.
  public let scientificName: String
  /// phylum, class, genus or species.
  public let rank: String

  public init(ncbiTaxId: String, scientificName: String, rank: String) {
    self.ncbiTaxId = ncbiTaxId
    self.scientificName = scientificName
    self.rank = rank
  }
}

public enum Analytes {
  /// Printed unit spelling → UCUM code. Mirrors \`normaliseUnit\`.
  public static let unitMap: [String: String] = [
${units}
  ]

  /// What each analyte measures, in one or two sentences.
  ///
  /// A definition, never an interpretation of a person's own value: the app
  /// describes the test and leaves the reading of a result to a doctor, or to
  /// the consent-gated feature that asks a model (ADR-039, §5 of #186).
  public static let descriptions: [String: String] = [
${descriptions}
  ]

  /// The same definitions in German, for a phone set to German.
  ///
  /// Not in \`Localizable.strings\`: the English text is generated from the
  /// TypeScript dictionary, so a translation kept anywhere else would drift
  /// the moment an analyte is added. The generator refuses to emit unless
  /// both languages cover exactly the same analytes.
  public static let descriptionsDe: [String: String] = [
${descriptionsDe}
  ]

  public static let codings: [AnalyteCoding] = [
${rows}
  ]

  /// Latin letters OCR returns as their Cyrillic or Greek twins. Mirrors
  /// \`HOMOGLYPHS\`: a recogniser produced \`МСH\` for \`MCH\`, identical on
  /// screen and a different code point, which \`normaliseLabel\` then stripped.
  static let homoglyphs: [Character: Character] = [
    "А": "A", "В": "B", "С": "C", "Е": "E", "Н": "H", "І": "I", "Ј": "J", "К": "K", "М": "M",
    "О": "O", "Р": "P", "Ѕ": "S", "Т": "T", "Х": "X", "У": "Y", "а": "a", "в": "b", "с": "c",
    "е": "e", "о": "o", "р": "p", "у": "y", "х": "x", "Α": "A", "Β": "B", "Ε": "E", "Ζ": "Z",
    "Η": "H", "Ι": "I", "Κ": "K", "Μ": "M", "Ν": "N", "Ο": "O", "Ρ": "P", "Τ": "T", "Υ": "Y",
    "Χ": "X", "ο": "o", "ρ": "p", "ν": "v",
  ]

  /// Replaces every homoglyph with the Latin letter it imitates.
  public static func foldHomoglyphs(_ raw: String) -> String {
    String(raw.map { homoglyphs[$0] ?? $0 })
  }

  /// Folds case, spacing, punctuation and German diacritics. Mirrors \`normaliseLabel\`.
  public static func normaliseLabel(_ raw: String) -> String {
    let folded = foldHomoglyphs(raw).lowercased()
      .replacingOccurrences(of: "ä", with: "ae")
      .replacingOccurrences(of: "ö", with: "oe")
      .replacingOccurrences(of: "ü", with: "ue")
      .replacingOccurrences(of: "ß", with: "ss")
    // ASCII letters and digits only, as the TypeScript fold does. Unicode
    // alphanumerics kept the accented letter of a method name here and the
    // two keys never met.
    return String(folded.unicodeScalars.filter { asciiAlphanumerics.contains($0) })
  }

  private static let asciiAlphanumerics = CharacterSet(
    charactersIn: "abcdefghijklmnopqrstuvwxyz0123456789")

  /// The strict key with the umlaut digraphs collapsed. Mirrors \`looseLabelKey\`.
  ///
  /// OCR drops diacritics: \`Hämoglobin\` arrives as \`Hamoglobin\`, which the
  /// strict key never matches. Both sides are collapsed, so the printed and the
  /// dropped spelling meet. The TypeScript source refuses to load if two
  /// different analytes share a loose key, so the fallback cannot mis-code.
  public static func looseLabelKey(_ raw: String) -> String {
    normaliseLabel(raw)
      .replacingOccurrences(of: "ae", with: "a")
      .replacingOccurrences(of: "oe", with: "o")
      .replacingOccurrences(of: "ue", with: "u")
  }

  public static func normaliseUnit(_ raw: String) -> String? {
    let compact = raw.replacingOccurrences(of: "µ", with: "u")
      .replacingOccurrences(of: "μ", with: "u")
      .components(separatedBy: .whitespacesAndNewlines).joined()
    // Case decides before anything is lowercased: \`G/l\` is giga per litre, a
    // cell count, and \`g/l\` is a gram per litre, a haemoglobin. Same in
    // \`normaliseUnit\` on the TypeScript side.
    if compact == "G/l" || compact == "G/L" { return "10*9/L" }
    if compact == "T/l" || compact == "T/L" { return "10*12/L" }
    return unitMap[compact.lowercased()] ?? repairUnit(raw)
  }

  /// Characters a recogniser confuses with one another. Mirrors \`CONFUSABLE\`.
  static let confusable: Set<Character> = ["I", "l", "i", "1", "|", "!", "/"]
  static let confusableTargets: [Character] = ["l", "i", "/"]

  /// Repairs a unit a recogniser mangled, or nil. Mirrors \`repairUnit\`.
  ///
  /// Measured on a real sheet (#186): \`U/l\` came back as \`U/I\` and as
  /// \`UII\`, and \`uIU/ml\` as \`ulU/ml\`. It runs only when the printed
  /// spelling is not already a unit, the token must hold one character that is
  /// not itself confusable, and the substitutions must lead to exactly one
  /// UCUM code, so nothing ambiguous is ever guessed.
  public static func repairUnit(_ raw: String) -> String? {
    let compact = Array(
      raw.replacingOccurrences(of: "µ", with: "u").replacingOccurrences(of: "μ", with: "u")
        .components(separatedBy: .whitespacesAndNewlines).joined())
    guard compact.count >= 2, compact.count <= 12 else { return nil }
    var positions: [Int] = []
    var hasAnchor = false
    for (index, character) in compact.enumerated() {
      if confusable.contains(character) { positions.append(index) } else { hasAnchor = true }
    }
    guard hasAnchor, !positions.isEmpty, positions.count <= 3 else { return nil }

    var found: Set<String> = []
    let total = Int(pow(Double(confusableTargets.count), Double(positions.count)))
    for mask in 0..<total {
      var characters = compact
      var rest = mask
      for position in positions {
        characters[position] = confusableTargets[rest % confusableTargets.count]
        rest /= confusableTargets.count
      }
      if let candidate = unitMap[String(characters).lowercased()] { found.insert(candidate) }
    }
    return found.count == 1 ? found.first : nil
  }

  /// Resolves a printed label and unit to a coding, or nil, never a guess.
  ///
  /// Strict key first; the loose key only when the strict one finds nothing.
  public static func lookup(label: String, unit: String) -> AnalyteCoding? {
    guard let ucum = normaliseUnit(unit) else { return nil }
    let key = normaliseLabel(label)
    if let exact = codings.first(where: { $0.labelKey == key && $0.ucum == ucum }) {
      return exact
    }
    let loose = looseLabelKey(label)
    return codings.first { looseLabelKey($0.labelKey) == loose && $0.ucum == ucum }
  }

  /// True when the dictionary knows this analyte in *some* unit.
  ///
  /// Separates "we have never heard of this analyte" from "we know it, but not
  /// in the unit printed", a distinction that decides whether a row is a gap
  /// in the dictionary or a unit the lab reported unusually.
  public static func knowsLabel(_ label: String) -> Bool {
    let key = normaliseLabel(label)
    if codings.contains(where: { $0.labelKey == key }) { return true }
    let loose = looseLabelKey(label)
    return codings.contains { looseLabelKey($0.labelKey) == loose }
  }

  /// The analyte a label names, in whatever unit, or nil.
  ///
  /// Used to decide whether two spellings on one printed row mean the same
  /// measurement: practice software prints its own short code in front of the
  /// name, \`hdl Cholesterin-HDL\`, and the code may only be dropped when both
  /// halves agree. \`HDL Cholesterin\` is the counter-example that makes the
  /// check necessary rather than decorative.
  public static func analyteKey(forLabel label: String) -> String? {
    let key = normaliseLabel(label)
    if let hit = codings.first(where: { $0.labelKey == key }) { return hit.analyteKey }
    let loose = looseLabelKey(label)
    return codings.first { looseLabelKey($0.labelKey) == loose }?.analyteKey
  }

  /// The units this analyte is defined for, for an actionable error message.
  public static func expectedUnits(forLabel label: String) -> [String] {
    let key = normaliseLabel(label)
    let strict = codings.filter { $0.labelKey == key }.map { $0.ucum }
    if !strict.isEmpty { return strict }
    let loose = looseLabelKey(label)
    return codings.filter { looseLabelKey($0.labelKey) == loose }.map { $0.ucum }
  }
}
`;
}

export async function generate(): Promise<string> {
  const { labels, units } = readDefinitions();
  const entries = buildEntries(labels, units);
  if (entries.length === 0) {
    throw new Error(
      "No analyte codings recovered: the source shape changed; fix the generator.",
    );
  }

  // The Swift fold is a transliteration of the TypeScript one. Prove on every
  // label that the loose key derives from the strict key the way the template
  // derives it, so a change to one side without the other fails here.
  for (const label of labels) {
    const derived = normaliseLabel(label)
      .replace(/ae/g, "a")
      .replace(/oe/g, "o")
      .replace(/ue/g, "u");
    if (derived !== looseLabelKey(label)) {
      throw new Error(
        `looseLabelKey("${label}") is not derivable from its strict key; update the Swift template`,
      );
    }
  }

  const unitMap: [string, string][] = [];
  for (const unit of units) {
    const ucum = normaliseUnit(unit);
    const key = unit.replace(/µ|μ/g, "u").replace(/\s+/g, "").toLowerCase();
    // A spelling that only case tells apart (`G/l` versus `g/l`) is decided in
    // code on both sides, before the map. Writing it into the map under its
    // lowercase key would overwrite the gram-per-litre entry with a count.
    if (ucum && normaliseUnit(key) === ucum) unitMap.push([key, ucum]);
  }
  unitMap.sort((a, b) => a[0].localeCompare(b[0]));

  return renderSwift(entries, [...new Map(unitMap).entries()]);
}

/** The reference-range table, validated against the analyte dictionary. */
export function generateRanges(): string {
  const problems = validateRanges(REFERENCE_RANGES);
  if (problems.length > 0) {
    throw new Error(
      `reference-ranges.ts does not agree with the analyte dictionary:\n  ${problems.join(
        "\n  ",
      )}`,
    );
  }
  return renderRanges(REFERENCE_RANGES);
}

async function main(): Promise<void> {
  const check = process.argv.includes("--check");
  const rendered = await generate();
  const renderedRanges = generateRanges();

  if (check) {
    let currentRanges = "";
    try {
      currentRanges = await readFile(RANGES_TARGET, "utf8");
    } catch {
      currentRanges = "";
    }
    if (currentRanges !== renderedRanges) {
      process.stderr.write(
        "The generated Swift reference-range table is out of date with " +
          "services/epa-ingest/src/reference-ranges.ts.\n" +
          "Run: cd services/epa-ingest && npm run generate:swift\n",
      );
      process.exitCode = 1;
      return;
    }
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
  await writeFile(RANGES_TARGET, renderedRanges, "utf8");
  process.stdout.write(
    `${REFERENCE_RANGES.length} reference ranges → ${RANGES_TARGET}\n`,
  );
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
