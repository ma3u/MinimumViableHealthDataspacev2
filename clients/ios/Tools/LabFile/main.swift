// Imports a lab report file the way the app does, and prints what it made of it.
//
//   swift run LabFile ~/Downloads/befund.pdf
//   swift run LabFile ~/Downloads/befund.pdf --values   # include the numbers
//
// The app and this tool call the same `LabImport`, so what this prints is what
// the phone would store, minus the sealing. It exists because the alternative
// way to find out how a real laboratory's layout parses is to scan it on a
// phone and read the result on a 6-inch screen.
//
// A lab report is health data. It lives outside this repository, always
// (README, rule 1), and this tool refuses a path inside it. Values are withheld
// unless asked for, so the default output can be pasted into an issue.
import Foundation
import Shared

let arguments = CommandLine.arguments.dropFirst()
guard let path = arguments.first(where: { !$0.hasPrefix("--") }) else {
  FileHandle.standardError.write(Data("usage: swift run LabFile <file.pdf|image> [--values]\n".utf8))
  exit(2)
}
let showValues = arguments.contains("--values")
let showRows = arguments.contains("--rows")
let url = URL(fileURLWithPath: path).standardizedFileURL
if url.path.contains("/clients/ios/") {
  FileHandle.standardError.write(
    Data("refusing: a lab report is health data and must not live inside the repository\n".utf8))
  exit(2)
}

func number(_ value: Double) -> String {
  value == value.rounded() ? String(Int(value)) : String(format: "%g", value)
}

/// Values are the person's own. Printed only on request; otherwise the shape of
/// the number is shown, which is enough to debug a parse.
func shown(_ value: Double, _ unit: String) -> String {
  showValues ? "\(number(value)) \(unit)" : "\(String(number(value).map { $0.isNumber ? "#" : $0 })) \(unit)"
}

let result = try await LabImport.file(at: url)
let extraction = result.extraction

/// What the recogniser and the layout inference made of each page.
///
/// The question a failed sheet always raises is "did the recogniser lose the
/// column, or did the parser read the wrong one", and the answer is here.
if showRows {
  for page in result.pages {
    let layout = page.layout.map {
      "label \($0.label), value \($0.value), unit \($0.unit), reference \($0.reference.map(String.init) ?? "none"), from \($0.rowsConsidered) rows"
    } ?? "none inferred, falling back to the line grammar"
    print("page \(page.page): \(page.rows.count) rows, \(page.cells.count) cells, \(page.fragments.count) fragments, layout: \(layout)")
    for (index, row) in page.rows.enumerated() {
      let cells = row.cells.map { cell -> String in
        let text = showValues ? cell.text : String(cell.text.map { $0.isNumber ? "#" : $0 })
        return "[\(cell.column):\(text)]"
      }.joined(separator: " ")
      print("  \(index): \(cells)")
    }
    if page.rows.isEmpty {
      // No table was detected, so the line grammar works on the recogniser's
      // reading order. Printing it is the only way to see why a row failed.
      print("  reading order:")
      for line in page.plainText.components(separatedBy: .newlines) where !line.isEmpty {
        print("    \(showValues ? line : String(line.map { $0.isNumber ? "#" : $0 }))")
      }
    }
    print("")
  }
}

print("file       \(url.lastPathComponent)")
print("provenance \(extraction.source.rawValue) → Observation.status \"\(extraction.source.observationStatus)\"")
print("pages      \(result.pages.count), document \(result.pdf.count) bytes")
if let lab = result.metadata.laboratory { print("laboratory \(lab)") }
if let date = result.metadata.labDate {
  print("lab date   \(date.formatted(date: .long, time: .omitted)) (\(result.metadata.labDateRole?.rawValue ?? "?"), \(result.metadata.dateSource.rawValue))")
} else {
  print("lab date   none found")
}
if let number = result.metadata.reportNumber { print("report no. \(number)") }
print("")
print("coded      \(extraction.coded.count)")
for value in extraction.coded {
  let comparator = value.raw.comparator?.rawValue ?? ""
  print("  \(value.coding.loinc.padding(toLength: 9, withPad: " ", startingAt: 0)) \(value.raw.label)  \(comparator)\(shown(value.raw.value, value.raw.unitRaw))")
}
print("")
print("unmapped   \(extraction.unmapped.count)")
for item in extraction.unmapped {
  print("  \(item.reason.rawValue.padding(toLength: 24, withPad: " ", startingAt: 0)) \(item.raw.label)  \(shown(item.raw.value, item.raw.unitRaw))")
}
print("")
print("unread     \(extraction.suspiciousLines.count)")
for line in extraction.suspiciousLines {
  print("  \(showValues ? line : String(line.map { $0.isNumber ? "#" : $0 }))")
}
