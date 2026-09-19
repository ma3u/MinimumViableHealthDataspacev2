// Replays a scan from its diagnostics record, on a Mac, with the current
// parser and dictionary.
//
//   swift run ScanReplay ~/Downloads/klarbefund-diagnostics-2026-09-19    # a whole export
//   swift run ScanReplay <folder>/diagnostics.json                        # one report
//   swift run ScanReplay <folder> --ocr                                   # re-run Vision on scan.pdf
//   swift run ScanReplay <folder> --json                                  # the replayed extraction
//
// The record holds what both Vision passes saw on the phone, so reconciliation,
// layout inference, parsing and coding run again here without the image. Change
// analytes.ts or the parser, regenerate, replay, and see which rows of the real
// sheet code now and which still refuse. `--ocr` goes one step further and runs
// the recogniser on the stored PDF, which answers whether a newer OS reads the
// sheet differently.
//
// The export contains health data. It lives outside this repository, always
// (README, rule 1), and this tool refuses a path inside it.
import Foundation
import Shared

#if canImport(Vision)
  import Vision
#endif

struct Options {
  var path: String?
  var ocr = false
  var json = false
}

var options = Options()
for argument in CommandLine.arguments.dropFirst() {
  switch argument {
  case "--ocr": options.ocr = true
  case "--json": options.json = true
  default: options.path = argument
  }
}

guard let path = options.path else {
  FileHandle.standardError.write(
    Data("usage: swift run ScanReplay <diagnostics.json | report folder | export folder> [--ocr] [--json]\n".utf8))
  exit(2)
}

let root = URL(fileURLWithPath: path).standardizedFileURL
if root.path.contains("/clients/ios/") {
  FileHandle.standardError.write(
    Data("refusing: a diagnostics export is health data and must not live inside the repository\n".utf8))
  exit(2)
}

/// Every `diagnostics.json`, and every `report.json` that has none beside it.
///
/// A record written before diagnostics existed still carries its unmapped rows
/// and unread lines, and those can be run through the current parser and
/// dictionary on their own. Less than a full replay, more than nothing.
func records(under url: URL) -> [URL] {
  var isDirectory: ObjCBool = false
  guard FileManager.default.fileExists(atPath: url.path, isDirectory: &isDirectory) else { return [] }
  if !isDirectory.boolValue { return url.pathExtension == "json" ? [url] : [] }
  guard let walker = FileManager.default.enumerator(at: url, includingPropertiesForKeys: nil) else {
    return []
  }
  let all = walker.compactMap { $0 as? URL }
  let diagnostics = all.filter { $0.lastPathComponent == "diagnostics.json" }
  let folders = Set(diagnostics.map { $0.deletingLastPathComponent().path })
  let recordsOnly = all.filter {
    $0.lastPathComponent == "report.json" && !folders.contains($0.deletingLastPathComponent().path)
  }
  return (diagnostics + recordsOnly).sorted { $0.path < $1.path }
}

/// Re-runs the rows a record-only export refused, with the current dictionary.
///
/// Each unmapped row and each unread line is re-extracted from its stored
/// source line. The line grammar sees the same `label  value  unit  rest`
/// shape the phone built, so a row that failed on the dictionary alone codes
/// here, and a row that failed on the grammar still shows why.
func replayRecordOnly(_ report: LabReport) {
  print("no diagnostics.json: re-coding the record's refused rows with the current dictionary")
  // A row stored before the reconciler collapsed whitespace can carry a line
  // break from a wrapped cell. It is one row; the grammar splits on newlines.
  func oneLine(_ text: String) -> String {
    text.split(whereSeparator: { $0.isWhitespace || $0.isNewline }).joined(separator: " ")
  }
  var recovered = 0
  for item in report.extraction.unmapped {
    let again = LabLineParser.extract(oneLine(item.raw.line), source: report.extraction.source)
    if let coded = again.coded.first {
      recovered += 1
      print("  now coded: \(item.raw.label) [\(item.raw.unitRaw)] → \(coded.coding.loinc) (was \(item.reason.rawValue))")
    } else if let still = again.unmapped.first {
      print("  still \(still.reason.rawValue): \(item.raw.label) [\(item.raw.unitRaw)]")
    } else {
      print("  now unread: \(item.raw.label) [\(item.raw.unitRaw)]")
    }
  }
  for line in report.extraction.suspiciousLines {
    let again = LabLineParser.extract(oneLine(line), source: report.extraction.source)
    if let coded = again.coded.first {
      recovered += 1
      print("  now coded from an unread line: \(coded.raw.label) [\(coded.raw.unitRaw)] → \(coded.coding.loinc)")
    } else if let unmapped = again.unmapped.first {
      print("  now unmapped from an unread line: \(unmapped.raw.label) [\(unmapped.raw.unitRaw)] (\(unmapped.reason.rawValue))")
    } else {
      print("  still unread: \(line)")
    }
  }
  print("  \(recovered) of \(report.extraction.unmapped.count + report.extraction.suspiciousLines.count) refused rows code now")
}

