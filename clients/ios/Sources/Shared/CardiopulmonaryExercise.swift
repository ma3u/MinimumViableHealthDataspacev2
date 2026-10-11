import Foundation

/// Reads a cardiopulmonary exercise test (CPET, spiroergometry) and the
/// spirometry printed with it.
///
/// The device writes its interpretation as sentences, one figure each
/// (numbers from a fictional report):
///
///     Die maximale Sauerstoffaufnahme von 2650 mL/min bzw. 104% des Soll ...
///     Die erste ventilatorische Schwelle liegt bei 1890 mL/min ... (71% der
///     gemessenen VO2max) ...
///
/// and prints the same figures again in tables whose labels and numbers the
/// recogniser scatters over separate lines. The line grammar took a year
/// for a value in eleven of those sentences and read nothing correctly. The
/// sentences are this reader's first source; the tables check them where
/// a figure can be checked:
///
/// - the oxygen uptake per kilogram is the uptake over the printed weight,
///   and its printed share of the predicted value is the uptake's;
/// - the oxygen pulse is the uptake over the peak heart rate;
/// - the first threshold is its printed share of the measured maximum;
/// - the peak heart rate is its printed share of the predicted one, and the
///   heart rate reserve is what is left of that prediction;
/// - FEV1 over FVC is the printed ratio, in every table that prints them.
///
/// A figure a check contradicts is not read.
public enum CardiopulmonaryExercise {

  public static func looksLike(_ text: String) -> Bool {
    let t = ReportMetadataExtractor.fold(text)
    return t.contains("fev1") || t.contains("ventilatorische schwelle") || t.contains("cpet")
  }

  // `VO2` as the recogniser reads it: with a zero, or a subscript lost.
  private static let vo2 = #"V[O0]2"#

