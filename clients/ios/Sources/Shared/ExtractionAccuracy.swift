import Foundation

/// Measures an extraction against a sheet whose truth a person has checked.
///
/// The tests already prove the safety property per condition: a degraded scan
/// loses rows and never invents values (`ScanningTests`). What they do not give
/// is a number a reviewer outside this repository can quote: how many rows of a
/// real or synthetic sheet came out right, field by field, and how many came out
/// wrong while looking trustworthy. This is that number.
///
/// A truth file is written by hand, from the paper, by the person the sheet
/// belongs to or someone they asked. It lives where the diagnostics export
/// lives, outside this repository, always (`clients/ios/README.md`, rule 1).
/// Only the `Summary`, which carries counts and LOINC codes and no values, is
/// meant to leave that folder.
public enum ExtractionAccuracy {

  // MARK: - The truth

  /// One printed row, as the paper says it.
  public struct TruthRow: Sendable, Equatable, Codable {
    public let label: String
    public let value: Double
    /// `<`, `<=`, `>=` or `>` when the sheet prints one, as in `<10`.
    public let comparator: String?
    public let unit: String
    /// The LOINC code a correct extraction produces. Nil together with
    /// `refused == false` means a coding that LOINC has no term for.
    public let loinc: String?
    /// True when the right outcome is a refusal: the row must land in the
    /// unmapped list, never coded, as a urine row with only a serum entry does.
    public let refused: Bool
    /// The range exactly as printed, when the truth file checks it.
    public let referenceText: String?

    public init(
      label: String, value: Double, comparator: String? = nil, unit: String,
      loinc: String?, refused: Bool = false, referenceText: String? = nil
    ) {
      self.label = label
      self.value = value
      self.comparator = comparator
      self.unit = unit
      self.loinc = loinc
      self.refused = refused
      self.referenceText = referenceText
    }

    private enum CodingKeys: String, CodingKey {
      case label, value, comparator, unit, loinc, refused, referenceText
    }

    public init(from decoder: Decoder) throws {
      let container = try decoder.container(keyedBy: CodingKeys.self)
      label = try container.decode(String.self, forKey: .label)
      value = try container.decode(Double.self, forKey: .value)
      comparator = try container.decodeIfPresent(String.self, forKey: .comparator)
      unit = try container.decode(String.self, forKey: .unit)
      loinc = try container.decodeIfPresent(String.self, forKey: .loinc)
      refused = try container.decodeIfPresent(Bool.self, forKey: .refused) ?? false
      referenceText = try container.decodeIfPresent(String.self, forKey: .referenceText)
    }
  }

  /// `truth.json`, next to the `diagnostics.json` it describes.
  public struct TruthFile: Sendable, Equatable, Codable {
    public let schema: Int
    /// The laboratory date the review screen should arrive at, `YYYY-MM-DD`.
    public let labDate: String?
    public let rows: [TruthRow]

    public init(schema: Int = 1, labDate: String? = nil, rows: [TruthRow]) {
      self.schema = schema
      self.labDate = labDate
      self.rows = rows
    }

    /// The lab date as the extractor builds dates: the day at noon UTC.
    public var labDay: Date? {
      guard let labDate else { return nil }
      let parts = labDate.split(separator: "-").compactMap { Int($0) }
      guard parts.count == 3 else { return nil }
      return ReportMetadataExtractor.day(parts[0], parts[1], parts[2])
    }
  }

  // MARK: - The outcome

  /// What happened to one row of the truth.
  public struct RowResult: Sendable, Equatable, Codable {
    public let label: String
    public let loinc: String?
    /// False when nothing extracted could be paired with this row.
    public let found: Bool
    public let valueCorrect: Bool
    public let unitCorrect: Bool
    /// Coded to the expected code, or refused when a refusal was expected.
    public let codeCorrect: Bool
    /// Nil when the truth file does not check the range of this row.
    public let referenceCorrect: Bool?
    /// Coded, so shown as a value, and wrong in value, unit or code.
    ///
    /// The one error that matters most. A missing row is a row the person
    /// re-scans; a coded wrong one is a number that can reach a doctor.
    public let silentError: Bool

