import DeviceCheck
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
    /// Creating an account, or signing in with a password (ADR-054).
    case signingIn
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
  /// The account whose password this phone holds, when it holds one: one
  /// the app created, or one the person signed in with (ADR-054).
  @Published private(set) var account: EHDSAccount?

  /// Hubs a link may name: the live one, and in a debug build the local stack.
  static var trusted: [TrustedHub] {
    #if DEBUG
      return TrustedHub.production + TrustedHub.development
    #else
      return TrustedHub.production
    #endif
  }

  private let transport: any EHDSTransport
  private let attestor: any AppAttestor
  private var tokens: TokenSet?
  /// The client the tokens were issued to, which a refresh must name.
  private var client = "klarbefund-app"
  private var hub: TrustedHub?
  private var polling: Task<Void, Never>?

  init(transport: (any EHDSTransport)? = nil, attestor: (any AppAttestor)? = nil) {
    #if DEBUG
      if DemoSeed.isRequested {
        self.transport = transport ?? DemoEHDSTransport()
        self.attestor = attestor ?? DemoAttestor()
        return
      }
    #endif
    self.transport = transport ?? URLSessionEHDSTransport()
    self.attestor = attestor ?? DeviceAppAttestor()
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

  // MARK: - An account of its own (ADR-054)

  /// False in the simulator and on devices without the Secure Enclave, where
  /// the hub could not tell this app from a script.
  var canCreateAccount: Bool { attestor.isSupported }

  /// Creates a sandbox account on the hub, keeps its password, and signs in.
  ///
  /// The hub creates an account only for a request Apple attests comes from
  /// this app on a real device: a challenge from the hub, a key from the
  /// Secure Enclave, and Apple's certificate binding the two.
  func createAccount() async {
    let hub = Self.trusted[0]
    state = .signingIn
    notice = nil
    do {
      let (status, body) = try await transport.postJSON(
        URL(string: "\(hub.ehds)/api/app-accounts/challenge")!, json: [:])
      let json = (try? JSONSerialization.jsonObject(with: body) as? [String: Any]) ?? [:]
      guard status == 200, let challenge = json["challenge"] as? String else {
        throw HubError(status: status, body: body)
      }
      let deviceId = Self.deviceId()
      let attested = try await attestor.attest(
        clientDataHash: EHDSAccount.clientDataHash(challenge: challenge, deviceId: deviceId))
      let (created, answer) = try await transport.postJSON(
        URL(string: "\(hub.ehds)/api/app-accounts")!,
        json: [
          "challenge": challenge, "keyId": attested.keyId,
          "attestation": attested.attestation.base64EncodedString(),
          "deviceId": deviceId, "deviceName": UIDevice.current.name,
        ])
      guard created == 201 else { throw HubError(status: created, body: answer) }
      let account = try EHDSAccount.created(from: answer, trusted: Self.trusted)
      keep(account)
      try await signIn(account)
    } catch {
      state = .failed(Self.explain(error))
    }
  }

  /// Signs in with a username and password the person typed.
  func signIn(username: String, password: String) async {
    let hub = Self.trusted[0]
    let account = EHDSAccount(
      ehds: hub.ehds, issuer: hub.issuer,
      username: username.trimmingCharacters(in: .whitespacesAndNewlines),
      password: password, createdByApp: false)
    state = .signingIn
    notice = nil
    do {
      try await signIn(account)
      keep(account)
    } catch {
      state = .failed(Self.explain(error))
    }
  }

  /// The password grant, then registering this phone under the login. Used
  /// for a new account, a typed one, and again whenever the session ends, so
  /// the phone stays connected without asking the person.
  private func signIn(_ account: EHDSAccount) async throws {
    guard account.travelsEncrypted else { throw EHDSAccount.Problem.unencrypted }
    let (status, body) = try await transport.post(
      URL(string: "\(account.issuer)/protocol/openid-connect/token")!, form: account.passwordGrant)
    let json = (try? JSONSerialization.jsonObject(with: body) as? [String: Any]) ?? [:]
    guard status == 200, let tokens = TokenSet.from(json: json) else {
      throw SignInError(keycloak: json["error_description"] as? String ?? json["error"] as? String)
    }
    let (registered, answer) = try await transport.send(
      method: "POST", url: URL(string: "\(account.ehds)/api/patient/app-devices")!,
      bearer: tokens.accessToken, device: nil,
      json: ["deviceId": Self.deviceId(), "deviceName": UIDevice.current.name])
    guard registered == 201 else { throw HubError(status: registered, body: answer) }
    self.tokens = tokens
    self.client = account.client
    self.hub = account.hub
    persist()
    state = .connected(hub: account.hub, username: account.username)
  }

  /// Deletes the account the app created: its login, its record and its
  /// phones on the hub, then everything on this phone (App Store 5.1.1(v)).
  func deleteAccount() async {
    guard let account, account.createdByApp, let hub else { return }
    do {
      let token = try await freshToken()
      let (status, body) = try await transport.send(
        method: "DELETE", url: URL(string: "\(hub.ehds)/api/patient/app/account")!,
        bearer: token, device: Self.deviceId(), json: nil)
      guard status == 200 else { throw HubError(status: status, body: body) }
      forget()
      forgetAccount()
      state = .disconnected
      notice = String(localized: "The account \(account.username) and its record were deleted.")
    } catch {
      notice = Self.explain(error)
    }
  }

  /// Removes the stored password from this phone. The account stays on the hub.
  func forgetAccount() {
    account = nil
    Keychain.delete(Self.accountTag)
  }

  private func keep(_ account: EHDSAccount) {
    self.account = account
    if let data = try? JSONEncoder().encode(account) { Keychain.set(data, for: Self.accountTag) }
  }

  // MARK: - The record

  func loadRecord(attemptsLeft: Int = 1) async {
    guard let hub else { return }
    loadingRecord = true
    defer { loadingRecord = false }
    do {
      let token = try await freshToken()
      let (status, body) = try await transport.send(
        method: "GET", url: URL(string: "\(hub.ehds)/api/patient/app/record")!,
        bearer: token, device: Self.deviceId(), json: nil)
      if status == 401, let account, attemptsLeft > 0 {
        // The phone holds the password, so it connects itself again rather
        // than asking the person to scan a code.
        try await signIn(account)
        await loadRecord(attemptsLeft: attemptsLeft - 1)
        return
      }
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
    if tokens == nil, let account {
      try await signIn(account)
    }
    guard let tokens, let hub else { throw HubError(status: 401, body: Data()) }
    if tokens.isFresh() { return tokens.accessToken }
    let refreshed: TokenSet? = await {
      guard let refresh = tokens.refreshToken,
        let (status, body) = try? await transport.post(
          URL(string: "\(hub.issuer)/protocol/openid-connect/token")!,
          form: ["grant_type": "refresh_token", "client_id": client, "refresh_token": refresh]),
        status == 200,
        let json = try? JSONSerialization.jsonObject(with: body) as? [String: Any]
      else { return nil }
      return TokenSet.from(json: json)
    }()
    guard let next = refreshed else {
      // The session ended. With the password on the phone, sign in again.
      if let account {
        try await signIn(account)
        if let again = self.tokens { return again.accessToken }
      }
      forget()
      throw HubError(status: 401, body: Data())
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
          form: ["client_id": client, "token": refresh, "token_type_hint": "refresh_token"])
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
  private static let accountTag = "red.mabu.meinbefund.ehds.account"

  private struct Stored: Codable {
    let ehds: String
    let issuer: String
    let username: String
    let tokens: TokenSet
    /// Absent in a connection stored before ADR-054: the QR code's client.
    let client: String?
  }

  private func persist() {
    guard let hub, let tokens else { return }
    let stored = Stored(
      ehds: hub.ehds, issuer: hub.issuer,
      username: AccessTokenClaims.decode(tokens.accessToken)?.username ?? "", tokens: tokens,
      client: client)
    if let data = try? JSONEncoder().encode(stored) { Keychain.set(data, for: Self.tokensTag) }
  }

  private func restore() {
    if let data = Keychain.get(Self.accountTag),
      let account = try? JSONDecoder().decode(EHDSAccount.self, from: data),
      Self.trusted.contains(account.hub)
    {
      self.account = account
    }
    guard let data = Keychain.get(Self.tokensTag),
      let stored = try? JSONDecoder().decode(Stored.self, from: data),
      let hub = Self.trusted.first(where: { $0.ehds == stored.ehds && $0.issuer == stored.issuer })
    else { return }
    if let refreshEnd = stored.tokens.refreshExpiresAt, refreshEnd < Date() {
      Keychain.delete(Self.tokensTag)
      // With the password kept, the session ending is not the connection
      // ending: the next request signs in again.
      guard let account, account.hub == hub else { return }
      self.hub = hub
      self.client = account.client
      state = .connected(hub: hub, username: account.username)
      return
    }
    self.hub = hub
    self.tokens = stored.tokens
    self.client = stored.client ?? "klarbefund-app"
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
    case let error as SignInError:
      return error.localizedDescription
    case EHDSAccount.Problem.unencrypted:
      return String(localized: "Klarbefund sends a password only over an encrypted connection.")
    case EHDSAccount.Problem.incomplete:
      return String(localized: "The hub's answer was incomplete. Try again.")
    case let EHDSAccount.Problem.untrustedHub(host):
      return String(localized: "Klarbefund does not connect to \(host). Only the EHDS demo hub is accepted.")
    case let error as DCError where error.code == .featureUnsupported:
      return String(localized: "This device cannot prove to the hub that it runs Klarbefund, so it cannot create an account. Sign in with an existing account instead.")
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

/// Keycloak refused the password grant.
struct SignInError: LocalizedError {
  let keycloak: String?
  var errorDescription: String? {
    if keycloak == "Invalid user credentials" {
      return String(localized: "The username or password is wrong.")
    }
    return String(localized: "Sign-in was refused: \(keycloak ?? "no reason given")")
  }
}

/// Everything the connection sends, so the demo can answer without a network.
protocol EHDSTransport: FormTransport {
  func send(
    method: String, url: URL, bearer: String, device: String?, json: [String: String]?
  ) async throws -> (status: Int, body: Data)
  /// A JSON request without a token: the two routes that create an account.
  func postJSON(_ url: URL, json: [String: String]) async throws -> (status: Int, body: Data)
}

/// Apple's App Attest, behind a protocol so the simulator and the UI tests
/// can stand in for the Secure Enclave.
protocol AppAttestor: Sendable {
  var isSupported: Bool { get }
  /// A new key, attested over the hash: its id (base64) and Apple's attestation.
  func attest(clientDataHash: Data) async throws -> (keyId: String, attestation: Data)
}

/// The real one. A new key per account: a key may be attested once.
struct DeviceAppAttestor: AppAttestor {
  var isSupported: Bool { DCAppAttestService.shared.isSupported }

  func attest(clientDataHash: Data) async throws -> (keyId: String, attestation: Data) {
    let service = DCAppAttestService.shared
    guard service.isSupported else { throw DCError(.featureUnsupported) }
    let keyId = try await service.generateKey()
    let attestation = try await service.attestKey(keyId, clientDataHash: clientDataHash)
    return (keyId, attestation)
  }
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

  func postJSON(_ url: URL, json: [String: String]) async throws -> (status: Int, body: Data) {
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.httpBody = try JSONSerialization.data(withJSONObject: json)
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
  /// App Attest for the simulator and the UI tests: no Secure Enclave, so a
  /// fixed key and an attestation only the demo transport accepts.
  struct DemoAttestor: AppAttestor {
    var isSupported: Bool { true }
    func attest(clientDataHash: Data) async throws -> (keyId: String, attestation: Data) {
      (Data(repeating: 1, count: 32).base64EncodedString(), Data("demo".utf8))
    }
  }

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
      if form["grant_type"] == "password", form["password"] != Self.demoPassword {
        return (401, Data(#"{"error":"invalid_grant","error_description":"Invalid user credentials"}"#.utf8))
      }
      let json = #"{"access_token":"\#(Self.token)","refresh_token":"demo","expires_in":300,"refresh_expires_in":1800}"#
      return (200, Data(json.utf8))
    }

    /// The fictional account the demo creates; never a real login.
    static let demoUsername = "kb-demo2345"
    static let demoPassword = "Demo2-Pass3-Word4-Only5"

    func postJSON(_ url: URL, json: [String: String]) async throws -> (status: Int, body: Data) {
      switch url.path {
      case "/api/app-accounts/challenge":
        return (200, Data(#"{"challenge":"1.demo.demo"}"#.utf8))
      case "/api/app-accounts":
        let answer = #"{"username":"\#(Self.demoUsername)","password":"\#(Self.demoPassword)","patientId":"KB-DEMO2345","ehds":"https://ehds.mabu.red","issuer":"https://auth.ehds.mabu.red/realms/edcv","client":"klarbefund-account"}"#
        return (201, Data(answer.utf8))
      default: return (404, Data("{}".utf8))
      }
    }

    func send(
      method: String, url: URL, bearer: String, device: String?, json: [String: String]?
    ) async throws -> (status: Int, body: Data) {
      switch (method, url.path) {
      case ("POST", "/api/patient/app-devices"): return (201, Data("{}".utf8))
      case ("DELETE", "/api/patient/app/account"): return (200, Data(#"{"deleted":"kb-demo2345"}"#.utf8))
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
