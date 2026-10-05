import Foundation

/// Connecting Klarbefund to a patient's record on the EHDS hub (#473, ADR-049).
///
/// The patient screen shows a QR code. It carries a `klarbefund://connect` link
/// with everything the phone needs to finish an OAuth 2.0 device grant (RFC
/// 8628) on its own: which hub, which Keycloak issuer, which client, the
/// device code, and a pairing id to name when it registers. The patient
/// approves on Keycloak's consent page in their browser; the phone polls
/// Keycloak for the token. Nothing here needs a password on the phone.
///
/// Everything in this file is free of UIKit and the network, so it can be
/// tested here: what a link must say to be trusted, and what the poller does
/// with each answer Keycloak can give.

/// A hub the app will connect to, and the issuer that must come with it.
///
/// A QR code is anyone's to print. Without this list a code could point the
/// app at a look-alike hub and a look-alike Keycloak and harvest whatever the
/// person then approves, so a link naming any other pair is refused before the
/// network is touched. The same idea as `DSP_CATALOG_TOKEN_HOSTS` for the
/// catalog crawler.
public struct TrustedHub: Sendable, Equatable {
  public let ehds: String
  public let issuer: String

  public init(ehds: String, issuer: String) {
    self.ehds = ehds
    self.issuer = issuer
  }

  /// The live demo.
  public static let production: [TrustedHub] = [
    TrustedHub(ehds: "https://ehds.mabu.red", issuer: "https://auth.ehds.mabu.red/realms/edcv")
  ]

  /// The compose stack on the developer's Mac, which the simulator reaches as
  /// localhost. Only ever added in a debug build.
  public static let development: [TrustedHub] = ["3000", "3003", "3021"].map {
    TrustedHub(ehds: "http://localhost:\($0)", issuer: "http://localhost:8080/realms/edcv")
  }

  /// Where a person opens the patient screen to show the QR code.
  public var patientScreen: URL { URL(string: "\(ehds)/patient/profile")! }

  public var host: String { URL(string: ehds)?.host ?? ehds }
}

/// A `klarbefund://connect` link, checked.
public struct ConnectLink: Sendable, Equatable {
  public let hub: TrustedHub
  public let clientID: String
  public let pairingID: String
  public let deviceCode: String
  public let userCode: String
  /// Seconds between polls, as Keycloak asked.
  public let interval: Int
  public let expires: Date

  public enum Problem: Error, Equatable, Sendable {
    /// Not a `klarbefund://connect` link at all.
    case notAConnectLink
    /// A field the grant needs is missing.
    case missing(String)
    /// The hub, or its pairing with the issuer, is not on the trusted list.
    case untrustedHub(String)
    /// The client is not Klarbefund's.
    case wrongClient(String)
    /// The two minutes are over; scan a new code.
    case expired
  }

  /// Reads and checks a link from a QR code, a tap or a paste.
  public static func parse(
    _ text: String, trusted: [TrustedHub], now: Date = Date()
  ) throws(Problem) -> ConnectLink {
    guard let url = URL(string: text.trimmingCharacters(in: .whitespacesAndNewlines)),
      url.scheme == "klarbefund", url.host == "connect",
      let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems
    else { throw .notAConnectLink }

    func value(_ name: String) throws(Problem) -> String {
      guard let v = items.first(where: { $0.name == name })?.value, !v.isEmpty else {
        throw .missing(name)
      }
      return v
    }

    let ehds = try value("ehds").trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    let issuer = try value("issuer")
    guard let hub = trusted.first(where: { $0.ehds == ehds && $0.issuer == issuer }) else {
      throw .untrustedHub(URL(string: ehds)?.host ?? ehds)
    }
    let client = try value("client")
    guard client == "klarbefund-app" else { throw .wrongClient(client) }
    let expires = Date(timeIntervalSince1970: TimeInterval(Int(try value("expires")) ?? 0))
    guard expires > now else { throw .expired }

    return ConnectLink(
      hub: hub, clientID: client, pairingID: try value("pairing"),
      deviceCode: try value("device_code"), userCode: try value("user_code"),
      interval: max(1, Int(items.first(where: { $0.name == "interval" })?.value ?? "") ?? 5),
      expires: expires)
  }

