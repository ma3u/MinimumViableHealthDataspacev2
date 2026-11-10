import Foundation
import Testing

@testable import Shared

/// #934 step 4: the bonus programs as the hub lists them, and how the app
/// reads a join, a withdrawal and a transfer, above all the 403 after a
/// withdrawal. Every value is fictional: AlphaKasse DE and its active year
/// bonus, from the hub's own mock fixture.
@Suite("Bonus programs: the hub's answers, read by the app")
struct BonusProgrammesTests {
  private let programmeId = "urn:mvhd:programme:alphakasse:active-year-2025"

  /// The live route's answer, as Neo4j prints it: nanosecond datetimes, nulls.
  private var listed: Data {
    Data(
      #"""
      {"programmes":[{"programmeId":"urn:mvhd:programme:alphakasse:active-year-2025",
        "title":"Active year bonus 2025","description":null,"publisherName":"AlphaKasse DE",
        "publisherDid":"did:web:alphakasse.de:insurer","dataSpace":"insurance-wellbeing",
        "endpointUrl":null,"ruleTitle":"Active year rule, version 2025.1",
        "ruleDescription":"Goal met when active 150 minutes a week.","ruleVersion":"2025.1",
        "lastSeenAt":"2026-11-09T08:00:00Z"}],
       "consents":[
        {"consentId":"c-2","programmeId":"urn:mvhd:programme:alphakasse:active-year-2025",
         "joinedAt":"2026-11-09T10:15:00.123456789Z","withdrawnAt":null},
        {"consentId":"c-1","programmeId":"urn:mvhd:programme:alphakasse:active-year-2025",
         "joinedAt":"2026-11-02T09:00:00Z","withdrawnAt":"2026-11-03T09:00:00Z"}],
       "legalBasis":"Primary use the person directs"}
      """#.utf8)
  }

  @Test("decodes the hub's list, nulls and all")
  func decodesTheList() throws {
    let offer = try #require(ProgrammeOffer.parse(listed))
    #expect(offer.programmes.count == 1)
    let programme = offer.programmes[0]
    #expect(programme.title == "Active year bonus 2025")
    #expect(programme.publisher == "AlphaKasse DE")
    #expect(programme.description == nil)
    #expect(programme.dataSpace == "insurance-wellbeing")
    #expect(offer.consents.map(\.consentId) == ["c-2", "c-1"])
  }

  @Test("reads the portal's static fixture, so the phone and the browser share one shape")
  func readsThePortalFixture() throws {
    let url = URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent().appendingPathComponent(
        "../../../../ui/public/mock/patient_programmes.json"
      ).standardizedFileURL
    let offer = try #require(ProgrammeOffer.parse(try Data(contentsOf: url)))
    #expect(offer.programmes.first?.programmeId == programmeId)
    #expect(offer.programmes.first?.ruleYear() == 2025)
    #expect(offer.consents.isEmpty)
  }

  @Test("refuses an answer that is not the programs' shape")
  func refusesAnotherShape() {
    #expect(ProgrammeOffer.parse(Data(#"{"error":"Unauthorized"}"#.utf8)) == nil)
    #expect(ProgrammeOffer.parse(Data("not json".utf8)) == nil)
  }

  @Test("a missing consents list is an empty one")
  func missingConsents() throws {
    let offer = try #require(ProgrammeOffer.parse(Data(#"{"programmes":[]}"#.utf8)))
    #expect(offer.consents.isEmpty)
  }

  @Test("open is the consent not withdrawn; last is the newest, open or not")
  func openAndLast() throws {
    var offer = try #require(ProgrammeOffer.parse(listed))
    #expect(offer.open(programmeId)?.consentId == "c-2")
    #expect(offer.last(programmeId)?.consentId == "c-2")

    offer.apply(
      ProgrammeConsent(
        consentId: "c-2", programmeId: programmeId, joinedAt: "2026-11-09T10:15:00Z",
        withdrawnAt: "2026-11-09T11:00:00Z"))
    #expect(offer.open(programmeId) == nil, "a withdrawal closes it")
    #expect(offer.last(programmeId)?.withdrawnAt != nil)
    #expect(offer.consents.count == 2, "replaced, not added")
  }

  @Test("the day shown is the hub's calendar day, as the portal prints it")
  func days() throws {
    let offer = try #require(ProgrammeOffer.parse(listed))
    let joined = try #require(offer.open(programmeId)?.joinedDay)
    let parts = Calendar(identifier: .gregorian).dateComponents([.year, .month, .day], from: joined)
    #expect([parts.year, parts.month, parts.day] == [2026, 11, 9])
    #expect(offer.consents[1].withdrawnDay != nil)
  }

  @Test("the year to send is the rule's, or this year when the rule names none")
  func ruleYear() {
    let now = Date(timeIntervalSince1970: 1_793_000_000)  // in 2026
    #expect(BonusProgramme(programmeId: "p", title: "t", ruleVersion: "2027.1").ruleYear(now: now) == 2027)
    #expect(BonusProgramme(programmeId: "p", title: "t").ruleYear(now: now) == 2026)
    #expect(BonusProgramme(programmeId: "p", title: "t", ruleVersion: "v1").ruleYear(now: now) == 2026)
  }

  @Test("a join answers 201 with the open consent")
  func join() {
    let body = Data(
      #"{"consent":{"consentId":"c-3","programmeId":"p","joinedAt":"2026-11-09T12:00:00Z","withdrawnAt":null},"legalBasis":"x"}"#
        .utf8)
    guard case let .consent(consent) = ProgrammeAnswer.join(status: 201, body: body) else {
      Issue.record("not read as a consent")
      return
    }
    #expect(consent.isOpen)
    #expect(ProgrammeAnswer.join(status: 200, body: body) == .failed(status: 200, reason: nil))
  }

  @Test("a withdrawal answers 200 with the closed consent; 404 when none is open")
  func withdraw() {
    let body = Data(
      #"{"consent":{"consentId":"c-3","programmeId":"p","joinedAt":"2026-11-09T12:00:00Z","withdrawnAt":"2026-11-09T13:00:00Z"}}"#
        .utf8)
    guard case let .consent(consent) = ProgrammeAnswer.withdraw(status: 200, body: body) else {
      Issue.record("not read as a consent")
      return
    }
    #expect(!consent.isOpen)
    let none = Data(#"{"error":"There is no open consent to this program to withdraw"}"#.utf8)
    #expect(
      ProgrammeAnswer.withdraw(status: 404, body: none)
        == .failed(status: 404, reason: "There is no open consent to this program to withdraw"))
  }

  @Test("a transfer under an open consent answers 202 with the year and goal met")
  func transfer() {
    let body = Data(
      #"{"transfer":{"transferId":"t-1","programmeId":"p","year":2025,"goalMet":true,"status":"evaluated","requestedAt":"2026-11-10T12:00:00Z"},"legalBasis":"x"}"#
        .utf8)
    #expect(
      ProgrammeAnswer.transfer(status: 202, body: body)
        == .transfer(
          ProgrammeTransfer(
            transferId: "t-1", programmeId: "p", year: 2025, goalMet: true,
            status: "evaluated")))
  }

  @Test("a year that is not over answers 409, and the app reads: nothing was sent")
  func yearNotOver() {
    let body = Data(
      #"{"error":"2026 is not over","evaluation":{"year":2026,"status":"year-not-over","evaluableFrom":"2027-01-01"}}"#
        .utf8)
    #expect(ProgrammeAnswer.transfer(status: 409, body: body) == .yearNotOver(evaluableFrom: "2027-01-01"))
  }

  @Test("decodes the member's result for an ended year, breakdown and all")
  func evaluated() throws {
    let body = Data(
      #"{"programmeId":"p","evaluation":{"year":2025,"status":"evaluated","goalMet":false,"activity":{"minutesPerWeek":78,"required":150,"weeksWithData":48,"met":false},"checkUp":{"count":1,"required":1,"met":true}}}"#
        .utf8)
    let evaluation = try #require(ProgrammeEvaluation.parse(body))
    #expect(evaluation.year == 2025)
    #expect(
      evaluation
        == .evaluated(
          ProgrammeResult(
            year: 2025, goalMet: false, minutesPerWeek: 78, requiredMinutesPerWeek: 150,
            weeksWithData: 48, activityMet: false, checkUps: 1, checkUpMet: true)))
  }

  @Test("decodes a year that is not over, and refuses another shape")
  func evaluationShapes() {
    let notOver = Data(
      #"{"evaluation":{"year":2026,"status":"year-not-over","evaluableFrom":"2027-01-01"}}"#.utf8)
    #expect(
      ProgrammeEvaluation.parse(notOver) == .yearNotOver(year: 2026, evaluableFrom: "2027-01-01"))
    #expect(ProgrammeEvaluation.parse(Data(#"{"error":"Patient not found"}"#.utf8)) == nil)
    // Evaluated without its breakdown is not a result the screen can show.
    #expect(
      ProgrammeEvaluation.parse(
        Data(#"{"evaluation":{"year":2025,"status":"evaluated","goalMet":true}}"#.utf8)) == nil)
  }

  @Test("after a withdrawal the hub answers 403, and the app reads: nothing was sent")
  func refusedAfterWithdrawal() {
    let body = Data(
      #"{"error":"No open consent to this program: join it first. After a withdrawal nothing is sent."}"#
        .utf8)
    #expect(ProgrammeAnswer.transfer(status: 403, body: body) == .noOpenConsent)
    // Whatever the body says: a 403 is never read as sent.
    #expect(ProgrammeAnswer.transfer(status: 403, body: Data()) == .noOpenConsent)
  }

  @Test("any other status is a failure with the hub's reason")
  func otherFailures() {
    let body = Data(#"{"error":"programmeId and a calendar year are required"}"#.utf8)
    #expect(
      ProgrammeAnswer.transfer(status: 400, body: body)
        == .failed(status: 400, reason: "programmeId and a calendar year are required"))
    #expect(ProgrammeAnswer.transfer(status: 202, body: Data("{}".utf8)) == .failed(status: 202, reason: nil))
  }
}
