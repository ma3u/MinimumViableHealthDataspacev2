// GENERATED FILE, DO NOT EDIT.
//
// Source: services/claude-federation/src/analyse.ts
// Regenerate: cd services/claude-federation && npm run generate:prompt
//
// The system prompt is what states the intended purpose, which is what keeps
// this out of scope as a medical device (issue #186 section 5, MDCG 2019-11).
// Two paths send it: the hosted service, and the phone talking directly to a
// user's own provider. A hand-copied second version would drift quietly, and
// the only symptom would be answers getting less careful on one path.

import Foundation

public enum PromptText {
  /// Forbids diagnosis, risk scoring, prognosis and treatment advice, and binds
  /// the model to the range the issuing laboratory printed (ADR-033 rule 1).
  public static let system = "You are helping a person understand their own laboratory results.\n\nYou explain what a measurement is and what its printed reference range means.\nYou do not diagnose, you do not estimate risk, you do not predict outcomes,\nand you do not recommend treatment, medication or dosage. When a question\nasks for any of those, say plainly that it is a question for their doctor\nand explain the underlying measurement instead.\n\nReference ranges are printed by the issuing laboratory and are specific to\nits assay. Use the range given with each value. Never substitute a range\nfrom elsewhere and never describe a value as normal or abnormal against a\nrange that was not supplied.\n\nValues marked preliminary were transcribed from a photograph by OCR and have\nnot been verified against the paper. Treat them as possibly misread, and say\nso if a preliminary value is central to your answer."

  /// Renders the selected values as the only health content in the request.
  public static func values(_ values: [CloudAnalysis.SharedValue]) -> String {
    var lines = ["Selected values:"]
    for v in values {
      let range: String
      if let low = v.referenceLow, let high = v.referenceHigh {
        range = "\(trim(low)) to \(trim(high))"
      } else if let high = v.referenceHigh {
        range = "< \(trim(high))"
      } else if let low = v.referenceLow {
        range = "> \(trim(low))"
      } else {
        range = "none printed"
      }
      lines.append(
        "- \(v.label)\(v.loinc.map { " (LOINC \($0))" } ?? ""): "
          + "\(trim(v.value)) \(v.unit); "
          + "printed reference \(range); \(v.status)")
    }
    return lines.joined(separator: "\n")
  }

  public static func user(values: [CloudAnalysis.SharedValue], question: String) -> String {
    let asked = question.trimmingCharacters(in: .whitespacesAndNewlines)
    return [
      Self.values(values), "",
      asked.isEmpty ? "Please explain these values." : asked,
    ].joined(separator: "\n")
  }

  /// Matches JavaScript number rendering: an integral value prints without a
  /// fractional part, so the two paths produce the same prompt bytes.
  private static func trim(_ value: Double) -> String {
    value == value.rounded() && abs(value) < 1e15
      ? String(Int64(value)) : String(value)
  }

  /// One rendered line, pinned so the Swift and TypeScript renderings cannot
  /// drift apart unnoticed.
  public static let goldenSample = "Selected values:\n- LDL-Cholesterin (LOINC 2089-1): 141 mg/dL; printed reference < 116; preliminary"
}
