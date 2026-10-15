import Foundation

/// Reads the results of a lactate performance test (Leistungsdiagnostik).
///
/// The analysis software prints one labelled result per line (numbers from
/// a fictional report):
///
///     Körpergewicht  68.0 kg
///     IAS (Laktatkonstante: 1.5 mmol/l)  162.0 Watt
///     IAS/kg  2.38 Watt/kg
///     LT in Prozent der "IAS"  64 %
///     Leistung bei 4.0 mmol/l Laktat  194.2 Watt
///     Leistung bei 4.0 mmol/l/kg Körpergewicht  2.86 Watt/kg
///
/// The line grammar took `2 mmol/l` out of `Herzfrequenz bei 2.0 mmol/l
/// Laktat` as a lactate and a heart rate as a power. Most results are
/// printed with a twin that checks them: a power per kilogram is the power
/// over the printed weight, the lactate threshold is its printed share of
/// the anaerobic one, and the estimated aerobic capacity per kilogram is
/// the capacity over the weight. A result its twin contradicts is not read,
/// and the thresholds must come in order.
public enum LactateTest {

  public static func looksLike(_ text: String) -> Bool {
    let t = ReportMetadataExtractor.fold(text)
    return t.contains("laktat") && (t.contains("ias") || t.contains("lactate threshold"))
      && t.contains("watt")
  }

  // The recogniser reads `mmol/l` as `mmol/1`, and `VO2` as `VO,`.
  private static let mmol = #"mmol\s*/\s*[l1I]"#
  private static let vo2 = #"V[O0][,2₂]?\s*max"#

