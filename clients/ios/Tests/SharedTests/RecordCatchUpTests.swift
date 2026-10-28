import Foundation
import Testing

@testable import Shared

@Suite("Record catch-up when the app comes up (2026-10-28)")
struct RecordCatchUpTests {
  let hub = (ehds: "https://ehds.mabu.red", issuer: "https://auth.ehds.mabu.red/realms/edcv")

  func account(createdByApp: Bool, username: String = "kb-test0001") -> EHDSAccount {
    EHDSAccount(
      ehds: hub.ehds, issuer: hub.issuer, username: username, password: "not-a-real-password",
      createdByApp: createdByApp)
  }

  @Test("the app's own account, sending on, nothing running: due")
  func due() {
    #expect(
      RecordCatchUp().due(
        account: account(createdByApp: true), sending: true, busy: false, lastAttempt: nil))
  }

  @Test("never without the person's decision to send, or for a typed-in account")
  func onlyWithConsentAndOwnAccount() {
    let rule = RecordCatchUp()
    #expect(!rule.due(account: nil, sending: true, busy: false, lastAttempt: nil))
    #expect(
      !rule.due(account: account(createdByApp: true), sending: false, busy: false, lastAttempt: nil))
    #expect(
      !rule.due(account: account(createdByApp: false), sending: true, busy: false, lastAttempt: nil))
  }

  @Test("not while a send runs, and not twice within the gap")
  func throttled() {
    let rule = RecordCatchUp(minimumGap: 60)
    let now = Date()
    let mine = account(createdByApp: true)
    #expect(!rule.due(account: mine, sending: true, busy: true, lastAttempt: nil, now: now))
    #expect(
      !rule.due(
        account: mine, sending: true, busy: false, lastAttempt: now.addingTimeInterval(-10), now: now))
    #expect(
      rule.due(
        account: mine, sending: true, busy: false, lastAttempt: now.addingTimeInterval(-61), now: now))
  }

  @Test("signing in again as the app's account keeps it the app's account")
  func signInAgainKeepsOrigin() {
    let kept = account(createdByApp: true)
    let again = EHDSAccount.signedIn(
      ehds: hub.ehds, issuer: hub.issuer, username: " kb-test0001 ", password: "typed", kept: kept)
    #expect(again.createdByApp)
    #expect(again.username == "kb-test0001")
    #expect(again.client == kept.client)
    #expect(again.password == "typed")
  }

  @Test("another username, or no kept account, is a borrowed account")
  func otherAccountIsBorrowed() {
    let kept = account(createdByApp: true)
    #expect(
      !EHDSAccount.signedIn(
        ehds: hub.ehds, issuer: hub.issuer, username: "patient1", password: "x", kept: kept
      ).createdByApp)
    #expect(
      !EHDSAccount.signedIn(
        ehds: hub.ehds, issuer: hub.issuer, username: "kb-test0001", password: "x", kept: nil
      ).createdByApp)
  }
}
