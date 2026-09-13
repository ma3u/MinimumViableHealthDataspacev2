import AuthenticationServices
import CryptoKit
import Foundation
import UIKit

/// Signs the user in against any OIDC provider, with PKCE and no client secret.
///
/// ## Why a web flow rather than Sign in with Apple
///
/// Sign in with Apple would be the obvious choice and needs the
/// `com.apple.developer.applesignin` entitlement, which needs the capability
/// enabled on the App ID in the developer portal. This build already ships
/// without `default-data-protection` for exactly that reason: the Apple
/// Developer sign-in Xcode holds is currently rejected, so no capability can be
/// added. A second blocked entitlement would put the whole feature behind the
/// same door.
///
/// `ASWebAuthenticationSession` needs no entitlement, works against Keycloak,
/// Apple's own OIDC endpoints or anything else standards-compliant, and keeps
/// the choice of provider a matter of configuration rather than of code.
///
/// ## Why PKCE and no secret
///
/// The app is a public client. It cannot keep a secret: the binary can be read
/// and the traffic belongs to whoever owns the phone. PKCE is what makes an
/// authorization code useless to anyone who intercepts it, and it is the reason
/// this flow is safe without one.
@MainActor
final class OIDCSession: NSObject, ObservableObject {

  struct Configuration: Sendable {
    let issuer: URL
    let clientID: String
    /// Custom scheme the provider redirects back to, e.g. `meinbefund`.
    let redirectScheme: String

    /// Read from the Info.plist so a build can be pointed at a different
    /// provider without a code change.
    static func fromBundle(_ bundle: Bundle = .main) -> Configuration? {
      guard
        let issuer = (bundle.object(forInfoDictionaryKey: "MBOIDCIssuer") as? String)
          .flatMap(URL.init(string:)),
        let clientID = bundle.object(forInfoDictionaryKey: "MBOIDCClientID") as? String,
        let scheme = bundle.object(forInfoDictionaryKey: "MBOIDCRedirectScheme") as? String,
        !clientID.isEmpty, !scheme.isEmpty
      else { return nil }
      return Configuration(issuer: issuer, clientID: clientID, redirectScheme: scheme)
    }
  }

  enum SignInError: LocalizedError {
    case notConfigured
    case discoveryFailed(String)
    case cancelled
    case noIdentityToken
    case tokenExchangeFailed(String)

    var errorDescription: String? {
      switch self {
      case .notConfigured:
        return "Kein Anmeldedienst konfiguriert."
      case let .discoveryFailed(detail):
        return "Anmeldedienst nicht erreichbar: \(detail)"
      case .cancelled:
        return "Anmeldung abgebrochen."
      case .noIdentityToken:
        return "Der Anmeldedienst hat kein ID-Token ausgestellt."
      case let .tokenExchangeFailed(detail):
        return "Anmeldung fehlgeschlagen: \(detail)"
      }
    }
  }

  @Published private(set) var signedIn = false

  private var identityToken: String?
  private var expiresAt: Date?
  private var session: ASWebAuthenticationSession?

  /// A token that is valid now, or nil if the user must sign in again.
  ///
  /// ID tokens are short-lived by design and there is no refresh token kept: a
  /// refresh token is a long-lived credential on a device we have already
  /// decided cannot hold one. Re-authenticating costs the user a tap and
  /// removes a class of theft entirely.
  func currentIdentityToken() -> String? {
    guard let identityToken, let expiresAt, expiresAt > Date().addingTimeInterval(30) else {
      return nil
    }
    return identityToken
  }

  func signIn(configuration: Configuration) async throws {
    let metadata = try await discover(configuration.issuer)

    let verifier = Self.randomURLSafeString(bytes: 64)
    let challenge = Data(SHA256.hash(data: Data(verifier.utf8))).base64URLEncodedString()
    let state = Self.randomURLSafeString(bytes: 32)
    let redirectURI = "\(configuration.redirectScheme)://oidc-callback"

    var components = URLComponents(url: metadata.authorization, resolvingAgainstBaseURL: false)!
    components.queryItems = [
      URLQueryItem(name: "response_type", value: "code"),
      URLQueryItem(name: "client_id", value: configuration.clientID),
      URLQueryItem(name: "redirect_uri", value: redirectURI),
      URLQueryItem(name: "scope", value: "openid"),
      URLQueryItem(name: "state", value: state),
      URLQueryItem(name: "code_challenge", value: challenge),
      URLQueryItem(name: "code_challenge_method", value: "S256"),
    ]

    let callback = try await authenticate(
      url: components.url!, scheme: configuration.redirectScheme)

    let returned = URLComponents(url: callback, resolvingAgainstBaseURL: false)
    guard returned?.queryItems?.first(where: { $0.name == "state" })?.value == state else {
      // A mismatched state means the response is not the one this flow started.
      throw SignInError.tokenExchangeFailed("state mismatch")
    }
    guard let code = returned?.queryItems?.first(where: { $0.name == "code" })?.value else {
      throw SignInError.cancelled
    }

    try await exchange(
      code: code, verifier: verifier, redirectURI: redirectURI,
      configuration: configuration, tokenEndpoint: metadata.token)
  }

