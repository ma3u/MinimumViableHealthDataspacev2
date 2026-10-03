import Foundation
import Testing

@testable import Shared

/// #186 criterion 6: the study's consent, the ePA objection and a registry
/// consent are three separately revocable things, never one switch.
@Suite("Consents: three decisions, never one switch")
struct ConsentsTests {
  private let day1 = Date(timeIntervalSince1970: 1_780_000_000)
  private let day2 = Date(timeIntervalSince1970: 1_780_500_000)

  @Test("nothing recorded is not the same as withdrawn")
  func neverRecorded() {
    var ledger = ConsentLedger.empty
    #expect(ledger.current(.registry) == nil)
    ledger.record(.registry, active: false, effective: day1)
    #expect(ledger.current(.registry)?.active == false)
    #expect(ledger.current(.study) == nil)
  }

  @Test("recording one kind leaves the other two exactly as they were")
  func independent() {
    var ledger = ConsentLedger.empty
    ledger.record(.study, active: true, effective: day1, holder: "Studienzentrum Nord")
    ledger.record(.registry, active: true, effective: day1, holder: "Register Herz")
    ledger.record(.epaObjection, active: true, effective: day1, holder: "AlphaKasse DE")

    let before = ConsentKind.allCases.map { ledger.current($0) }
    for kind in ConsentKind.allCases {
      var changed = ledger
      changed.record(kind, active: false, effective: day2)
      for other in ConsentKind.allCases where other != kind {
        #expect(changed.current(other) == before[ConsentKind.allCases.firstIndex(of: other)!])
      }
      #expect(changed.isActive(kind) == false)
    }
  }

  @Test("withdrawing the study consent does not withdraw an ePA objection or a registry consent")
  func studyWithdrawal() {
    var ledger = ConsentLedger.empty
    ledger.record(.study, active: true, effective: day1)
    ledger.record(.registry, active: true, effective: day1)
    ledger.record(.epaObjection, active: true, effective: day1)
    ledger.record(.study, active: false, effective: day2)
    #expect(!ledger.isActive(.study))
    #expect(ledger.isActive(.registry))
    #expect(ledger.isActive(.epaObjection))
  }

  @Test("a withdrawal keeps the grant it withdraws, so consent can still be shown")
  func appendOnly() {
    var ledger = ConsentLedger.empty
    ledger.record(.registry, active: true, effective: day1, holder: "Register Herz")
    ledger.record(.registry, active: false, effective: day2)
    let history = ledger.history(of: .registry)
    #expect(history.map(\.active) == [true, false])
    #expect(history.first?.effective == day1)
    // The holder carries over when the withdrawal names none.
    #expect(history.last?.holder == "Register Herz")
  }

  @Test("a blank holder is stored as none")
  func blankHolder() {
    var ledger = ConsentLedger.empty
    ledger.record(.study, active: true, effective: day1, holder: "   ")
    #expect(ledger.current(.study)?.holder == nil)
  }

  @Test("the ledger survives a round trip through the store's encoding")
  func codable() throws {
    var ledger = ConsentLedger.empty
    ledger.record(.epaObjection, active: true, effective: day1, holder: "AlphaKasse DE")
    let decoded = try JSONDecoder().decode(
      ConsentLedger.self, from: JSONEncoder().encode(ledger))
    #expect(decoded == ledger)
    #expect(String(decoding: try JSONEncoder().encode(ledger), as: UTF8.self)
      .contains("epa-objection"))
  }
}
