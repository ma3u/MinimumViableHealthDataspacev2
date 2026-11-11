import CryptoKit
import Foundation
import Shared

/// "Export to my Mac (Relate)": the person's reports and Apple Health weekly
/// means go into a local Relate graph on their own Mac, over their own Wi-Fi.
///
/// The Mac's receiver shows a QR code (`klarbefund://relate`). Pairing stores
/// that link in the Keychain (`ThisDeviceOnly`, like the EHDS tokens). Every
/// request goes over a URLSession that accepts exactly the certificate whose
/// SHA-256 the QR code named, so nothing reaches another machine, even on a
/// shared network. Like the EHDS sync, a report is sent again only when its
/// values changed, and the receiver replaces a report rather than adding to it.
@MainActor
final class LocalRelateExport: ObservableObject {
  @Published private(set) var link: LocalRelateLink?
  /// How many values the Mac's graph holds, from the last check.
  @Published private(set) var macObservations: Int?
  @Published private(set) var busy = false
  @Published private(set) var lastResult: String?
  @Published var notice: String?
  /// The person's decisions, apart from EHDS: reports, and device trends.
  @Published private(set) var sendsReports = false
  @Published private(set) var sendsWearables = false

  private static let linkTag = "red.mabu.meinbefund.relate.link"
  private static let sentTag = "red.mabu.meinbefund.relate.sent"
  private static let reportsTag = "red.mabu.meinbefund.relate.sendsReports"
  private static let wearablesTag = "red.mabu.meinbefund.relate.sendsWearables"

  init() {
    if let data = Keychain.get(Self.linkTag),
      let stored = try? JSONDecoder().decode(LocalRelateLink.self, from: data)
    {
      link = stored
    }
    sendsReports = UserDefaults.standard.bool(forKey: Self.reportsTag)
    sendsWearables = UserDefaults.standard.bool(forKey: Self.wearablesTag)
  }

  var isPaired: Bool { link != nil }

  // MARK: - Pairing

  /// From a scanned, tapped or pasted `klarbefund://relate` link.
  func pair(with text: String) async {
    notice = nil
    let candidate: LocalRelateLink
    do {
      candidate = try LocalRelateLink.parse(text)
    } catch {
      notice = Self.explain(error)
      return
    }
    busy = true
    defer { busy = false }
    do {
      let (status, body) = try await request("GET", candidate.statusEndpoint, link: candidate)
      guard status == 200 else { throw ReceiverError(status: status, body: body) }
      let json = (try? JSONSerialization.jsonObject(with: body) as? [String: Any]) ?? [:]
      macObservations = json["observations"] as? Int
      link = candidate
      if let data = try? JSONEncoder().encode(candidate) { Keychain.set(data, for: Self.linkTag) }
      // A new Mac starts empty: send everything again.
      UserDefaults.standard.removeObject(forKey: Self.sentTag)
      notice = String(localized: "Paired with \(candidate.name). Your values go to \(candidate.store) on that Mac only.")
    } catch {
      notice = Self.explain(error)
    }
  }

  func forget() {
    link = nil
    macObservations = nil
    lastResult = nil
    Keychain.delete(Self.linkTag)
    UserDefaults.standard.removeObject(forKey: Self.sentTag)
    setSendsReports(false)
    setSendsWearables(false)
  }

  func setSendsReports(_ on: Bool) {
    sendsReports = on
    UserDefaults.standard.set(on, forKey: Self.reportsTag)
  }

  func setSendsWearables(_ on: Bool) {
    sendsWearables = on
    UserDefaults.standard.set(on, forKey: Self.wearablesTag)
  }

  // MARK: - Export

  /// Sends each report whose values changed since it was last sent to this
  /// Mac; `all` sends every report again (safe: the receiver replaces).
  func export(_ reports: [LabReport], all: Bool = false) async {
    guard let link, sendsReports || all else { return }
    busy = true
    defer { busy = false }
    var sent = (UserDefaults.standard.dictionary(forKey: Self.sentTag) as? [String: String]) ?? [:]
    var reportsSent = 0
    var values = 0
    var failed: [String] = []
    for report in reports where !report.extraction.coded.isEmpty {
      let key = report.id.uuidString.lowercased()
      let print = EHDSConnection.fingerprint(report)
      guard all || sent[key] != print else { continue }
      do {
        let (status, body) = try await request(
          "POST", link.recordEndpoint, link: link,
          body: Data(ReportExport.fhirJSON(report).utf8), headers: ["X-Klarbefund-Report": key])
        guard status == 201 else { throw ReceiverError(status: status, body: body) }
        let json = (try? JSONSerialization.jsonObject(with: body) as? [String: Any]) ?? [:]
        values += (json["stored"] as? Int) ?? 0
        sent[key] = print
        reportsSent += 1
        UserDefaults.standard.set(sent, forKey: Self.sentTag)
      } catch {
        failed.append("\(report.title): \(Self.explain(error))")
      }
    }
    var lines: [String] = []
    if reportsSent > 0 || all {
      lines.append(String(localized: "Sent \(values) values from \(reportsSent) reports to \(link.name)."))
    }
    if !failed.isEmpty {
      lines.append(String(localized: "Not sent (\(failed.count)): \(failed.joined(separator: "; "))"))
    }
    if !lines.isEmpty { lastResult = lines.joined(separator: "\n") }
    await refreshStatus()
  }

