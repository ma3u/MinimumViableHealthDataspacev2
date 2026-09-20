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

/// The developer corpus: three years, seven reports, four sources.
///
/// It exists so a question about a trend, an unmatched value or a body
/// measurement can be answered by looking rather than by first building the
/// data to look at.
final class DevDatasetUITests: XCTestCase {

  override func setUp() {
    continueAfterFailure = false
  }

  private func launch(_ screen: AppDriver.Screen? = nil) -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments = ["-MBDevData"]
    if let screen { app.launchArguments += ["-MBShot", screen.rawValue] }
    app.launch()
    return app
  }

  func testTheCorpusIsThere() {
    let app = launch()
    AppDriver.require(
      app.staticTexts["Lipidprofil, Labor Musterstadt"], "the newest report")
    XCTAssertGreaterThanOrEqual(
      app.cells.count, 5, "several years of reports, not two")
  }

  func testEveryLaboratoryIsInvented() {
    // A real report lives outside the repository, always.
    let app = launch()
    let text = AppDriver.visibleText(app)
    for real in ["Charité", "Limbach", "Synlab", "Amedes", "Sonic"] {
      XCTAssertFalse(text.contains(real), "\(real) has no business in test data")
    }
    XCTAssertTrue(text.contains("Muster"), "the fictional ones are there")
  }

  func testATrendHasEnoughPointsToBeATrend() {
    let app = launch(.trends)
    AppDriver.require(app.navigationBars["Trends"], "the Trends screen")
    AppDriver.scrollTo(
      app.buttons.matching(identifier: "trend-point-cholesterol-ldl").firstMatch, in: app)
    let points = app.buttons.matching(identifier: "trend-point-cholesterol-ldl")
    XCTAssertGreaterThanOrEqual(
      points.count, 5, "LDL was measured on five dates, and all five are plotted")
  }

  func testTheUnmatchedListHasSomethingInIt() {
    // A dataset with nothing unmatched hides the screen that exists to show
    // what the app could not read.
    let app = launch()
    AppDriver.scrollTo(
      app.staticTexts["Studienlabor, Studienzentrum Musterklinik"], in: app).tap()
    AppDriver.scrollTo(AppDriver.text(containing: "Omega-3-Index", in: app), in: app)
    XCTAssertTrue(
      AppDriver.text(containing: "unmatched", in: app).exists,
      "and the section says how many were not matched")
  }

  func testAScaleReadingIsCarriedWithoutALoincCode() {
    let app = launch()
    AppDriver.scrollTo(
      app.staticTexts["Körperzusammensetzung"].firstMatch, in: app).tap()
    AppDriver.scrollTo(AppDriver.text(containing: "Viszeralfett", in: app), in: app)
    XCTAssertFalse(
      AppDriver.visibleText(app).contains("Optional("),
      "and it is not printed as an optional")
  }

  func testEveryReportKeepsItsPages() {
    let app = launch()
    AppDriver.require(app.staticTexts["Lipidprofil, Labor Musterstadt"], "a report").tap()
    AppDriver.scrollTo(
      app.buttons.containing(NSPredicate(format: "label CONTAINS 'Original scan'")).firstMatch,
      in: app)
  }
}
