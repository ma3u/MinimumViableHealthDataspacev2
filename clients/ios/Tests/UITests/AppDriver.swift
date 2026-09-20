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

  /// Scrolls until an element exists, because a `List` does not build a row
  /// nobody has looked at and a test that assumes otherwise fails on the
  /// eleventh analyte and not on the second.
  @discardableResult
  static func scrollTo(
    _ element: XCUIElement, in app: XCUIApplication, tries: Int = 12,
    file: StaticString = #filePath, line: UInt = #line
  ) -> XCUIElement {
    for _ in 0..<tries {
      if element.exists { return element }
      app.swipeUp()
    }
    XCTAssertTrue(element.exists, "never scrolled into view", file: file, line: line)
    return element
  }

  /// Any text containing this, because a row often prints a label, a value
  /// and a unit as one string and an exact match then finds nothing.
  static func text(containing needle: String, in app: XCUIApplication) -> XCUIElement {
    app.staticTexts.containing(NSPredicate(format: "label CONTAINS[c] %@", needle))
      .firstMatch
  }

  /// Every string on screen, for the checks that are about what a person can
  /// read rather than about one element.
  /// One snapshot, not four hundred lookups.
  ///
  /// Walking the elements one at a time asks the app for each in turn, and a
  /// list that recycles a row between two of those asks fails the test with
  /// "No matches found for Element at index 150" about nothing at all.
  static func visibleText(_ app: XCUIApplication) -> String {
    app.debugDescription
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
