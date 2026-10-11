import Foundation

/// Reads the summary of a bicycle ergometry with ECG (Belastungs-EKG).
///
/// The first page prints a summary beside a trend chart, and a findings
/// paragraph under it that repeats the main figures (numbers from a
/// fictional report):
///
///     max. Last  225  W
///     Herzfrequenz, max  158  /min
///     Blutdruck, Ruhe  124 / 80  mmHg
///     Blutdruck, max.  196 / 88  mmHg
///     HFxBD, max.  30968
///     ...
///     max. Last: 225 W in Laststufe 5 ..., MET: 11.4
///     Ruhe HF: 71 /min, Max. HF: 158 /min ...
///
/// The line grammar reads the chart's axis ticks as values and the labels
/// as one another's. Each figure here is read wherever it is printed, and
/// every printing must agree. The rate-pressure product is the peak heart
/// rate times the peak systolic pressure, so it checks both; the peak load
/// is the printed share of the predicted load; and a physical working
/// capacity's watts per kilogram are its watts over the printed weight.
public enum ExerciseECG {

  /// True for the summary page of an ergometry.
  public static func looksLike(_ text: String) -> Bool {
    let t = ReportMetadataExtractor.fold(text)
    return t.contains("max. last") && (t.contains("pwc") || t.contains("laststufe"))
  }

