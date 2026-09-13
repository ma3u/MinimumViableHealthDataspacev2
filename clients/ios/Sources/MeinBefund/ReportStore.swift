import CryptoKit
import Foundation
import Shared

/// Encrypted local store for scanned reports.
///
/// This is the **primary** store, not a cache. Apple Health has no quantity type
/// for a lipid panel — none exists anywhere, including the US — so the values
/// this app is built for live here permanently (#186).
///
/// Three properties it must keep:
///   - the file is unreadable while the device is locked
///   - the key never leaves this device and never reaches iCloud Keychain
///   - each record is sealed individually, so a leaked file is not a leaked panel
public actor ReportStore {

  public struct StoredReport: Codable, Sendable, Identifiable, Equatable {
    public let id: UUID
    public let scannedAt: Date
    /// Collection date as printed on the report, when the user confirms one.
    public var collectedOn: Date?
    public var title: String
    public let extraction: ExtractionResult
  }

  private let directory: URL
  private let keyTag = "red.mabu.meinbefund.storekey"
  private var cached: [StoredReport] = []
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
  }

  private func url(for id: UUID) -> URL {
    directory.appendingPathComponent("\(id.uuidString).sealed")
  }

  public func save(_ report: StoredReport) throws {
    try ensureDirectory()
    let plain = try JSONEncoder().encode(report)
    let sealed = try AES.GCM.seal(plain, using: storeKey()).combined!
    // Complete protection: unreadable while the device is locked. Any future
    // background work must downgrade this deliberately, not by accident.
    try sealed.write(to: url(for: report.id), options: [.atomic, .completeFileProtection])
    cached.removeAll { $0.id == report.id }
    cached.append(report)
    cached.sort { $0.scannedAt > $1.scannedAt }
  }

  public func delete(_ id: UUID) throws {
    try? FileManager.default.removeItem(at: url(for: id))
    cached.removeAll { $0.id == id }
  }

  /// Loads every stored report.
  ///
  /// A file that fails to decrypt is reported rather than skipped: silently
  /// dropping a report the user believes they saved is the one outcome worse
  /// than an error.
  public func load() throws -> [StoredReport] {
    if loaded { return cached }
    try ensureDirectory()
    let key = try storeKey()
    var reports: [StoredReport] = []
    var failures: [UUID] = []

    let files =
      (try? FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil))
      ?? []
    for file in files where file.pathExtension == "sealed" {
      guard let id = UUID(uuidString: file.deletingPathExtension().lastPathComponent) else {
        continue
      }
      do {
        let box = try AES.GCM.SealedBox(combined: Data(contentsOf: file))
        let plain = try AES.GCM.open(box, using: key)
        reports.append(try JSONDecoder().decode(StoredReport.self, from: plain))
      } catch {
        failures.append(id)
      }
    }

    cached = reports.sorted { $0.scannedAt > $1.scannedAt }
    loaded = true
    if let first = failures.first { throw StoreError.corrupt(first) }
    return cached
  }

  /// Every coded value across all reports, oldest first — the trend series.
  public func timeline() throws -> [(date: Date, value: CodedLabValue)] {
    try load()
      .flatMap { report in
        report.extraction.coded.map { (report.collectedOn ?? report.scannedAt, $0) }
      }
      .sorted { $0.0 < $1.0 }
  }
}