  /// Keycloak's token endpoint for this hub.
  public var tokenEndpoint: URL {
    URL(string: "\(hub.issuer)/protocol/openid-connect/token")!
  }
}

/// What Keycloak handed the phone.
public struct TokenSet: Codable, Sendable, Equatable {
  public let accessToken: String
  public let refreshToken: String?
  public let expiresAt: Date
  public let refreshExpiresAt: Date?

  public init(accessToken: String, refreshToken: String?, expiresAt: Date, refreshExpiresAt: Date?) {
    self.accessToken = accessToken
    self.refreshToken = refreshToken
    self.expiresAt = expiresAt
    self.refreshExpiresAt = refreshExpiresAt
  }

  /// From a token endpoint's JSON answer.
  public static func from(json: [String: Any], now: Date = Date()) -> TokenSet? {
    guard let access = json["access_token"] as? String else { return nil }
    let expiresIn = (json["expires_in"] as? NSNumber)?.doubleValue ?? 300
    let refreshIn = (json["refresh_expires_in"] as? NSNumber)?.doubleValue
    return TokenSet(
      accessToken: access, refreshToken: json["refresh_token"] as? String,
      expiresAt: now.addingTimeInterval(expiresIn),
      refreshExpiresAt: refreshIn.flatMap { $0 > 0 ? now.addingTimeInterval($0) : nil })
  }

  /// Valid for at least another half minute, so a request does not race the expiry.
  public func isFresh(now: Date = Date()) -> Bool { expiresAt > now.addingTimeInterval(30) }
}

/// The two claims the app shows, read without verifying anything.
///
/// The hub verifies every token; the phone only needs to say whose account it
/// connected to, so the person can confirm it is theirs.
public struct AccessTokenClaims: Sendable, Equatable {
  public let username: String
  public let client: String?

  public static func decode(_ token: String) -> AccessTokenClaims? {
    let parts = token.split(separator: ".")
    guard parts.count >= 2 else { return nil }
    var base64 = String(parts[1]).replacingOccurrences(of: "-", with: "+")
      .replacingOccurrences(of: "_", with: "/")
    while base64.count % 4 != 0 { base64 += "=" }
    guard let data = Data(base64Encoded: base64),
      let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
      let username = json["preferred_username"] as? String
    else { return nil }
    return AccessTokenClaims(username: username, client: json["azp"] as? String)
  }
}

/// Sends a form to a URL and returns the status and body. A protocol so the
/// poller can be tested against a script of answers.
public protocol FormTransport: Sendable {
  func post(_ url: URL, form: [String: String]) async throws -> (status: Int, body: Data)
}

/// The phone's half of RFC 8628: poll until the patient approves.
public enum DeviceGrant {

  public enum Failure: Error, Equatable, Sendable {
    /// The patient pressed No on the consent page.
    case denied
    /// Two minutes passed without an approval.
    case expired
    /// Anything else Keycloak said, by its error code.
    case keycloak(String)
  }

  /// Polls Keycloak's token endpoint until it answers with a token or an error
  /// that ends the grant.
  ///
  /// - `authorization_pending`: wait the interval and ask again.
  /// - `slow_down`: the interval grows by five seconds, as the RFC says.
  /// - `access_denied`, `expired_token`: stop, and say which.
  public static func poll(
    _ link: ConnectLink, transport: any FormTransport,
    now: @Sendable () -> Date = { Date() },
    sleep: @Sendable (Int) async throws -> Void = { try await Task.sleep(for: .seconds($0)) }
  ) async throws -> TokenSet {
    var interval = link.interval
    while true {
      guard now() < link.expires else { throw Failure.expired }
      let (status, body) = try await transport.post(
        link.tokenEndpoint,
        form: [
          "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
          "client_id": link.clientID,
          "device_code": link.deviceCode,
        ])
      let json = (try? JSONSerialization.jsonObject(with: body) as? [String: Any]) ?? [:]
      if status == 200, let tokens = TokenSet.from(json: json, now: now()) {
        return tokens
      }
      switch json["error"] as? String ?? "http-\(status)" {
      case "authorization_pending": break
      case "slow_down": interval += 5
      case "access_denied": throw Failure.denied
      case "expired_token": throw Failure.expired
      case let other: throw Failure.keycloak(other)
      }
      try await sleep(interval)
    }
  }
}

