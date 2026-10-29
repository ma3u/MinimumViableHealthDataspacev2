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

  func testThePrintedRangeIsShownAsPrinted() {
    // #186 criterion 4. The qualifier "(unter 75 J.)" is in no number the
    // parser can read; only the printed text keeps it, and the screen used to
    // rebuild the range from the numbers and drop it.
    let app = AppDriver.launch(.detail)
    let range = AppDriver.scrollTo(
      AppDriver.text(containing: "< 125 (unter 75 J.)", in: app), in: app)
    XCTAssertTrue(range.exists, "the range reads exactly as the laboratory printed it")
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
    AppDriver.scrollTo(AppDriver.text(containing: "Zonulin", in: app), in: app)
    XCTAssertTrue(
      AppDriver.text(containing: "unmatched", in: app).exists,
      "and the section says how many were not matched")
  }

  func testA24HourBloodPressureReportShowsItsMeansAndItsFall() {
    // The summary of a day of cuff readings: the means by period and the
    // night-time fall, which must keep its minus sign.
    let app = launch()
    AppDriver.scrollTo(
      app.staticTexts["24-h-Blutdruckmessung, Praxis Dr. Muster"], in: app
    ).tap()
    // The summary, the single readings and the averages by activity level.
    AppDriver.require(
      app.buttons.containing(NSPredicate(format: "label CONTAINS 'Original scan, 3 page'"))
        .firstMatch, "three pages of scan")
    AppDriver.require(
      AppDriver.text(containing: "Systolischer Blutdruck Tagesmittel", in: app),
      "the day mean of the systolic pressure")
    AppDriver.scrollTo(
      AppDriver.text(containing: "Nächtliche Absenkung diastolisch", in: app), in: app)
    XCTAssertTrue(
      AppDriver.text(containing: "-23", in: app).exists
        || AppDriver.text(containing: "−23", in: app).exists,
      "the diastolic fall is shown as a fall")
  }

  func testFindDuplicateReportsOffersTheRedundantOneAndDeletesIt() {
    let app = launch()
    AppDriver.require(app.staticTexts["Lipidprofil, Seite 1"], "the rescanned first page")
    // The list offers the review itself once two reports look the same.
    AppDriver.require(app.buttons["home-duplicates"], "the duplicates row").tap()
    let alert = app.alerts["Duplicate report"]
    AppDriver.require(alert, "the duplicate is reported")
    XCTAssertTrue(
      alert.staticTexts.containing(NSPredicate(format: "label CONTAINS 'Lipidprofil, Labor Musterstadt'"))
        .firstMatch.exists, "and the report that holds every value is named")
    alert.buttons.containing(NSPredicate(format: "label BEGINSWITH 'Delete'")).firstMatch.tap()
    XCTAssertTrue(
      app.staticTexts["Lipidprofil, Seite 1"].waitForNonExistence(timeout: 5),
      "the redundant page is gone")
    AppDriver.require(app.staticTexts["Lipidprofil, Labor Musterstadt"], "the whole report stays")
  }

  private func openLipidProfile(_ app: XCUIApplication) {
    AppDriver.require(app.staticTexts["Lipidprofil, Labor Musterstadt"], "the lipid profile").tap()
  }

  func testAValueIsCorrectedAndMarkedAsChecked() {
    let app = launch()
    openLipidProfile(app)
    AppDriver.require(app.buttons["coded-row-0"], "the first value").tap()
    let value = AppDriver.require(app.textFields["edit-value"], "the value field")
    value.tap()
    value.press(forDuration: 1.0)
    if app.menuItems["Select All"].waitForExistence(timeout: 2) { app.menuItems["Select All"].tap() }
    value.typeText("199")
    app.buttons["edit-save"].tap()
    AppDriver.require(app.images["Corrected by you"], "the correction is marked")
  }

  func testAllValuesAreMarkedAsCheckedAtOnce() {
    let app = launch()
    openLipidProfile(app)
    AppDriver.require(app.buttons["verify-all"], "the verify-all button").tap()
    AppDriver.require(
      AppDriver.text(containing: "All values checked against the paper", in: app),
      "every value is checked")
  }

  func testMissingValuesAreDraftedAsAMaskedIssue() {
    let app = launch()
    AppDriver.scrollTo(
      app.staticTexts["Studienlabor, Studienzentrum Musterklinik"], in: app).tap()
    app.buttons["More"].firstMatch.tap()
    AppDriver.require(app.buttons["Report missing values"], "the menu entry").tap()
    let body = AppDriver.require(app.textViews["feedback-body"], "the drafted issue")
    let text = body.value as? String ?? ""
    XCTAssertTrue(text.contains("`Zonulin` · `ng/ml`"), "the unmatched row is named, without its value")
    XCTAssertFalse(text.contains("48 ng"), "its value is not in the issue")
    XCTAssertFalse(text.contains("Musterklinik"), "the laboratory is left out")
    app.buttons["Cancel"].firstMatch.tap()
  }

  func testAReportIsDeletedAfterAConfirmation() {
    let app = launch()
    openLipidProfile(app)
    app.buttons["More"].firstMatch.tap()
    AppDriver.require(app.buttons["Delete report"], "the menu entry").tap()
    let alert = app.alerts["Delete this report?"]
    AppDriver.require(alert, "a confirmation first")
    alert.buttons["Delete"].tap()
    XCTAssertTrue(
      app.staticTexts["Lipidprofil, Labor Musterstadt"].waitForNonExistence(timeout: 5),
      "the report is gone")
  }

  func testAHolterReportShowsItsHeartRateSummary() {
    let app = launch()
    AppDriver.scrollTo(app.staticTexts["Langzeit-EKG, Praxis Dr. Muster"], in: app).tap()
    AppDriver.require(
      AppDriver.text(containing: "Herzfrequenz 24-h-Minimum", in: app), "the slowest heart rate")
    AppDriver.scrollTo(AppDriver.text(containing: "Herzschläge gesamt", in: app), in: app)
    XCTAssertFalse(
      AppDriver.visibleText(app).contains("{beats}"), "a count is shown without UCUM's braces")
  }

  func testAnECGShowsItsIntervalsAndAxes() {
    let app = launch()
    AppDriver.scrollTo(app.staticTexts["Ruhe-EKG, Praxis Dr. Muster"], in: app).tap()
    AppDriver.scrollTo(AppDriver.text(containing: "QTc nach Bazett", in: app), in: app)
    AppDriver.scrollTo(AppDriver.text(containing: "T-Achse", in: app), in: app)
    XCTAssertTrue(
      AppDriver.text(containing: "°", in: app).exists, "an axis is shown in degrees")
  }

  func testADXAScanShowsItsBoneDensityAndRegionalFat() {
    let app = launch()
    AppDriver.scrollTo(
      app.staticTexts["Körperzusammensetzung (DXA), Praxis Muster"], in: app
    ).tap()
    AppDriver.scrollTo(AppDriver.text(containing: "Android-Fettanteil", in: app), in: app)
    AppDriver.scrollTo(AppDriver.text(containing: "Knochendichte Ganzkörper", in: app), in: app)
    XCTAssertTrue(
      AppDriver.text(containing: "g/cm²", in: app).exists, "a density in g/cm², not g/cm2")
  }

  func testACardiopulmonaryExerciseTestShowsItsOxygenUptake() {
    let app = launch()
    AppDriver.scrollTo(app.staticTexts["Spiroergometrie, Praxis Muster"], in: app).tap()
    AppDriver.scrollTo(AppDriver.text(containing: "Maximale Sauerstoffaufnahme", in: app), in: app)
    AppDriver.scrollTo(AppDriver.text(containing: "Sauerstoffpuls", in: app), in: app)
    XCTAssertTrue(
      AppDriver.text(containing: "mL/beat", in: app).exists, "an oxygen pulse per beat")
    XCTAssertFalse(AppDriver.visibleText(app).contains("{ratio}"), "no UCUM braces on screen")
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
