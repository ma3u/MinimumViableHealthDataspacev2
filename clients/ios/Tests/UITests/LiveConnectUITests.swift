import XCTest

/// Connect to EHDS against a real hub and a real Keycloak (#473), not the demo.
///
/// Skipped unless the run passes a fresh link from the patient screen:
///
///   TEST_RUNNER_KLARBEFUND_LINK='klarbefund://connect?...' \
///     xcodebuild test ... -only-testing:MeinBefundUITests/LiveConnectUITests
///
/// The patient approves in the browser before or while this runs; the device
/// grant does not care which comes first, only that it is within two minutes.
/// `docs/klarbefund/README.md` has the script that does all of it against the
/// compose stack.
final class LiveConnectUITests: XCTestCase {

  func testTheAppConnectsToTheHubAndReadsTheRecord() throws {
    guard let text = ProcessInfo.processInfo.environment["KLARBEFUND_LINK"],
      let link = URL(string: text)
    else { throw XCTSkip("no KLARBEFUND_LINK: this test needs a live pairing") }

    let app = XCUIApplication()
    app.launch()
    // iOS asks before following a custom scheme. A prompt left over from an
    // earlier attempt would open that older link, so it is cancelled first.
    let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
    if springboard.buttons["Cancel"].waitForExistence(timeout: 2) {
      springboard.buttons["Cancel"].tap()
    }
    app.open(link)
    let open = springboard.buttons["Open"]
    if open.waitForExistence(timeout: 5) { open.tap() }

    let account = app.descendants(matching: .any).matching(identifier: "connect-account").firstMatch
    XCTAssertTrue(account.waitForExistence(timeout: 60), "the phone never connected")
    XCTAssertTrue(account.label.contains("patient1"), account.label)
    app.buttons["connect-confirm"].tap()

    app.buttons["connect-show-record"].tap()
    let first = app.descendants(matching: .any).matching(identifier: "record-observation").firstMatch
    XCTAssertTrue(first.waitForExistence(timeout: 20), "the record never arrived")
    XCTAssertTrue(app.staticTexts["record-source"].label.contains("synthetic"))
    let shot = XCTAttachment(screenshot: app.screenshot())
    shot.lifetime = .keepAlways
    add(shot)
  }
}
