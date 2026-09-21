import XCTest

/// Getting your data out, and getting it off the phone for good.
///
/// Both live behind the same menu, and both are promises rather than
/// features: a person who cannot find them has no copy and no way to stop
/// holding one.
final class DataRightsUITests: XCTestCase {

  override func setUp() {
    continueAfterFailure = false
  }

  private func openMenu(_ app: XCUIApplication) {
    AppDriver.require(app.buttons["More"], "the menu button").tap()
  }

  func testTheMenuOffersBothTheCopyAndTheDeletion() {
    // Article 15 and Article 17, one tap from the list. "Export diagnostics"
    // was the only way out of the app for a while, and a person looking for
    // their own data does not read "diagnostics" as meaning them.
    let app = AppDriver.launch()
    openMenu(app)
    AppDriver.require(app.buttons["Export all my data"], "the data export")
    AppDriver.require(app.buttons["Delete all my data"], "the deletion")
  }

  func testDeletingEverythingIsAskedAboutFirstAndCanBeCalledOff() {
    let app = AppDriver.launch()
    openMenu(app)
    app.buttons["Delete all my data"].tap()

    // The question has to say that there is no copy anywhere else, because
    // the usual assumption about a phone app is that a server has one.
    let asked = AppDriver.require(app.alerts.firstMatch, "the question")
    XCTAssertTrue(
      asked.staticTexts.containing(
        NSPredicate(format: "label CONTAINS 'cannot be undone'")).firstMatch.exists,
      "the question says it is final")

    AppDriver.require(app.buttons["Cancel"], "a way out").tap()
    AppDriver.require(
      app.staticTexts["Lipid panel, Praxis Dr. Muster"], "the reports are still there")
  }

  func testExportingEverythingHandsOverAnArchive() {
    let app = AppDriver.launch()
    openMenu(app)
    app.buttons["Export all my data"].tap()

    // The share sheet, however the system chooses to draw it that year: what
    // matters is that a file was produced and handed over rather than an
    // error alert.
    let sheet = app.otherElements["ActivityListView"]
    let named = AppDriver.text(containing: "klarbefund-meine-daten", in: app)
    XCTAssertTrue(
      sheet.waitForExistence(timeout: 30) || named.waitForExistence(timeout: 5),
      "the archive reached the share sheet")
    XCTAssertFalse(app.staticTexts["Error"].exists, "no error was raised")
  }
}
