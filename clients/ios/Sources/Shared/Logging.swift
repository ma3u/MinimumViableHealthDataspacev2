import OSLog

/// The app's loggers, one subsystem so a diagnostics export can collect them.
///
/// Health data never goes into a log line. Counts, LOINC codes, durations and
/// error descriptions do; a label, a number or a line of recognised text does
/// not, because the unified log is readable by anyone with the device unlocked
/// and a Mac, and `privacy: .private` only redacts it in a release build. The
/// same rule the `claude-federation` service already follows.
public enum Log {
  public static let subsystem = "red.mabu.meinbefund"

  public static let scan = Logger(subsystem: subsystem, category: "scan")
  public static let store = Logger(subsystem: subsystem, category: "store")
  public static let export = Logger(subsystem: subsystem, category: "export")
  public static let diagnostics = Logger(subsystem: subsystem, category: "diagnostics")
}
