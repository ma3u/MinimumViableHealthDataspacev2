import Foundation

/// Reads a whole-body DXA scan's body composition report.
///
/// The report is a table of regions, each with its fat share and its fat,
/// lean and bone mass, then pages of prose around a few labelled results
/// (numbers from a fictional report):
///
///     (e) Gesamt  23,4  22,6  61.020  14.280  46.740  2.150  63,2
///     Android  28,1  27,9  4.410  1.239  3.171  38  4,4
///     A/G Verhältnis:  1,35
///     RSMI:  7,85 kg/m²
///
/// The line grammar reads the first number of a row and nothing else, and
/// on a real report it read three sentences of the prose as values. A
/// region's row is its own proof: the fat and lean mass add up to the
/// tissue mass, the fat over the tissue is the tissue's fat share, the fat
/// over tissue and bone is the region's, and tissue and bone are the total.
/// A row whose numbers do not satisfy all four is misread somewhere and is
/// not read at all. The bone density row is checked the same way: its
/// centile is the normal distribution's at its Z-score.
public enum BodyComposition {

  /// True for a page of a DXA body composition report.
  public static func looksLike(_ text: String) -> Bool {
    let t = ReportMetadataExtractor.fold(text)
    return t.contains("bmc") && (t.contains("%fett") || t.contains("%fat"))
  }

  // A share with one decimal, and a mass in grams with its thousands
  // separator (a dot, or the comma a recogniser makes of it).
  private static let share = #"(-?\d{1,3}[.,]\d)"#
  private static let grams = #"(-?\d{1,3}(?:[.,]\d{3})*)"#

  /// One region's row: tissue fat share, region fat share, tissue, fat,
  /// lean and bone mass in grams, total mass in kilograms.
  struct Region: Equatable {
    let tissueShare: Double
    let regionShare: Double
    let tissue: Double
    let fat: Double
    let lean: Double
    let bone: Double
    let total: Double
    let line: String

    /// The four identities every row of the table satisfies.
    var isConsistent: Bool {
      guard tissue > 0, tissue + bone > 0 else { return false }
      return PrintedFields.agree(fat + lean, tissue, within: 2)
        && PrintedFields.agree(fat / tissue * 100, tissueShare, within: 0.06)
        && PrintedFields.agree(fat / (tissue + bone) * 100, regionShare, within: 0.06)
        && PrintedFields.agree((tissue + bone) / 1000, total, within: 0.06)
    }
  }

  /// The row named `name`, read and checked, or nil.
  static func region(_ name: String, in text: String) -> Region? {
    let pattern =
      #"^\s*(?:\(e\)\s*)?"# + name + #"\s+"# + share + #"\s+"# + share + #"\s+"# + grams + #"\s+"#
      + grams + #"\s+"# + grams + #"\s+"# + grams + #"\s+"# + share + #"\s*$"#
    for g in PrintedFields.lineGroups(pattern, in: text) {
      guard g.count == 7,
        let tissueShare = PrintedFields.decimal(g[0]), let regionShare = PrintedFields.decimal(g[1]),
        let tissue = PrintedFields.count(g[2]), let fat = PrintedFields.count(g[3]),
        let lean = PrintedFields.count(g[4]), let bone = PrintedFields.count(g[5]),
        let total = PrintedFields.decimal(g[6])
      else { continue }
      let row = Region(
        tissueShare: tissueShare, regionShare: regionShare, tissue: tissue, fat: fat, lean: lean,
        bone: bone, total: total, line: g.joined(separator: "  "))
      if row.isConsistent { return row }
    }
    return nil
  }

  /// The normal distribution's cumulative probability, for a Z-score's centile.
  static func centile(_ z: Double) -> Double { 50 * (1 + erf(z / 2.0.squareRoot())) }

