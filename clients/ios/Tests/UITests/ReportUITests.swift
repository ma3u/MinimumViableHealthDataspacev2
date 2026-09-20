import XCTest

/// The list and one report, which is the screen a person checks against their
/// own paper. What it shows has to be exactly right.
final class ReportUITests: XCTestCase {

  override func setUp() {
    continueAfterFailure = false
  }

  func testTheListShowsTheStoredReports() {
    let app = AppDriver.launch()
    AppDriver.require(
      app.staticTexts["Lipid panel, Praxis Dr. Muster"], "the first report")
    AppDriver.require(
      app.staticTexts["Check-up, Praxis Dr. Muster"], "the second report")
  }

  func testAReportNamesItsCodesWithoutLeakingAnOptional() {
    // `LOINC Optional("2093-3")` appeared here, on the one screen a person is
    // asked to compare with the paper in front of them.
    let app = AppDriver.launch(.detail)
    AppDriver.require(app.staticTexts["Cholesterin gesamt"], "a coded value")

    let text = AppDriver.visibleText(app)
    XCTAssertTrue(text.contains("LOINC"), "a coded value names its LOINC code")
    XCTAssertFalse(text.contains("Optional("), "no optional is printed raw")
    XCTAssertFalse(text.contains("nil"), "no nil is printed raw")
  }

  func testEveryValueSaysWhereOnThePaperItCameFrom() {
    // The promise of this screen: nothing is unverifiable.
    let app = AppDriver.launch(.detail)
    AppDriver.require(app.staticTexts["Cholesterin gesamt"], "a coded value")
    XCTAssertTrue(
      AppDriver.visibleText(app).contains("line"),
      "a value names the page and line it was read from")
  }

  func testTheOriginalScanCanBeOpened() {
    // Demo reports used to carry no pages at all, so this button was simply
    // absent and the app looked like one that forgets what it read from.
    let app = AppDriver.launch(.detail)
    let scan = AppDriver.require(
      app.buttons.containing(NSPredicate(format: "label CONTAINS 'Original scan'"))
        .firstMatch,
      "the original scan button")
    scan.tap()
    XCTAssertTrue(
      app.buttons["Done"].waitForExistence(timeout: 8)
        || app.navigationBars.firstMatch.waitForExistence(timeout: 2),
      "the scan viewer opened")
  }

  func testAPreliminaryValueIsMarkedAsSuch() {
    // A transcription is never presented as the laboratory's own figure.
    let app = AppDriver.launch()
    XCTAssertTrue(
      AppDriver.visibleText(app).lowercased().contains("preliminary"),
      "a scanned report says its values are preliminary")
  }
}