    public var exact: Bool {
      found && valueCorrect && unitCorrect && codeCorrect && (referenceCorrect ?? true)
    }
  }

  public enum DateOutcome: String, Sendable, Codable {
    case correct, wrong, notFound = "not-found", notChecked = "not-checked"
  }

  /// Counts only. Safe to publish: no label, no value, no date.
  public struct Summary: Sendable, Equatable, Codable {
    public var sheets = 0
    public var truthRows = 0
    public var found = 0
    public var exact = 0
    public var valueCorrect = 0
    public var unitCorrect = 0
    public var codeCorrect = 0
    public var referenceChecked = 0
    public var referenceCorrect = 0
    /// Coded rows that were wrong in value, unit or code.
    public var silentErrors = 0
    /// Coded values with no row on the sheet behind them.
    public var spurious = 0
    /// Lines the parser could not read and handed to the reviewer instead.
    public var unreadLines = 0
    public var labDateChecked = 0
    public var labDateCorrect = 0
    /// LOINC codes of the rows that were not exact, for the error log.
    public var inexactCodes: [String] = []

    public init() {}

    /// Share of truth rows extracted exactly right, 0 to 1.
    public var exactRate: Double { truthRows == 0 ? 0 : Double(exact) / Double(truthRows) }
    /// Share of truth rows found at all, 0 to 1.
    public var recall: Double { truthRows == 0 ? 0 : Double(found) / Double(truthRows) }

    public mutating func add(_ other: Summary) {
      sheets += other.sheets
      truthRows += other.truthRows
      found += other.found
      exact += other.exact
      valueCorrect += other.valueCorrect
      unitCorrect += other.unitCorrect
      codeCorrect += other.codeCorrect
      referenceChecked += other.referenceChecked
      referenceCorrect += other.referenceCorrect
      silentErrors += other.silentErrors
      spurious += other.spurious
      unreadLines += other.unreadLines
      labDateChecked += other.labDateChecked
      labDateCorrect += other.labDateCorrect
      inexactCodes += other.inexactCodes
    }
  }

  public struct Report: Sendable, Equatable, Codable {
    public let rows: [RowResult]
    public let labDate: DateOutcome
    public let summary: Summary
  }

  // MARK: - The comparison

  /// One extracted row, coded or refused, as a pairing candidate.
  private struct Candidate {
    let raw: RawLabValue
    /// Nil when the row was refused. A coding whose `loinc` is nil is still a
    /// coded row: a quantity LOINC has no term for.
    let coding: AnalyteCoding?
    var coded: Bool { coding != nil }
  }

