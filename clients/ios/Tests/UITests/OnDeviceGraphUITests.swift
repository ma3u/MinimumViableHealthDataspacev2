import XCTest

/// Health graph on this iPhone: Relate runs in the app, builds the graph from
/// the reports on the phone and answers Cypher queries there. Demo data only
/// (`-MBDemoSeed`), in the demo's own folder.
final class OnDeviceGraphUITests: XCTestCase {

  override func setUp() {
    continueAfterFailure = false
  }

  func testSwitchingOnBuildsTheGraphAndOffDeletesIt() {
    let app = AppDriver.launch(.graph)
    let enabled = AppDriver.require(app.switches["graph-enabled"], "the graph switch")
    if enabled.value as? String == "1" {  // left on by an earlier run: start clean
      enabled.switches.firstMatch.tap()
      XCTAssertFalse(app.staticTexts["graph-values"].waitForExistence(timeout: 2))
    }
    enabled.switches.firstMatch.tap()

    // Built on the phone: the demo's two reports, and their values.
    let reports = AppDriver.require(
      app.descendants(matching: .any).matching(identifier: "graph-reports").firstMatch,
      "the report count", timeout: 20)
    XCTAssertTrue(reports.label.contains("2"), reports.label)
    let values = app.descendants(matching: .any).matching(identifier: "graph-values").firstMatch
    XCTAssertTrue(values.exists)
    XCTAssertFalse(values.label.hasSuffix(" 0"), values.label)

    // A trend is a Cypher query answered on the phone.
    let analyte = AppDriver.scrollTo(
      app.descendants(matching: .any).matching(identifier: "graph-analyte").firstMatch, in: app)
    analyte.tap()
    AppDriver.require(
      app.descendants(matching: .any).matching(identifier: "graph-trend-row").firstMatch,
      "a trend row", timeout: 5)
    app.navigationBars.buttons.firstMatch.tap()

    for _ in 0..<6 where !enabled.isHittable { app.swipeDown() }
    enabled.switches.firstMatch.tap()
    XCTAssertFalse(
      app.descendants(matching: .any).matching(identifier: "graph-reports").firstMatch
        .waitForExistence(timeout: 2), "switching off removes the graph")
  }

  /// The development dataset has one lipid panel in two reports of the same
  /// day (fictional): each of those values is counted once, and the copies
  /// are shown as such instead of as more lab values.
  func testAValueInTwoReportsIsCountedOnce() {
    let app = XCUIApplication()
    app.launchArguments = ["-MBDevData", "-MBShot", "graph"]
    app.launch()
    let enabled = AppDriver.require(app.switches["graph-enabled"], "the graph switch")
    if enabled.value as? String != "1" { enabled.switches.firstMatch.tap() }

    let copies = AppDriver.require(
      app.descendants(matching: .any).matching(identifier: "graph-copies").firstMatch,
      "the row for values also in another report", timeout: 30)
    XCTAssertFalse(copies.label.hasSuffix(" 0"), copies.label)

    enabled.switches.firstMatch.tap()  // leave the demo graph off for the next run
  }
}
