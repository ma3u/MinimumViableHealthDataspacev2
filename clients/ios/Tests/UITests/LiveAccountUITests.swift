import XCTest

/// An account the app creates for itself on the live hub (ADR-054), with
/// Apple's real App Attest, so only on a real iPhone: the simulator cannot
/// attest. Creates a sandbox account, reads its empty record, and deletes it,
/// so a run leaves nothing behind on the hub.
///
/// Skipped unless asked for:
///
///   TEST_RUNNER_KLARBEFUND_LIVE_ACCOUNT=1 xcodebuild test ... \
///     -destination 'platform=iOS,id=<the iPhone>' \
///     -only-testing:MeinBefundUITests/LiveAccountUITests
final class LiveAccountUITests: XCTestCase {

  func testTheAppCreatesItsOwnAccountReadsItAndDeletesIt() throws {
    guard ProcessInfo.processInfo.environment["KLARBEFUND_LIVE_ACCOUNT"] == "1" else {
      throw XCTSkip("set KLARBEFUND_LIVE_ACCOUNT=1 to create an account on the live hub")
    }
    let app = XCUIApplication()
    app.launchArguments = ["-MBShot", "connect"]
    app.launch()

    let create = app.buttons["account-create"]
    XCTAssertTrue(create.waitForExistence(timeout: 10), "no Create button: an account is already stored")
    XCTAssertTrue(create.isEnabled, "this device cannot attest")
    create.tap()

    let username = app.descendants(matching: .any)
      .matching(identifier: "account-shown-username").firstMatch
    if !username.waitForExistence(timeout: 60) {
      let error = app.descendants(matching: .any).matching(identifier: "connect-error").firstMatch
      XCTFail("no account: \(error.exists ? error.label : "no error shown")")
      return
    }
    XCTAssertTrue(username.label.contains("kb-"), username.label)
    app.buttons["account-reveal"].tap()
    let password = app.staticTexts["account-shown-password"]
    XCTAssertFalse(password.label.contains("•"), "the password can be revealed")

    app.buttons["connect-show-record"].tap()
    XCTAssertTrue(
      app.staticTexts["record-sandbox"].waitForExistence(timeout: 20),
      "the account's own record never arrived")
    app.navigationBars.buttons.element(boundBy: 0).tap()

    let delete = app.buttons["account-delete"]
    for _ in 0..<5 where !delete.isHittable { app.swipeUp() }
    delete.tap()
    app.buttons.matching(identifier: "account-delete-confirm").firstMatch.tap()
    XCTAssertTrue(create.waitForExistence(timeout: 20), "the account was not deleted")
  }
}
