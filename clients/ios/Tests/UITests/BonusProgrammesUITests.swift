import XCTest

/// Bonus programs (#934, step 4; ADR-080), with the hub played by the demo
/// under `-MBDemoSeed`: AlphaKasse DE's fictional active year bonus for 2025,
/// joined, its result shown (step 6, ADR-087), answered and withdrawn, all
/// in memory. No real record and no network are involved.
final class BonusProgrammesUITests: XCTestCase {

  override func setUp() {
    continueAfterFailure = false
  }

  func testJoinSendAndWithdraw() {
    let app = AppDriver.launch(.programmes)
    AppDriver.require(app.navigationBars["Bonus programs"], "the Bonus programs screen")
    AppDriver.require(
      app.staticTexts["programmes-not-research"], "the line that keeps it apart from research")
    let publisher = AppDriver.require(app.descendants(matching: .any)
      .matching(identifier: "programme-publisher").firstMatch, "who offers the program")
    XCTAssertTrue(publisher.label.contains("AlphaKasse DE"), publisher.label)
    XCTAssertTrue(
      AppDriver.text(containing: "Active year bonus 2025", in: app).exists, "the program's title")

    AppDriver.scrollTo(app.buttons["programme-join"], in: app).tap()
    let joined = AppDriver.require(
      app.descendants(matching: .any).matching(identifier: "programme-joined").firstMatch,
      "the consent, open")
    XCTAssertTrue(joined.label.contains("You joined on"), joined.label)

    // The result, worked out by the hub, before anything can be sent.
    let goal = app.staticTexts["programme-goal"]
    _ = goal.waitForExistence(timeout: 4)
    AppDriver.scrollTo(goal, in: app)
    XCTAssertEqual(goal.label, "Goal met: yes")
    let result = app.descendants(matching: .any).matching(identifier: "programme-result").firstMatch
    XCTAssertTrue(result.label.contains("181 minutes a week"), result.label)
    XCTAssertTrue(result.label.contains("This breakdown stays in your record"), result.label)

    let send = AppDriver.scrollTo(app.buttons["programme-send"], in: app)
    XCTAssertTrue(send.label.contains("2025"), "the year the rule names: \(send.label)")
    XCTAssertTrue(send.isEnabled, "send is offered once the year is worked out")
    send.tap()
    // The line sits under the buttons, and a List builds no row nobody has
    // scrolled to: wait for the answer, then scroll to where it is.
    let sent = app.staticTexts["programme-message"]
    _ = sent.waitForExistence(timeout: 4)
    AppDriver.scrollTo(sent, in: app)
    XCTAssertTrue(sent.label.contains("Recorded for 2025: goal met, yes"), sent.label)
    XCTAssertTrue(sent.label.contains("AlphaKasse DE"), sent.label)

    AppDriver.scrollTo(app.buttons["programme-withdraw"], in: app).tap()
    let withdrawn = AppDriver.require(
      app.staticTexts["programme-withdrawn"], "the withdrawal, with its day")
    XCTAssertTrue(withdrawn.label.contains("Nothing is sent any more"), withdrawn.label)
    XCTAssertFalse(app.buttons["programme-send"].exists, "no send without an open consent")
    AppDriver.require(app.buttons["programme-join"], "joining again is offered")
  }

  func testReachedFromConnectToEHDS() {
    let app = AppDriver.launch(.connect)
    AppDriver.require(app.navigationBars["Connect to EHDS"], "the Connect sheet")
    let expires = Int(Date().addingTimeInterval(120).timeIntervalSince1970)
    let link =
      "klarbefund://connect?ehds=https%3A%2F%2Fehds.mabu.red&issuer=https%3A%2F%2Fauth.ehds.mabu.red%2Frealms%2Fedcv&client=klarbefund-app&pairing=demo&device_code=demo&user_code=DEMO-CODE&interval=1&expires=\(expires)"
    let field = AppDriver.scrollTo(app.textFields["connect-paste"], in: app)
    field.tap()
    field.typeText(link)
    AppDriver.scrollTo(app.buttons["connect-go"], in: app).tap()
    AppDriver.require(app.buttons["connect-confirm"], "the account question").tap()

    AppDriver.require(app.buttons["connect-show-programmes"], "the Bonus programs entry").tap()
    AppDriver.require(app.navigationBars["Bonus programs"], "the Bonus programs screen")
    AppDriver.scrollTo(app.buttons["programme-join"], in: app)
  }
}
