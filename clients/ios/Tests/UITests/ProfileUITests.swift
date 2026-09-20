import XCTest

/// The profile, where a value could be typed and then silently thrown away.
final class ProfileUITests: XCTestCase {

  override func setUp() {
    continueAfterFailure = false
  }

  private func openProfile() -> XCUIApplication {
    let app = AppDriver.launch()
    app.buttons["More"].firstMatch.tap()
    AppDriver.require(app.buttons["Profile"], "the profile menu item").tap()
    AppDriver.require(app.navigationBars["Profile"], "the profile screen")
    return app
  }

  func testTheWaistCanBeTypedAndIsKept() {
    // It could be typed, and then the obvious Save button at the top of the
    // sheet threw it away, because a second button further down was the one
    // that saved measurements.
    let app = openProfile()
    let waist = AppDriver.require(
      app.textFields["profile-waist-circumference"], "the waist field")
    waist.tap()
    waist.typeText("86")
    XCTAssertEqual(
      waist.value as? String, "86", "the field took what was typed into it")

    AppDriver.require(app.buttons["Save"], "the save button").tap()

    // Reopening shows what was saved, rather than an empty form.
    app.buttons["More"].firstMatch.tap()
    app.buttons["Profile"].tap()
    let again = AppDriver.require(
      app.textFields["profile-waist-circumference"], "the waist field again")
    XCTAssertEqual(again.value as? String, "86", "the waist survived the save")
  }

  func testEachMeasurementCarriesItsOwnDate() {
    // One date for the whole screen put two of three measurements on a day
    // they were not taken.
    let app = openProfile()
    // A compact DatePicker surfaces as a button, not as a date picker, so
    // count anything that carries the label rather than one element type.
    let dated = app.descendants(matching: .any)
      .matching(NSPredicate(format: "label CONTAINS[c] 'Measured'"))
    XCTAssertGreaterThanOrEqual(
      dated.count, 3, "waist, weight and visceral fat each have a date")
  }

  func testVisceralFatOffersBothUnits() {
    // An area in cm² and a mass in kg are different quantities, and only the
    // person knows which their device shows.
    let app = openProfile()
    AppDriver.require(
      app.textFields["profile-visceral-fat"], "the visceral fat field")
    XCTAssertTrue(
      AppDriver.visibleText(app).contains("cm²"),
      "the unit is shown and can be chosen")
  }

  func testTheProfileSaysWhyItAsks() {
    let app = openProfile()
    XCTAssertTrue(
      AppDriver.visibleText(app).contains("never sent anywhere"),
      "the screen states that nothing about the person leaves the device")
  }
}
