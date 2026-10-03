import Foundation
import Shared
import UIKit

/// The phone's connection to the patient's record on the EHDS hub (#473, ADR-049).
///
/// Holds what a connection is made of: the hub, the Keycloak tokens, and a
/// device id generated once. Tokens and the device id live in the Keychain as
/// `ThisDeviceOnly`, like the store key: unavailable while the phone is locked
/// and never restored onto another device. Nothing read from the hub is
/// stored; the record is fetched when the person asks to see it.
@MainActor
final class EHDSConnection: ObservableObject {

  enum State: Equatable {
    case disconnected
    /// Waiting for the patient to approve in their browser.
    case waiting(ConnectLink)
    /// Connected, until the person says the account is theirs.
    case confirming(hub: TrustedHub, username: String)
    case connected(hub: TrustedHub, username: String)
    case failed(String)
  }

  @Published private(set) var state: State = .disconnected
  /// A problem with a link that arrived while already connected. Shown, but it
  /// never replaces the connection: a stale or foreign code opened later must
  /// not undo one that works (measured: an expired link the system offered to
  /// open after the real one had connected turned a connected phone into
  /// "the code expired").
  @Published var notice: String?
  @Published private(set) var record: DataspaceRecord?
  @Published private(set) var loadingRecord = false

  /// Hubs a link may name: the live one, and in a debug build the local stack.
  static var trusted: [TrustedHub] {
    #if DEBUG
      return TrustedHub.production + TrustedHub.development
    #else
      return TrustedHub.production
    #endif
  }

  private let transport: any EHDSTransport
  private var tokens: TokenSet?
  private var hub: TrustedHub?
  private var polling: Task<Void, Never>?

  init(transport: (any EHDSTransport)? = nil) {
    #if DEBUG
      if DemoSeed.isRequested {
        self.transport = transport ?? DemoEHDSTransport()
        return
      }
    #endif
    self.transport = transport ?? URLSessionEHDSTransport()
    restore()
  }

  // MARK: - Connecting

  /// Starts from a scanned, tapped or pasted link. Refuses an untrusted one
  /// before anything leaves the phone.
  func connect(with text: String) {
    let link: ConnectLink
    do {
      link = try ConnectLink.parse(text, trusted: Self.trusted)
    } catch {
      if isConnected {
        notice = Self.explain(error)
      } else {
        state = .failed(Self.explain(error))
      }
      return
    }
    notice = nil
    polling?.cancel()
    state = .waiting(link)
    polling = Task { [transport] in
      do {
        let tokens = try await DeviceGrant.poll(link, transport: transport)
        try await self.register(link: link, tokens: tokens)
      } catch is CancellationError {
        return
      } catch {
        self.state = .failed(Self.explain(error))
      }
    }
  }

  /// Connected or about to confirm: there is a working connection to keep.
  var isConnected: Bool {
    switch state {
    case .connected, .confirming: return true
    default: return false
    }
  }

  func cancel() {
    polling?.cancel()
    polling = nil
    state = tokens == nil ? .disconnected : state
  }

  private func register(link: ConnectLink, tokens: TokenSet) async throws {
    let claims = AccessTokenClaims.decode(tokens.accessToken)
    let deviceId = Self.deviceId()
    let (status, body) = try await transport.send(
      method: "POST", url: URL(string: "\(link.hub.ehds)/api/patient/app-devices")!,
      bearer: tokens.accessToken, device: nil,
      json: [
        "pairingId": link.pairingID, "deviceId": deviceId,
        "deviceName": UIDevice.current.name,
      ])
    guard status == 201 else { throw HubError(status: status, body: body) }
    self.tokens = tokens
    self.hub = link.hub
    persist()
    state = .confirming(hub: link.hub, username: claims?.username ?? "?")
  }

  /// The person confirmed the account is theirs.
  func confirm() {
    if case let .confirming(hub, username) = state {
      state = .connected(hub: hub, username: username)
    }
  }

  // MARK: - The record

  func loadRecord() async {
    guard let hub else { return }
    loadingRecord = true
    defer { loadingRecord = false }
    do {
      let token = try await freshToken()
      let (status, body) = try await transport.send(
        method: "GET", url: URL(string: "\(hub.ehds)/api/patient/app/record")!,
        bearer: token, device: Self.deviceId(), json: nil)
      if status == 401 {
        // Disconnected on the website, or the session ended: either way this
        // phone is no longer connected, and saying so is the honest answer.
        forget()
        state = .failed(String(localized: "This phone is no longer connected. Scan a new code to connect again."))
        return
      }
      guard status == 200, let parsed = DataspaceRecord.parse(body) else {
        throw HubError(status: status, body: body)
      }
      record = parsed
    } catch {
      state = .failed(Self.explain(error))
    }
  }