  public static func read(pageTexts: [String]) -> [RawLabValue] {
    guard let page = pageTexts.first(where: looksLike) else { return [] }
    var values: [RawLabValue] = []
    func add(_ label: String, _ value: Double?, _ unit: String, _ line: String) {
      guard let value else { return }
      values.append(PrintedFields.value(label, value, unit, line: line, number: 9800 + values.count))
    }
    func number(_ pattern: String) -> Double? {
      PrintedFields.lineGroups(pattern, in: page).first.flatMap { PrintedFields.decimal($0[0]) }
    }
    let decimal = #"(\d{1,4}(?:[.,]\d{1,2})?)"#

    let weight = number(#"^\s*K\S*rpergewicht\s+"# + decimal + #"\s*kg"#)
    func perKilogramAgrees(_ watts: Double?, _ perKilogram: Double?) -> Bool {
      guard let watts, let perKilogram, let weight, weight > 0 else { return false }
      return PrintedFields.agree(watts / weight, perKilogram, within: 0.011)
    }

    // The individual anaerobic threshold, checked by its power per kilogram.
    let ias = number(#"^\s*IAS\s*\([^)]*\)\s+"# + decimal + #"\s*Watt"#)
    let iasPerKilogram = number(#"^\s*IAS\s*/\s*kg\s+"# + decimal + #"\s*Watt"#)
    let iasRead = perKilogramAgrees(ias, iasPerKilogram)
    let iasLactate = number(#"Laktat\S*\s+an\s+der\s+"?IAS\S*\s+"# + decimal + #"\s*"# + mmol)
    let iasRate = number(#"Herzfrequenz\s+an\s+der\s+"?IAS\S*\s+"# + decimal + #"\s*/\s*min"#)

    // The lactate threshold, checked by its share of the anaerobic one.
    let lt = number(#"^\s*LT\s+"# + decimal + #"\s*Watt"#)
    let ltShare = number(#"LT\s+in\s+Prozent\s+der\s+"?IAS\S*\s+"# + decimal + #"\s*%"#)
    let ltLactate = number(#"Laktat\s+an\s+der\s+LT\b[^\d]*"# + decimal + #"\s*"# + mmol)
    let ltRate = number(#"Herzfrequenz\s+an\s+der\s+LT\b[^\d]*"# + decimal + #"\s*/\s*min"#)
    var ltRead = false
    if let lt, let ias, let ltShare, iasRead, ias > 0 {
      ltRead = PrintedFields.agree(lt / ias * 100, ltShare, within: 1) && lt < ias
    }

    if iasRead, let ias, let iasPerKilogram {
      add("Leistung an der individuellen anaeroben Schwelle", ias, "watts", "IAS \(PrintedFields.text(ias)) Watt")
      add("Leistung an der individuellen anaeroben Schwelle pro kg", iasPerKilogram, "watts/kg", "IAS/kg \(PrintedFields.text(iasPerKilogram)) Watt/kg")
    }
    // The lactate and heart rate at a threshold are read beside it, and
    // must be lower at the lactate threshold than at the anaerobic one.
    let inOrder = { (low: Double?, high: Double?) -> Bool in
      guard let low, let high else { return true }
      return low < high
    }
    if iasRead {
      add("Laktat an der individuellen anaeroben Schwelle", iasLactate.flatMap { (0.5...10).contains($0) ? $0 : nil }, "mmol/l", "Laktat an der IAS \(iasLactate.map(PrintedFields.text) ?? "") mmol/l")
      add("Herzfrequenz an der individuellen anaeroben Schwelle", iasRate.flatMap { (60...220).contains($0) ? $0 : nil }, "/min", "Herzfrequenz an der IAS \(iasRate.map(PrintedFields.text) ?? "") /min")
    }
    if ltRead, let lt, inOrder(ltLactate, iasLactate), inOrder(ltRate, iasRate) {
      add("Leistung an der Laktatschwelle", lt, "watts", "LT \(PrintedFields.text(lt)) Watt")
      add("Laktat an der Laktatschwelle", ltLactate.flatMap { (0.3...6).contains($0) ? $0 : nil }, "mmol/l", "Laktat an der LT \(ltLactate.map(PrintedFields.text) ?? "") mmol/l")
      add("Herzfrequenz an der Laktatschwelle", ltRate.flatMap { (50...210).contains($0) ? $0 : nil }, "/min", "Herzfrequenz an der LT \(ltRate.map(PrintedFields.text) ?? "") /min")
    }

    // The power and heart rate at a fixed lactate, 2 and 4 mmol/l.
    var fixed: [(level: String, power: Double, rate: Double?)] = []
    for level in ["2", "4"] {
      let at = #"bei\s+"# + level + #"(?:[.,]0)?\s*"# + mmol
      guard let power = number(#"^\s*Leistung\s+"# + at + #"\s+Laktat\s+"# + decimal + #"\s*Watt"#),
        perKilogramAgrees(
          power, number(#"^\s*Leistung\s+"# + at + #"\s*/\s*kg\D*"# + decimal + #"\s*Watt"#))
      else { continue }
      fixed.append((level, power, number(#"^\s*Herzfrequenz\s+"# + at + #"\s+Laktat\s+"# + decimal + #"\s*/\s*min"#)))
    }
    if fixed.count == 2, !(fixed[0].power < fixed[1].power) { fixed = [] }
    if fixed.count == 2, !inOrder(fixed[0].rate, fixed[1].rate) {
      fixed = fixed.map { ($0.level, $0.power, nil) }
    }
    for entry in fixed {
      add("Leistung bei \(entry.level) mmol/l Laktat", entry.power, "watts", "Leistung bei \(entry.level).0 mmol/l Laktat \(PrintedFields.text(entry.power)) Watt")
      add("Herzfrequenz bei \(entry.level) mmol/l Laktat", entry.rate.flatMap { (60...220).contains($0) ? $0 : nil }, "/min", "Herzfrequenz bei \(entry.level).0 mmol/l Laktat \(entry.rate.map(PrintedFields.text) ?? "") /min")
    }

    let vlamax = number(#"VLa\s*Max\S*\s+"# + decimal + #"\s*"# + mmol + #"\s*/\s*s"#)
    add("Maximale glykolytische Leistung (VLaMax)", vlamax.flatMap { (0.05...2).contains($0) ? $0 : nil }, "mmol/l/s", "VLaMax \(vlamax.map(PrintedFields.text) ?? "") mmol/l/s")
    let critical = number(#"^\s*Critical\s+Power\s+"# + decimal + #"\s*Watt"#)
    add("Critical Power", critical.flatMap { (40...700).contains($0) ? $0 : nil }, "watts", "Critical Power \(critical.map(PrintedFields.text) ?? "") Watt")

    // The estimated aerobic capacity, checked by its value per kilogram.
    let capacity = number(#"^\s*"# + vo2 + #"\s*\(berechnet\)\s+"# + decimal + #"\s*l\s*/\s*min"#)
    let capacityPerKilogram = number(#"^\s*Relative\s+"# + vo2 + #"\s*\(berechnet\)\s+"# + decimal + #"\s*ml"#)
    if let capacity, let capacityPerKilogram, let weight, weight > 0,
      PrintedFields.agree(capacity * 1000 / weight, capacityPerKilogram, within: 0.1)
    {
      add("Maximale Sauerstoffaufnahme (berechnet)", capacity, "l/min", "VO2max (berechnet) \(PrintedFields.text(capacity)) l/min")
      add("Maximale Sauerstoffaufnahme pro kg (berechnet)", capacityPerKilogram, "ml/min/kg", "Relative VO2max (berechnet) \(PrintedFields.text(capacityPerKilogram)) ml/min/kg")
    }

    if let weight, (25...300).contains(weight) {
      add("Körpergewicht", weight, "kg", "Körpergewicht \(PrintedFields.text(weight)) kg")
    }
    return values
  }

  public static func applied(to sheet: ExtractionResult, pageTexts: [String]) -> ExtractionResult {
    PrintedFields.replacing(sheet, with: read(pageTexts: pageTexts), minimum: 3)
  }
}
