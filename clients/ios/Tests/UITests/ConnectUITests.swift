import XCTest

/// Connect to EHDS (#473, ADR-049), with the hub and Keycloak played by the
/// demo under `-MBDemoSeed`: the screen, the refusal of a code from a hub not
/// on the list, the "is this your account?" step, the record and Disconnect.
final class ConnectUITests: XCTestCase {

  override func setUp() {
    continueAfterFailure = false
  }

  private func link(ehds: String = "https%3A%2F%2Fehds.mabu.red") -> String {
    let expires = Int(Date().addingTimeInterval(120).timeIntervalSince1970)
    return "klarbefund://connect?ehds=\(ehds)&issuer=https%3A%2F%2Fauth.ehds.mabu.red%2Frealms%2Fedcv&client=klarbefund-app&pairing=demo&device_code=demo&user_code=DEMO-CODE&interval=1&expires=\(expires)"
  }

  private func open() -> XCUIApplication {
    let app = AppDriver.launch(.connect)
    AppDriver.require(app.navigationBars["Connect to EHDS"], "the Connect sheet")
    AppDriver.require(app.staticTexts["connect-website"], "the patient screen's address")
    return app
  }

  private func paste(_ text: String, in app: XCUIApplication) {
    let field = AppDriver.scrollTo(app.textFields["connect-paste"], in: app)
    field.tap()
    field.typeText(text)
    AppDriver.scrollTo(app.buttons["connect-go"], in: app).tap()
  }

  func testTheSheetSaysWhereTheCodeIs() {
    let app = open()
    XCTAssertTrue(
      app.staticTexts["connect-website"].label.contains("ehds.mabu.red/patient/profile"),
      "the patient screen's address is on the sheet")
  }

  func testACodeFromAHubNotOnTheListIsRefused() {
    let app = open()
    paste(link(ehds: "https%3A%2F%2Fehds-mabu.red"), in: app)
    // The refusal sits at the top of the form, above the field just used.
    app.swipeDown()
    app.swipeDown()
    let error = AppDriver.require(
      app.descendants(matching: .any).matching(identifier: "connect-error").firstMatch,
      "the refusal")
    XCTAssertTrue(error.label.contains("ehds-mabu.red"), error.label)
  }

  func testConnectingAsksWhoseAccountThenShowsTheRecord() {
    let app = open()
    paste(link(), in: app)

    let account = AppDriver.require(
      app.descendants(matching: .any).matching(identifier: "connect-account").firstMatch,
      "the account the phone connected to")
    XCTAssertTrue(account.label.contains("patient1"), account.label)
    app.buttons["connect-confirm"].tap()

    AppDriver.require(app.buttons["connect-show-record"], "the record button").tap()
    let source = AppDriver.require(
      app.staticTexts["record-source"], "where the record comes from")
    XCTAssertTrue(source.label.contains("synthetic"), "the demo record says it is synthetic")
    XCTAssertEqual(
      app.descendants(matching: .any).matching(identifier: "record-observation").count, 2,
      "the demo record's two measurements")
    XCTAssertTrue(
      AppDriver.text(containing: "< 116", in: app).exists, "the printed range comes along")

    app.navigationBars.buttons.element(boundBy: 0).tap()
    AppDriver.scrollTo(app.buttons["connect-disconnect"], in: app).tap()
    AppDriver.require(app.staticTexts["connect-website"], "back to not connected")
  }

  func testABadCodeLaterDoesNotUndoAConnection() {
    // The live run found it: an expired link opened after the real one had
    // connected replaced the connection with "the code expired".
    let app = open()
    paste(link(), in: app)
    AppDriver.require(app.buttons["connect-confirm"], "the account question").tap()
    // Through the system, as a QR code read by the camera app would arrive:
    // `XCUIApplication.open` relaunches the app, which is not the case here.
    XCUIDevice.shared.system.open(URL(string: link(ehds: "https%3A%2F%2Fehds-mabu.red"))!)
    let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
    if springboard.buttons["Open"].waitForExistence(timeout: 5) { springboard.buttons["Open"].tap() }
    AppDriver.require(
      app.descendants(matching: .any).matching(identifier: "connect-notice").firstMatch,
      "the notice about the bad code")
    XCTAssertTrue(
      app.descendants(matching: .any).matching(identifier: "connect-connected-account")
        .firstMatch.exists,
      "still connected")
  }
}