  /// The same weekly means the Trends screen draws, as the EHDS sync sends them.
  func exportWearables(reportDates: [Date], force: Bool = false) async {
    guard let link, sendsWearables || force else { return }
    busy = true
    defer { busy = false }
    do {
      let period = WearableSeries.period(reportDates: reportDates)
      let series = try await WearableSources.current.series(in: period)
      let (status, body) = try await request(
        "POST", link.wearablesEndpoint, link: link, body: WearableFHIR.json(series))
      guard status == 201 else { throw ReceiverError(status: status, body: body) }
      let json = (try? JSONSerialization.jsonObject(with: body) as? [String: Any]) ?? [:]
      lastResult = String(
        localized: "Sent \((json["stored"] as? Int) ?? 0) weekly values from \(series.count) device trends to \(link.name).")
    } catch {
      lastResult = String(localized: "Device trends not sent: \(Self.explain(error))")
    }
    await refreshStatus()
  }

  func refreshStatus() async {
    guard let link else { return }
    if let (status, body) = try? await request("GET", link.statusEndpoint, link: link), status == 200,
      let json = try? JSONSerialization.jsonObject(with: body) as? [String: Any]
    {
      macObservations = json["observations"] as? Int
    }
  }

  // MARK: - Transport

  private func request(
    _ method: String, _ url: URL, link: LocalRelateLink, body: Data? = nil,
    headers: [String: String] = [:]
  ) async throws -> (Int, Data) {
    var request = URLRequest(url: url)
    request.httpMethod = method
    request.timeoutInterval = 20
    request.setValue("Bearer \(link.token)", forHTTPHeaderField: "Authorization")
    request.setValue(EHDSConnection.deviceId(), forHTTPHeaderField: "X-Klarbefund-Device")
    if let body {
      request.setValue("application/fhir+json", forHTTPHeaderField: "Content-Type")
      request.httpBody = body
    }
    for (name, value) in headers { request.setValue(value, forHTTPHeaderField: name) }
    let pin = PinnedCertificate(fingerprint: link.fingerprint)
    let session = URLSession(configuration: .ephemeral, delegate: pin, delegateQueue: nil)
    defer { session.finishTasksAndInvalidate() }
    let (data, response) = try await session.data(for: request)
    return ((response as? HTTPURLResponse)?.statusCode ?? 0, data)
  }

  static func explain(_ error: Error) -> String {
    switch error {
    case LocalRelateLink.Problem.notARelateLink:
      return String(localized: "That is not a Relate pairing code. On the Mac, run the receiver and scan the code it shows.")
    case LocalRelateLink.Problem.notHTTPS:
      return String(localized: "The code asks for an unencrypted connection. Klarbefund only sends over HTTPS.")
    case let LocalRelateLink.Problem.notLocal(host):
      return String(localized: "\(host) is not on your own network. Klarbefund only exports to a Mac on your Wi-Fi.")
    case LocalRelateLink.Problem.badFingerprint, LocalRelateLink.Problem.weakToken,
      LocalRelateLink.Problem.missing:
      return String(localized: "The code is incomplete. Show it again on the Mac and scan once more.")
    case let e as ReceiverError where e.status == 401:
      return String(localized: "The Mac no longer knows this phone. Scan its code again.")
    case let e as ReceiverError:
      return String(localized: "The Mac answered \(e.status).")
    case let e as URLError where e.code == .cancelled:
      return String(localized: "The Mac's certificate is not the one in the code, so nothing was sent.")
    case let e as URLError:
      return String(localized: "The Mac cannot be reached (\(e.code.rawValue)). Is the receiver running, and is the phone on the same Wi-Fi?")
    default:
      return error.localizedDescription
    }
  }
}

struct ReceiverError: Error {
  let status: Int
  let body: Data
}

/// Accepts the server only when its leaf certificate has the pinned SHA-256.
final class PinnedCertificate: NSObject, URLSessionDelegate, Sendable {
  let fingerprint: String
  init(fingerprint: String) { self.fingerprint = fingerprint }

  func urlSession(
    _ session: URLSession, didReceive challenge: URLAuthenticationChallenge
  ) async -> (URLSession.AuthChallengeDisposition, URLCredential?) {
    guard challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust,
      let trust = challenge.protectionSpace.serverTrust,
      let chain = SecTrustCopyCertificateChain(trust) as? [SecCertificate],
      let leaf = chain.first,
      CertificatePin.matches(der: SecCertificateCopyData(leaf) as Data, fingerprint: fingerprint)
    else { return (.cancelAuthenticationChallenge, nil) }
    return (.useCredential, URLCredential(trust: trust))
  }
}
