import XCTest

/// Three things a reviewer met in build 15 (Nov 13, 2026) and each a tester
/// would read as a defect: a provider the build cannot reach, a hub that is
/// stopped at night with nothing on the screen saying so, and LOINC and UCUM
/// content shipped without the notices their licenses ask for.
final class TestFlightReviewUITests: XCTestCase {

  override func setUp() {
    continueAfterFailure = false
  }

  /// UI test builds, like TestFlight ones, carry no OIDC issuer and no service
  /// address, so the Klarbefund service must not be offered.
  func testTheProviderListOffersOnlyWhatThisBuildCanReach() {
    let app = AppDriver.launch(.settings)
    // An inline picker's rows are buttons, not texts.
    func row(_ label: String) -> XCUIElement {
      app.descendants(matching: .any)
        .matching(NSPredicate(format: "label CONTAINS[c] %@", label)).firstMatch
    }
    AppDriver.require(app.navigationBars.firstMatch, "the settings sheet")
    AppDriver.scrollTo(row("On this iPhone"), in: app)
    AppDriver.scrollTo(row("Your own Anthropic API key"), in: app)
    XCTAssertFalse(
      AppDriver.visibleText(app).contains("Klarbefund service"),
      "the hosted service is not offered by a build that cannot reach it")
  }

  func testTheConnectSheetSaysWhenTheDemoHubRuns() {
    let app = AppDriver.launch(.connect)
    AppDriver.require(app.navigationBars["Connect to EHDS"], "the Connect sheet")
    let hours = AppDriver.scrollTo(app.staticTexts["connect-hub-hours"], in: app)
    XCTAssertTrue(hours.label.contains("weekdays"), hours.label)
    XCTAssertTrue(hours.label.contains("Berlin time"), hours.label)
  }

  func testPrivacyAndSafetyCarriesTheLoincAndUcumNotices() {
    let app = AppDriver.launch(.privacy)
    AppDriver.require(app.navigationBars["Privacy and safety"], "the privacy sheet")
    XCTAssertFalse(
      AppDriver.visibleText(app).contains("Klarbefund service"),
      "the privacy text does not describe a service this build does not offer")
    let loinc = AppDriver.scrollTo(app.staticTexts["legal-loinc"], in: app)
    XCTAssertTrue(loinc.label.contains("Regenstrief Institute"), loinc.label)
    XCTAssertTrue(loinc.label.contains("loinc.org/license"), loinc.label)
    let ucum = AppDriver.scrollTo(app.staticTexts["legal-ucum"], in: app)
    XCTAssertTrue(ucum.label.contains("UCUM License"), ucum.label)
  }

  /// Build 16: Export to my Mac can send the year of birth and sex, for the
  /// Mac's age-dependent scores (SCORE2, eGFR, FIB-4). Off until the person
  /// switches it on: the profile otherwise stays on the phone (ADR-034).
  func testExportToMyMacOffersYearOfBirthAndSexSwitchedOff() {
    let app = AppDriver.launch(.relatePaired)
    let toggle = AppDriver.scrollTo(app.switches["relate-sends-person"], in: app)
    XCTAssertEqual(toggle.value as? String, "0", "off until the person switches it on")
    XCTAssertTrue(
      AppDriver.text(containing: "Only the year is sent", in: app).exists,
      "the footer says that only the year leaves the phone")
  }
}