  /// Every value of the report the pages agree on.
  public static func read(pageTexts: [String]) -> [RawLabValue] {
    guard pageTexts.contains(where: looksLike) else { return [] }
    let all = pageTexts.joined(separator: "\n")
    var values: [RawLabValue] = []
    func add(_ label: String, _ value: Double, _ unit: String, _ line: String) {
      values.append(PrintedFields.value(label, value, unit, line: line, number: 9500 + values.count))
    }

    if let total = region("(?:Gesamt|Total)", in: all) {
      add("Körperfettanteil", total.tissueShare, "%", "Gesamt Gewebe %Fett \(total.line)")
      add("Körperfettmasse", total.fat / 1000, "kg", "Gesamt Fett (g) \(total.line)")
      add("Mager-Weichteilmasse", total.lean / 1000, "kg", "Gesamt Mager (g) \(total.line)")
      add("Knochenmineralgehalt", total.bone / 1000, "kg", "Gesamt BMC (g) \(total.line)")
    }
    let android = region("Android", in: all)
    let gynoid = region("Gynoid", in: all)
    if let android { add("Android-Fettanteil", android.tissueShare, "%", "Android \(android.line)") }
    if let gynoid { add("Gynoid-Fettanteil", gynoid.tissueShare, "%", "Gynoid \(gynoid.line)") }
    // The ratio is the two shares' quotient, so it is read only beside them.
    if let android, let gynoid, gynoid.tissueShare > 0,
      let printed = PrintedFields.firstGroup(#"A\s*/\s*G\s*Verh\S*\s*:?\s*(\d[.,]\d{1,2})"#, in: all),
      let ratio = PrintedFields.decimal(printed),
      PrintedFields.agree(ratio, android.tissueShare / gynoid.tissueShare, within: 0.015)
    {
      add("Android/Gynoid-Verhältnis", ratio, "{ratio}", "A/G Verhältnis: \(printed)")
    }

    if let vat = visceralFat(in: all) {
      add("Viszerales Fett", vat.mass / 1000, "kg", vat.line)
      add("Viszerales Fett", vat.area, "cm2", vat.line)
    }
    if let bone = boneDensity(in: all) {
      add("Knochendichte Ganzkörper", bone.density, "g/cm2", bone.line)
      add("Knochendichte Ganzkörper, T-Wert", bone.t, "{SD}", bone.line)
      add("Knochendichte Ganzkörper, Z-Wert", bone.z, "{SD}", bone.line)
    }
    if let printed = PrintedFields.firstGroup(#"RSMI\s*:\s*(\d{1,2}[.,]\d{1,2})\s*kg"#, in: all),
      let rsmi = PrintedFields.decimal(printed), (3...15).contains(rsmi)
    {
      add("Relativer Skelettmuskelindex", rsmi, "kg/m2", "RSMI: \(printed) kg/m²")
    }

    let lines = all.components(separatedBy: .newlines)
    return values + AmbulatoryBloodPressure.bodyMeasures(in: lines, fragments: [])
  }

  /// The estimated visceral fat: `540 cm³  508 g  57 cm²` under its heading
  /// (volume, mass, area). The mass is the volume at the density of fat,
  /// 0.94 g/cm³, which checks the line; the subcutaneous fat's line, printed
  /// below it in the same shape, is under a heading of its own.
  static func visceralFat(in text: String) -> (mass: Double, area: Double, line: String)? {
    let lines = text.components(separatedBy: .newlines)
    guard let heading = lines.firstIndex(where: { ReportMetadataExtractor.fold($0).contains("viszeral") })
    else { return nil }
    for line in lines[(heading + 1)...].prefix(3) {
      guard
        let g = PrintedFields.groups(
          #"(\d{2,4})\s*cm\S*\s+(\d{2,4})\s*g\s+(\d{1,4})\s*cm"#, in: line),
        let volume = Double(g[0]), let mass = Double(g[1]), let area = Double(g[2])
      else { continue }
      guard PrintedFields.agree(mass, volume * 0.94, within: volume * 0.02 + 2) else { return nil }
      return (mass, area, line.trimmingCharacters(in: .whitespaces))
    }
    return nil
  }

  /// The whole-body bone density row: age, density, T-score, Z-score and
  /// the Z-score's centile, `52,4  1,153  -0,6  -0,2  42`. The recogniser
  /// joins an axis tick to the row's front, so the row is found by its
  /// shape, and kept only when the centile is the Z-score's.
  static func boneDensity(in text: String) -> (density: Double, t: Double, z: Double, line: String)? {
    let pattern =
      #"(\d{2}[.,]\d)\s+(\d[.,]\d{3})\s+(-?\d[.,]\d)\s+(-?\d[.,]\d)\s+(\d{1,3})\s*$"#
    for g in PrintedFields.lineGroups(pattern, in: text) {
      guard let density = PrintedFields.decimal(g[1]), (0.4...2.0).contains(density),
        let t = PrintedFields.decimal(g[2]), (-6...6).contains(t),
        let z = PrintedFields.decimal(g[3]), (-6...6).contains(z),
        let printedCentile = Double(g[4]),
        PrintedFields.agree(centile(z), printedCentile, within: 2.5)
      else { continue }
      return (density, t, z, g.joined(separator: "  "))
    }
    return nil
  }

  /// The document's reading: this reader's values in place of the line
  /// grammar's, once it has read the totals row.
  public static func applied(to sheet: ExtractionResult, pageTexts: [String]) -> ExtractionResult {
    PrintedFields.replacing(sheet, with: read(pageTexts: pageTexts), minimum: 3)
  }
}
