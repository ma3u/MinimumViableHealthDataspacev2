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
/// ## The rules, and why they are this conservative
///
/// The table pass is treated as the authority on structure and the text pass as
/// the authority on characters, but only where the two cannot contradict each
/// other:
///
/// - **Recovered:** the cell is empty and text fell inside it. Take the text.
///   This is the `%` case, and the reason the whole type exists.
/// - **Extended:** the cell text is a prefix or substring of what the text pass
///   read there, and the text pass read more. Take the longer one. Containment
///   means the two agree and one is simply more complete, so this cannot invent
///   a value. `5` becoming `5,4` is the case worth catching.
/// - **Otherwise keep the cell.** Where the two genuinely disagree, the
///   structured pass wins and the disagreement is not papered over.
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
  public struct TextFragment: Sendable, Equatable {
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
  public struct Cell: Sendable, Equatable {
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
    /// The text pass read the same thing, more completely.
    case extended
  }

  public struct ReconciledCell: Sendable, Equatable {
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
  public struct Row: Sendable, Equatable {
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

      let fromText =
        inside
        .map(\.fragment.text)
        .joined(separator: " ")
        .trimmingCharacters(in: .whitespaces)
      let fromCell = cell.text.trimmingCharacters(in: .whitespaces)

      let resolved: (String, Origin)
      if fromCell.isEmpty, !fromText.isEmpty {
        resolved = (fromText, .recovered)
      } else if !fromCell.isEmpty, fromText.count > fromCell.count, fromText.contains(fromCell) {
        resolved = (fromText, .extended)
      } else {
        resolved = (fromCell, .document)
      }

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
