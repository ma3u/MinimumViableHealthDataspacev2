import Foundation

#if canImport(PDFKit)
  import PDFKit
#endif

/// A PDF text layer's lines, rebuilt from where the text sits on the page.
///
/// `PDFPage.string` returns text in the order the PDF draws it, which is not
/// always the order a person reads it. Measured on a laboratory's own PDF:
/// two rows 12 points apart, GOT and GPT, came out as both names on one line
/// and both values on the next, so GOT's value was filed under a merged
/// label and GPT's was lost. The geometry was never wrong, only the order.
///
/// So the line fragments are regrouped by height: fragments that overlap
/// vertically by more than half the smaller one's height are one row, read
/// left to right. Text left of the table (a side column of `Fallnummer:`,
/// `Tagesnummer:`, `EMail:`) stays on lines of its own, or it would be glued
/// onto the result rows beside it and cost them.
///
/// `LabImport` parses both this and `PDFPage.string` and keeps whichever
/// codes more values, so a PDF whose drawing order was already right cannot
/// get worse.
public enum PDFTextRows {

  /// One page's rebuilt lines, or nil when the text layer has no fragments.
  public static func lines(pdf: Data) -> [String]? {
    #if canImport(PDFKit)
      guard let document = PDFDocument(data: pdf) else { return nil }
      var pages: [String] = []
      for index in 0..<document.pageCount {
        guard let page = document.page(at: index) else { return nil }
        pages.append(lines(page: page).joined(separator: "\n"))
      }
      return pages
    #else
      return nil
    #endif
  }

  #if canImport(PDFKit)
    static func lines(page: PDFPage) -> [String] {
      guard let all = page.selection(for: page.bounds(for: .mediaBox)) else { return [] }
      let fragments = all.selectionsByLine().compactMap { selection -> (CGRect, String)? in
        guard let text = selection.string?.trimmingCharacters(in: .whitespacesAndNewlines),
          !text.isEmpty
        else { return nil }
        return (selection.bounds(for: page), text)
      }
      return rows(fragments)
    }
  #endif

  /// The grouping itself, on plain rectangles, so it can be tested without a
  /// PDF. PDF coordinates: y grows upwards.
  static func rows(_ fragments: [(CGRect, String)]) -> [String] {
    let sorted = fragments.sorted { $0.0.midY > $1.0.midY }
    guard !sorted.isEmpty else { return [] }
    // The table's left edge: its header's, or the most common start.
    var starts: [Int: Int] = [:]
    for fragment in sorted { starts[Int(fragment.0.minX.rounded()), default: 0] += 1 }
    let header = sorted.first { $0.1.hasPrefix("Analyse") || $0.1.hasPrefix("Analyt") }
    let left =
      header?.0.minX ?? CGFloat(starts.max { $0.value < $1.value || ($0.value == $1.value && $0.key > $1.key) }!.key)

    var rows: [[(CGRect, String)]] = []
    for fragment in sorted {
      // A side column, left of the table, never joins a row.
      if fragment.0.maxX < left - 2 {
        rows.append([fragment])
        continue
      }
      if let last = rows.last, let anchor = last.first, anchor.0.maxX >= left - 2 {
        let overlap = min(anchor.0.maxY, fragment.0.maxY) - max(anchor.0.minY, fragment.0.minY)
        if overlap > 0.5 * min(anchor.0.height, fragment.0.height) {
          rows[rows.count - 1].append(fragment)
          continue
        }
      }
      rows.append([fragment])
    }
    return rows.map { $0.sorted { $0.0.minX < $1.0.minX }.map(\.1).joined(separator: " ") }
  }
}
