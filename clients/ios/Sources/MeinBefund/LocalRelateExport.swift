import CryptoKit
import Foundation
import Network
import Shared
import UIKit

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
  /// Send over USB cable: where it stands.
  @Published private(set) var usb: USBTransfer = .off
  private var usbListeners: [NWListener] = []
  /// Background time while waiting or sending, so switching to another app
  /// (or the screen locking) right after tapping does not end the transfer.
  private var usbBackground: UIBackgroundTaskIdentifier = .invalid

  enum USBTransfer: Equatable {
    case off, waiting, sending
    case done(String)
    case failed(String)
  }

  // Demo and dev-data launches pair and send under their own keys. Sharing
  // the real ones sent fictional reports and weekly means to a real Mac
  // (Nov 12, 2026): a Simulator paired with the person's own receiver
  // exported its demo data there on the next demo launch.
  private static var demo: String {
    #if DEBUG
      DemoSeed.isRequested ? ".demo" : ""
    #else
      ""
    #endif
  }
  private static var linkTag: String { "red.mabu.meinbefund.relate.link" + demo }
  private static var sentTag: String { "red.mabu.meinbefund.relate.sent" + demo }
  private static var reportsTag: String { "red.mabu.meinbefund.relate.sendsReports" + demo }
  private static var wearablesTag: String { "red.mabu.meinbefund.relate.sendsWearables" + demo }

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
      remember(candidate)
      notice = String(localized: "Paired with \(candidate.name). Your values go to \(candidate.store) on that Mac only.")
    } catch let error as URLError where error.code != .cancelled {
      // Not reachable over Wi-Fi (another network, or only a cable between
      // them): the code came from the Mac's own screen, so keep it; sending
      // over the USB cable needs only the token. A wrong certificate
      // (`.cancelled`) is still refused.
      remember(candidate)
      notice = String(localized: "Paired with \(candidate.name). It cannot be reached over Wi-Fi right now; you can send over a USB cable instead.")
    } catch {
      notice = Self.explain(error)
    }
  }

  private func remember(_ candidate: LocalRelateLink) {
    link = candidate
    if let data = try? JSONEncoder().encode(candidate) { Keychain.set(data, for: Self.linkTag) }
    // A new Mac starts empty: send everything again.
    UserDefaults.standard.removeObject(forKey: Self.sentTag)
  }

  func forget() {
    stopUSB()
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
    // One quick look first: off the Mac's Wi-Fi, every report would wait for
    // its own timeout, and the screen stayed busy for minutes.
    guard await reachable(link) else {
      lastResult = String(localized: "\(link.name) cannot be reached over Wi-Fi right now. Nothing was sent; you can send over a USB cable instead.")
      return
    }
    var sent = (UserDefaults.standard.dictionary(forKey: Self.sentTag) as? [String: String]) ?? [:]
    var reportsSent = 0
    var values = 0
    var failed: [String] = []
    // Unlike the EHDS sync, a report with only uncoded values goes too: the
    // Mac is the person's own copy of everything the paper said.
    for report in reports
    where !(report.extraction.coded.isEmpty && report.extraction.unmapped.isEmpty) {
      let key = report.id.uuidString.lowercased()
      let print = LocalGraphExport.fingerprint(
        coded: EHDSConnection.fingerprint(report), unmapped: report.extraction.unmapped)
      guard all || sent[key] != print else { continue }
      do {
        let (status, body) = try await request(
          "POST", link.recordEndpoint, link: link,
          body: LocalGraphExport.bundle(
            fhirJSON: Data(ReportExport.fhirJSON(report).utf8),
            unmapped: report.extraction.unmapped),
          headers: ["X-Klarbefund-Report": key])
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
    guard await reachable(link) else { return }
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

  /// The receiver answers within a few seconds (over Wi-Fi).
  private func reachable(_ link: LocalRelateLink) async -> Bool {
    guard let (status, _) = try? await request("GET", link.statusEndpoint, link: link, timeout: 4) else {
      return false
    }
    return status == 200
  }

  func refreshStatus() async {
    guard let link else { return }
    if let (status, body) = try? await request("GET", link.statusEndpoint, link: link), status == 200,
      let json = try? JSONSerialization.jsonObject(with: body) as? [String: Any]
    {
      macObservations = json["observations"] as? Int
    }
  }

  // MARK: - Send over USB cable

  /// The port the Mac's `health-graph usb` connects to through usbmuxd.
  static let usbPort: UInt16 = 8788

  /// Waits on the phone's loopback (reachable from the Mac only through the
  /// USB cable, never over Wi-Fi) for the paired Mac. The Mac sends the
  /// pairing token first; only then do every report and, if the person sends
  /// them, the Apple Health weekly means go out, as the same bundles Wi-Fi
  /// sends. One Mac, one transfer, then the port closes.
  func startUSB(_ reports: [LabReport]) async {
    usbLog("USB: start (paired: \(link != nil), listening: \(!usbListeners.isEmpty))")
    guard let link, usbListeners.isEmpty else { return }
    // Listen at once and gather the data meanwhile: reading a year of Apple
    // Health takes a while on a real phone, and the screen should say
    // "Waiting for the Mac" from the tap on, not look dead.
    let wearables = sendsWearables
    let frames = Task { @MainActor () -> [Data] in
      var frames: [Data] = []
      for report in reports
      where !(report.extraction.coded.isEmpty && report.extraction.unmapped.isEmpty) {
        let bundle = LocalGraphExport.bundle(
          fhirJSON: Data(ReportExport.fhirJSON(report).utf8), unmapped: report.extraction.unmapped)
        let key = report.id.uuidString.lowercased()
        frames.append(Data(#"{"type":"record","report":"\#(key)","bundle":"#.utf8) + bundle + Data("}".utf8))
      }
      if wearables, let series = await Self.weeklySeries(reportDates: reports.map(\.effectiveDate)) {
        frames.append(Data(#"{"type":"wearables","bundle":"#.utf8) + WearableFHIR.json(series) + Data("}".utf8))
      }
      frames.append(Data(#"{"type":"end"}"#.utf8))
      usbLog("USB: \(frames.count) frames ready")
      return frames
    }
    listen(token: link.token, name: link.name, frames: frames)
  }

  /// The weekly means, or nil if HealthKit has none or takes longer than 45 s.
  private static func weeklySeries(reportDates: [Date]) async -> [WearableSeries]? {
    let period = WearableSeries.period(reportDates: reportDates)
    let once = Once()
    return await withCheckedContinuation { (done: CheckedContinuation<[WearableSeries]?, Never>) in
      Task { @MainActor in
        var series: [WearableSeries]?
        do { series = try await WearableSources.current.series(in: period) } catch { series = nil }
        if once.claim() { done.resume(returning: series?.isEmpty == false ? series : nil) }
      }
      Task {
        try? await Task.sleep(for: .seconds(45))
        if once.claim() { done.resume(returning: nil) }
      }
    }
  }

  #if DEBUG
    /// `-MBUSBSelfTest`: listen at launch with a fixed test token and no data,
    /// so `health-graph usb --test-token` can check the cable path on a real
    /// phone without a person's values or a tap.
    static let usbSelfTestToken = "usb-self-test-token-0000000000000000"
    func startUSBSelfTest() {
      guard ProcessInfo.processInfo.arguments.contains("-MBUSBSelfTest"), usbListeners.isEmpty else { return }
      usbLog("USB self-test: listening")
      listen(token: Self.usbSelfTestToken, name: "self-test", frames: Task { [Data(#"{"type":"end"}"#.utf8)] })
    }
  #endif

  private func listen(token: String, name: String, frames payload: Task<[Data], Never>) {
    // Loopback only, both families: usbmux on the phone may connect over
    // IPv4 or IPv6, and nothing on the Wi-Fi can reach either address.
    guard let port = NWEndpoint.Port(rawValue: Self.usbPort) else { return }
    var failures: [String] = []
    for host in ["127.0.0.1", "::1"] {
      let parameters = NWParameters.tcp
      parameters.requiredLocalEndpoint = .hostPort(host: NWEndpoint.Host(host), port: port)
      parameters.allowLocalEndpointReuse = true
      do {
        let listener = try NWListener(using: parameters)
        listener.newConnectionHandler = { [weak self] connection in
          Task { @MainActor in await self?.serveUSB(connection, token: token, frames: payload, name: name) }
        }
        listener.stateUpdateHandler = { [weak self] state in
          usbLog("USB listener \(host): \(state)")
          guard case .failed(let error) = state else { return }
          Task { @MainActor in self?.listenerFailed(listener, error) }
        }
        listener.start(queue: .main)
        usbListeners.append(listener)
      } catch {
        usbLog("USB listener \(host): \(error)")
        failures.append(error.localizedDescription)
      }
    }
    if usbListeners.isEmpty {
      finishUSB(.failed(failures.joined(separator: "; ")))
    } else {
      usb = .waiting
      usbBackground = UIApplication.shared.beginBackgroundTask(withName: "Send over USB") { [weak self] in
        Task { @MainActor in self?.stopUSB() }
      }
    }
  }

  /// One family failing (a phone without IPv6 loopback, say) is fine while the other listens.
  private func listenerFailed(_ listener: NWListener, _ error: NWError) {
    listener.cancel()
    usbListeners.removeAll { $0 === listener }
    if usbListeners.isEmpty, usb == .waiting { usb = .failed(error.localizedDescription) }
  }

  func stopUSB() {
    usbListeners.forEach { $0.cancel() }
    usbListeners = []
    endUSBBackground()
    if usb == .waiting || usb == .sending { usb = .off }
  }

  private func endUSBBackground() {
    guard usbBackground != .invalid else { return }
    UIApplication.shared.endBackgroundTask(usbBackground)
    usbBackground = .invalid
  }

  private func finishUSB(_ outcome: USBTransfer) {
    usbListeners.forEach { $0.cancel() }
    usbListeners = []
    endUSBBackground()
    usb = outcome
  }

  private func serveUSB(
    _ connection: NWConnection, token: String, frames: Task<[Data], Never>, name: String
  ) async {
    usbLog("USB: connection from \(connection.endpoint)")
    guard usb == .waiting else {  // one Mac, one transfer
      connection.cancel()
      return
    }
    usb = .sending
    let channel = FrameChannel(connection)
    defer { connection.cancel() }
    do {
      try await channel.open()
      let hello = (try? JSONSerialization.jsonObject(with: await channel.read()) as? [String: Any]) ?? [:]
      guard let given = hello["token"] as? String, Self.sameSecret(given, token) else {
        try? await channel.write(Data(#"{"type":"error","error":"not the paired Mac"}"#.utf8))
        finishUSB(.failed(String(localized: "The Mac on the cable is not the paired one, so nothing was sent.")))
        return
      }
      for frame in await frames.value { try await channel.write(frame) }
      let reply = (try? JSONSerialization.jsonObject(with: await channel.read()) as? [String: Any]) ?? [:]
      let stored = reply["stored"] as? Int ?? 0
      let sent = reply["reports"] as? Int ?? 0
      let weekly = reply["weekly"] as? Int ?? 0
      finishUSB(.done(String(localized: "Sent \(stored) values from \(sent) reports and \(weekly) weekly values over USB to \(name).")))
      await refreshStatus()
    } catch {
      finishUSB(.failed(String(localized: "USB transfer failed: \(error.localizedDescription)")))
    }
  }

  /// Compares secrets without leaking where they differ.
  nonisolated static func sameSecret(_ a: String, _ b: String) -> Bool {
    let x = Array(a.utf8)
    let y = Array(b.utf8)
    var diff = UInt8(x.count == y.count ? 0 : 1)
    for i in 0..<max(x.count, y.count) {
      diff |= (i < x.count ? x[i] : 0) ^ (i < y.count ? y[i] : 0)
    }
    return diff == 0
  }

  // MARK: - Transport

  private func request(
    _ method: String, _ url: URL, link: LocalRelateLink, body: Data? = nil,
    headers: [String: String] = [:], timeout: TimeInterval = 20
  ) async throws -> (Int, Data) {
    var request = URLRequest(url: url)
    request.httpMethod = method
    request.timeoutInterval = timeout
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

/// Length-prefixed frames (4-byte big-endian length, then JSON) over one
/// accepted connection, as `health-graph usb` speaks them.
final class FrameChannel: @unchecked Sendable {
  private let connection: NWConnection
  private let queue = DispatchQueue(label: "red.mabu.meinbefund.usb")
  static let maxFrame = 10 * 1024 * 1024

  init(_ connection: NWConnection) { self.connection = connection }

  func open() async throws {
    try await withCheckedThrowingContinuation { (done: CheckedContinuation<Void, Error>) in
      connection.stateUpdateHandler = { [connection] state in
        switch state {
        case .ready:
          connection.stateUpdateHandler = nil
          done.resume()
        case .failed(let error), .waiting(let error):
          connection.stateUpdateHandler = nil
          done.resume(throwing: error)
        case .cancelled:
          connection.stateUpdateHandler = nil
          done.resume(throwing: CancellationError())
        default:
          break
        }
      }
      connection.start(queue: queue)
    }
  }

  func write(_ body: Data) async throws {
    var length = UInt32(body.count).bigEndian
    let frame = Data(bytes: &length, count: 4) + body
    try await withCheckedThrowingContinuation { (done: CheckedContinuation<Void, Error>) in
      connection.send(
        content: frame,
        completion: .contentProcessed { error in
          if let error { done.resume(throwing: error) } else { done.resume() }
        })
    }
  }

  func read() async throws -> Data {
    let header = try await exactly(4)
    let length = Int(header.withUnsafeBytes { $0.loadUnaligned(as: UInt32.self).bigEndian })
    guard length > 0, length <= Self.maxFrame else { throw URLError(.cannotParseResponse) }
    return try await exactly(length)
  }

  private func exactly(_ count: Int) async throws -> Data {
    try await withCheckedThrowingContinuation { (done: CheckedContinuation<Data, Error>) in
      connection.receive(minimumIncompleteLength: count, maximumLength: count) { data, _, _, error in
        if let error {
          done.resume(throwing: error)
        } else if let data, data.count == count {
          done.resume(returning: data)
        } else {
          done.resume(throwing: URLError(.networkConnectionLost))
        }
      }
    }
  }
}

/// True for the first caller only: lets two racing tasks resume one continuation.
private final class Once: @unchecked Sendable {
  private let lock = NSLock()
  private var claimed = false
  func claim() -> Bool {
    lock.lock()
    defer { lock.unlock() }
    if claimed { return false }
    claimed = true
    return true
  }
}

/// USB transfer states for the debug console (`devicectl ... --console`):
/// listener states, the connecting address and frame counts, never values.
func usbLog(_ line: @autoclosure () -> String) {
  #if DEBUG
    print(line())
  #endif
}
