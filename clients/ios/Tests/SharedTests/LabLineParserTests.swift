import Testing

@testable import Shared

@Suite("Number parsing: the German convention")
struct NumberTests {
  @Test("a dot before exactly three digits is thousands grouping")
  func thousands() {
    // 1.240 pg/mL NT-proBNP is 1240, a normal result and a cardiology
    // referral, told apart by one rule.
    #expect(LabLineParser.parseNumber("1.240") == 1240)
  }

  @Test("a dot before one or two digits is a decimal point")
  func decimalPoint() {
    #expect(LabLineParser.parseNumber("0.92") == 0.92)
    #expect(LabLineParser.parseNumber("2.4") == 2.4)
  }

  @Test("a comma is the decimal separator")
  func decimalComma() {
    #expect(LabLineParser.parseNumber("87,3") == 87.3)
  }

  @Test("the rightmost separator decides when both appear")
  func mixed() {
    #expect(LabLineParser.parseNumber("1.234,5") == 1234.5)
    #expect(LabLineParser.parseNumber("1,234.5") == 1234.5)
  }

  @Test("anything that is not a number is refused")
  func refusals() {
    #expect(LabLineParser.parseNumber("n.b.") == nil)
    #expect(LabLineParser.parseNumber("") == nil)
    #expect(LabLineParser.parseNumber("negativ") == nil)
  }
}

@Suite("Reference ranges")
struct ReferenceRangeTests {
  @Test("intervals with hyphen, en dash or bis")
  func intervals() {
    #expect(LabLineParser.parseReferenceRange("0,70 - 1,20") == .init(low: 0.7, high: 1.2))
    #expect(LabLineParser.parseReferenceRange("4,8 – 5,9") == .init(low: 4.8, high: 5.9))
    #expect(LabLineParser.parseReferenceRange("197 bis 771") == .init(low: 197, high: 771))
  }

  @Test("an em dash separates an interval too")
  func emDashInterval() {
    // A style sweep twice replaced the em dash inside this parser's own regex
    // alternation, and every suite stayed green because nothing covered it.
    #expect(LabLineParser.parseReferenceRange("0,70 — 1,20") == .init(low: 0.7, high: 1.2))
  }

  @Test("single bounds")
  func bounds() {
    #expect(LabLineParser.parseReferenceRange("< 200") == .init(high: 200))
    #expect(LabLineParser.parseReferenceRange("> 40") == .init(low: 40))
  }

  @Test("free text yields nothing rather than a guess")
  func freeText() {
    #expect(LabLineParser.parseReferenceRange("siehe Vorbefund") == .init())
  }
}

@Suite("Line parsing")
struct LineTests {
  static let report = """
    Laborbefund

    Cholesterin gesamt          212     mg/dl          < 200
    LDL-Cholesterin             141     mg/dl          < 116
    HDL-Cholesterin              48     mg/dl          > 40
    Lp(a)                      87,3     mg/dl          < 30
    hs-CRP                      2,4     mg/l           < 3,0
    HbA1c                       5,7     %              4,8 - 5,9
    Ferritin                    <10     ug/l           30 - 400
    Vitamin B12                 412     pg/ml          197 - 771
    NT-proBNP                 1.240     pg/ml          < 125
    Troponin T hs              n.b.     ng/l           < 14
    Omega-3-Index               4,1     %              > 8
    """

  static let parsed = LabLineParser.parse(report)
  func value(_ label: String) -> RawLabValue? { Self.parsed.values.first { $0.label == label } }

  @Test("reads a plain row with its reference bound")
  func plainRow() {
    #expect(value("LDL-Cholesterin")?.value == 141)
    #expect(value("LDL-Cholesterin")?.referenceHigh == 116)
  }

  @Test("labels containing their own digits stay intact")
  func digitLabels() {
    #expect(value("Vitamin B12")?.value == 412)
    #expect(value("HbA1c")?.value == 5.7)
  }

  @Test("a label with parentheses stays intact")
  func parenLabel() {
    #expect(value("Lp(a)")?.value == 87.3)
  }

  @Test("a comparator on the value is captured")
  func comparator() {
    #expect(value("Ferritin")?.comparator == .lessThan)
    #expect(value("Ferritin")?.value == 10)
  }

  @Test("German thousands survive the line grammar")
  func thousandsInLine() {
    #expect(value("NT-proBNP")?.value == 1240)
  }

  @Test("a row with no numeric result is reported, not invented")
  func notDetermined() {
    #expect(value("Troponin T hs") == nil)
    #expect(Self.parsed.suspiciousLines.contains { $0.contains("Troponin") })
  }

  @Test("headers and address lines produce no values")
  func noJunk() {
    #expect(value("Laborbefund") == nil)
    #expect(Self.parsed.values.allSatisfy { $0.value > 0 })
  }
}

@Suite("Extraction with provenance")
struct ExtractionTests {
  @Test("a scan is preliminary, never final")
  func scanIsPreliminary() {
    let result = LabLineParser.extract(LineTests.report, source: .ocrTranscribed)
    #expect(result.source == .ocrTranscribed)
    #expect(result.source.observationStatus == "preliminary")
    #expect(result.coded.allSatisfy { $0.source == .ocrTranscribed })
  }

  @Test("only a lab's own characters produce final")
  func digitalIsFinal() {
    #expect(SourceKind.labIssuedDigital.observationStatus == "final")
    #expect(SourceKind.selfTracked.observationStatus == "preliminary")
  }

  @Test("codes the cardiovascular panel")
  func codesPanel() {
    let result = LabLineParser.extract(LineTests.report, source: .ocrTranscribed)
    let loincs = Set(result.coded.map(\.coding.loinc))
    #expect(loincs.contains("2089-1"))  // LDL
    #expect(loincs.contains("10835-7"))  // Lp(a) by mass
    #expect(loincs.contains("30522-7"))  // hs-CRP
    #expect(loincs.contains("33762-6"))  // NT-proBNP
  }

  @Test("an unknown analyte is reported, not guessed")
  func unknownAnalyte() {
    let result = LabLineParser.extract(LineTests.report, source: .ocrTranscribed)
    let omega = result.unmapped.first { $0.raw.label.hasPrefix("Omega-3") }
    #expect(omega?.reason == .unknownAnalyte)
  }

  @Test("a known analyte in the wrong unit is a mismatch, not an unknown")
  func unitMismatch() {
    let result = LabLineParser.extract("HbA1c   5,7   mg/dl   4,8 - 5,9", source: .ocrTranscribed)
    #expect(result.unmapped.first?.reason == .unitMismatch)
    #expect(Analytes.expectedUnits(forLabel: "HbA1c").contains("%"))
  }

  @Test("every parsed row is accounted for exactly once")
  func nothingDropped() {
    let parsed = LabLineParser.parse(LineTests.report)
    let result = LabLineParser.extract(LineTests.report, source: .ocrTranscribed)
    #expect(result.coded.count + result.unmapped.count == parsed.values.count)
  }
}
