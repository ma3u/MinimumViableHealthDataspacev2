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

  // MARK: - The AGP summary page

  /// True for the summary page of an AGP report (the international
  /// consensus Ambulatory Glucose Profile, Battelino et al. 2019), in German
  /// or English.
  public static func looksLikeSummary(_ text: String) -> Bool {
    let t = ReportMetadataExtractor.fold(text)
    return t.contains("zeit im zielbereich") || t.contains("time in range")
      || t.contains("glukosemanagement") || t.contains("glucose management indicator")
  }

  /// One glucose range of the time-in-ranges bar, by the bounds it prints
  /// in mg/dl and in mmol/l.
  struct Band {
    let label: String
    let mgdl: String
    let mmol: String
  }

  static let bands: [Band] = [
    Band(label: "Zeit deutlich über dem Zielbereich", mgdl: #">\s*250"#, mmol: #">\s*13[.,]9"#),
    Band(label: "Zeit über dem Zielbereich", mgdl: #"181\s*[-–]\s*250"#, mmol: #"10[.,]1\s*[-–]\s*13[.,]9"#),
    Band(label: "Zeit im Zielbereich", mgdl: #"70\s*[-–]\s*180"#, mmol: #"3[.,]9\s*[-–]\s*10[.,]0"#),
    Band(label: "Zeit unter dem Zielbereich", mgdl: #"54\s*[-–]\s*69"#, mmol: #"3[.,]0\s*[-–]\s*3[.,]8"#),
    Band(label: "Zeit deutlich unter dem Zielbereich", mgdl: #"<\s*54"#, mmol: #"<\s*3[.,]0"#),
  ]

  /// The summary page's figures, each checked where the page allows:
  ///
  /// - the five ranges of the time-in-ranges bar add up to 100 %, or none
  ///   of them is read (each is printed rounded, so within 2);
  /// - the GMI is the mean glucose's: 3.31 + 0.02392 × mg/dl, or
  ///   12.71 + 4.70587 × mmol/l (Bergenstal et al. 2018);
  /// - the coefficient of variation is the standard deviation over the mean.
  public static func summary(pageTexts: [String]) -> [RawLabValue] {
    guard let page = pageTexts.first(where: looksLikeSummary) else { return [] }
    var values: [RawLabValue] = []
    func add(_ label: String, _ value: Double, _ unit: String, _ line: String) {
      values.append(PrintedFields.value(label, value, unit, line: line, number: 9910 + values.count))
    }
    let percent = #"(\d{1,3}(?:[.,]\d)?)\s*%"#
    let lines = page.components(separatedBy: .newlines)

    // The time in ranges: a line with a range's bounds and a percentage.
    var shares: [(band: Band, value: Double, line: String)] = []
    for band in bands {
      for line in lines {
        guard
          line.range(of: band.mgdl, options: .regularExpression) != nil
            || line.range(of: band.mmol, options: .regularExpression) != nil,
          let figure = PrintedFields.lineGroups(percent + #"(?!.*%)"#, in: line).first?.first,
          let value = PrintedFields.decimal(figure), (0...100).contains(value)
        else { continue }
        shares.append((band, value, line.trimmingCharacters(in: .whitespaces)))
        break
      }
    }
    if shares.count == bands.count,
      PrintedFields.agree(shares.map(\.value).reduce(0, +), 100, within: 2)
    {
      for share in shares { add(share.band.label, share.value, "%", share.line) }
    }

    // The statistics.
    let flat = lines.joined(separator: " ")
    let mean =
      PrintedFields.groups(
        #"(?:Durchschnittliche[rs]?\s+Glukose(?:wert)?|Mittlere[rs]?\s+Glukose(?:wert)?|Average\s+Glucose)\D{0,20}?(\d{1,3}(?:[.,]\d)?)\s*(mg/dl|mmol/l)"#,
        in: flat)
    let meanValue = mean.flatMap { PrintedFields.decimal($0[0]) }
    let inMmol = mean.map { $0[1].lowercased() == "mmol/l" } ?? false
    if let meanValue, let mean {
      add("Durchschnittliche Glukose (Sensor)", meanValue, inMmol ? "mmol/l" : "mg/dL", "Durchschnittliche Glukose \(mean[0]) \(mean[1])")
    }
    if let figure = PrintedFields.firstGroup(#"\(?GMI\)?\D{0,15}?(\d{1,2}[.,]\d)\s*%"#, in: flat),
      let gmi = PrintedFields.decimal(figure), let meanValue,
      PrintedFields.agree(gmi, inMmol ? 12.71 + 4.70587 * meanValue : 3.31 + 0.02392 * meanValue, within: 0.1)
    {
      add("Glukosemanagement-Indikator (GMI)", gmi, "%", "GMI \(figure) %")
    }
    let sd = PrintedFields.firstGroup(
      #"(?:Standardabweichung|Standard\s+Deviation|\bSD\b)\D{0,15}?(\d{1,3}(?:[.,]\d)?)\s*mg/dl"#, in: flat
    ).flatMap(PrintedFields.decimal)
    if let figure = PrintedFields.firstGroup(
      #"(?:Glukosevariabilit\S*|Glucose\s+Variability|Variationskoeffizient)\D{0,80}?"# + percent, in: flat),
      let cv = PrintedFields.decimal(figure), (5...80).contains(cv)
    {
      // Checked by the standard deviation when the page prints one.
      let checked = sd.flatMap { sd in meanValue.map { sd / $0 * 100 } }
      if inMmol || checked.map({ PrintedFields.agree($0, cv, within: 1) }) ?? true {
        add("Glukosevariabilität (VK)", cv, "%", "Glukosevariabilität \(figure) %")
        if let sd, !inMmol {
          add("Standardabweichung der Glukose (Sensor)", sd, "mg/dL", "SD \(PrintedFields.text(sd)) mg/dL")
        }
      }
    }
    if let figure = PrintedFields.firstGroup(
      #"(?:Zeit,?\s+in\s+der\s+das\s+CGM\s+aktiv\s+war|Time\s+CGM\s+is\s+Active|Sensor\s+aktiv)\D{0,10}?"# + percent, in: flat),
      let active = PrintedFields.decimal(figure), (0...100).contains(active)
    {
      add("Sensor aktiv", active, "%", "% Zeit, in der das CGM aktiv war \(figure) %")
    }
    return values
  }

  public static func applied(
    to sheet: ExtractionResult, pageTexts: [String], pages: [ScanDiagnostics.Page]
  ) -> ExtractionResult {
    let input = pageTexts.enumerated().map { index, text in
      (text: text, fragments: index < pages.count ? pages[index].fragments : [])
    }
    // The summary page's average is the report's; the daily pattern's is
    // read only when there is no summary.
    let summary = summary(pageTexts: pageTexts)
    let daily = summary.contains { $0.label == "Durchschnittliche Glukose (Sensor)" }
      ? [] : read(pages: input)
    return PrintedFields.replacing(sheet, with: summary + daily, minimum: 1)
  }
}
