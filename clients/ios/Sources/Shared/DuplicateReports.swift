import Foundation

/// Finds a report that is already on the phone, whole.
///
/// `Duplicates` keeps a scale's repeated readings out of one import. This
/// compares whole reports, because the same paper scanned twice is a whole
/// second report: measured on a real phone, one laboratory PDF was imported
/// twice three weeks apart, the identical file both times, and every one of
/// its 45 values stood twice on one day. A rescan with a better parser is the
/// other case: an older scan of a 24-hour blood pressure report had read one
/// value, and a new scan of the same paper read 21, the one among them.
///
/// Two reports are compared by their measurements, each the analyte, unit,
/// value and day (`Duplicates.Key`), never by title or file name, which a
/// person types and a scanner invents. Three relations count:
/// - **identical**: the same measurements;
/// - **contained**: every measurement of the new report is already in an
///   older one, so saving it adds nothing;
/// - **supersedes**: every measurement of an older report is in the new one,
///   which reads more of the same paper.
///
/// Anything less, two reports of one day that share some values, is two
/// reports. Nothing here deletes: it says which report is redundant, and
/// the person decides.
public enum DuplicateReports {

  public enum Relation: String, Sendable, Equatable {
    case identical, contained, supersedes
  }

  /// A report and an older one it duplicates, with the one that can go.
  public struct Match: Sendable, Equatable {
    public let relation: Relation
    /// The report being compared, the new scan when importing.
    public let report: LabReport
    /// The stored report it was found to duplicate.
    public let existing: LabReport
    /// The one whose removal loses no measurement.
    public let redundant: LabReport
  }

  /// How `candidate` relates to each stored report, strongest first.
  public static func matches(for candidate: LabReport, among stored: [LabReport]) -> [Match] {
    let mine = Duplicates.keys(of: candidate)
    guard !mine.isEmpty else { return [] }
    return stored.compactMap { other -> Match? in
      guard other.id != candidate.id else { return nil }
      let theirs = Duplicates.keys(of: other)
      guard !theirs.isEmpty else { return nil }
      if mine == theirs {
        return Match(
          relation: .identical, report: candidate, existing: other,
          redundant: keeper(candidate, other).id == candidate.id ? other : candidate)
      }
      if mine.isSubset(of: theirs) {
        return Match(relation: .contained, report: candidate, existing: other, redundant: candidate)
      }
      if theirs.isSubset(of: mine) {
        return Match(relation: .supersedes, report: candidate, existing: other, redundant: other)
      }
      return nil
    }
    .sorted { rank($0.relation) < rank($1.relation) }
  }

  /// Every pair of stored reports where one is redundant, each pair once.
  public static func pairs(in stored: [LabReport]) -> [Match] {
    var found: [Match] = []
    var seen = Set<UUID>()
    for (index, report) in stored.enumerated() {
      for match in matches(for: report, among: Array(stored[(index + 1)...]))
      where !seen.contains(match.redundant.id) {
        found.append(match)
        seen.insert(match.redundant.id)
      }
    }
    return found
  }

  /// Of two identical reports, the one to keep: the one that still has its
  /// pages and its diagnostics, so it can be read again and checked against
  /// the paper, and of two equal ones the newer scan.
  static func keeper(_ a: LabReport, _ b: LabReport) -> LabReport {
    func evidence(_ r: LabReport) -> Int { (r.scan != nil ? 2 : 0) + (r.hasDiagnostics ? 1 : 0) }
    if evidence(a) != evidence(b) { return evidence(a) > evidence(b) ? a : b }
    return a.scannedAt >= b.scannedAt ? a : b
  }

  /// Says what was found, for a person deciding whether to delete.
  public static func sentence(_ match: Match) -> String {
    let keep = match.redundant.id == match.report.id ? match.existing : match.report
    let gone = match.redundant
    func date(_ r: LabReport) -> String { r.effectiveDate.formatted(date: .abbreviated, time: .omitted) }
    let count = Duplicates.keys(of: gone).count
    switch match.relation {
    case .identical:
      return String(
        localized:
          "“\(gone.title)” and “\(keep.title)” of \(date(keep)) have the same \(count) values. Deleting one loses none of them.")
    case .contained, .supersedes:
      return String(
        localized:
          "All \(count) values of “\(gone.title)” are also in “\(keep.title)” of \(date(keep)). Deleting it loses none of them.")
    }
  }

  private static func rank(_ relation: Relation) -> Int {
    switch relation {
    case .identical: return 0
    case .contained: return 1
    case .supersedes: return 2
    }
  }
}