  /// A token valid for the next request, refreshing it when needed.
  private func freshToken() async throws -> String {
    guard let tokens, let hub else { throw HubError(status: 401, body: Data()) }
    if tokens.isFresh() { return tokens.accessToken }
    guard let refresh = tokens.refreshToken else { throw HubError(status: 401, body: Data()) }
    let (status, body) = try await transport.post(
      URL(string: "\(hub.issuer)/protocol/openid-connect/token")!,
      form: ["grant_type": "refresh_token", "client_id": "klarbefund-app", "refresh_token": refresh])
    let json = (try? JSONSerialization.jsonObject(with: body) as? [String: Any]) ?? [:]
    guard status == 200, let next = TokenSet.from(json: json) else {
      forget()
      throw HubError(status: 401, body: body)
    }
    self.tokens = next
    persist()
    return next.accessToken
  }

  // MARK: - Disconnecting

  /// Tells the hub, revokes the refresh token at Keycloak, and forgets
  /// everything. Each step is best effort: being offline must not leave a
  /// phone that believes it is connected.
  func disconnect() async {
    if let hub, let tokens {
      let device = Self.deviceId()
      _ = try? await transport.send(
        method: "DELETE", url: URL(string: "\(hub.ehds)/api/patient/app-devices/\(device)")!,
        bearer: tokens.accessToken, device: device, json: nil)
      if let refresh = tokens.refreshToken {
        _ = try? await transport.post(
          URL(string: "\(hub.issuer)/protocol/openid-connect/revoke")!,
          form: ["client_id": "klarbefund-app", "token": refresh, "token_type_hint": "refresh_token"])
      }
    }
    forget()
    state = .disconnected
  }

  private func forget() {
    tokens = nil
    hub = nil
    record = nil
    Keychain.delete(Self.tokensTag)
  }

  // MARK: - Keeping it

  private static let tokensTag = "red.mabu.meinbefund.ehds.connection"
  private static let deviceTag = "red.mabu.meinbefund.ehds.device"

  private struct Stored: Codable {
    let ehds: String
    let issuer: String
    let username: String
    let tokens: TokenSet
  }

  private func persist() {
    guard let hub, let tokens else { return }
    let stored = Stored(
      ehds: hub.ehds, issuer: hub.issuer,
      username: AccessTokenClaims.decode(tokens.accessToken)?.username ?? "", tokens: tokens)
    if let data = try? JSONEncoder().encode(stored) { Keychain.set(data, for: Self.tokensTag) }
  }

  private func restore() {
    guard let data = Keychain.get(Self.tokensTag),
      let stored = try? JSONDecoder().decode(Stored.self, from: data),
      let hub = Self.trusted.first(where: { $0.ehds == stored.ehds && $0.issuer == stored.issuer })
    else { return }
    if let refreshEnd = stored.tokens.refreshExpiresAt, refreshEnd < Date() {
      Keychain.delete(Self.tokensTag)
      return
    }
    self.hub = hub
    self.tokens = stored.tokens
    state = .connected(hub: hub, username: stored.username)
  }

  /// Generated once and kept, so the hub sees one phone, not one per connection.
  static func deviceId() -> String {
    if let data = Keychain.get(deviceTag) { return String(decoding: data, as: UTF8.self) }
    let id = UUID().uuidString.lowercased()
    Keychain.set(Data(id.utf8), for: deviceTag)
    return id
  }

  // MARK: - Words

  static func explain(_ error: Error) -> String {
    switch error {
    case ConnectLink.Problem.notAConnectLink:
      return String(localized: "This is not a Klarbefund connection code.")
    case let ConnectLink.Problem.untrustedHub(host):
      return String(localized: "Klarbefund does not connect to \(host). Only codes from the EHDS demo hub are accepted.")
    case ConnectLink.Problem.expired, DeviceGrant.Failure.expired:
      return String(localized: "The code expired. Show a new one on the patient screen and scan again.")
    case DeviceGrant.Failure.denied:
      return String(localized: "The connection was declined on the consent page.")
    case let ConnectLink.Problem.missing(field):
      return String(localized: "The code is incomplete (\(field) is missing).")
    case let ConnectLink.Problem.wrongClient(client):
      return String(localized: "The code is for another application (\(client)).")
    case let error as HubError:
      return error.localizedDescription
    default:
      return error.localizedDescription
    }
  }
}

/// A refusal from the hub, with the reason it gave.
struct HubError: LocalizedError {
  let status: Int
  let body: Data
  var errorDescription: String? {
    let json = (try? JSONSerialization.jsonObject(with: body) as? [String: Any]) ?? [:]
    let reason = json["reason"] as? String ?? json["error"] as? String ?? ""
    return String(localized: "The hub refused (\(status)): \(reason)")
  }
}

