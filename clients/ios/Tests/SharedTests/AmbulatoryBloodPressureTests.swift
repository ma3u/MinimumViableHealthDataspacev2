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

  static let text = "24-H ABPM report\nManschette Blutdruck [mmHg]\nGesamt Tag Nacht\nMittel.\nSYS DIA\nDipping\nSYS -12,0 %\nDIA -22 %\nPuls -11,5%\n"

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
    #expect(value(values, "Nächtliche Absenkung systolisch") == -12)
    #expect(value(values, "Nächtliche Absenkung diastolisch") == -22)
    #expect(value(values, "Nächtliche Absenkung Puls") == -11.5)
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

  @Test("a lab report is not taken for one")
  func notABPM() {
    #expect(!AmbulatoryBloodPressure.looksLike("Natrium 140 mmol/l\nKalium 4,1 mmol/l"))
  }
}
