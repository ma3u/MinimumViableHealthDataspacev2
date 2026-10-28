import XCTest

/// The list's shortcuts and the grouped menus (2026-10-29). The ⋯ menu had
/// thirteen entries in one column; what is part of looking at your reports
/// moved into the list, data coming in moved to +, and the menu keeps
/// settings and the rights over your data.
final class HomeUITests: XCTestCase {
  override func setUp() {
    continueAfterFailure = false
  }

  func testTheListOpensTrendsAndShowsTheRecord() {
    let app = AppDriver.launch()
    AppDriver.require(app.buttons["home-ehds"], "the EHDS record row")
    AppDriver.require(app.buttons["home-trends"], "the Trends row").tap()
    AppDriver.require(app.navigationBars["Trends"], "the Trends screen")
  }

  func testTheMenuHoldsSettingsAndDataRightsOnly() {
    let app = AppDriver.launch()
    app.buttons["More"].firstMatch.tap()
    for kept in ["Profile", "Reference values", "Consents", "Analysis provider",
                 "Privacy and safety", "Export all my data", "Delete all my data"] {
      AppDriver.require(app.buttons[kept], "\(kept) in the menu")
    }
    for moved in ["Trends", "Connect to EHDS", "Find duplicate reports", "Earlier measurements"] {
      XCTAssertFalse(app.buttons[moved].exists, "\(moved) is no longer a menu entry")
    }
  }

  func testEarlierMeasurementsAreAddedFromThePlusMenu() {
    let app = AppDriver.launch()
    app.buttons["Add report"].firstMatch.tap()
    AppDriver.require(app.buttons["Earlier measurements"], "the + menu entry").tap()
    AppDriver.require(app.staticTexts["Earlier measurements"], "the sheet")
  }
}