  /// Compares one sheet's extraction with its truth.
  ///
  /// Pairing goes by label first, the loose key that folds case, spacing,
  /// diacritics and the `rn`/`m` confusion, then by value and unit for a
  /// label the recogniser mangled. Each extracted row pairs once. What is left
  /// over and coded is spurious: a value with no row on the sheet behind it.
  public static func compare(
    truth: TruthFile, extraction: ExtractionResult, labDate: Date? = nil
  ) -> Report {
    var pool: [Candidate?] =
      extraction.coded.map { Candidate(raw: $0.raw, coding: $0.coding) }
      + extraction.unmapped.map { Candidate(raw: $0.raw, coding: nil) }

    var results: [RowResult] = []
    var summary = Summary()
    summary.sheets = 1
    summary.truthRows = truth.rows.count
    summary.unreadLines = extraction.suspiciousLines.count

    for row in truth.rows {
      guard let index = pairIndex(for: row, in: pool), let candidate = pool[index] else {
        results.append(
          RowResult(
            label: row.label, loinc: row.loinc, found: false, valueCorrect: false,
            unitCorrect: false, codeCorrect: false, referenceCorrect: nil, silentError: false))
        continue
      }
      pool[index] = nil

      let valueCorrect =
        sameNumber(candidate.raw.value, row.value)
        && candidate.raw.comparator?.rawValue == row.comparator
      let unitCorrect = sameUnit(candidate.raw.unitRaw, row.unit)
      let codeCorrect =
        row.refused
        ? !candidate.coded
        : (candidate.coded && candidate.coding?.loinc == row.loinc)
      let referenceCorrect = row.referenceText.map {
        sameReference(candidate.raw.referenceText, $0)
      }
      let silentError = candidate.coded && !(valueCorrect && unitCorrect && codeCorrect)

      results.append(
        RowResult(
          label: row.label, loinc: row.loinc, found: true, valueCorrect: valueCorrect,
          unitCorrect: unitCorrect, codeCorrect: codeCorrect,
          referenceCorrect: referenceCorrect, silentError: silentError))
    }

    for result in results {
      if result.found { summary.found += 1 }
      if result.exact { summary.exact += 1 }
      if result.valueCorrect { summary.valueCorrect += 1 }
      if result.unitCorrect { summary.unitCorrect += 1 }
      if result.codeCorrect { summary.codeCorrect += 1 }
      if let reference = result.referenceCorrect {
        summary.referenceChecked += 1
        if reference { summary.referenceCorrect += 1 }
      }
      if result.silentError { summary.silentErrors += 1 }
      if !result.exact { summary.inexactCodes.append(result.loinc ?? "uncoded") }
    }
    summary.spurious = pool.compactMap { $0 }.filter(\.coded).count

    let dateOutcome: DateOutcome
    if let expected = truth.labDay {
      summary.labDateChecked = 1
      if let labDate {
        dateOutcome = labDate == expected ? .correct : .wrong
      } else {
        dateOutcome = .notFound
      }
      if dateOutcome == .correct { summary.labDateCorrect = 1 }
    } else {
      dateOutcome = .notChecked
    }

    return Report(rows: results, labDate: dateOutcome, summary: summary)
  }

  private static func pairIndex(for row: TruthRow, in pool: [Candidate?]) -> Int? {
    let key = Analytes.looseLabelKey(row.label)
    if !key.isEmpty,
      let exact = pool.firstIndex(where: {
        guard let candidate = $0 else { return false }
        return Analytes.looseLabelKey(candidate.raw.label) == key
      })
    {
      return exact
    }
    // A printed label can carry a method or specimen the truth leaves out,
    // `Ferritin (CLIA)`, so a key that contains the other's pairs too.
    if key.count >= 3,
      let partial = pool.firstIndex(where: {
        guard let candidate = $0 else { return false }
        let other = Analytes.looseLabelKey(candidate.raw.label)
        return other.count >= 3 && (other.contains(key) || key.contains(other))
      })
    {
      return partial
    }
    return pool.firstIndex(where: {
      guard let candidate = $0 else { return false }
      return sameNumber(candidate.raw.value, row.value)
        && sameUnit(candidate.raw.unitRaw, row.unit)
    })
  }

  static func sameNumber(_ a: Double, _ b: Double) -> Bool {
    abs(a - b) <= 1e-9 * max(1, abs(a), abs(b))
  }

  static func sameUnit(_ a: String, _ b: String) -> Bool {
    if let left = Analytes.normaliseUnit(a), let right = Analytes.normaliseUnit(b) {
      return left == right
    }
    return compact(a) == compact(b)
  }

  /// Spacing, case and the decimal separator do not make a range different.
  static func sameReference(_ extracted: String?, _ printed: String) -> Bool {
    guard let extracted else { return false }
    return compact(extracted).replacingOccurrences(of: ",", with: ".")
      == compact(printed).replacingOccurrences(of: ",", with: ".")
  }

  private static func compact(_ text: String) -> String {
    text.components(separatedBy: .whitespacesAndNewlines).joined().lowercased()
  }
}
