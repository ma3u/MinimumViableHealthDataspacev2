import Foundation

/// A GitHub issue about values the app did not read, drafted on the phone.
///
/// The issue is public, so the draft carries the shape of the problem and no
/// health data: every digit is replaced by `#`, and the report's title, its
/// laboratory, its dates and the person's name are not in it at all. What is
/// left is what a developer needs: which labels and units went unmatched,
/// which lines could not be read, which codes were read, and the app's build.
/// The person sees the whole text, can change or delete any of it, and sends
/// it themselves from GitHub in the browser; the app holds no GitHub token
/// and sends nothing.
public enum FeedbackIssue {

  public static let repository = "ma3u/MinimumViableHealthDataspacev2"

  /// Every digit as `#`.
  public static func masked(_ text: String) -> String {
    String(text.map { $0.isNumber ? "#" : $0 })
  }

  /// The issue's title and body. `note` is what the person wrote about what
  /// is missing, masked like the rest.
  public static func draft(report: LabReport, note: String, build: String) -> (title: String, body: String)
  {
    let e = report.extraction
    let kind = ReportSuggestion.kind(of: e.coded) ?? "Report"
    var body = "### What is missing\n\n"
    let trimmed = note.trimmingCharacters(in: .whitespacesAndNewlines)
    body += trimmed.isEmpty ? "_(not described)_\n" : masked(trimmed) + "\n"
    body += "\n### What the app read\n\n"
    body += "- Kind: \(kind)\n"
    body += "- Source: \(e.source.rawValue), \(report.scan?.pageCount ?? 0) page(s)\n"
    body += "- \(e.coded.count) coded, \(e.unmapped.count) unmatched, \(e.suspiciousLines.count) unread\n"
    body += "- Build: \(build), dictionary \(Analytes.codings.count) codings\n"
    if !e.unmapped.isEmpty {
      body += "\n### Unmatched rows (numbers masked)\n\n"
      for item in e.unmapped.prefix(40) {
        body += "- `\(masked(item.raw.label))` · `\(masked(item.raw.unitRaw))` · \(item.reason.rawValue)\n"
      }
    }
    if !e.suspiciousLines.isEmpty {
      body += "\n### Unread lines (numbers masked)\n\n"
      for line in e.suspiciousLines.prefix(40) {
        body += "- `\(masked(line).replacingOccurrences(of: "`", with: "'"))`\n"
      }
    }
    let codes = e.coded.compactMap(\.coding.loinc).sorted()
    if !codes.isEmpty {
      body += "\n### LOINC codes read\n\n" + codes.joined(separator: ", ") + "\n"
    }
    body += "\n_Drafted by Klarbefund. Digits are masked; no values, names or dates are included._\n"
    let title = "Klarbefund: values not read from a \(kind.lowercased())"
    return (title, String(body.prefix(6000)))
  }

  /// GitHub's new-issue page with the draft filled in.
  public static func url(title: String, body: String) -> URL? {
    var components = URLComponents(string: "https://github.com/\(repository)/issues/new")
    components?.queryItems = [
      URLQueryItem(name: "title", value: title),
      URLQueryItem(name: "body", value: body),
      URLQueryItem(name: "labels", value: "klarbefund-feedback"),
    ]
    return components?.url
  }
}