  public static func read(pageTexts: [String]) -> [RawLabValue] {
    guard pageTexts.contains(where: looksLike) else { return [] }
    let all = pageTexts.joined(separator: "\n")
    // The sentences, with the recogniser's line breaks taken out.
    let prose = all.components(separatedBy: .newlines).joined(separator: " ")
    var values: [RawLabValue] = []
    func add(_ label: String, _ value: Double?, _ unit: String, _ line: String) {
      guard let value else { return }
      values.append(PrintedFields.value(label, value, unit, line: line, number: 9700 + values.count))
    }
    func sentence(_ pattern: String) -> [Double]? {
      PrintedFields.groups(pattern, in: prose)?.map { PrintedFields.decimal($0) ?? .nan }
        .filter { !$0.isNaN }
    }
    func lines(_ pattern: String) -> [Double?] {
      PrintedFields.lineGroups(pattern, in: all).map { PrintedFields.decimal($0[0]) }
    }
    func within(_ value: Double?, _ range: ClosedRange<Double>) -> Double? {
      value.flatMap { range.contains($0) ? $0 : nil }
    }

    // The person, from the header every page repeats: age, weight, height.
    let header = PrintedFields.lineGroups(
      #"(?:Männlich|Weiblich|Divers|Male|Female)\s+(\d{1,3}[.,]\d)\s+(\d{2,3}[.,]\d{1,2})\s+(\d{3}[.,]\d)"#,
      in: all)
    let weight = PrintedFields.agreed(header.map { PrintedFields.decimal($0[1]) })
    let height = PrintedFields.agreed(header.map { PrintedFields.decimal($0[2]) })

    // ---- Spirometry ----
    let fvc = PrintedFields.agreed(
      lines(#"^\s*FVC\s+(?:L\s+)?(\d[.,]\d{2})\b"#)
        + [sentence(#"FVC\s*Wert\s*von\s*(\d[.,]\d{2})\s*L"#)?.first])
    let fev1 = PrintedFields.agreed(lines(#"^\s*FEV1\s+(?:L\s+)?(\d[.,]\d{2})\b"#))
    var ratio = PrintedFields.agreed(
      lines(#"^\s*FEV1/FVC%?\s+%?\s*(\d{2,3}[.,]\d)\b"#)
        + [sentence(#"FEV1/FVC%?\s*Verh\S*\s*von\s*(\d{2,3}[.,]\d)\s*%"#)?.first])
    if let fvc, let fev1, let r = ratio, !PrintedFields.agree(fev1 / fvc * 100, r, within: 0.6) {
      ratio = nil
    }
    add("Forcierte Vitalkapazität", within(fvc, 0.5...9), "litres", "FVC \(fvc.map(PrintedFields.text) ?? "") L")
    add("Einsekundenkapazität", within(fev1, 0.3...7), "litres", "FEV1 \(fev1.map(PrintedFields.text) ?? "") L")
    add("FEV1/FVC", within(ratio, 30...100), "%", "FEV1/FVC% \(ratio.map(PrintedFields.text) ?? "") %")
    let fef = PrintedFields.agreed(lines(#"^\s*FEF25-75%?\s+\S+\s+(\d{1,2}[.,]\d{2})\b"#))
    add("FEF25-75", within(fef, 0.2...12), "litres/s", "FEF25-75% \(fef.map(PrintedFields.text) ?? "") L/s")
    let pef = PrintedFields.agreed(lines(#"^\s*PEF\s+\S+\s+(\d{1,2}[.,]\d{2})\b"#))
    add("Peak Expiratory Flow", within(pef, 1...18), "litres/s", "PEF \(pef.map(PrintedFields.text) ?? "") L/s")

    // ---- Exercise ----
    let uptake = sentence(
      #"maximale\s*Sauerstoffaufnahme\s*von\s*(\d{3,4})\s*mL/min\s*bzw\.?\s*(\d{2,3})\s*%"#)
    let peak = uptake.flatMap { within($0.first, 300...7000) }
    let peakShare = uptake.flatMap { $0.count > 1 ? $0[1] : nil }
    add("Maximale Sauerstoffaufnahme", peak, "ml/min", "maximale Sauerstoffaufnahme \(peak.map(PrintedFields.text) ?? "") mL/min")

    // Per kilogram: a table line `41,2  119  >21,5`, picked by being the
    // uptake over the weight and carrying the uptake's share of predicted.
    if let peak, let weight, weight > 0 {
      for g in PrintedFields.lineGroups(#"^\s*(\d{1,2}[.,]\d)\s+(\d{2,3})\s+>\s*\d"#, in: all) {
        guard let perKilogram = PrintedFields.decimal(g[0]), let share = Double(g[1]),
          PrintedFields.agree(peak / weight, perKilogram, within: 0.1),
          peakShare.map({ $0 == share }) ?? true
        else { continue }
        add("Maximale Sauerstoffaufnahme pro kg", perKilogram, "ml/min/kg", "VO2/kg \(g[0]) mL/min/kg")
        // A MET is 3.5 mL/min/kg; the device prints it beside its share.
        if let met = PrintedFields.firstGroup(#"Stoffwechsel\s+(\d{1,2}[.,]\d)\b"#, in: all)
          .flatMap(PrintedFields.decimal),
          PrintedFields.agree(perKilogram / 3.5, met, within: 0.1)
        {
          add("MET, maximal", met, "{MET}", "METS \(PrintedFields.text(met))")
        }
        break
      }
    }

    // Heart rate: `68  126  151  163  171  95  > 154`, rest, the two
    // thresholds, peak, predicted and share of predicted.
    let rateShare = sentence(#"Herzfrequenz\s*bei\s*(\d{2,3})\s*%\s*der\s*Vorhersage"#)?.first
    let reserve = sentence(#"Herzfrequenzreserve\s*ist\s*mit\s*(\d{1,3})\s*bpm"#)?.first
    var peakRate: Double?
    for g in PrintedFields.lineGroups(
      #"^\s*(\d{2,3})\s+(\d{2,3})\s+(\d{2,3})\s+(\d{2,3})\s+(\d{2,3})\s+(\d{2,3})\s+>\s*\d"#, in: all)
    {
      let n = g.compactMap(Double.init)
      guard n.count == 6, n[0] < n[1], n[1] < n[2], n[2] <= n[3], n[4] > 0,
        PrintedFields.agree(n[3] / n[4] * 100, n[5], within: 1),
        rateShare.map({ $0 == n[5] }) ?? true,
        reserve.map({ $0 == n[4] - n[3] }) ?? true
      else { continue }
      peakRate = n[3]
      add("Ruheherzfrequenz", n[0], "/min", "HF Ruhe \(g[0]) bpm")
      add("Maximale Herzfrequenz unter Belastung", n[3], "/min", "HF Max \(g[3]) bpm")
      add("Herzfrequenzreserve", reserve, "/min", "Herzfrequenzreserve \(reserve.map(PrintedFields.text) ?? "") bpm")
      break
    }

    let pulse = sentence(#"Sauerstoffpuls\s*bei\s*(\d{1,2}[.,]\d)\s*mL/beat"#)?.first
    if let pulse, let peak, let peakRate, PrintedFields.agree(peak / peakRate, pulse, within: 0.1) {
      add("Sauerstoffpuls, maximal", pulse, "ml/beat", "Sauerstoffpuls \(PrintedFields.text(pulse)) mL/beat")
    }

    // The first ventilatory threshold, checked by its share of the maximum,
    // and per kilogram by the weight.
    if let threshold = sentence(
      #"ventilatorische\s*Schwelle\s*liegt\s*bei\s*(\d{3,4})\s*mL/min.{0,80}?\((\d{2,3})\s*%\s*der\s*gemessenen"#),
      threshold.count == 2, let peak,
      PrintedFields.agree(threshold[0] / peak * 100, threshold[1], within: 1)
    {
      add("Erste ventilatorische Schwelle", threshold[0], "ml/min", "VT1 \(PrintedFields.text(threshold[0])) mL/min")
      if let weight, weight > 0,
        let perKilogram = PrintedFields.firstGroup(
          vo2 + #"/kg@VT1\s+mL/min/kg\s+(\d{1,2}[.,]\d)\b"#, in: all
        ).flatMap(PrintedFields.decimal),
        PrintedFields.agree(threshold[0] / weight, perKilogram, within: 0.1)
      {
        add("Erste ventilatorische Schwelle pro kg", perKilogram, "ml/min/kg", "VO2/kg@VT1 \(PrintedFields.text(perKilogram)) mL/min/kg")
      }
    }

    let slope = PrintedFields.agreed([
      sentence(#"VE/VC[O0]2\s*Slope\s*ist\s*(\d{1,2}[.,]\d)"#)?.first,
      PrintedFields.firstGroup(#"VE/VC[O0]2\s*Steigung\s+(\d{1,2}[.,]\d)"#, in: all)
        .flatMap(PrintedFields.decimal),
    ])
    add("VE/VCO2-Steigung", within(slope, 10...80), "{ratio}", "VE/VCO2 Slope \(slope.map(PrintedFields.text) ?? "")")
    let breathing = sentence(#"Atemreserve\s*an\s*der\s*Belastungsspitze\s*von\s*(\d{1,2}[.,]\d)\s*%"#)?.first
    add("Atemreserve", within(breathing, 0...95), "%", "Atemreserve \(breathing.map(PrintedFields.text) ?? "") %")
    let ventilation = sentence(#"Ve\s*liegt\s*bei\s*(\d{2,3}[.,]\d)\s*L/min"#)?.first
    add("Atemminutenvolumen, maximal", within(ventilation, 10...300), "l/min", "VE \(ventilation.map(PrintedFields.text) ?? "") L/min")
    let exchange = sentence(#"Austauschrate\s*bei\s*(\d[.,]\d{2})"#)?.first
    add("Respiratorischer Quotient, maximal", within(exchange, 0.6...1.8), "{ratio}", "RER \(exchange.map(PrintedFields.text) ?? "")")
    let recovery = sentence(#"Erholung\s*der\s*Herzfrequenz\s*nach\s*1\s*Minute\s*liegt\s*mit\s*(\d{1,3})\s*bpm"#)?.first
    add("Herzfrequenzerholung nach 1 Minute", within(recovery, 0...120), "/min", "HF-Erholung 1 min \(recovery.map(PrintedFields.text) ?? "") bpm")
    let work = sentence(vo2 + #"/Last\s*Slope\s*liegt\s*mit\s*(\d{1,2}[.,]\d{1,2})\s*mL/min/Watt"#)?.first
    add("VO2/Leistung-Steigung", within(work, 3...20), "ml/min/watts", "VO2/Last Slope \(work.map(PrintedFields.text) ?? "") mL/min/Watt")

    // Blood pressure: two table lines, systolic then diastolic, each at rest
    // and at its peak with the time of the peak, which both share.
    let pressures = PrintedFields.lineGroups(#"^\s*(\d{2,3})\s+(\d{2,3})\s*\((\d{1,2}:\d{2})\)"#, in: all)
    let peakSystolic = sentence(#"systolische\s*Blutdruck\s*w\S*hrend\s*der\s*Belastung\s*ist\s*mit\s*(\d{2,3})\s*mmHg"#)?.first
    if pressures.count >= 2, pressures[0][2] == pressures[1][2],
      let restS = Double(pressures[0][0]), let maxS = Double(pressures[0][1]),
      let restD = Double(pressures[1][0]), let maxD = Double(pressures[1][1]),
      restD < restS, maxD < maxS, peakSystolic.map({ $0 == maxS }) ?? true
    {
      let rest = "P Syst/Diast Ruhe \(pressures[0][0])/\(pressures[1][0]) mmHg"
      add("Systolischer Blutdruck", restS, "mmHg", rest)
      add("Diastolischer Blutdruck", restD, "mmHg", rest)
      let top = "P Syst/Diast Max \(pressures[0][1])/\(pressures[1][1]) mmHg (\(pressures[0][2]))"
      add("Systolischer Blutdruck unter Belastung, maximal", maxS, "mmHg", top)
      add("Diastolischer Blutdruck unter Belastung", maxD, "mmHg", top)
    }

    // The load at the two thresholds and at the peak, in that order.
    if let g = PrintedFields.groups(
      #"Last\s+Watt\s+(\d{2,3}[.,]\d)\s+(\d{2,3}[.,]\d)\s+(\d{2,3}[.,]\d)"#, in: all),
      let first = PrintedFields.decimal(g[0]), let second = PrintedFields.decimal(g[1]),
      let top = PrintedFields.decimal(g[2]), first < second, second < top, top <= 800
    {
      add("Maximale Belastung", top, "watts", "Last Max \(g[2]) Watt")
    }

    if let weight, (25...300).contains(weight) {
      add("Körpergewicht", weight, "kg", "Gewicht (kg) \(PrintedFields.text(weight))")
    }
    if let height, (100...230).contains(height) {
      add("Körpergröße", height, "cm", "Größe (cm) \(PrintedFields.text(height))")
    }
    return values
  }

  public static func applied(to sheet: ExtractionResult, pageTexts: [String]) -> ExtractionResult {
    PrintedFields.replacing(sheet, with: read(pageTexts: pageTexts), minimum: 3)
  }
}
