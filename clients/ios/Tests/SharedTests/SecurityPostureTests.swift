import Foundation
import Testing

/// The security posture the self-assessment claims, pinned as tests
/// (docs/klarbefund/self-assessment.md, BSI TR-03161 part 1). Each test reads
/// the build files the claim points at, so a change that weakens the posture
/// fails here before it ships, instead of surfacing in the next audit.
///
/// The files are read by path from this test file, as the FHIR parity test
/// does with its fixtures, because the package has no resource bundle for them.
@Suite("Security posture: what the self-assessment claims, checked in the build files")
struct SecurityPostureTests {

  private var root: URL {
    URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent()  // SharedTests
      .deletingLastPathComponent()  // Tests
      .deletingLastPathComponent()  // clients/ios
  }

  private func text(_ relative: String) throws -> String {
    try String(contentsOf: root.appendingPathComponent(relative), encoding: .utf8)
  }

  private func plist(_ relative: String) throws -> [String: Any] {
    let data = try Data(contentsOf: root.appendingPathComponent(relative))
    let any = try PropertyListSerialization.propertyList(from: data, format: nil)
    return try #require(any as? [String: Any], "\(relative) is a dictionary plist")
  }

  // O.TrdP: no third-party software at all.
  @Test("Package.swift declares no external dependency")
  func noExternalPackages() throws {
    let manifest = try text("Package.swift")
    #expect(!manifest.contains(".package("), "a .package( line would add a third-party dependency")
    let project = try text("project.yml")
    #expect(!project.contains("\npackages:"), "project.yml must not add Swift packages")
  }

  // O.Purp: no tracking, and the privacy manifest says what is collected.
  @Test("Privacy manifest: tracking off, no tracking domains, health data declared")
  func privacyManifest() throws {
    let manifest = try plist("Sources/MeinBefund/PrivacyInfo.xcprivacy")
    #expect(manifest["NSPrivacyTracking"] as? Bool == false)
    #expect((manifest["NSPrivacyTrackingDomains"] as? [Any])?.isEmpty ?? true)
    let types = try #require(manifest["NSPrivacyCollectedDataTypes"] as? [[String: Any]])
    let names = types.compactMap { $0["NSPrivacyCollectedDataType"] as? String }
    #expect(names.contains("NSPrivacyCollectedDataTypeHealth"))
    for type in types {
      #expect(type["NSPrivacyCollectedDataTypeLinked"] as? Bool == false, "no collected type is linked to identity")
      #expect(type["NSPrivacyCollectedDataTypeTracking"] as? Bool == false, "no collected type is used for tracking")
    }
  }

  // O.Data: complete file protection is the default for everything the app writes.
  @Test("Entitlements: default data protection is NSFileProtectionComplete")
  func dataProtectionEntitlement() throws {
    let entitlements = try plist("Sources/MeinBefund/MeinBefund.entitlements")
    #expect(entitlements["com.apple.developer.default-data-protection"] as? String == "NSFileProtectionComplete")
  }

  // O.Ntwk: App Transport Security stays on; the only exception is local networking.
  @Test("ATS: no arbitrary loads, no per-domain exception, local networking only")
  func appTransportSecurity() throws {
    let project = try text("project.yml")
    #expect(project.contains("NSAppTransportSecurity:"))
    #expect(project.contains("NSAllowsLocalNetworking: true"))
    #expect(!project.contains("NSAllowsArbitraryLoads"), "ATS must not be switched off")
    #expect(!project.contains("NSExceptionDomains"), "no domain may opt out of ATS")
  }

  // O.Cryp: Apple CryptoKit only, a 256-bit key, Keychain bound to this device while unlocked.
  @Test("Store: AES-GCM under a 256-bit Keychain key, this device only")
  func storeCryptography() throws {
    let store = try text("Sources/MeinBefund/ReportStore.swift")
    #expect(store.contains("SymmetricKey(size: .bits256)"))
    #expect(store.contains("AES.GCM.seal("))
    #expect(store.contains("kSecAttrAccessibleWhenUnlockedThisDeviceOnly"))
    #expect(store.contains("isExcludedFromBackup = true"), "the store stays out of iCloud and iTunes backups")
    #expect(store.contains(".completeFileProtection"))
  }

  // O.Auth: PKCE with S256 for the hub sign-in, tokens never in UserDefaults.
  @Test("Hub sign-in: PKCE S256 in the system web session; tokens in the Keychain")
  func hubSignIn() throws {
    let oidc = try text("Sources/MeinBefund/OIDCSession.swift")
    #expect(oidc.contains("code_challenge_method"))
    #expect(oidc.contains("\"S256\""))
    #expect(oidc.contains("ASWebAuthenticationSession"))
    let connection = try text("Sources/MeinBefund/EHDSConnection.swift")
    #expect(!connection.contains("UserDefaults.standard.set(token"), "no token in UserDefaults")
  }

  // O.Plat: HealthKit is read-only.
  @Test("HealthKit: nothing is written back")
  func healthKitReadOnly() throws {
    let source = try text("Sources/MeinBefund/WearableSource.swift")
    #expect(source.contains("requestAuthorization(toShare: []"))
  }

  // Minimisation: a cloud question carries at most this many values and no identity.
  @Test("Cloud question: at most 40 values")
  func cloudQuestionCap() throws {
    let cloud = try text("Sources/Shared/CloudAnalysis.swift")
    #expect(cloud.contains("maxValues = 40"))
  }

  // Export compliance: the app uses only Apple's cryptography.
  @Test("Export compliance: ITSAppUsesNonExemptEncryption is false")
  func exportCompliance() throws {
    let project = try text("project.yml")
    #expect(project.contains("ITSAppUsesNonExemptEncryption: false"))
  }
}
