import XCTest

/// Launching and getting about, so a test says what it checks and not how to
/// reach it.
///
/// Every launch carries `-MBDemoSeed`, so the data is two fixed reports that
/// exist only in memory. No real report is ever involved and the same run on
/// another machine sees the same numbers.
enum AppDriver {

  /// Screens `-MBShot` can open directly, which saves a test from tapping its
  /// way there and breaking when a menu moves.
  enum Screen: String {
    case detail, scan, consent, settings, privacy, trends, reference
  }

  static func launch(_ screen: Screen? = nil) -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments = ["-MBDemoSeed"]
    if let screen {
      app.launchArguments += ["-MBShot", screen.rawValue]
    }
    app.launch()
    return app
  }

  /// Waits for an element and fails the test where it was expected, not deep
  /// inside a helper.
  @discardableResult
  static func require(
    _ element: XCUIElement, _ what: String, timeout: TimeInterval = 8,
    file: StaticString = #filePath, line: UInt = #line
  ) -> XCUIElement {
    XCTAssertTrue(
      element.waitForExistence(timeout: timeout),
      "\(what) never appeared", file: file, line: line)
    return element
  }

  /// Every string on screen, for the checks that are about what a person can
  /// read rather than about one element.
  static func visibleText(_ app: XCUIApplication) -> String {
    app.descendants(matching: .any)
      .allElementsBoundByIndex
      .prefix(400)
      .map { "\($0.label) \($0.value as? String ?? "")" }
      .joined(separator: "\n")
  }
}

extension XCUIElement {

  /// Taps a point inside this element by proportion of its own frame.
  ///
  /// A chart has no tappable children, so a test has to aim. Proportions
  /// survive a layout change in a way screen coordinates do not.
  ///
  /// A brief press rather than `tap()`: Swift Charts' own selection ignores a
  /// touch that goes down and up in the same instant, which is what a
  /// synthesised tap is. A finger never does that.
  func tap(atX x: CGFloat, y: CGFloat, holding duration: TimeInterval = 0.12) {
    coordinate(withNormalizedOffset: CGVector(dx: x, dy: y))
      .press(forDuration: duration)
  }
}
