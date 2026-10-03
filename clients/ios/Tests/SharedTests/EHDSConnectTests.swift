import Foundation
import Testing

@testable import Shared

/// #473: connecting Klarbefund to the patient's record by a QR code.
@Suite("Connect to EHDS: the link and the device grant")
struct EHDSConnectTests {
  private let now = Date(timeIntervalSince1970: 1_791_000_000)

  private func link(
    ehds: String = "https://ehds.mabu.red",
    issuer: String = "https://auth.ehds.mabu.red/realms/edcv",
    client: String = "klarbefund-app",
    expires: Int = 1_791_000_120,
    drop: String? = nil
  ) -> String {
    var c = URLComponents(string: "klarbefund://connect")!
    c.queryItems = [
      ("ehds", ehds), ("issuer", issuer), ("client", client), ("pairing", "p-1"),
      ("device_code", "dc-1"), ("user_code", "ABCD-EFGH"), ("interval", "5"),
      ("expires", String(expires)),
    ].filter { $0.0 != drop }.map { URLQueryItem(name: $0.0, value: $0.1) }
    return c.url!.absoluteString
  }

  @Test("a link from the live hub is read in full")
  func readsTheLiveHub() throws {
    let parsed = try ConnectLink.parse(link(), trusted: TrustedHub.production, now: now)
    #expect(parsed.hub.host == "ehds.mabu.red")
    #expect(parsed.deviceCode == "dc-1")
    #expect(parsed.pairingID == "p-1")
    #expect(parsed.tokenEndpoint.absoluteString
      == "https://auth.ehds.mabu.red/realms/edcv/protocol/openid-connect/token")
  }

  @Test("a hub that is not on the list is refused before the network is touched")
  func refusesALookAlike() {
    #expect(throws: ConnectLink.Problem.untrustedHub("ehds-mabu.red")) {
      try ConnectLink.parse(
        link(ehds: "https://ehds-mabu.red"), trusted: TrustedHub.production, now: self.now)
    }
  }

  @Test("the right hub with a foreign issuer is refused too")
  func refusesAForeignIssuer() {
    #expect(throws: ConnectLink.Problem.untrustedHub("ehds.mabu.red")) {
      try ConnectLink.parse(
        link(issuer: "https://evil.example/realms/edcv"), trusted: TrustedHub.production,
        now: self.now)
    }
  }

  @Test("the local stack is trusted only when the debug list is passed")
  func localOnlyInDebug() throws {
    let local = link(ehds: "http://localhost:3021", issuer: "http://localhost:8080/realms/edcv")
    #expect(throws: ConnectLink.Problem.self) {
      try ConnectLink.parse(local, trusted: TrustedHub.production, now: self.now)
    }
    let parsed = try ConnectLink.parse(
      local, trusted: TrustedHub.production + TrustedHub.development, now: now)
    #expect(parsed.hub.patientScreen.absoluteString == "http://localhost:3021/patient/profile")
  }

  @Test("an expired code, a foreign client, a missing field and a stranger are each said plainly")
  func problems() {
    let trusted = TrustedHub.production
    #expect(throws: ConnectLink.Problem.expired) {
      try ConnectLink.parse(self.link(expires: 1_790_999_000), trusted: trusted, now: self.now)
    }
    #expect(throws: ConnectLink.Problem.wrongClient("health-dataspace-ui")) {
      try ConnectLink.parse(self.link(client: "health-dataspace-ui"), trusted: trusted, now: self.now)
    }
    #expect(throws: ConnectLink.Problem.missing("device_code")) {
      try ConnectLink.parse(self.link(drop: "device_code"), trusted: trusted, now: self.now)
    }
    #expect(throws: ConnectLink.Problem.notAConnectLink) {
      try ConnectLink.parse("https://ehds.mabu.red/patient", trusted: trusted, now: self.now)
    }
  }

  // MARK: - The poller

  /// Answers from a script, and records what was asked.
  final class Script: FormTransport, @unchecked Sendable {
    var answers: [(Int, String)]
    var asked: [[String: String]] = []
    init(_ answers: [(Int, String)]) { self.answers = answers }
    func post(_ url: URL, form: [String: String]) async throws -> (status: Int, body: Data) {
      asked.append(form)
      let (status, body) = answers.removeFirst()
      return (status, Data(body.utf8))
    }
  }

  final class Sleeps: @unchecked Sendable {
    var seconds: [Int] = []
  }

  private func parsed() throws -> ConnectLink {
    try ConnectLink.parse(link(), trusted: TrustedHub.production, now: now)
  }

  @Test("pending, then slower, then a token: the interval grows by five on slow_down")
  func pollsUntilApproved() async throws {
    let script = Script([
      (400, #"{"error":"authorization_pending"}"#),
      (400, #"{"error":"slow_down"}"#),
      (200, #"{"access_token":"a.b.c","refresh_token":"r","expires_in":300,"refresh_expires_in":1800}"#),
    ])
    let sleeps = Sleeps()
    let now = self.now
    let tokens = try await DeviceGrant.poll(
      try parsed(), transport: script, now: { now }, sleep: { sleeps.seconds.append($0) })
    #expect(tokens.accessToken == "a.b.c")
    #expect(tokens.refreshToken == "r")
    #expect(sleeps.seconds == [5, 10])
    #expect(script.asked.first?["grant_type"] == "urn:ietf:params:oauth:grant-type:device_code")
    #expect(script.asked.first?["device_code"] == "dc-1")
  }

  @Test("a No on the consent page ends the grant as denied")
  func denied() async throws {
    let script = Script([(400, #"{"error":"access_denied"}"#)])
    let now = self.now
    await #expect(throws: DeviceGrant.Failure.denied) {
      try await DeviceGrant.poll(try self.parsed(), transport: script, now: { now }, sleep: { _ in })
    }
  }

  @Test("an expired code ends the grant, whether Keycloak or the clock says so")
  func expired() async throws {
    let script = Script([(400, #"{"error":"expired_token"}"#)])
    let now = self.now
    await #expect(throws: DeviceGrant.Failure.expired) {
      try await DeviceGrant.poll(try self.parsed(), transport: script, now: { now }, sleep: { _ in })
    }
    let later = now.addingTimeInterval(500)
    await #expect(throws: DeviceGrant.Failure.expired) {
      try await DeviceGrant.poll(
        try self.parsed(), transport: Script([]), now: { later }, sleep: { _ in })
    }
  }

  // MARK: - What the phone shows

  @Test("the account is read from the token to ask 'is this you?'")
  func claims() {
    let payload = Data(#"{"preferred_username":"patient1","azp":"klarbefund-app"}"#.utf8)
      .base64EncodedString().replacingOccurrences(of: "=", with: "")
    #expect(AccessTokenClaims.decode("h.\(payload).s")
      == AccessTokenClaims(username: "patient1", client: "klarbefund-app"))
    #expect(AccessTokenClaims.decode("not-a-token") == nil)
  }

  @Test("the record Bundle becomes observations, with the printed range and the fictional tag")
  func record() throws {
    let bundle = #"""
      {"resourceType":"Bundle","type":"searchset","meta":{"tag":[{"code":"fictional"}]},
       "entry":[{"resource":{"resourceType":"Observation","id":"o1",
         "code":{"coding":[{"code":"2089-1","display":"LDL"}],"text":"Cholesterol in LDL"},
         "effectiveDateTime":"2026-09-04T00:00:00Z",
         "valueQuantity":{"value":141,"unit":"mg/dL"},
         "referenceRange":[{"high":{"value":116},"text":"< 116"}]}},
        {"resource":{"resourceType":"Observation","id":"o2",
         "code":{"coding":[{"code":"4548-4"}],"text":"HbA1c"},
         "effectiveDateTime":"2026-09-04",
         "valueQuantity":{"value":5.4,"unit":"%"},
         "referenceRange":[{"low":{"value":4},"high":{"value":6}}]}}]}
      """#
    let record = try #require(DataspaceRecord.parse(Data(bundle.utf8)))
    #expect(record.fictional)
    #expect(record.observations.map(\.loinc) == ["2089-1", "4548-4"])
    #expect(record.observations[0].range == "< 116")
    #expect(record.observations[1].range == "4 – 6")
    #expect(record.observations.allSatisfy { $0.effective != nil })
  }
}
