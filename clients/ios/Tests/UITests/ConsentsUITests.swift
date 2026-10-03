import XCTest

/// #186 criterion 6: the study's consent, the ePA objection and a registry
/// consent are three separately revocable things, never one switch.
///
/// The unit suite proves the ledger cannot change two at once. This proves
/// the screen does not either: three buttons, three states, and withdrawing
/// one leaves the others as they were.
final class ConsentsUITests: XCTestCase {

  override func setUp() {
    continueAfterFailure = false
  }

  /// Finds a row above or below the fold. `AppDriver.scrollTo` only swipes
  /// up, and the study section is the first one, so once a test has gone
  /// down to the registry it has to come back.
  ///
  /// "Hittable" is not enough: a row scrolled under the navigation bar is
  /// hittable, and the tap lands on the bar. So the row has to sit wholly
  /// between the bar and the bottom of the screen.
  @discardableResult
  private func find(_ element: XCUIElement, in app: XCUIApplication) -> XCUIElement {
    func visible() -> Bool {
      guard element.exists, element.isHittable else { return false }
      let top = app.navigationBars["Consents"].frame.maxY
      let bottom = app.windows.firstMatch.frame.maxY - 40
      return element.frame.minY >= top && element.frame.maxY <= bottom
    }
    if !visible(), element.exists, element.frame.minY < app.navigationBars["Consents"].frame.maxY {
      for _ in 0..<6 where !visible() {
        app.collectionViews.firstMatch.swipeDown(velocity: .slow)
      }
    }
    for _ in 0..<12 where !visible() { app.collectionViews.firstMatch.swipeUp(velocity: .slow) }
    for _ in 0..<6 where !visible() { app.collectionViews.firstMatch.swipeDown(velocity: .slow) }
    XCTAssertTrue(visible(), "never scrolled into view")
    return element
  }

  private func status(_ app: XCUIApplication, _ kind: String) -> String {
    find(
      app.descendants(matching: .any).matching(identifier: "consent-status-\(kind)").firstMatch,
      in: app
    ).label
  }

  /// The status once it says `needle`, or what it says after five seconds:
  /// the record is written in a task, so the row redraws a moment after the
  /// tap and not during it.
  private func status(
    _ app: XCUIApplication, _ kind: String, becomes needle: String
  ) -> String {
    let element = app.descendants(matching: .any)
      .matching(identifier: "consent-status-\(kind)").firstMatch
    find(element, in: app)
    let settled = NSPredicate(format: "label CONTAINS[c] %@", needle)
    _ = XCTWaiter.wait(
      for: [XCTNSPredicateExpectation(predicate: settled, object: element)], timeout: 5)
    return element.label
  }

  private func toggle(_ app: XCUIApplication, _ kind: String) {
    let button = find(app.buttons["consent-toggle-\(kind)"], in: app)
    // A tap while the list is still coasting after a swipe stops the scroll
    // and goes nowhere; let it settle first.
    Thread.sleep(forTimeInterval: 1)
    button.tap()
  }

  func testThreeDecisionsStartUnrecordedAndChangeOneAtATime() {
    let app = AppDriver.launch(.consents)
    AppDriver.require(app.navigationBars["Consents"], "the Consents screen")
    // The sheet is still sliding in when its bar appears; wait for its content.
    AppDriver.require(app.buttons["consent-toggle-study"], "the study button")

    for kind in ["study", "epa-objection", "registry"] {
      XCTAssertTrue(
        status(app, kind).contains("Nothing recorded"), "\(kind) starts unrecorded")
    }

    toggle(app, "study")
    toggle(app, "registry")
    let registry = status(app, "registry", becomes: "Consent given")
    XCTAssertTrue(registry.contains("Consent given"), registry)

    // Withdrawing the study consent leaves the registry consent standing and
    // the ePA untouched.
    toggle(app, "study")
    let study = status(app, "study", becomes: "withdrawn")
    XCTAssertTrue(study.contains("withdrawn"), study)
    XCTAssertTrue(
      status(app, "registry").contains("Consent given"),
      "withdrawing from the study did not withdraw the registry: \(status(app, "registry"))")
    XCTAssertTrue(
      status(app, "epa-objection").contains("Nothing recorded"),
      "and did not touch the ePA: \(status(app, "epa-objection"))")
  }

  func testTheEpaIsAnObjectionNotAConsent() {
    let app = AppDriver.launch(.consents)
    AppDriver.require(app.navigationBars["Consents"], "the Consents screen")
    let button = find(app.buttons["consent-toggle-epa-objection"], in: app)
    XCTAssertTrue(button.label.contains("objection"), "the ePA button records an objection")
    button.tap()
    let objection = status(app, "epa-objection", becomes: "Objected")
    XCTAssertTrue(objection.contains("Objected"), objection)
  }
}
