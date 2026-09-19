import Foundation
import OSLog

/// Packs what a tester needs off the phone into one archive.
///
/// There is no other way out. The store is sealed under a key that never leaves
/// the device, so Xcode's container download and `devicectl` yield ciphertext,
/// and enabling iTunes file sharing would open the container to every app on
/// the Mac, which is the path #186's acceptance criterion 8 exists to rule out.
/// So the app decrypts, writes plain files to a temporary folder, zips them
/// and hands the archive to the share sheet. The person chooses where it goes,
/// and the archive contains their health data in full: the sheet says so
/// before it is built.
public enum DiagnosticsBundle {

  public enum BundleError: Error, LocalizedError {
    case zipFailed(String)

    public var errorDescription: String? {
      switch self {
      case .zipFailed(let reason): return "Could not build the archive: \(reason)"
      }
    }
  }

  /// Zips a directory using the file coordinator's upload representation.
  ///
  /// `.forUploading` on a directory asks Foundation for a zip of it, which is
  /// the one zip facility iOS ships without a third-party library. The URL it
  /// hands over is valid only inside the accessor, so the archive is copied
  /// out before the block returns.
  public static func zip(directory: URL, to destination: URL) throws {
    var coordinationError: NSError?
    var copyError: Error?
    NSFileCoordinator().coordinate(
      readingItemAt: directory, options: [.forUploading], error: &coordinationError
    ) { zipped in
      do {
        try? FileManager.default.removeItem(at: destination)
        try FileManager.default.copyItem(at: zipped, to: destination)
      } catch {
        copyError = error
      }
    }
    if let coordinationError {
      throw BundleError.zipFailed(coordinationError.localizedDescription)
    }
    if let copyError { throw BundleError.zipFailed(copyError.localizedDescription) }
  }

  /// The app's own log lines since the process started, as text.
  ///
  /// `OSLogStore` on iOS only reaches the current process, so this is one
  /// session's worth. The durable record of a scan is `ScanDiagnostics`; this
  /// is the narrative around it, and it never carries a health value because
  /// nothing in `Log` ever logs one.
  public static func processLog(subsystem: String = Log.subsystem) -> String {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    do {
      let store = try OSLogStore(scope: .currentProcessIdentifier)
      let entries = try store.getEntries(at: store.position(timeIntervalSinceLatestBoot: 0))
      var lines: [String] = []
      for case let entry as OSLogEntryLog in entries where entry.subsystem == subsystem {
        lines.append(
          "\(formatter.string(from: entry.date)) [\(entry.category)] "
            + "\(levelName(entry.level)): \(entry.composedMessage)")
      }
      return lines.joined(separator: "\n") + "\n"
    } catch {
      return "log unavailable: \(error.localizedDescription)\n"
    }
  }

  private static func levelName(_ level: OSLogEntryLog.Level) -> String {
    switch level {
    case .debug: return "debug"
    case .info: return "info"
    case .notice: return "notice"
    case .error: return "error"
    case .fault: return "fault"
    case .undefined: return "undefined"
    @unknown default: return "unknown"
    }
  }

  /// JSON the way the export and the replay tool both read it: ISO dates,
  /// sorted keys, readable.
  public static func encoder() -> JSONEncoder {
    let encoder = JSONEncoder()
    encoder.dateEncodingStrategy = .iso8601
    encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
    return encoder
  }

  public static func decoder() -> JSONDecoder {
    let decoder = JSONDecoder()
    decoder.dateDecodingStrategy = .iso8601
    return decoder
  }
}
