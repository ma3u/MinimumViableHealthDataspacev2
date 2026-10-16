import Foundation
import Testing

@testable import Shared

/// A 24-hour blood pressure report's summary grid, read by geometry. The
/// layout is a real report's; every number is invented, and the grid is
/// photographed slightly skewed, as a real photo is.
@Suite("A 24-hour ambulatory blood pressure report")
struct AmbulatoryBloodPressureTests {
  /// Min, mean, max, SD, % above limit, for each of three periods.
  static let grid: [(String, [String])] = [
    ("SYS", ["101", "121", "149", "11,0", "12%", "103", "127", "149", "9,0", "8%", "99", "109", "125", "7,5", "4%"]),
    ("DIA", ["55", "71", "93", "10,0", "20%", "56", "77", "93", "8,0", "10%", "53", "60", "66", "4,0", "1%"]),
    ("Puls", ["50", "64", "110", "10,5", "8%", "55", "67", "110", "11,0", "6%", "50", "58", "65", "4,0", "3%"]),
    ("MAD", ["70", "88", "104", "9,5", "20%", "80", "93", "104", "6,0", "10%", "70", "76", "84", "5,0", "30%"]),
    ("PP", ["30", "50", "80", "12,0", "40%", "30", "50", "80", "14,0", "40%", "41", "49", "60", "8,0", "40%"]),
  ]

  static func fragments(skew: Double = 0.014) -> [DocumentReconciler.TextFragment] {
    func f(_ text: String, x: Double, y: Double) -> DocumentReconciler.TextFragment {
      // y counts up from the bottom; the skew lifts the right side of a row.
      DocumentReconciler.TextFragment(
        text: text, region: SourceRegion(page: 1, x: x, y: y + skew * x, width: 0.03, height: 0.008))
    }
    var out: [DocumentReconciler.TextFragment] = []
    for (header, x) in [("Gesamt", 0.15), ("Tag", 0.41), ("Nacht", 0.67)] {
      out.append(f(header, x: x, y: 0.36))
    }
    for (row, (label, cells)) in grid.enumerated() {
      let y = 0.33 - Double(row) * 0.016
      out.append(f(label, x: 0.08, y: y))
      for (column, cell) in cells.enumerated() {
        out.append(f(cell, x: 0.155 + Double(column) * 0.052, y: y))
      }
    }
    return out
  }

  static let text = "24-H ABPM report\nManschette Blutdruck [mmHg]\nGesamt Tag Nacht\nMittel.\nSYS DIA\nDipping\nSYS -14,2 %\nDIA -22 %\nPuls -13,4%\n"

  private func value(_ values: [RawLabValue], _ label: String) -> Double? {
    values.first { $0.label == label }?.value
  }

  @Test("reads each period's mean, for every row, through a skewed photograph")
  func means() {
    let values = AmbulatoryBloodPressure.read(text: Self.text, fragments: Self.fragments())
    #expect(value(values, "Systolischer Blutdruck 24-h-Mittel") == 121)
    #expect(value(values, "Systolischer Blutdruck Tagesmittel") == 127)
    #expect(value(values, "Systolischer Blutdruck Nachtmittel") == 109)
    #expect(value(values, "Diastolischer Blutdruck Nachtmittel") == 60)
    #expect(value(values, "Puls Tagesmittel") == 67)
    #expect(value(values, "Mittlerer arterieller Druck 24-h-Mittel") == 88)
    #expect(value(values, "Pulsdruck Nachtmittel") == 49)
    #expect(values.filter { $0.label.hasSuffix("mittel") || $0.label.hasSuffix("Mittel") }.count == 15)
  }

  @Test("codes the means with the LOINC codes for their period")
  func codes() {
    let result = AmbulatoryBloodPressure.extract(
      pageTexts: [Self.text],
      pages: [
        ScanDiagnostics.Page(
          page: 1, imageWidth: 1, imageHeight: 1, tableCount: 1, cells: [],
          fragments: Self.fragments(), rows: [], orphanedFragments: [], layout: nil,
          plainText: Self.text, recognitionSeconds: 0)
      ], source: .ocrTranscribed)
    let codes = Dictionary(result.coded.map { ($0.raw.label, $0.coding.loinc ?? "uncoded") }) { a, _ in a }
    #expect(codes["Systolischer Blutdruck 24-h-Mittel"] == "8490-5")
    #expect(codes["Diastolischer Blutdruck 24-h-Mittel"] == "8472-3")
    #expect(codes["Puls 24-h-Mittel"] == "41924-2")
    #expect(codes["Systolischer Blutdruck Tagesmittel"] == "96608-5")
    #expect(codes["Diastolischer Blutdruck Nachtmittel"] == "96609-3")
    #expect(codes["Mittlerer arterieller Druck Tagesmittel"] == "8478-0")
    #expect(codes["Pulsdruck 24-h-Mittel"] == "107146-3")
    #expect(codes["Nächtliche Absenkung systolisch"] == "uncoded")
    #expect(result.unmapped.isEmpty)
  }

  @Test("reads the dipping table, sign and all")
  func dipping() {
    let values = AmbulatoryBloodPressure.read(text: Self.text, fragments: [])
    #expect(value(values, "Nächtliche Absenkung systolisch") == -14.2)
    #expect(value(values, "Nächtliche Absenkung diastolisch") == -22)
    #expect(value(values, "Nächtliche Absenkung Puls") == -13.4)
  }