func number(_ value: Double) -> String {
  value == value.rounded() ? String(Int(value)) : String(format: "%g", value)
}

func describe(_ result: ExtractionResult, indent: String = "  ") {
  for value in result.coded {
    let comparator = value.raw.comparator?.rawValue ?? ""
    print(
      "\(indent)ok      \(value.raw.label)  \(comparator)\(number(value.raw.value)) \(value.raw.unitRaw)"
        + "  → \(value.coding.loinc) \(value.coding.ucum)")
  }
  for item in result.unmapped {
    print(
      "\(indent)unmapped \(item.raw.label)  \(number(item.raw.value)) \(item.raw.unitRaw)"
        + "  (\(item.reason.rawValue))")
  }
  for line in result.suspiciousLines {
    print("\(indent)unread   \(line)")
  }
}

func key(_ value: CodedLabValue) -> String {
  "\(value.raw.label)|\(value.raw.value)|\(value.raw.unitRaw)"
}

func compare(phone: ExtractionResult, now: ExtractionResult) {
  let before = Set(phone.coded.map(key))
  let after = Set(now.coded.map(key))
  print(
    "  phone: \(phone.coded.count) coded, \(phone.unmapped.count) unmapped, "
      + "\(phone.suspiciousLines.count) unread")
  print(
    "  now:   \(now.coded.count) coded, \(now.unmapped.count) unmapped, "
      + "\(now.suspiciousLines.count) unread")
  for value in now.coded where !before.contains(key(value)) {
    print("  newly coded: \(value.raw.label) → \(value.coding.loinc)")
  }
  for value in phone.coded where !after.contains(key(value)) {
    print("  no longer coded: \(value.raw.label) (was \(value.coding.loinc))")
  }
}

#if canImport(Vision)
  func reread(pdf: Data, pages: Int) async throws -> ExtractionResult {
    var merged = ExtractionResult.empty(source: .ocrTranscribed)
    for page in 1...max(1, pages) {
      guard let image = ScanDocument.rasterise(pdf, page: page, dpi: 300) else { continue }
      let reading = try await VisionDocumentReader.read(image, page: page)
      print(
        "  page \(page): re-read \(reading.cells.count) cells, \(reading.fragments.count) fragments, "
          + "\(reading.tableCount) table(s)")
      if reading.rows.isEmpty {
        merged = merged.merging(LabLineParser.extract(reading.plainText, source: .ocrTranscribed))
        continue
      }
      merged = merged.merging(LabLineParser.extract(rows: reading.rows, source: .ocrTranscribed))
      let leftovers = VisionDocumentReader.readingOrder(reading.orphanedFragments)
      if !leftovers.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        merged = merged.merging(LabLineParser.extract(leftovers, source: .ocrTranscribed))
      }
    }
    return merged
  }
#endif

let decoder = DiagnosticsBundle.decoder()
let found = records(under: root)
if found.isEmpty {
  FileHandle.standardError.write(Data("no diagnostics.json under \(root.path)\n".utf8))
  exit(1)
}

