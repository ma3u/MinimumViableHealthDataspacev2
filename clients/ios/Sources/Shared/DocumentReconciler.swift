import Foundation

/// Repairs a recognised table against the raw recognised text of the same page.
///
/// ## Why this exists
///
/// Two Vision **engines** read the same lab sheet, and they do not see the same
/// characters.
///
/// `RecognizeDocumentsRequest` (iOS 26 Swift Vision) understands that a lab
/// sheet is a table. It returns typed cells with row and column indices and a
/// bounding box each, so analyte, value, unit and reference range arrive already
/// separated instead of as one string a regex has to split. It is also the only
/// way to satisfy #186's bounding-box requirement.
///
/// The legacy `VNRecognizeTextRequest` understands nothing about structure, but
/// it reads characters the new stack drops. Measured on the synthetic German lab
/// sheet in `VisionDocumentReaderTests`, same image, same row:
///
///     legacy VNRecognizeTextRequest   'HbA1c' '5,4' '%' '4,0 - 6,0'
///     Swift RecognizeTextRequest      'HbA1c' '5,4'     '4,0 - 6,0'
///     RecognizeDocumentsRequest       ["HbA1c", "5,4", "", "4,0 - 6,0"]
///
/// Worth being precise about, because the first reading of this was wrong: the
/// lone `%` is not lost by *table* recognition. It is lost by the **new Vision
/// text stack**, which the documents request is built on, so both new APIs drop
/// it and only the old engine reads it.
///
/// That one character matters more than it looks. The unit selects the LOINC
/// code, never the label: HbA1c in `%` is 4548-4 and in `mmol/mol` is 59261-8.
/// An empty unit is correctly refused as `unknown-unit` rather than mis-coded,
/// so nothing unsafe happens, but a perfectly readable row is thrown away.
///
/// So this is not one engine cross-checking itself, which would recover nothing.
/// It is structure from the new engine and characters from the old one.
///
/// ## Correction, 2026-09-19: that measurement was taken on macOS
///
/// The three-way comparison above comes from `swift test`, which runs on macOS.
/// A diagnostics record from the **iPhone simulator** (iOS 26.5) shows the
/// legacy pass losing the same `%`: of 42 recognised fragments on the page, not
/// one contains a `%`, and the document pass's unit cell for that row is empty
/// too. On iOS, both engines lose it.
///
/// The hybrid still earns its keep, for structure and for the characters the
/// two engines do disagree about. What it cannot do is recover a character
/// neither pass read. Nothing downstream may invent it either: the unit selects
/// the LOINC code, so an HbA1c row whose `%` is gone must be **reported as
/// unread**, which is what `LabLineParser` does with an empty unit cell.
///
/// This is why the diagnostics record exists. The claim was believed for six
/// days because the only measurement ever taken ran on the wrong operating
/// system.
///
/// ## The rules, and why they are this conservative
///
/// The table pass is treated as the authority on structure and the text pass as
/// the authority on characters, but only where the two cannot contradict each
/// other:
///
/// - **Recovered:** the cell is empty and text fell inside it. Take the text.
///   This is the `%` case, and the reason the whole type exists.
/// - **Otherwise keep the cell**, always. A non-empty cell is never rewritten.
///
/// There used to be a third rule: extend a cell when the text pass read the
/// same thing but longer, on the theory that `5` should become `5,4`. It was
/// speculation, it was never measured, and measuring it killed it. On a sheet
/// skewed by one degree, which is an utterly ordinary hand-held photograph, a
/// cell's axis-aligned box overlaps its neighbour's content, so the fragments
/// inside it pick up stray characters. `mg/dl` became `mg/dll`, which still
/// *contains* `mg/dl` and is longer, so the rule fired and produced a unit with
/// no UCUM mapping. Coded values dropped from 8 to 6 at one degree and to 3 at
/// two degrees. `ScanningTests` is what caught it.
///
/// The lesson is narrower than "be careful": a repair rule that can rewrite a
/// cell the structured pass read correctly is a rule that can only lose
/// information on a good scan. Recovery from *empty* cannot.
///
/// Fragments are assigned to a cell by their **centre**, not by overlap, so a
/// fragment can land in exactly one cell and text cannot be duplicated into two
/// columns. A fragment whose centre falls in no cell is reported in
/// `orphanedFragments` rather than dropped: text that is on the page but in no
/// table row is exactly where a footnote, a second table or a failed layout
/// hides, and silently discarding it would make a bad parse look like a clean
/// one.
public enum DocumentReconciler {

  /// One run of recognised text, with no structural claim attached.
  public struct TextFragment: Sendable, Equatable, Codable {
    public let text: String
    public let region: SourceRegion
    /// Recogniser confidence, carried through for triage, never for gating.
    public let confidence: Double?

    public init(text: String, region: SourceRegion, confidence: Double? = nil) {
      self.text = text
      self.region = region
      self.confidence = confidence
    }
  }

  /// One cell as the table pass saw it.
  public struct Cell: Sendable, Equatable, Codable {
    public let text: String
    public let region: SourceRegion
    public let row: Int
    public let column: Int