  @Test("refuses a mean its own minimum and maximum do not bracket")
  func bracket() {
    var broken = Self.fragments()
    // The night mean of SYS read as 190: above that period's maximum.
    if let i = broken.firstIndex(where: { $0.text == "109" }) {
      broken[i] = DocumentReconciler.TextFragment(text: "190", region: broken[i].region)
    }
    let values = AmbulatoryBloodPressure.read(text: Self.text, fragments: broken)
    #expect(value(values, "Systolischer Blutdruck Nachtmittel") == nil)
    #expect(value(values, "Systolischer Blutdruck Tagesmittel") == 127)
  }

  @Test("reads nothing from a grid that is not fifteen columns")
  func notThisGrid() {
    let fewer = Self.fragments().filter { !($0.region.x > 0.7 && $0.region.x < 0.75) }
    let values = AmbulatoryBloodPressure.read(text: Self.text, fragments: fewer)
    #expect(values.allSatisfy { $0.label.hasPrefix("Nächtliche") })
  }

  @Test("a dipping figure read without its minus takes the sign of the grid's means")
  func dippingSignFromMeans() {
    // The recogniser lost the minus of the DIA row on a real sheet. The grid
    // says 77 by day and 60 by night: a fall of 22 %, not a rise.
    let unsigned = Self.text.replacingOccurrences(of: "DIA -22 %", with: "DIA 22%")
    let values = AmbulatoryBloodPressure.read(text: unsigned, fragments: Self.fragments())
    #expect(value(values, "Nächtliche Absenkung diastolisch") == -22)
    #expect(value(values, "Nächtliche Absenkung systolisch") == -14.2)
  }

  @Test("a dipping figure the grid's means contradict is refused")
  func dippingContradicted() {
    // SYS 127 by day and 109 by night is a fall of 14.2 %, not 30 %.
    let wrong = Self.text.replacingOccurrences(of: "SYS -14,2 %", with: "SYS -30,0 %")
    let values = AmbulatoryBloodPressure.read(text: wrong, fragments: Self.fragments())
    #expect(value(values, "Nächtliche Absenkung systolisch") == nil)
    // A printed sign is never overruled: a signed rise the means call a fall
    // is refused, not flipped.
    let rise = Self.text.replacingOccurrences(of: "DIA -22 %", with: "DIA +22 %")
    let flipped = AmbulatoryBloodPressure.read(text: rise, fragments: Self.fragments())
    #expect(value(flipped, "Nächtliche Absenkung diastolisch") == nil)
  }

  @Test("reads height, weight and BMI from the header row, unit glued or missing")
  func bodyMeasures() {
    let header = ["Größe 182 cm   Gewicht 80kg   BMI 24,2"]
    let values = AmbulatoryBloodPressure.bodyMeasures(in: header, fragments: [])
    #expect(value(values, "Körpergröße") == 182)
    #expect(value(values, "Körpergewicht") == 80)
    #expect(value(values, "Body-Mass-Index") == 24.2)
    // The recogniser's spelling of the same header on a real photograph.
    let lost = AmbulatoryBloodPressure.bodyMeasures(in: ["Große 182 cm"], fragments: [])
    #expect(value(lost, "Körpergröße") == 182)
  }

  @Test("pairs each header name with its value on a tilted photograph")
  func bodyMeasuresTilted() {
    // The layout of the phone's reading of a real header: the photograph
    // tilts, so a name and its value are a line apart in reading order and
    // the BMI's value sits higher than its name. Invented values.
    func f(_ text: String, _ x: Double, _ y: Double, _ w: Double, _ h: Double)
      -> DocumentReconciler.TextFragment
    {
      DocumentReconciler.TextFragment(
        text: text, region: SourceRegion(page: 1, x: x, y: y, width: w, height: h))
    }
    let fragments = [
      f("Größe", 0.087, 0.832, 0.047, 0.015), f("182 cm", 0.192, 0.824, 0.050, 0.013),
      f("Alter", 0.418, 0.832, 0.031, 0.009), f("52", 0.493, 0.831, 0.018, 0.009),
      f("Gewicht", 0.418, 0.816, 0.055, 0.009), f("80 kg", 0.493, 0.814, 0.036, 0.010),
      f("Pacemaker", 0.735, 0.835, 0.075, 0.014), f("24,2", 0.840, 0.828, 0.031, 0.011),
      f("BMI", 0.737, 0.821, 0.027, 0.008),
    ]
    let lines = ["Größe  Alter  Pacemaker", "182 cm  52  24,2", "Gewicht  BMI"]
    let values = AmbulatoryBloodPressure.bodyMeasures(in: lines, fragments: fragments)
    #expect(value(values, "Körpergröße") == 182)
    #expect(value(values, "Körpergewicht") == 80)
    #expect(value(values, "Body-Mass-Index") == 24.2)
    #expect(values.allSatisfy { $0.region != nil })
  }

  @Test("refuses the header when the BMI is not the weight over the squared height")
  func bodyMeasuresDisagree() {
    let header = ["Größe 182 cm   Gewicht 89kg   BMI 24,2"]
    #expect(AmbulatoryBloodPressure.bodyMeasures(in: header, fragments: []).isEmpty)
    // Two readings of one field that differ: that field is refused.
    let twice = ["Gewicht 80 kg", "Gewicht 86 kg", "Größe 182 cm"]
    let values = AmbulatoryBloodPressure.bodyMeasures(in: twice, fragments: [])
    #expect(value(values, "Körpergewicht") == nil)
    #expect(value(values, "Körpergröße") == 182)
  }

  @Test("a lab report is not taken for one")
  func notABPM() {
    #expect(!AmbulatoryBloodPressure.looksLike("Natrium 140 mmol/l\nKalium 4,1 mmol/l"))
  }
}
