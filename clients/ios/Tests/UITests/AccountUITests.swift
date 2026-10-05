import XCTest

/// An account the app creates for itself on the hub (ADR-054), with the hub,
/// Keycloak and App Attest played by the demo under `-MBDemoSeed`: create,
/// see the username and password, read the empty record, delete.
final class AccountUITests: XCTestCase {

  override func setUp() {
    continueAfterFailure = false
  }

  private func open() -> XCUIApplication {
    let app = AppDriver.launch(.connect)
    AppDriver.require(app.navigationBars["Connect to EHDS"], "the Connect sheet")
    return app
  }

  func testCreatingAnAccountConnectsAndShowsItsPassword() {
    let app = open()
    AppDriver.require(app.buttons["account-create"], "Create an EHDS account").tap()

    let username = AppDriver.require(
      app.descendants(matching: .any).matching(identifier: "account-shown-username").firstMatch,
      "the new username")
    XCTAssertTrue(username.label.contains("kb-demo2345"), username.label)
    XCTAssertTrue(
      app.descendants(matching: .any).matching(identifier: "connect-connected-account")
        .firstMatch.label.contains("kb-demo2345"),
      "connected as the new account, with no code to scan")

    // Hidden until asked for.
    let password = app.staticTexts["account-shown-password"]
    XCTAssertFalse(password.label.contains("Demo2"), "the password starts hidden")
    app.buttons["account-reveal"].tap()
    XCTAssertTrue(app.staticTexts["account-shown-password"].label.contains("Demo2-Pass3"))

    AppDriver.require(app.buttons["connect-show-record"], "the record button").tap()
    AppDriver.require(app.staticTexts["record-sandbox"], "the record says it is the account's own")
    app.navigationBars.buttons.element(boundBy: 0).tap()

    AppDriver.scrollTo(app.buttons["account-delete"], in: app).tap()
    // A confirmation dialog lists its action twice in the accessibility tree.
    AppDriver.require(
      app.buttons.matching(identifier: "account-delete-confirm").firstMatch, "the confirmation"
    ).tap()
    AppDriver.require(app.buttons["account-create"], "back to no account")
  }

  func testAWrongPasswordIsSaidPlainly() {
    let app = open()
    let user = AppDriver.scrollTo(app.textFields["account-username"], in: app)
    user.tap()
    user.typeText("kb-demo2345")
    let secret = app.secureTextFields["account-password"]
    secret.tap()
    secret.typeText("wrong")
    app.buttons["account-sign-in"].tap()
    let error = AppDriver.require(
      app.descendants(matching: .any).matching(identifier: "connect-error").firstMatch,
      "the refusal")
    XCTAssertTrue(error.label.contains("wrong"), error.label)
  }
}
