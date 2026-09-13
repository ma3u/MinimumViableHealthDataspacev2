// fm-extract, can Apple's on-device model do the structured extraction?
//
// Reads a lab report as plain text, asks the on-device Foundation Model for
// structured rows, and writes JSON in the same shape the scorer expects. The
// point is to answer one question with numbers instead of opinion (issue #186):
// is on-device extraction good enough that no lab report ever has to leave the
// phone?
//
// Nothing here touches the network. The report text is read from a local file
// and handed to a model running on this machine.
//
//   swift run fm-extract --in report.txt --out fm.json
//
// Requires macOS 26+ with Apple Intelligence enabled
// (System Settings → Apple Intelligence & Siri).

import Foundation
import FoundationModels

// MARK: - The schema the model must fill

@Generable(description: "One measured analyte row from a laboratory report")
struct LabRow: Codable {
  @Guide(
    description:
      "The analyte name exactly as printed, e.g. 'LDL-Cholesterin', 'Lp(a)', 'hs-CRP'. Do not translate or expand it."
  )
  var label: String

  @Guide(
    description:
      "The numeric result as a decimal number using a point. German reports use a comma as the decimal separator and a dot for thousands: '87,3' is 87.3 and '1.240' is 1240, not 1.24."
  )
  var value: Double

  @Guide(description: "The unit exactly as printed, e.g. 'mg/dl', 'µg/l', 'U/l', '%'.")
  var unit: String

  @Guide(
    description:
      "The reference range exactly as printed, e.g. '< 200', '0,70 - 1,20', '> 40'. Empty string if the row has none."
  )
  var referenceRange: String
}

@Generable(description: "All measured rows found in one laboratory report")
struct LabExtraction {
  @Guide(
    description:
      "Every row that carries a numeric measurement. Skip headers, addresses and dates. Skip rows whose result is not a number, such as 'n.b.' or 'negativ'. Never invent a row that is not printed."
  )
  var rows: [LabRow]
}

// MARK: - Output shape (shared with the scorer)

struct OutputRow: Codable {
  var label: String
  var value: Double
  var unit: String
  var referenceRange: String
}

struct Output: Codable {
  var arm: String
  var model: String
  var rows: [OutputRow]
  var chunks: Int
  var elapsedSeconds: Double
  /// Chunks the model refused or failed on, counted, never silently skipped.
  var failedChunks: [String]
}

// MARK: - Arguments

struct Args {
  var input: String
  var output: String?
  var chunkLines: Int = 40
  var temperature: Double = 0.0
}

func parseArgs() -> Args? {
  var input: String?
  var output: String?
  var chunkLines = 40
  var temperature = 0.0

  var i = 1
  let argv = CommandLine.arguments
  while i < argv.count {
    let a = argv[i]
    switch a {
    case "-h", "--help":
      return nil
    case "--in":
      i += 1
      input = i < argv.count ? argv[i] : nil
    case "--out":
      i += 1
      output = i < argv.count ? argv[i] : nil
    case "--chunk-lines":
      i += 1
      chunkLines = Int(i < argv.count ? argv[i] : "") ?? 40
    case "--temperature":
      i += 1
      temperature = Double(i < argv.count ? argv[i] : "") ?? 0.0
    default:
      FileHandle.standardError.write("Unknown option \(a)\n".data(using: .utf8)!)
      return nil
    }
    i += 1
  }
  guard let input else { return nil }
  return Args(input: input, output: output, chunkLines: chunkLines, temperature: temperature)
}

let usage = """
fm-extract: Apple on-device model, structured lab extraction

Usage:
  swift run fm-extract --in <report.txt> [--out <result.json>]

Options:
  --in <path>           lab report as plain text (required)
  --out <path>          write JSON here (default: stdout)
  --chunk-lines <n>     lines per model call (default 40); the on-device
                        context is small, so a full report is split
  --temperature <t>     default 0.0, for repeatability

Keep the input outside this repository. It is personal health data.
"""

guard let args = parseArgs() else {
  print(usage)
  exit(2)
}

// MARK: - Availability

switch SystemLanguageModel.default.availability {
case .available:
  break
case .unavailable(let reason):
  FileHandle.standardError.write(
    """
    The on-device model is unavailable: \(reason)

    Enable it in System Settings → Apple Intelligence & Siri, wait for the model
    to finish downloading, then run this again.

    """.data(using: .utf8)!)
  exit(1)
}

// MARK: - Read and chunk

let text: String
do {
  text = try String(contentsOfFile: args.input, encoding: .utf8)
} catch {
  FileHandle.standardError.write("Cannot read \(args.input): \(error)\n".data(using: .utf8)!)
  exit(1)
}

/// Splits the report into chunks the on-device context can hold.
///
/// Lab reports are line-oriented and rows are independent, so a plain line
/// split loses nothing, unlike prose, where a split mid-paragraph would.
func chunk(_ text: String, lines perChunk: Int) -> [String] {
  let lines = text.split(separator: "\n", omittingEmptySubsequences: false).map(String.init)
  guard lines.count > perChunk else { return [text] }
  var chunks: [String] = []
  var start = 0
  while start < lines.count {
    let end = min(start + perChunk, lines.count)
    chunks.append(lines[start..<end].joined(separator: "\n"))
    start = end
  }
  return chunks
}

let chunks = chunk(text, lines: args.chunkLines)

// MARK: - Extract

let instructions = """
You extract laboratory measurements from German lab reports.

Copy what is printed. Do not convert units, do not normalise analyte names, do \
not compute anything, and never output a row that is not on the page. If a row \
has no numeric result, leave it out entirely rather than guessing a value.
"""

let session = LanguageModelSession(instructions: instructions)
let options = GenerationOptions(temperature: args.temperature)

var allRows: [OutputRow] = []
var failed: [String] = []
let started = Date()

for (index, part) in chunks.enumerated() {
  let prompt = """
    Extract every measured row from this section of a laboratory report.

    ---
    \(part)
    ---
    """
  do {
    let response = try await session.respond(
      to: prompt, generating: LabExtraction.self, options: options)
    for row in response.content.rows {
      allRows.append(
        OutputRow(
          label: row.label.trimmingCharacters(in: .whitespaces),
          value: row.value,
          unit: row.unit.trimmingCharacters(in: .whitespaces),
          referenceRange: row.referenceRange.trimmingCharacters(in: .whitespaces)))
    }
  } catch {
    // A failed chunk is reported, never quietly dropped: a missing row and a
    // row that was never asked for are different results.
    failed.append("chunk \(index + 1)/\(chunks.count): \(error)")
  }
}

let output = Output(
  arm: "apple-on-device",
  model: "SystemLanguageModel.default",
  rows: allRows,
  chunks: chunks.count,
  elapsedSeconds: Date().timeIntervalSince(started),
  failedChunks: failed)

let encoder = JSONEncoder()
encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
let data = try encoder.encode(output)

if let out = args.output {
  try data.write(to: URL(fileURLWithPath: out))
  FileHandle.standardError.write(
    "extracted \(allRows.count) rows from \(chunks.count) chunk(s) in "
      + String(format: "%.1fs", output.elapsedSeconds) + " → \(out)\n",
    )
} else {
  print(String(data: data, encoding: .utf8)!)
}

if !failed.isEmpty {
  FileHandle.standardError.write("\(failed.count) chunk(s) failed:\n".data(using: .utf8)!)
  for f in failed { FileHandle.standardError.write("  \(f)\n".data(using: .utf8)!) }
}

extension FileHandle {
  fileprivate func write(_ string: String) {
    write(string.data(using: .utf8)!)
  }
}
