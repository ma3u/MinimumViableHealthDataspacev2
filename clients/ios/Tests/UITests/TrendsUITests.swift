import XCTest

/// The trend chart, which is the screen that has broken most often.
///
/// Four defects in one afternoon lived here and not one was reachable from a
/// unit test: a card clipped at the chart's edge, a selection that forgot
/// itself on the next render, a tap gesture that never fired inside a `List`
/// row, and points that only a sighted, precise tap could reach. Each was
/// obvious the moment the app was actually driven.
final class TrendsUITests: XCTestCase {

  override func setUp() {
    continueAfterFailure = false
  }

  private func openTrends() -> XCUIApplication {
    let app = AppDriver.launch(.trends)
    AppDriver.require(app.navigationBars["Trends"], "the Trends screen")
    return app
  }

  /// The measurements of one analyte, oldest first.
  ///
  /// Scrolled to first: the default order puts whatever sits furthest from
  /// its published range at the top, so ferritin is no longer the first
  /// chart, and a `List` does not build a row nobody has looked at.
  private func points(_ app: XCUIApplication, _ analyte: String = "ferritin") -> XCUIElementQuery {
    AppDriver.scrollTo(
      app.buttons.matching(identifier: "trend-point-\(analyte)").firstMatch, in: app)
    return app.buttons.matching(identifier: "trend-point-\(analyte)")
  }

  private var callout: (XCUIApplication) -> XCUIElement {
    { $0.descendants(matching: .any)["trend-callout"] }
  }

  func testEveryMeasurementIsItsOwnTarget() {
    // Not only the chart's own selection gesture, which VoiceOver cannot
    // reach and which a drawn dot eight points across makes a test of aim.
    let app = openTrends()
    let dots = points(app)
    XCTAssertEqual(dots.count, 2, "the demo ferritin series has two measurements")

    let newest = dots.element(boundBy: 1)
    XCTAssertTrue(
      newest.label.contains("210"), "a point says what it is: \(newest.label)")
    XCTAssertTrue(
      newest.label.contains("2026"), "and when it was measured: \(newest.label)")
    XCTAssertGreaterThanOrEqual(
      newest.frame.width, 40, "the target is a finger wide, not a dot wide")
  }

  func testTappingAPointShowsItsMeasurement() {
    let app = openTrends()
    XCTAssertFalse(callout(app).exists, "nothing is selected before a tap")

    points(app).element(boundBy: 1).tap()

    let card = AppDriver.require(callout(app), "the card naming the measurement")
    XCTAssertTrue(
      card.label.contains("210") || AppDriver.visibleText(app).contains("210 ug/L"),
      "the card names the value it belongs to")
  }

  func testTheCardStaysInsideTheChart() {
    // It used to be placed before it had been measured, so the first render
    // put a card of zero width at the point, half of it over the chart's
    // right edge, where the row clips and the text is lost.
    let app = openTrends()
    // The last measurement sits hard against the right edge, which is where
    // a card that is not held in would hang over.
    points(app).element(boundBy: 1).tap()
    let chart = AppDriver.require(
      app.otherElements["trend-chart-ferritin"], "the ferritin chart")

    let card = AppDriver.require(callout(app), "the card").frame
    XCTAssertGreaterThanOrEqual(card.minX, chart.frame.minX - 1, "starts inside")
    XCTAssertLessThanOrEqual(card.maxX, chart.frame.maxX + 1, "ends inside")
    XCTAssertGreaterThan(card.width, 100, "and has a width to be clipped from")
  }

  func testTheSelectionSurvivesTheNextRender() {
    // `TrendPoint.id` was a fresh UUID minted on every recomputation, so the
    // selected point's identity changed on the next pass and the card
    // vanished. On screen that is indistinguishable from a tap that never
    // registered.
    let app = openTrends()
    points(app).element(boundBy: 1).tap()
    AppDriver.require(callout(app), "the card")

    app.swipeUp()
    app.swipeDown()
    XCTAssertTrue(
      callout(app).exists, "the card is still there after the view was rebuilt")
  }

  func testTappingTheSamePointAgainPutsTheCardAway() {
    let app = openTrends()
    points(app).element(boundBy: 1).tap()
    AppDriver.require(callout(app), "the card")

    points(app).element(boundBy: 1).tap()
    XCTAssertFalse(callout(app).waitForExistence(timeout: 2), "the card is gone")
  }

  func testTappingTheCardOpensThatReport() {
    let app = openTrends()
    points(app).element(boundBy: 1).tap()
    AppDriver.require(callout(app), "the card").tap()

    XCTAssertTrue(
      app.staticTexts["Report number"].waitForExistence(timeout: 8)
        || app.staticTexts["2609000001"].waitForExistence(timeout: 2),
      "the report the measurement came from is open")
  }

  func testNoChartClaimsARangeItCannotCite() {
    // Every band drawn is either a published range with its source beside it
    // or the laboratory's own, said out loud. Nothing is ever just coloured.
    let app = openTrends()
    let text = AppDriver.visibleText(app)
    XCTAssertTrue(
      text.contains("Optimal") || text.contains("No guideline range")
        || text.contains("No published range"),
      "a chart says which range it is showing")
    XCTAssertFalse(text.contains("abnormal"), "no chart calls a value abnormal")
  }

  // MARK: - #186 criteria 2 and 3

  func testAChartNamesEachKindOfEvidenceItShows() {
    // The demo's values were read from a photo, so every chart that is not
    // all laboratory files carries the legend, and its words, not a tap,
    // say whose each point is.
    let app = openTrends()
    let legend = AppDriver.scrollTo(
      app.descendants(matching: .any).matching(identifier: "provenance-legend").firstMatch,
      in: app)
    XCTAssertTrue(
      legend.label.contains("Read from a photo"), "the legend names the kind: \(legend.label)")
  }

  func testWearableTrendsSitBesideTheLabValuesAndNotAmongThem() {
    let app = openTrends()
    let load = AppDriver.scrollTo(app.buttons["wearables-load"], in: app, tries: 30)
    load.tap()
    let pulse = AppDriver.scrollTo(
      app.descendants(matching: .any).matching(identifier: "wearable-resting-heart-rate")
        .firstMatch, in: app)
    XCTAssertTrue(pulse.exists, "the device's resting pulse is drawn")
    // Its own section, with the words that keep it from reading as a lab value.
    // The footer sits under the last device chart, so it is scrolled to: a
    // `List` does not build a row nobody has looked at.
    XCTAssertTrue(
      AppDriver.scrollTo(AppDriver.text(containing: "not by a laboratory", in: app), in: app)
        .exists,
      "the section says the device is not a laboratory")
    // And never as a lab series: no trend point carries its identifier.
    XCTAssertEqual(
      app.buttons.matching(identifier: "trend-point-resting-heart-rate").count, 0,
      "a wearable metric is never a tappable lab measurement")
  }
}
