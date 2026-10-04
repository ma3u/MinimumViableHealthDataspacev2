import CryptoKit
import Foundation

/// An account on the EHDS hub that the app holds the password of (ADR-054).
///
/// Either one the app created for itself, a sandbox `kb-xxxxxxxx` with an
/// empty record, or one the person signed in with. Kept in the Keychain as
/// `ThisDeviceOnly` and shown to the person, so they can sign in on the
/// website with it too.
public struct EHDSAccount: Codable, Sendable, Equatable {
  public let ehds: String
  public let issuer: String
  /// The Keycloak client the password grant goes to.
  public let client: String
  public let username: String
  public let password: String
  /// True when the app created it, and so may delete it.
  public let createdByApp: Bool

  public init(
    ehds: String, issuer: String, client: String = EHDSAccount.passwordClient,
    username: String, password: String, createdByApp: Bool
  ) {
    self.ehds = ehds
    self.issuer = issuer
    self.client = client
    self.username = username
    self.password = password
    self.createdByApp = createdByApp
  }

  /// The public client that allows the password grant and nothing else.
  public static let passwordClient = "klarbefund-account"

  public var hub: TrustedHub { TrustedHub(ehds: ehds, issuer: issuer) }

  public enum Problem: Error, Equatable, Sendable {
    /// The hub answered without a field the account needs.
    case incomplete
    /// The answer names a hub or issuer the app does not trust.
    case untrustedHub(String)
  }

  /// The hub's answer to `POST /api/app-accounts`, checked against the hubs
  /// the app trusts: an answer naming another issuer is refused, so the
  /// password can never be sent somewhere the person did not choose.
  public static func created(from body: Data, trusted: [TrustedHub]) throws -> EHDSAccount {
    guard let json = try? JSONSerialization.jsonObject(with: body) as? [String: Any],
      let username = json["username"] as? String, !username.isEmpty,
      let password = json["password"] as? String, !password.isEmpty,
      let ehds = json["ehds"] as? String, let issuer = json["issuer"] as? String
    else { throw Problem.incomplete }
    guard trusted.contains(TrustedHub(ehds: ehds, issuer: issuer)) else {
      throw Problem.untrustedHub(URL(string: issuer)?.host ?? issuer)
    }
    return EHDSAccount(
      ehds: ehds, issuer: issuer, client: (json["client"] as? String) ?? passwordClient,
      username: username, password: password, createdByApp: true)
  }

  /// What the attestation signs: the hub's challenge and this phone's device
  /// id, so an attestation can be used for this request and no other.
  public static func clientData(challenge: String, deviceId: String) -> Data {
    Data("\(challenge)|\(deviceId)".utf8)
  }

  /// SHA-256 of `clientData`, which App Attest takes as its client data hash.
  public static func clientDataHash(challenge: String, deviceId: String) -> Data {
    Data(SHA256.hash(data: clientData(challenge: challenge, deviceId: deviceId)))
  }

  /// The form of the password grant.
  public var passwordGrant: [String: String] {
    [
      "grant_type": "password", "client_id": client, "username": username,
      "password": password, "scope": "openid profile",
    ]
  }
}
