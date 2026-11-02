import Foundation
import Testing

@testable import Shared

/// A home amino acid test, printed as a name with its range and the result on
/// the line below. The text layer's quirks are a real PDF's: names in
/// kerning fragments, one name's fragments out of order, a row split around
/// its result and a row split by a page. Every value and range is invented
/// (README rule 1).
@Suite("A home amino acid panel")
struct AminoAcidPanelTests {

  static let results = """
    Amino Acid Test
    S
    a
    mple Numb
    er:
    Your test result
    P
    ara
    meter Norm
    alb
    ereich
    Messerge
    bnis
    Isoleucin 30 – 110 nmol/ml
    61.4 nmol/ml
    Leucin 55 – 185 nmol/ml
    121.8 nmol/ml
    Phenylala
    nin 35 – 80 nmol/ml
    54.3 nmol/ml
    """

  static let secondPage = """
    Threonin 55
    102.6 nmol/ml
    – 150 nmol/ml
    Arginin 2.5 – 48 nmol/ml
    38.4 nmol/ml
    Tyrosin 25 – 95 nmol/ml
    """

  static let thirdPage = """
    58.7 nmol/ml
    Asp
    ara
    ginsäure 30 – 160 nmol/ml
    >200 nmol/ml
    Bet
    a
    -Ala
    nin 4.1 – 18 nmol/ml
    6.4 nmol/ml
    G
    mm
    a
    a
    b
    -Amino
    uttersäure0.12 – 1.6 nmol/ml
    0.82 nmol/ml
    Homo
    arginin0.6 – 3.1 nmol/ml
    1.9 nmol/ml
    """

  /// A detail page: the result said again, and a gauge's numbers before the
  /// next name, which belong to no row.
  static let detailPage = """
    Isoleucin ist eine essentielle Aminosäure. Ein M a ngel k a nn zu Ermüdung führen [1].
    30 110 61.4 nmol/ml 2.6 130
    Leucin
    Die Konzentra tion von Leucin im Blut wird in N a nomol pro Milliliter (nmol/ml) gemessen.
    Ihr gemessener Leucin-Wert b eträgt 121.8 nmol/ml und liegt d a mit im Norm alb ereich.
    < 55 nmol/ml: Niedriger Bereich > 185 nmol/ml: Bereich n a türlicher Schw a nkungen
    55 - 185 nmol/ml: Norm alb ereich
    """

  static var pages: [String] { [results, secondPage, thirdPage, detailPage] }

  private func byName(_ values: [RawLabValue]) -> [String: RawLabValue] {
    Dictionary(values.map { ($0.label, $0) }) { a, _ in a }
  }

  @Test("every row is read with its range, across fragments and pages")
  func readsEveryRow() throws {
    let values = AminoAcidPanel.read(pageTexts: Self.pages)
    #expect(values.map(\.label) == [
      "Isoleucin", "Leucin", "Phenylalanin", "Threonin", "Arginin", "Tyrosin",
      "Asparaginsäure", "Beta-Alanin", "Gamma-Aminobuttersäure", "Homoarginin",
    ])
    let v = byName(values)
    let isoleucine = try #require(v["Isoleucin"])
    #expect(isoleucine.value == 61.4)
    #expect(isoleucine.referenceLow == 30 && isoleucine.referenceHigh == 110)
    #expect(isoleucine.unitRaw == "nmol/ml")
    #expect(v["Phenylalanin"]?.value == 54.3)
  }

  @Test("a row split around its result keeps its range")
  func splitRow() throws {
    let threonine = try #require(byName(AminoAcidPanel.read(pageTexts: Self.pages))["Threonin"])
    #expect(threonine.value == 102.6)
    #expect(threonine.referenceLow == 55 && threonine.referenceHigh == 150)
  }

  @Test("a row split by a page break keeps its result")
  func pageBreak() {
    #expect(byName(AminoAcidPanel.read(pageTexts: Self.pages))["Tyrosin"]?.value == 58.7)
  }

  @Test("a result above the measuring range keeps its comparator")
  func comparator() throws {
    let aspartate = try #require(byName(AminoAcidPanel.read(pageTexts: Self.pages))["Asparaginsäure"])
    #expect(aspartate.value == 200)
    #expect(aspartate.comparator == .greaterThan)
  }

  @Test("a name whose fragments came out of order is still recognised")
  func scrambledName() {
    #expect(AminoAcidPanel.name(endingWith: Array("gmmaabaminouttersäure")) == "Gamma-Aminobuttersäure")
    // Letters in any order are only trusted for a long name.
    #expect(AminoAcidPanel.name(endingWith: Array("nicsyl")) == nil)
    // The longer name wins where one ends with the other.
    #expect(AminoAcidPanel.name(endingWith: Array("homoarginin")) == "Homoarginin")
    #expect(AminoAcidPanel.name(endingWith: Array("messergebnisarginin")) == "Arginin")
  }

  @Test("a result its detail page contradicts is not read")
  func twinDisagrees() {
    let detail = Self.detailPage.replacingOccurrences(of: "b eträgt 121.8", with: "b eträgt 112.8")
    let values = AminoAcidPanel.read(pageTexts: [Self.results, Self.secondPage, Self.thirdPage, detail])
    #expect(byName(values)["Leucin"] == nil)
    #expect(byName(values)["Isoleucin"]?.value == 61.4)
  }

  @Test("the gauge and the ranges on a detail page are not read as rows")
  func detailPageAlone() {
    #expect(AminoAcidPanel.read(pageTexts: [Self.detailPage]).isEmpty)
  }

  @Test("every name codes, in nanomoles per millilitre as in micromoles per litre")
  func everyNameCodes() throws {
    for name in AminoAcidPanel.names {
      let nmol = try #require(Analytes.lookup(label: name, unit: "nmol/ml"), "\(name)")
      let umol = try #require(Analytes.lookup(label: name, unit: "µmol/l"), "\(name)")
      #expect(nmol.loinc == umol.loinc, "\(name)")
      #expect(nmol.ucum == "umol/L", "\(name)")
    }
    #expect(Analytes.lookup(label: "Sarkosin", unit: "nmol/ml")?.loinc == "26613-0")
    #expect(Analytes.lookup(label: "Homoarginin", unit: "nmol/ml")?.loinc == "79612-8")
  }

  @Test("the panel's reading replaces the line grammar's, which read nothing")
  func replacesTheGrammar() {
    let sheet = LabLineParser.extract(Self.pages.joined(separator: "\n"), source: .labIssuedDigital)
    let read = DocumentReaders.applied(to: sheet, pageTexts: Self.pages, pages: [])
    #expect(read.coded.count == 10)
    #expect(read.unmapped.isEmpty)
  }

  @Test("an aminogram the line grammar reads row by row is left to it")
  func grammarKeepsItsOwn() {
    let page = """
      Isoleucin 61,4 µmol/l 30 - 110
      Leucin 121,8 µmol/l 55 - 185
      Lysin 104,5 µmol/l 70 - 165
      Methionin 21,7 µmol/l 12 - 35
      Phenylalanin 54,3 µmol/l 35 - 80
      Threonin 102,6 µmol/l 55 - 150
      """
    let sheet = LabLineParser.extract(page, source: .labIssuedDigital)
    #expect(DocumentReaders.applied(to: sheet, pageTexts: [page], pages: []) == sheet)
  }
}