/// Everything the connection sends, so the demo can answer without a network.
protocol EHDSTransport: FormTransport {
  func send(
    method: String, url: URL, bearer: String, device: String?, json: [String: String]?
  ) async throws -> (status: Int, body: Data)
}

struct URLSessionEHDSTransport: EHDSTransport {
  func post(_ url: URL, form: [String: String]) async throws -> (status: Int, body: Data) {
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
    var components = URLComponents()
    components.queryItems = form.map { URLQueryItem(name: $0.key, value: $0.value) }
    request.httpBody = Data((components.percentEncodedQuery ?? "").utf8)
    return try await run(request)
  }

  func send(
    method: String, url: URL, bearer: String, device: String?, json: [String: String]?
  ) async throws -> (status: Int, body: Data) {
    var request = URLRequest(url: url)
    request.httpMethod = method
    request.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization")
    if let device { request.setValue(device, forHTTPHeaderField: "X-Klarbefund-Device") }
    if let json {
      request.setValue("application/json", forHTTPHeaderField: "Content-Type")
      request.httpBody = try JSONSerialization.data(withJSONObject: json)
    }
    return try await run(request)
  }

  private func run(_ request: URLRequest) async throws -> (status: Int, body: Data) {
    var request = request
    request.timeoutInterval = 20
    let (data, response) = try await URLSession.shared.data(for: request)
    return ((response as? HTTPURLResponse)?.statusCode ?? 0, data)
  }
}

/// The few Keychain calls the connection needs, all `ThisDeviceOnly`.
enum Keychain {
  static func set(_ data: Data, for account: String) {
    delete(account)
    let add: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrAccount as String: account,
      kSecValueData as String: data,
      kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
    ]
    SecItemAdd(add as CFDictionary, nil)
  }

  static func get(_ account: String) -> Data? {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrAccount as String: account,
      kSecReturnData as String: true,
    ]
    var item: CFTypeRef?
    guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess else { return nil }
    return item as? Data
  }

  static func delete(_ account: String) {
    SecItemDelete(
      [kSecClass as String: kSecClassGenericPassword, kSecAttrAccount as String: account]
        as CFDictionary)
  }
}

#if DEBUG
  /// The hub and Keycloak, played by the demo, so a UI test can connect
  /// without either. Approves at once, connects `patient1`, and answers with
  /// a small fictional record.
  struct DemoEHDSTransport: EHDSTransport {
    /// A token the phone only decodes for display; nothing verifies it here.
    static let token: String = {
      func encode(_ s: String) -> String {
        Data(s.utf8).base64EncodedString().replacingOccurrences(of: "=", with: "")
          .replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_")
      }
      return encode(#"{"alg":"none"}"#) + "."
        + encode(#"{"preferred_username":"patient1","azp":"klarbefund-app"}"#) + ".demo"
    }()

    /// A link to paste in a UI test: the live hub's names, a demo device code.
    static var link: String {
      let expires = Int(Date().addingTimeInterval(120).timeIntervalSince1970)
      return "klarbefund://connect?ehds=https%3A%2F%2Fehds.mabu.red&issuer=https%3A%2F%2Fauth.ehds.mabu.red%2Frealms%2Fedcv&client=klarbefund-app&pairing=demo&device_code=demo&user_code=DEMO-CODE&interval=1&expires=\(expires)"
    }

    func post(_ url: URL, form: [String: String]) async throws -> (status: Int, body: Data) {
      let json = #"{"access_token":"\#(Self.token)","refresh_token":"demo","expires_in":300,"refresh_expires_in":1800}"#
      return (200, Data(json.utf8))
    }

    func send(
      method: String, url: URL, bearer: String, device: String?, json: [String: String]?
    ) async throws -> (status: Int, body: Data) {
      switch (method, url.path) {
      case ("POST", "/api/patient/app-devices"): return (201, Data("{}".utf8))
      case ("GET", "/api/patient/app/record"):
        let bundle = #"""
          {"resourceType":"Bundle","type":"searchset","meta":{"tag":[{"code":"fictional"}]},"entry":[
           {"resource":{"resourceType":"Observation","id":"d1","code":{"coding":[{"code":"2089-1"}],"text":"Cholesterol in LDL"},"effectiveDateTime":"2026-06-12","valueQuantity":{"value":128,"unit":"mg/dL"},"referenceRange":[{"high":{"value":116},"text":"< 116"}]}},
           {"resource":{"resourceType":"Observation","id":"d2","code":{"coding":[{"code":"4548-4"}],"text":"Hemoglobin A1c"},"effectiveDateTime":"2026-06-12","valueQuantity":{"value":5.6,"unit":"%"},"referenceRange":[{"low":{"value":4},"high":{"value":6}}]}}]}
          """#
        return (200, Data(bundle.utf8))
      default: return (200, Data("{}".utf8))
      }
    }
  }
#endif