  func signOut() {
    identityToken = nil
    expiresAt = nil
    signedIn = false
  }

  // MARK: - Steps

  private struct Metadata {
    let authorization: URL
    let token: URL
  }

  private func discover(_ issuer: URL) async throws -> Metadata {
    let url = issuer.appendingPathComponent(".well-known/openid-configuration")
    do {
      let (data, response) = try await URLSession.shared.data(from: url)
      guard (response as? HTTPURLResponse)?.statusCode == 200 else {
        throw SignInError.discoveryFailed("HTTP \((response as? HTTPURLResponse)?.statusCode ?? 0)")
      }
      let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
      guard
        let authorization = (json?["authorization_endpoint"] as? String).flatMap(URL.init(string:)),
        let token = (json?["token_endpoint"] as? String).flatMap(URL.init(string:))
      else { throw SignInError.discoveryFailed("incomplete metadata") }
      return Metadata(authorization: authorization, token: token)
    } catch let error as SignInError {
      throw error
    } catch {
      throw SignInError.discoveryFailed(error.localizedDescription)
    }
  }

  private func authenticate(url: URL, scheme: String) async throws -> URL {
    try await withCheckedThrowingContinuation { continuation in
      let session = ASWebAuthenticationSession(url: url, callbackURLScheme: scheme) { callback, error in
        if let callback {
          continuation.resume(returning: callback)
        } else if let error = error as? ASWebAuthenticationSessionError,
          error.code == .canceledLogin
        {
          continuation.resume(throwing: SignInError.cancelled)
        } else {
          continuation.resume(
            throwing: SignInError.tokenExchangeFailed(error?.localizedDescription ?? "unknown"))
        }
      }
      session.presentationContextProvider = self
      // A fresh session every time rather than reusing the browser's cookies, so
      // signing out of the app actually signs the user out.
      session.prefersEphemeralWebBrowserSession = true
      self.session = session
      session.start()
    }
  }

  private func exchange(
    code: String, verifier: String, redirectURI: String,
    configuration: Configuration, tokenEndpoint: URL
  ) async throws {
    var request = URLRequest(url: tokenEndpoint)
    request.httpMethod = "POST"
    request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
    var body = URLComponents()
    body.queryItems = [
      URLQueryItem(name: "grant_type", value: "authorization_code"),
      URLQueryItem(name: "code", value: code),
      URLQueryItem(name: "redirect_uri", value: redirectURI),
      URLQueryItem(name: "client_id", value: configuration.clientID),
      URLQueryItem(name: "code_verifier", value: verifier),
    ]
    request.httpBody = body.percentEncodedQuery.map { Data($0.utf8) }

    let (data, response) = try await URLSession.shared.data(for: request)
    guard (response as? HTTPURLResponse)?.statusCode == 200 else {
      let detail = String(decoding: data.prefix(200), as: UTF8.self)
      throw SignInError.tokenExchangeFailed(detail)
    }

    let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
    guard let idToken = json?["id_token"] as? String else { throw SignInError.noIdentityToken }

    identityToken = idToken
    // Expiry is read from the token rather than from `expires_in`, which
    // describes the access token and can differ.
    expiresAt = Self.expiry(of: idToken) ?? Date().addingTimeInterval(300)
    signedIn = true
  }

  // MARK: - Helpers

  /// Reads `exp` without verifying. Only to decide when to ask the user to sign
  /// in again; the service verifies the signature and we do not.
  static func expiry(of jwt: String) -> Date? {
    let parts = jwt.split(separator: ".")
    guard parts.count >= 2 else { return nil }
    var payload = String(parts[1]).replacingOccurrences(of: "-", with: "+")
      .replacingOccurrences(of: "_", with: "/")
    while payload.count % 4 != 0 { payload += "=" }
    guard let data = Data(base64Encoded: payload),
      let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
      let exp = json["exp"] as? Double
    else { return nil }
    return Date(timeIntervalSince1970: exp)
  }

  static func randomURLSafeString(bytes count: Int) -> String {
    var bytes = [UInt8](repeating: 0, count: count)
    _ = SecRandomCopyBytes(kSecRandomDefault, count, &bytes)
    return Data(bytes).base64URLEncodedString()
  }
}

extension OIDCSession: ASWebAuthenticationPresentationContextProviding {
  nonisolated func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
    MainActor.assumeIsolated {
      UIApplication.shared.connectedScenes
        .compactMap { $0 as? UIWindowScene }
        .flatMap(\.windows)
        .first { $0.isKeyWindow } ?? ASPresentationAnchor()
    }
  }
}

extension Data {
  func base64URLEncodedString() -> String {
    base64EncodedString()
      .replacingOccurrences(of: "+", with: "-")
      .replacingOccurrences(of: "/", with: "_")
      .replacingOccurrences(of: "=", with: "")
  }
}
