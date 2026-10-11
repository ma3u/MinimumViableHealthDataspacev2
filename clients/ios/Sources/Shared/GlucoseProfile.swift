import Foundation

/// Reads the average glucose from a glucose sensor's daily pattern page
/// (a continuous glucose monitor's report, "Tagesmuster").
///
/// The page is printed across the paper and photographed upright, so its
/// table runs down the page: a row of times (`00:00`, `02:00`, ...) headed
/// by "Tages-Durchschnitt", and beside it a row of glucose values headed by
/// the average. The recogniser's reading order puts the average between an
/// axis tick and the target range (`180  118  Durchschnitt  Tages-`, from a
/// fictional page), so it is read by position instead: the number nearest
/// the word "Durchschnitt". The rest of its row are the values at each
/// time of day; when they are read, their mean must be close to the
/// average, or the number is not the average.
public enum GlucoseProfile {

  public static func looksLike(_ text: String) -> Bool {
    let t = ReportMetadataExtractor.fold(text)
    return t.contains("glukose") && (t.contains("tagesmuster") || t.contains("libre"))
  }

  public static func read(pages: [(text: String, fragments: [DocumentReconciler.TextFragment])])
    -> [RawLabValue]
  {
    for page in pages where looksLike(page.text) {
      guard
        let label = page.fragments.first(where: {
          ReportMetadataExtractor.fold($0.text).contains("durchschnitt")
        })
      else { continue }
      let numbers = page.fragments.compactMap { fragment -> (Double, SourceRegion)? in
        let text = fragment.text.trimmingCharacters(in: .whitespaces)
        guard text.range(of: #"^\d{2,3}$"#, options: .regularExpression) != nil,
          let value = Double(text), (40...400).contains(value)
        else { return nil }
        return (value, fragment.region)
      }
      func distance(_ a: SourceRegion, _ b: SourceRegion) -> Double {
        let dx = a.midX - b.midX
        let dy = a.midY - b.midY
        return (dx * dx + dy * dy).squareRoot()
      }
      guard let average = numbers.min(by: { distance($0.1, label.region) < distance($1.1, label.region) }),
        distance(average.1, label.region) < 0.08
      else { continue }

      // The row the average heads: the numbers in line with it, along
      // whichever axis the times run.
      let times = page.fragments.filter {
        $0.text.range(of: #"^\d{2}:\d{2}$"#, options: .regularExpression) != nil
      }
      if times.count >= 4 {
        let xs = times.map(\.region.midX)
        let ys = times.map(\.region.midY)
        let runsDown = (ys.max()! - ys.min()!) > (xs.max()! - xs.min()!)
        let row = numbers.filter {
          $0.1 != average.1
            && (runsDown
              ? abs($0.1.midX - average.1.midX) < 0.015 : abs($0.1.midY - average.1.midY) < 0.015)
        }
        if row.count >= 6 {
          let mean = row.map(\.0).reduce(0, +) / Double(row.count)
          guard abs(mean - average.0) <= average.0 * 0.15 else { continue }
        }
      }
      return [
        RawLabValue(
          label: "Durchschnittliche Glukose (Sensor)", value: average.0, unitRaw: "mg/dL",
          line: "Tages-Durchschnitt \(PrintedFields.text(average.0)) mg/dL", lineNumber: 9900,
          region: average.1)
      ]
    }
    return []
  }

  public static func applied(
    to sheet: ExtractionResult, pageTexts: [String], pages: [ScanDiagnostics.Page]
  ) -> ExtractionResult {
    let input = pageTexts.enumerated().map { index, text in
      (text: text, fragments: index < pages.count ? pages[index].fragments : [])
    }
    return PrintedFields.replacing(sheet, with: read(pages: input), minimum: 1)
  }
}
