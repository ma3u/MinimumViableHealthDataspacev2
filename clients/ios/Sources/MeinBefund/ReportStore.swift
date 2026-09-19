import CryptoKit
import Foundation
import Shared

/// Encrypted local store for scanned reports.
///
/// This is the **primary** store, not a cache. Apple Health has no quantity type
/// for a lipid panel, none exists anywhere, including the US, so the values
/// this app is built for live here permanently (#186).
///
/// Three properties it must keep:
///   - the file is unreadable while the device is locked
///   - the key never leaves this device and never reaches iCloud Keychain
///   - each record is sealed individually, so a leaked file is not a leaked panel
///
/// A report is up to three sealed files under one id: the record, the scanned
/// pages as a PDF, and the scan's diagnostics. Each is sealed on its own, under
/// the same key, so the record can be opened without decrypting megabytes of
/// pages, and a missing attachment is a missing attachment rather than a
/// corrupt report.
public actor ReportStore {

  /// The record type kept its old name at every call site.
  public typealias StoredReport = LabReport

  private enum Attachment: String {
    case scan
    case diagnostics = "diag"
  }

  private let directory: URL
  private let keyTag = "red.mabu.meinbefund.storekey"
  private var cached: [LabReport] = []
  private var loaded = false

  public init(directory: URL? = nil) {
    self.directory =
      directory
      ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        .appendingPathComponent("Reports", isDirectory: true)
  }

  // MARK: - Key custody

  /// Fetches the store key, creating it on first use.
  ///
  /// `kSecAttrAccessibleWhenUnlockedThisDeviceOnly` does two things that matter:
  /// the key is unavailable while the device is locked, and it is excluded from
  /// iCloud Keychain and from a restore onto a different device. A backup that
  /// carries the ciphertext therefore cannot carry the means to read it.
  private func storeKey() throws -> SymmetricKey {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrAccount as String: keyTag,
      kSecReturnData as String: true,
    ]
    var item: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &item)

    if status == errSecSuccess, let data = item as? Data {
      return SymmetricKey(data: data)
    }
    guard status == errSecItemNotFound else { throw StoreError.keychain(status) }

    let key = SymmetricKey(size: .bits256)
    let raw = key.withUnsafeBytes { Data($0) }
    let add: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrAccount as String: keyTag,
      kSecValueData as String: raw,
      kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
    ]
    let addStatus = SecItemAdd(add as CFDictionary, nil)
    guard addStatus == errSecSuccess else { throw StoreError.keychain(addStatus) }
    Log.store.notice("store key created")
    return key
  }

  public enum StoreError: Error, LocalizedError {
    case keychain(OSStatus)
    case corrupt(UUID)

    public var errorDescription: String? {
      switch self {
      case .keychain(let status): return "Keychain error \(status)"
      case .corrupt(let id): return "Report \(id) could not be decrypted"
      }
    }
  }

  // MARK: - Persistence

  private func ensureDirectory() throws {
    try FileManager.default.createDirectory(
      at: directory, withIntermediateDirectories: true,
      attributes: [.protectionKey: FileProtectionType.complete])
    try excludeFromBackup()
  }

  /// Keeps the store out of iCloud Backup.
  ///
  /// `Application Support` is backed up by default, so without this every
  /// sealed report is copied to iCloud on the next backup. Two reasons that is
  /// wrong, and the second is the one that decides it:
  ///
  /// 1. App Review guideline 5.1.3(ii) says plainly that apps must not store
  ///    personal health information in iCloud.
  /// 2. iCloud Backup is encrypted, but Apple holds the keys unless Advanced
  ///    Data Protection is switched on, and an app cannot check whether it is.
  ///    So backing up a lipid panel is a decision only the user can make with
  ///    the facts, and defaulting to "yes" makes it for them silently.
  ///
  /// The records are individually AES-GCM sealed, so a backup copy is not
  /// readable on its own. The key is `ThisDeviceOnly`, so it is also not
  /// restorable onto another device, which means a backed-up store would be
  /// ciphertext nobody could ever open. Copying it to Apple anyway would be
  /// exposure with no upside at all.
  ///
  /// Set on the directory rather than per file: a file written before the flag
  /// was applied would otherwise slip through.
  private func excludeFromBackup() throws {
    var url = directory
    var values = URLResourceValues()
    values.isExcludedFromBackup = true
    try url.setResourceValues(values)
  }

  private func url(for id: UUID) -> URL {
    directory.appendingPathComponent("\(id.uuidString).sealed")
  }

  private func url(for id: UUID, _ attachment: Attachment) -> URL {
    directory.appendingPathComponent("\(id.uuidString).\(attachment.rawValue).sealed")
  }

  /// Seals and writes. Complete protection: unreadable while the device is
  /// locked. Any future background work must downgrade this deliberately, not
  /// by accident.
  private func seal(_ plain: Data, to url: URL) throws {
    let sealed = try AES.GCM.seal(plain, using: storeKey()).combined!
    try sealed.write(to: url, options: [.atomic, .completeFileProtection])
  }

  /// Opens a sealed file, or returns nil when there is none.
  private func open(_ url: URL) throws -> Data? {
    guard FileManager.default.fileExists(atPath: url.path) else { return nil }
    let box = try AES.GCM.SealedBox(combined: Data(contentsOf: url))
    return try AES.GCM.open(box, using: storeKey())
  }

  public func save(_ report: LabReport) throws {
    try ensureDirectory()
    try seal(try JSONEncoder().encode(report), to: url(for: report.id))
    cached.removeAll { $0.id == report.id }
    cached.append(report)
    cached.sort { $0.effectiveDate > $1.effectiveDate }
    Log.store.info(
      "report saved: \(report.extraction.coded.count, privacy: .public) coded, \(report.extraction.needsReview, privacy: .public) to review, date \(report.metadata.dateSource.rawValue, privacy: .public)"
    )
  }

  /// Keeps the scanned pages, as one PDF, sealed next to the record.
  public func saveScan(_ pdf: Data, for id: UUID) throws {
    try ensureDirectory()
    try seal(pdf, to: url(for: id, .scan))
    Log.store.info("scan sealed: \(pdf.count, privacy: .public) bytes")
  }

  public func scan(for id: UUID) throws -> Data? {
    try open(url(for: id, .scan))
  }

  public func saveDiagnostics(_ diagnostics: ScanDiagnostics, for id: UUID) throws {
    try ensureDirectory()
    try seal(try JSONEncoder().encode(diagnostics), to: url(for: id, .diagnostics))
  }

  public func diagnostics(for id: UUID) throws -> ScanDiagnostics? {
    guard let plain = try open(url(for: id, .diagnostics)) else { return nil }
    return try JSONDecoder().decode(ScanDiagnostics.self, from: plain)
  }

  public func delete(_ id: UUID) throws {
    try? FileManager.default.removeItem(at: url(for: id))
    try? FileManager.default.removeItem(at: url(for: id, .scan))
    try? FileManager.default.removeItem(at: url(for: id, .diagnostics))
    cached.removeAll { $0.id == id }
    Log.store.notice("report deleted")
  }

  /// Loads every stored report.
  ///
  /// A file that fails to decrypt is reported rather than skipped: silently
  /// dropping a report the user believes they saved is the one outcome worse
  /// than an error.
  public func load() throws -> [LabReport] {
    if loaded { return cached }
    try ensureDirectory()
    let key = try storeKey()
    var reports: [LabReport] = []
    var failures: [UUID] = []

    let files =
      (try? FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil))
      ?? []
    for file in files where file.pathExtension == "sealed" {
      // Attachments are `<id>.scan.sealed` and `<id>.diag.sealed`; only the
      // bare `<id>.sealed` is a record.
      guard let id = UUID(uuidString: file.deletingPathExtension().lastPathComponent) else {
        continue
      }
      do {
        let box = try AES.GCM.SealedBox(combined: Data(contentsOf: file))
        let plain = try AES.GCM.open(box, using: key)
        reports.append(try JSONDecoder().decode(LabReport.self, from: plain))
      } catch {
        failures.append(id)
      }
    }

    cached = reports.sorted { $0.effectiveDate > $1.effectiveDate }
    loaded = true
    Log.store.info(
      "loaded \(reports.count, privacy: .public) report(s), \(failures.count, privacy: .public) unreadable"
    )
    if let first = failures.first { throw StoreError.corrupt(first) }
    return cached
  }

  /// Every coded value across all reports, oldest first, the trend series.
  public func timeline() throws -> [(date: Date, value: CodedLabValue)] {
    try load()
      .flatMap { report in
        report.extraction.coded.map { (report.effectiveDate, $0) }
      }
      .sorted { $0.0 < $1.0 }
  }
}