/// One measurement from the patient's record on the hub.
public struct DataspaceObservation: Sendable, Equatable, Identifiable {
  public let id: String
  public let loinc: String
  public let display: String
  public let value: Double
  public let unit: String
  public let effective: Date?
  /// The range as the laboratory printed it, or rebuilt from its bounds.
  public let range: String?
  /// `preliminary` for a value the app sent (#473 phase 3); the synthetic
  /// record's values are `final`.
  public var preliminary: Bool = false
  /// Where a value the app sent came from: `ocr-transcribed`, `self-tracked`.
  public var sourceKind: String? = nil
}

/// The record the hub returns: a FHIR R4 searchset Bundle of Observations.
public struct DataspaceRecord: Sendable, Equatable {
  public let observations: [DataspaceObservation]
  /// True when the Bundle carries the hub's `fictional` tag: every record on
  /// the demo hub is synthetic, and the screen must say so.
  public let fictional: Bool
  /// True for the record of an account the app created: the person's own.
  public var sandbox: Bool = false

  public static func parse(_ data: Data) -> DataspaceRecord? {
    guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
      json["resourceType"] as? String == "Bundle"
    else { return nil }
    let tags = ((json["meta"] as? [String: Any])?["tag"] as? [[String: Any]]) ?? []
    let fictional = tags.contains { ($0["code"] as? String) == "fictional" }
    let sandbox = tags.contains { ($0["code"] as? String) == "sandbox" }
    let iso = ISO8601DateFormatter()
    let day = DateFormatter()
    day.calendar = Calendar(identifier: .iso8601)
    day.dateFormat = "yyyy-MM-dd"
    let observations = ((json["entry"] as? [[String: Any]]) ?? []).compactMap {
      entry -> DataspaceObservation? in
      guard let r = entry["resource"] as? [String: Any],
        r["resourceType"] as? String == "Observation",
        let quantity = r["valueQuantity"] as? [String: Any],
        let value = (quantity["value"] as? NSNumber)?.doubleValue
      else { return nil }
      let code = (r["code"] as? [String: Any]) ?? [:]
      let coding = (code["coding"] as? [[String: Any]])?.first ?? [:]
      let effectiveText = r["effectiveDateTime"] as? String ?? ""
      let range = (r["referenceRange"] as? [[String: Any]])?.first
      let rangeText: String? = {
        guard let range else { return nil }
        if let text = range["text"] as? String, !text.isEmpty { return text }
        let low = ((range["low"] as? [String: Any])?["value"] as? NSNumber)?.doubleValue
        let high = ((range["high"] as? [String: Any])?["value"] as? NSNumber)?.doubleValue
        return PrintedReference.text(printed: nil, low: low, high: high) { String(format: "%g", $0) }
      }()
      let source = ((r["extension"] as? [[String: Any]]) ?? []).first {
        ($0["url"] as? String)?.hasSuffix("/epa-ingest-source-kind") == true
      }
      return DataspaceObservation(
        id: r["id"] as? String ?? UUID().uuidString,
        loinc: coding["code"] as? String ?? "",
        display: code["text"] as? String ?? coding["display"] as? String ?? "",
        value: value, unit: quantity["unit"] as? String ?? "",
        effective: iso.date(from: effectiveText) ?? day.date(from: String(effectiveText.prefix(10))),
        range: rangeText,
        preliminary: r["status"] as? String == "preliminary",
        sourceKind: source?["valueCode"] as? String)
    }
    return DataspaceRecord(observations: observations, fictional: fictional, sandbox: sandbox)
  }
}
