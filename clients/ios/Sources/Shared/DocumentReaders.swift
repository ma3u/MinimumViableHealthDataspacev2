import Foundation

/// The readers of documents that are not lab sheets, applied in turn to the
/// line grammar's reading. The import and the replay both call this, so the
/// phone and `ScanReplay` cannot read a document differently.
///
/// Each reader recognises its own document and leaves any other untouched:
/// a 24-hour blood pressure report and an ECG printout by geometry, a
/// Holter summary, a DXA scan, an ergometry, a spiroergometry and a lactate
/// test by their labels, a glucose sensor's daily pattern by position.
public enum DocumentReaders {

  public static func applied(
    to sheet: ExtractionResult, pageTexts: [String], pages: [ScanDiagnostics.Page]
  ) -> ExtractionResult {
    var result = AmbulatoryBloodPressure.applied(to: sheet, pageTexts: pageTexts, pages: pages)
    result = Electrocardiogram.applied(to: result, pageTexts: pageTexts, pages: pages)
    result = HolterReport.applied(to: result, pageTexts: pageTexts)
    result = BodyComposition.applied(to: result, pageTexts: pageTexts)
    result = ExerciseECG.applied(to: result, pageTexts: pageTexts)
    result = CardiopulmonaryExercise.applied(to: result, pageTexts: pageTexts)
    result = LactateTest.applied(to: result, pageTexts: pageTexts)
    result = GlucoseProfile.applied(to: result, pageTexts: pageTexts, pages: pages)
    return result
  }
}

/// Whether a photographed page could be read at all.
///
/// A page photographed out of focus still yields text, and the text is
/// nonsense: on a real lactate report's covering letter, `Berlin, den
/// 12.05.2026` (date invented) came back as `Serfin, den 12.05.2008`, with lines in
/// Cyrillic, and the line grammar read values and a wrong date out of it.
/// Such a page is left out of the reading and the person is told to
/// photograph it again.
///
/// Measured over every page of 26 real reports: on the blurred page 93 % of
/// the recognised fragments had a confidence below 0.5; on every other page,
/// charts and ECG traces included, at most 36 %. The limit sits between.
public enum PageQuality {

  public static func isUnreadable(_ page: ScanDiagnostics.Page) -> Bool {
    let confidences = page.fragments.compactMap(\.confidence)
    if confidences.count >= 20 {
      let low = confidences.filter { $0 < 0.5 }.count
      return Double(low) / Double(confidences.count) >= 0.6
    }
    // A record stored before confidences were kept: the same page has
    // eleven lines in Cyrillic out of 43, every other real page at most two.
    guard !page.fragments.isEmpty else { return false }
    let lines = page.plainText.components(separatedBy: .newlines)
      .filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty }
    let foreign = lines.filter(DocumentReconciler.hasForeignScript).count
    return lines.count >= 10 && foreign >= 5 && Double(foreign) >= Double(lines.count) * 0.15
  }

  /// The 1-based numbers of the pages that could not be read.
  public static func unreadablePages(_ pages: [ScanDiagnostics.Page]) -> [Int] {
    pages.filter(isUnreadable).map(\.page)
  }

  /// The page texts with every unreadable page's text taken out, so neither
  /// a reader nor the date and laboratory detection sees it.
  public static func readableTexts(_ texts: [String], pages: [ScanDiagnostics.Page]) -> [String] {
    let unreadable = Set(unreadablePages(pages))
    return texts.enumerated().map { unreadable.contains($0.offset + 1) ? "" : $0.element }
  }
}