    public init(text: String, region: SourceRegion, row: Int, column: Int) {
      self.text = text
      self.region = region
      self.row = row
      self.column = column
    }
  }

  /// Which pass a cell's final text came from. Reported so a reviewer can see
  /// where the table pass needed help rather than having to infer it.
  public enum Origin: String, Sendable, Equatable, Codable {
    /// The table pass read it and nothing needed repairing.
    case document
    /// The table pass read nothing here; the text pass did.
    case recovered
  }

  public struct ReconciledCell: Sendable, Equatable, Codable {
    public let text: String
    public let region: SourceRegion
    public let column: Int
    public let origin: Origin

    public init(text: String, region: SourceRegion, column: Int, origin: Origin) {
      self.text = text
      self.region = region
      self.column = column
      self.origin = origin
    }
  }

  /// One table row, cells left to right.
  public struct Row: Sendable, Equatable, Codable {
    public let cells: [ReconciledCell]
    /// Union of the row's cells, for highlighting the whole row on the page.
    public let region: SourceRegion

    public init(cells: [ReconciledCell], region: SourceRegion) {
      self.cells = cells
      self.region = region
    }

    /// The row rendered as the line grammar expects it.
    ///
    /// Two spaces, matching the separator the text-only path already produces,
    /// so `LabLineParser`'s line regex sees exactly the shape it was written
    /// and tested against. Empty cells are dropped rather than emitted as runs
    /// of whitespace, because `label  value    range` would let the regex take
    /// the range as the unit.
    public var line: String {
      cells.map(\.text)
        .filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty }
        .joined(separator: "  ")
    }
  }

  public struct Result: Sendable, Equatable {
    public let rows: [Row]
    /// Recognised text whose centre fell in no cell. Never discarded.
    public let orphanedFragments: [TextFragment]

    public init(rows: [Row], orphanedFragments: [TextFragment]) {
      self.rows = rows
      self.orphanedFragments = orphanedFragments
    }

    /// Cells the table pass alone would have got wrong.
    public var repairedCellCount: Int {
      rows.reduce(0) { $0 + $1.cells.filter { $0.origin != .document }.count }
    }
  }

  /// Collapses every run of whitespace, newlines included, to one space.
  ///
  /// A recognised cell's transcript can contain a line break: a long analyte
  /// name wraps inside its own cell, and Vision reports the wrap. The row is
  /// still one row, but `Row.line` then carries the break into the line
  /// grammar, which splits on newlines and sees two half-rows, neither of
  /// which parses. Measured on a real sheet (#186): `Hämoglobin` and
  /// `Retikulozyten` were both lost this way, each stored as a line with a
  /// newline in the middle.
  static func collapsingWhitespace(_ text: String) -> String {
    text.split(whereSeparator: { $0.isWhitespace || $0.isNewline })
      .joined(separator: " ")
  }

  /// Reconciles one page.
  public static func reconcile(cells: [Cell], fragments: [TextFragment]) -> Result {
    guard !cells.isEmpty else {
      return Result(rows: [], orphanedFragments: fragments)
    }

    var claimed = Set<Int>()
    var reconciled: [ReconciledCell] = []
    reconciled.reserveCapacity(cells.count)

    for cell in cells {
      // Fragments whose centre sits in this cell, left to right.
      var inside: [(index: Int, fragment: TextFragment)] = []
      for (index, fragment) in fragments.enumerated() where !claimed.contains(index) {
        if cell.region.contains(
          page: fragment.region.page, x: fragment.region.midX, y: fragment.region.midY)
        {
          inside.append((index, fragment))
        }
      }
      inside.sort { $0.fragment.region.x < $1.fragment.region.x }
      for entry in inside { claimed.insert(entry.index) }

      let fromText = collapsingWhitespace(inside.map(\.fragment.text).joined(separator: " "))
      let fromCell = collapsingWhitespace(cell.text)

      // Only an empty cell is ever filled in. See the type's documentation for
      // the measurement that removed the second rule.
      let resolved: (String, Origin) =
        fromCell.isEmpty && !fromText.isEmpty
        ? (fromText, .recovered)
        : (fromCell, .document)

      reconciled.append(
        ReconciledCell(
          text: resolved.0, region: cell.region, column: cell.column, origin: resolved.1))
    }

    // Rebuild rows in the table pass's own row order.
    var byRow: [Int: [ReconciledCell]] = [:]
    for (cell, source) in zip(reconciled, cells) {
      byRow[source.row, default: []].append(cell)
    }

    let rows: [Row] = byRow.keys.sorted().compactMap { index in
      let cells = byRow[index]!.sorted { $0.column < $1.column }
      guard let first = cells.first else { return nil }
      let region = cells.dropFirst().reduce(first.region) { $0.union($1.region) }
      return Row(cells: cells, region: region)
    }

    let orphans = fragments.enumerated()
      .filter { !claimed.contains($0.offset) }
      .map(\.element)

    return Result(rows: rows, orphanedFragments: orphans)
  }
}
