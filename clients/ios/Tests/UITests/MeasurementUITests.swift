import XCTest

/// Entering measurements, and finding a figure among the published ranges.
///
/// Both are reading-and-typing screens rather than computed ones, so what a
/// test can check is what a person can see and reach.
final class MeasurementUITests: XCTestCase {

  override func setUp() {
    continueAfterFailure = false
  }

  func testTheReferenceListCanBeNarrowedToOneCategory() {
    // Ten categories and 175 entries: looking up one figure from a blood
    // count should not mean scrolling past the lipids and the amino acids.
    let app = AppDriver.launch(.reference)
    let picker = AppDriver.require(app.buttons["reference-category"], "the category picker")
    XCTAssertTrue(
      AppDriver.visibleText(app).contains("Cardiovascular"),
      "everything is shown before a category is picked")

    picker.tap()
    AppDriver.require(
      app.buttons.containing(NSPredicate(format: "label BEGINSWITH 'Amino acids'")).firstMatch,
      "a category to pick"
    ).tap()

    let narrowed = AppDriver.visibleText(app)
    XCTAssertTrue(narrowed.contains("Amino acids"), "the chosen category is shown")
    XCTAssertFalse(narrowed.contains("LDL cholesterol"), "and the others are not")
  }

  func testAPastMeasurementCanBeEnteredWithItsOwnDate() {
    // The profile holds the latest of each measurement. A year of weights
    // read off a notebook needs somewhere else to go.
    let app = AppDriver.launch(.history)
    AppDriver.require(app.staticTexts["Earlier measurements"], "the sheet")

    let weight = AppDriver.require(app.textFields["history-weight-0"], "a weight field")
    weight.tap()
    weight.typeText("77")

    let waist = AppDriver.require(app.textFields["history-waist-0"], "a waist field")
    waist.tap()
    waist.typeText("94")

    AppDriver.require(app.buttons["history-add"], "a way to add a date").tap()
    AppDriver.require(app.textFields["history-weight-1"], "a second line")

    AppDriver.require(app.buttons["history-save"], "the save button").tap()
    AppDriver.require(
      app.staticTexts.containing(NSPredicate(format: "label CONTAINS 'Body measurements'"))
        .firstMatch,
      "the measurement is filed as a report")
  }

  func testNothingIsSavedFromAnEmptySheet() {
    // A line with no number on it is not a day.
    let app = AppDriver.launch(.history)
    let save = AppDriver.require(app.buttons["history-save"], "the save button")
    XCTAssertFalse(save.isEnabled, "saving nothing is not offered")
  }
}
