import Foundation
import Testing

@testable import Shared

/// The report's own dates and details, read from its text.
///
/// The first real scan was filed under the day it was photographed (#186).
/// These pin the rules that stop that: the collection date wins, a birth date
/// never does, and a future date cannot be a result.
@Suite("Reading what the report says about itself")
struct ReportMetadataTests {

  static func day(_ y: Int, _ m: Int, _ d: Int) -> Date {
    ReportMetadataExtractor.day(y, m, d)!
  }

  /// "Today" for every test, so the future-date rule is deterministic.
  static let now = day(2026, 9, 19)

  static func extract(_ page: String) -> ReportMetadata {
    ReportMetadataExtractor.extract(pages: [page], now: now)
  }

  @Test("the collection date is the lab date, not the print date and not the birth date")
  func labelledDates() {
    let metadata = Self.extract(
      """
      MVZ Labor Musterstadt GmbH
      Patient: Muster, Max   geb. 03.04.1975
      Auftragsnr.: 2609123456
      Einsender: Dr. med. Erika Beispiel
      Entnahme: 12.09.2026 08:15   Eingang: 12.09.2026 11:40
      Befunddatum: 14.09.2026
      """)

    #expect(metadata.collectedOn == Self.day(2026, 9, 12))
    #expect(metadata.receivedOn == Self.day(2026, 9, 12))
    #expect(metadata.reportedOn == Self.day(2026, 9, 14))
    #expect(metadata.labDate == Self.day(2026, 9, 12))
    #expect(metadata.labDateRole == .collection)
    #expect(metadata.dateSource == .printed)
    // The birth date is kept as evidence and never promoted.
    #expect(metadata.dates.contains { $0.role == .birth && $0.date == Self.day(1975, 4, 3) })
    #expect(metadata.laboratory == "MVZ Labor Musterstadt GmbH")
    #expect(metadata.reportNumber == "2609123456")
    #expect(metadata.orderingPhysician == "Dr. med. Erika Beispiel")
  }

  @Test("Entnahmedatum is a collection, not outranked by its own -datum suffix")
  func suffixDoesNotOutrank() {
    let metadata = Self.extract("Entnahmedatum 11.09.2026   Druckdatum 13.09.2026")
    #expect(metadata.collectedOn == Self.day(2026, 9, 11))
    #expect(metadata.reportedOn == Self.day(2026, 9, 13))
    #expect(metadata.labDate == Self.day(2026, 9, 11))
  }

  @Test("receipt stands in when no collection date is printed, then issue")
  func fallbackOrder() {
    let received = Self.extract("Materialeingang: 10.09.2026\nBefund vom 12.09.2026")
    #expect(received.labDate == Self.day(2026, 9, 10))
    #expect(received.labDateRole == .received)

    let reported = Self.extract("Laborbefund, validiert am 12.09.2026")
    #expect(reported.labDate == Self.day(2026, 9, 12))
    #expect(reported.labDateRole == .reported)
  }

  @Test("an unlabelled date is taken only when nothing better is printed, the latest one")
  func unlabelledFallback() {
    let metadata = Self.extract("Laborgemeinschaft Nord\nBlutbild 05.03.2025\nSeite 1 von 2  06.03.2025")
    #expect(metadata.labDate == Self.day(2025, 3, 6))
    #expect(metadata.labDateRole == .other)
    #expect(metadata.dateSource == .printed)
  }

  @Test("a future date and a birth date are never the lab date")
  func futureAndBirthExcluded() {
    let metadata = Self.extract("geb. 03.04.1975\nGültig bis 01.01.2030")
    #expect(metadata.labDate == nil)
    #expect(metadata.dateSource == .scan)
    #expect(metadata.dates.count == 2, "both dates stay as evidence")
  }

  @Test("ISO dates and two-digit years are read")
  func otherFormats() {
    let metadata = Self.extract("Abnahme 12.09.26\nReport date 2026-09-14")
    #expect(metadata.collectedOn == Self.day(2026, 9, 12))
    #expect(metadata.reportedOn == Self.day(2026, 9, 14))
  }

  @Test("a row of bare dates under a row of headings pairs them by position")
  func headingsAbove() {
    let metadata = Self.extract("Entnahme  Eingang  Befund\n11.09.2026  12.09.2026  13.09.2026")
    #expect(metadata.collectedOn == Self.day(2026, 9, 11))
    #expect(metadata.receivedOn == Self.day(2026, 9, 12))
    #expect(metadata.reportedOn == Self.day(2026, 9, 13))
  }

  @Test("an umlaut the recogniser dropped does not hide the keyword")
  func foldedKeywords() {
    let metadata = Self.extract("Uberweiser: Praxis Dr. Muster\nBlutentnahme 02.02.2026")
    #expect(metadata.orderingPhysician == "Praxis Dr. Muster")
    #expect(metadata.collectedOn == Self.day(2026, 2, 2))
  }

  @Test("a number of digits is a report number, a word after 'Auftrag' is not")
  func reportNumberNeedsDigits() {
    #expect(Self.extract("Auftrag angenommen").reportNumber == nil)
    #expect(Self.extract("Labor-Nr. AB-2026/0912").reportNumber == "AB-2026/0912")
  }

  @Test("31.02. and 99.99. are not dates")
  func invalidDates() {
    let metadata = Self.extract("Entnahme 31.02.2026   Eingang 99.99.2026")
    #expect(metadata.dates.isEmpty)
    #expect(metadata.labDate == nil)
  }

  @Test("the document's own title is not its laboratory")
  func titleIsNotTheLaboratory() {
    let metadata = Self.extract("Laborbefund\nMVZ Labor Musterstadt GmbH\nEntnahme: 12.09.2026")
    #expect(metadata.laboratory == "MVZ Labor Musterstadt GmbH")
  }

  @Test("a page number printed beside the laboratory is not part of its name")
  func pageNumberIsNotTheLaboratory() {
    // A table recogniser returns one printed line as one cell, page number and
    // all, which is how the issuer came to be called "... GmbH Seite 1".
    let metadata = Self.extract(
      "Laborbefund\nMVZ Labor Musterstadt GmbH   Seite 1\nEntnahme: 12.09.2026")
    #expect(metadata.laboratory == "MVZ Labor Musterstadt GmbH")
    #expect(
      ReportMetadataExtractor.trimPageNumber("Labor Nord GmbH - Seite 2 von 3") == "Labor Nord GmbH")
    // A name that merely ends in a number keeps it.
    #expect(ReportMetadataExtractor.trimPageNumber("Labor 2000") == "Labor 2000")
  }

  @Test("the referrer is read after its own keyword, not after the line's first colon")
  func referrerAfterItsOwnKeyword() {
    let metadata = Self.extract(
      "Auftragsnr.: 2609123456   Einsender: Dr. med. Erika Beispiel\nEntnahme: 12.09.2026")
    #expect(metadata.orderingPhysician == "Dr. med. Erika Beispiel")
    #expect(metadata.reportNumber == "2609123456")
  }

  @Test("the empty page yields the empty record")
  func emptyPage() {
    #expect(Self.extract("") == .empty)
  }
}