for file in found {
  let folder = file.deletingLastPathComponent()
  let report = try? decoder.decode(LabReport.self, from: Data(contentsOf: folder.appendingPathComponent("report.json")))

  if file.lastPathComponent == "report.json" {
    guard let report else {
      print("\(file.path): cannot decode")
      continue
    }
    print(String(repeating: "=", count: 72))
    print(report.title)
    print("  scanned \(report.scannedAt.formatted()), filed under \(report.effectiveDate.formatted(date: .long, time: .omitted))\(report.dateIsScanFallback ? " (the scan date; no lab date was confirmed)" : "")")
    print("  phone: \(report.extraction.coded.count) coded, \(report.extraction.unmapped.count) unmapped, \(report.extraction.suspiciousLines.count) unread")
    replayRecordOnly(report)
    continue
  }

  let diagnostics: ScanDiagnostics
  do {
    diagnostics = try decoder.decode(ScanDiagnostics.self, from: Data(contentsOf: file))
  } catch {
    print("\(file.path): cannot decode: \(error)")
    continue
  }

  print(String(repeating: "=", count: 72))
  print(report?.title ?? file.path)
  if let lab = diagnostics.metadata.laboratory { print("  laboratory: \(lab)") }
  if let date = diagnostics.metadata.labDate {
    print("  lab date: \(date.formatted(date: .long, time: .omitted)) (\(diagnostics.metadata.labDateRole?.rawValue ?? "?"), \(diagnostics.metadata.dateSource.rawValue))")
  } else {
    print("  lab date: none found on the sheet")
  }
  let env = diagnostics.environment
  print(
    "  scanned \(diagnostics.createdAt.formatted()) on \(env.deviceModel), \(env.systemName) \(env.systemVersion), "
      + "app \(env.appVersion) (\(env.build)), dictionary \(env.dictionaryCodings) codings then, "
      + "\(Analytes.codings.count) now")
  for page in diagnostics.pages {
    let layout = page.layout.map {
      "label \($0.label), value \($0.value), unit \($0.unit), reference \($0.reference.map(String.init) ?? "none")"
    } ?? "none, line grammar"
    print(
      "  page \(page.page): \(page.imageWidth)x\(page.imageHeight), \(page.tableCount) table(s), "
        + "\(page.rows.count) rows, \(page.orphanedFragments.count) orphan fragments, "
        + "layout: \(layout), \(String(format: "%.2f", page.recognitionSeconds)) s")
  }

  let replayed = ScanReplay.run(diagnostics)
  print("replay with the current parser and dictionary:")
  compare(phone: diagnostics.extraction, now: replayed)
  if options.json {
    let data = try DiagnosticsBundle.encoder().encode(replayed)
    print(String(decoding: data, as: UTF8.self))
  } else {
    describe(replayed)
  }

  let metadata = ReportMetadataExtractor.extract(pages: diagnostics.pages.map(\.plainText))
  if metadata != diagnostics.metadata {
    print("metadata with the current extractor differs from the phone's:")
    print("  laboratory: \(metadata.laboratory ?? "-")  lab date: \(metadata.labDate.map { $0.formatted(date: .long, time: .omitted) } ?? "-")  (\(metadata.labDateRole?.rawValue ?? "-"))")
    for date in metadata.dates {
      print("  \(date.role.rawValue) \(date.date.formatted(date: .numeric, time: .omitted)) ← \(date.keyword ?? "no keyword"): \(date.line)")
    }
  }

  if options.ocr {
    #if canImport(Vision)
      let pdfURL = folder.appendingPathComponent("scan.pdf")
      if let pdf = try? Data(contentsOf: pdfURL) {
        print("re-reading scan.pdf with this machine's Vision:")
        let reread = try await reread(pdf: pdf, pages: ScanDocument.pageCount(of: pdf))
        compare(phone: diagnostics.extraction, now: reread)
        describe(reread)
      } else {
        print("  --ocr: no scan.pdf next to \(file.lastPathComponent)")
      }
    #else
      print("  --ocr needs Vision, which this platform does not have")
    #endif
  }
}