  public static func read(pageTexts: [String]) -> [RawLabValue] {
    guard let summary = pageTexts.first(where: looksLike) else { return [] }
    let all = pageTexts.joined(separator: "\n")
    var values: [RawLabValue] = []
    func add(_ label: String, _ value: Double?, _ unit: String, _ line: String) {
      guard let value else { return }
      values.append(PrintedFields.value(label, value, unit, line: line, number: 9600 + values.count))
    }
    func number(_ pattern: String, _ text: String = summary) -> Double? {
      PrintedFields.firstGroup(pattern, in: text).flatMap(PrintedFields.decimal)
    }

    // The peak load, in the summary and in the findings; and the share of
    // the predicted load it was, which it must be.
    var load = PrintedFields.agreed([
      number(#"max\.?\s*Last\s+(\d{2,3})\s*W\b"#), number(#"max\.?\s*Last\s*:\s*(\d{2,3})\s*W\b"#),
    ])
    if let peak = load,
      // In the findings: `145% von Soll 172.0 W`, on one line. The summary
      // prints the share after the load and a line below it, where a
      // pattern that crosses lines pairs the load with itself.
      let g = PrintedFields.lineGroups(
        #"(\d{2,3})%\s*von\s*Soll\s*(\d{2,3}(?:[.,]\d)?)\s*W\b"#, in: summary).first,
      let share = Double(g[0]), let predicted = PrintedFields.decimal(g[1]), predicted > 0,
      !PrintedFields.agree(peak / predicted * 100, share, within: 1)
    {
      load = nil
    }
    if load.map({ !(20...600).contains($0) }) == true { load = nil }
    add("Maximale Belastung", load, "watts", "max. Last \(load.map(PrintedFields.text) ?? "") W")

    // The peak heart rate and blood pressure, checked by their product.
    var peakRate = PrintedFields.agreed([
      number(#"Herzfrequenz,?\s*max\.?\s+(\d{2,3})\b"#), number(#"Max\.?,?\s*HF\s*:\s*(\d{2,3})\b"#),
    ])
    let peakPressure = PrintedFields.groups(
      #"Blutdruck,?\s*max\.?\s+(\d{2,3})\s*/\s*(\d{2,3})"#, in: summary)
    var systolic = peakPressure.flatMap { Double($0[0]) }
    var diastolic = peakPressure.flatMap { Double($0[1]) }
    if let product = number(#"HFxBD,?\s*max\.?\s+(\d{4,5})\b"#) {
      if let rate = peakRate, let pressure = systolic, rate * pressure != product {
        peakRate = nil
        systolic = nil
        diastolic = nil
      }
    }
    if let s = systolic, let d = diastolic, !(d < s) {
      systolic = nil
      diastolic = nil
    }
    add("Maximale Herzfrequenz unter Belastung", peakRate, "/min", "Herzfrequenz, max \(peakRate.map(PrintedFields.text) ?? "") /min")
    add("Systolischer Blutdruck unter Belastung, maximal", systolic, "mmHg", "Blutdruck, max. \(peakPressure?.joined(separator: " / ") ?? "") mmHg")
    add("Diastolischer Blutdruck unter Belastung", diastolic, "mmHg", "Blutdruck, max. \(peakPressure?.joined(separator: " / ") ?? "") mmHg")

    // At rest: in the summary and the findings, and as the first stage of
    // the averaged complexes on the next pages.
    let restStage = all.range(of: "Ruhephase").map { String(all[$0.upperBound...]) }
    let restRate = PrintedFields.agreed([
      number(#"Ruhe\s*HF\s*:\s*(\d{2,3})\b"#),
      restStage.flatMap { number(#"HF\s*:\s*(\d{2,3})\b"#, $0) },
    ])
    add("Ruheherzfrequenz", restRate, "/min", "Ruhe HF: \(restRate.map(PrintedFields.text) ?? "") /min")
    let restPressure = PrintedFields.groups(
      #"Blutdruck,?\s*Ruhe\s+(\d{2,3})\s*/\s*(\d{2,3})"#, in: summary)
    let stagePressure = restStage.flatMap {
      PrintedFields.groups(#"BD\s*:\s*(\d{2,3})\s*/\s*(\d{2,3})"#, in: $0)
    }
    let restSystolic = PrintedFields.agreed([
      restPressure.flatMap { Double($0[0]) }, stagePressure.flatMap { Double($0[0]) },
    ])
    let restDiastolic = PrintedFields.agreed([
      restPressure.flatMap { Double($0[1]) }, stagePressure.flatMap { Double($0[1]) },
    ])
    if let s = restSystolic, let d = restDiastolic, d < s {
      let line = "Blutdruck, Ruhe \(PrintedFields.text(s)) / \(PrintedFields.text(d)) mmHg"
      add("Systolischer Blutdruck", s, "mmHg", line)
      add("Diastolischer Blutdruck", d, "mmHg", line)
    }

    let met = PrintedFields.agreed([
      number(#"MET,?\s*maximal\s+(\d{1,2}[.,]\d)\b"#), number(#"MET\s*:\s*(\d{1,2}[.,]\d)\b"#),
    ])
    add("MET, maximal", met.flatMap { (1...25).contains($0) ? $0 : nil }, "{MET}", "MET, maximal \(met.map(PrintedFields.text) ?? "")")

    if let printed = PrintedFields.firstGroup(#"Dauer\s*Belastung\s+(\d{1,2}:\d{2})\s*min"#, in: summary),
      let minutes = PrintedFields.minutes(printed), (1...60).contains(minutes)
    {
      add("Belastungsdauer", minutes, "minutes", "Dauer Belastung \(printed) min")
    }

    // Physical working capacity: `170  206  2.9  2.5 (117 %)`, the load at
    // a heart rate of 170, its watts per kilogram, and the predicted value.
    let weight = number(#"Gewicht\s+(\d{2,3}(?:[.,]\d{1,2})?)\s*kg"#)
    if let weight, weight > 0 {
      for g in PrintedFields.lineGroups(
        #"^\s*(?:\d{1,3}\s+)?(130|150|170)\s+(\d{2,3})\s+(\d[.,]\d)\s+\d[.,]\d\s*\("#, in: summary)
      {
        guard let watts = Double(g[1]), let perKilogram = PrintedFields.decimal(g[2]),
          PrintedFields.agree(watts / weight, perKilogram, within: 0.06)
        else { continue }
        add("PWC \(g[0])", watts, "watts", "PWC \(g[0])  \(g[1]) W  \(g[2]) W/kg")
      }
    }

    if let count = number(#"\bVES\s*:\s*(\d{1,4})\b"#) {
      add("Ventrikuläre Extrasystolen", count, "{beats}", "VES: \(PrintedFields.text(count))")
    }

    let header = summary.components(separatedBy: .newlines).prefix(12).map { $0 }
    return values + AmbulatoryBloodPressure.bodyMeasures(in: header, fragments: [])
  }

  public static func applied(to sheet: ExtractionResult, pageTexts: [String]) -> ExtractionResult {
    PrintedFields.replacing(sheet, with: read(pageTexts: pageTexts), minimum: 3)
  }
}
