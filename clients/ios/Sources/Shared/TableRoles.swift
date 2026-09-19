import Foundation

/// Works out what each column of a recognised lab table actually holds.
///
/// ## Why position cannot be assumed
///
/// The line grammar in `LabLineParser` hardcodes one layout:
///
///     Analyt            Wert   Einheit   Referenzbereich
///     LDL-Cholesterin    141   mg/dl     < 116
///
/// A real report from a Berlin study centre, scanned 2026-09-13, uses another:
///
///     Analyt                  Einheit  Referenzbereich  Wert
///     LDL-Cholesterin [P]     mmol/l   < 3.34           4.51
///     Transferrin-Saettigung [P]  %    16 - 45          46.1
///     Lp(a) [P]               g/l      < 0.300          <0.100
///
/// Unit before value, reference before value. Against that sheet the positional
/// grammar does not merely mis-read a row, it fails every single one: 26 lines
/// that plainly held measurements were reported unreadable.
///
/// Guessing harder at the line level cannot fix this, because the ambiguity is
/// real: in `Kortisol [P] nmol/l 145 - 619 432.5` there is nothing about
/// `145 - 619` or `432.5` in isolation that says which is the result.
///
/// ## What resolves it
///
/// A table has many rows, and the columns are consistent down the page even
/// when their order is not what we expected. So the decision is made **once per
/// table, using every row**, and then applied to each row. A column that reads
/// as a unit in nine rows out of ten is the unit column, whatever position it
/// sits in, and the one row where `%` could equally be a value follows the
/// table rather than being guessed at on its own.
///
/// This is the whole reason `RecognizeDocumentsRequest` was worth adopting.
/// Having paid for real cells, joining them back into a string and re-splitting
/// it with a positional regex threw the structure away again.
public enum TableRoles {

  public enum Role: String, Sendable, Equatable {
    case label
    case value
    case unit
    case reference
    /// Carried but not interpreted: specimen matrix, flags, converted values,
    /// the lab's own method column.
    case other
  }

  public struct Layout: Sendable, Equatable, Codable {
    public let label: Int
    public let value: Int
    public let unit: Int
    public let reference: Int?

    /// How many rows the layout was inferred from. A layout read off one or two
    /// rows is a coincidence, not a layout.
    public let rowsConsidered: Int
  }

  // MARK: - Cell classification

  /// True when the cell is a bare measurement: a number, optionally with a
  /// comparator, and nothing that makes it an interval.
  static func looksLikeValue(_ raw: String) -> Bool {
    let text = raw.trimmingCharacters(in: .whitespaces)
    guard !text.isEmpty, !looksLikeInterval(text) else { return false }
    let stripped = text
      .replacingOccurrences(of: "^\\s*(<=?|>=?|≤|≥)\\s*", with: "", options: .regularExpression)
      .trimmingCharacters(in: .whitespaces)
    // A trailing flag (`+`, `*`, `H`, `L`, `-`) or a glued `%` is still a
    // value cell.
    let withoutFlag = LabLineParser.splitGluedUnit(
      stripped.replacingOccurrences(
        of: LabLineParser.trailingFlag, with: "", options: .regularExpression)
    ).value.replacingOccurrences(
      of: LabLineParser.trailingFlag, with: "", options: .regularExpression)
    return LabLineParser.parseNumber(withoutFlag) != nil
  }

  /// An interval (`16 - 45`, `0,70 bis 1,20`) or a single bound (`< 116`).
  static func looksLikeReference(_ raw: String) -> Bool {
    let text = raw.trimmingCharacters(in: .whitespaces)
    guard !text.isEmpty else { return false }
    if looksLikeInterval(text) { return true }
    let range = LabLineParser.parseReferenceRange(text)
    // A bare number parses as no range at all, which is what keeps a value cell
    // from being mistaken for a bound.
    return (range.low != nil || range.high != nil)
      && text.range(of: "^\\s*(<=?|>=?|≤|≥|bis)", options: [.regularExpression, .caseInsensitive])
        != nil
  }

  private static func looksLikeInterval(_ text: String) -> Bool {
    text.range(
      of: "^\\s*\\d[\\d.,]*\\s*(?:-|–|—|bis)\\s*\\d[\\d.,]*",
      options: [.regularExpression, .caseInsensitive]) != nil
  }

  static func looksLikeUnit(_ raw: String) -> Bool {
    let text = raw.trimmingCharacters(in: .whitespaces)
    guard !text.isEmpty, text.count <= 16 else { return false }
    return Analytes.normaliseUnit(text) != nil
  }

  /// A label cell: starts with a letter and is not a unit.
  ///
  /// The second half matters. `%` is a perfectly good unit and also the tail of
  /// `Neutrophile %`, and a differential blood count is mostly such labels.
  static func looksLikeLabel(_ raw: String) -> Bool {
    let text = raw.trimmingCharacters(in: .whitespaces)
    guard let first = text.first, first.isLetter else { return false }
    return !looksLikeUnit(text)
  }

  // MARK: - Inference

  /// Infers the layout from every row, or returns nil when the table does not
  /// look like a lab panel at all.
  ///
  /// Returning nil rather than a low-confidence guess is deliberate: the caller
  /// falls back to the line grammar, which is well tested on the layout it was
  /// written for. A wrong layout applied confidently to every row of a sheet is
  /// far worse than reading none of them.
  public static func infer(rows: [[String]], minimumRows: Int = 3) -> Layout? {
    let columnCount = rows.map(\.count).max() ?? 0
    guard columnCount >= 3, rows.count >= minimumRows else { return nil }

    func score(_ column: Int, _ test: (String) -> Bool) -> Int {
      rows.reduce(0) { total, row in
        guard column < row.count else { return total }
        return total + (test(row[column]) ? 1 : 0)
      }
    }

    let unitScores = (0..<columnCount).map { score($0) { looksLikeUnit($0) } }
    let valueScores = (0..<columnCount).map { score($0) { looksLikeValue($0) } }
    let referenceScores = (0..<columnCount).map { score($0) { looksLikeReference($0) } }
    let labelScores = (0..<columnCount).map { score($0) { looksLikeLabel($0) } }

    // A column must describe most of the rows to claim a role. Half is the
    // threshold because a real sheet always has a header row and usually a
    // blank or a section heading.
    let quorum = max(2, rows.count / 2)

    guard let unit = unitScores.indices.max(by: { unitScores[$0] < unitScores[$1] }),
      unitScores[unit] >= quorum
    else { return nil }

    // The reference column is chosen first, because a reference cell also reads
    // as a value cell often enough that choosing the value first can steal it.
    let reference = referenceScores.indices
      .filter { $0 != unit && referenceScores[$0] >= quorum }
      .max(by: { referenceScores[$0] < referenceScores[$1] })

    guard let value = valueScores.indices
      .filter({ $0 != unit && $0 != reference })
      .max(by: { valueScores[$0] < valueScores[$1] }),
      valueScores[value] >= quorum
    else { return nil }

    guard let label = labelScores.indices
      .filter({ $0 != unit && $0 != value && $0 != reference })
      .max(by: { labelScores[$0] < labelScores[$1] }),
      labelScores[label] >= quorum
    else { return nil }

    return Layout(
      label: label, value: value, unit: unit, reference: reference,
      rowsConsidered: rows.count)
  }
}
