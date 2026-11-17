import CryptoKit
import Foundation

/// Exporting to a local Relate graph on the person's own Mac (Relate by Neo4j
/// hackathon, Nov 2026).
///
/// The Mac runs `python -m health_graph receive --db health.rl` from
/// github.com/ma3u/relate-hackathon-team. It shows a QR code with a
/// `klarbefund://relate` link: where the receiver listens on the home network,
/// a bearer token, and the SHA-256 fingerprint of the receiver's self-signed
/// certificate. The phone pins that fingerprint, so its reports go to that one
/// Mac and nowhere else, encrypted, without any cloud in between.
///
/// Like `EHDSConnect.swift`, this file is free of UIKit and the network, so
/// what a link must say to be trusted is tested here.
public struct LocalRelateLink: Codable, Sendable, Equatable {
  /// Base URL of the receiver, always https on a private address.
  public let url: URL
  public let token: String
  /// Lower-case hex SHA-256 of the receiver certificate's DER bytes.
  public let fingerprint: String
  /// The Mac's name, to show the person where their values go.
  public let name: String
  /// The store file on the Mac, e.g. `health.rl`.
  public let store: String

  public enum Problem: Error, Equatable, Sendable {
    /// Not a `klarbefund://relate` link.
    case notARelateLink
    case missing(String)
    /// Only https: health values never cross the network in clear text.
    case notHTTPS
    /// Only the person's own network: a private, loopback or `.local` address.
    case notLocal(String)
    case badFingerprint
    case weakToken
  }

  public init(url: URL, token: String, fingerprint: String, name: String, store: String) {
    self.url = url
    self.token = token
    self.fingerprint = fingerprint
    self.name = name
    self.store = store
  }

  /// Reads and checks a link from a QR code, a tap or a paste.
  public static func parse(_ text: String) throws(Problem) -> LocalRelateLink {
    guard let link = URL(string: text.trimmingCharacters(in: .whitespacesAndNewlines)),
      link.scheme == "klarbefund", link.host == "relate",
      let items = URLComponents(url: link, resolvingAgainstBaseURL: false)?.queryItems
    else { throw .notARelateLink }

    func value(_ name: String) throws(Problem) -> String {
      guard let v = items.first(where: { $0.name == name })?.value, !v.isEmpty else {
        throw .missing(name)
      }
      return v
    }

    guard let url = URL(string: try value("url")), let host = url.host else {
      throw .missing("url")
    }
    guard url.scheme == "https" else { throw .notHTTPS }
    guard isLocal(host) else { throw .notLocal(host) }

    let fingerprint = try value("fp").lowercased()
    guard fingerprint.count == 64, fingerprint.allSatisfy(\.isHexDigit) else {
      throw .badFingerprint
    }
    let token = try value("token")
    guard token.count >= 32 else { throw .weakToken }

    return LocalRelateLink(
      url: url, token: token, fingerprint: fingerprint,
      name: items.first(where: { $0.name == "name" })?.value ?? host,
      store: items.first(where: { $0.name == "store" })?.value ?? "health.rl")
  }

  /// A private IPv4 range, loopback, an IPv6 unique-local or link-local
  /// address, or a Bonjour `.local` name.
  public static func isLocal(_ host: String) -> Bool {
    let h = host.lowercased().trimmingCharacters(in: CharacterSet(charactersIn: "[]"))
    if h == "localhost" || h.hasSuffix(".local") { return true }
    let parts = h.split(separator: ".").compactMap { Int($0) }
    if parts.count == 4, parts.allSatisfy({ (0...255).contains($0) }) {
      switch (parts[0], parts[1]) {
      case (10, _), (127, _), (192, 168), (169, 254): return true
      case (172, let b) where (16...31).contains(b): return true
      default: return false
      }
    }
    if h.contains(":") {
      return h == "::1" || h.hasPrefix("fc") || h.hasPrefix("fd") || h.hasPrefix("fe80")
    }
    return false
  }

  public var recordEndpoint: URL { url.appendingPathComponent("v1/record") }
  public var wearablesEndpoint: URL { url.appendingPathComponent("v1/wearables") }
  public var statusEndpoint: URL { url.appendingPathComponent("v1/status") }
}

/// The pin: does this certificate (DER bytes) carry the fingerprint the QR
/// code promised?
public enum CertificatePin {
  public static func fingerprint(of der: Data) -> String {
    SHA256.hash(data: der).map { String(format: "%02x", $0) }.joined()
  }

  public static func matches(der: Data, fingerprint expected: String) -> Bool {
    fingerprint(of: der) == expected.lowercased()
  }
}
