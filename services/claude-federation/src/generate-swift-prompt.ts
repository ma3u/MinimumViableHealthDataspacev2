/**
 * Emits the Swift copy of the system prompt and the value rendering.
 *
 * The prompt is not decoration. It is what keeps the product on the safe side
 * of the line in issue #186 section 5: it forbids diagnosis, risk scoring and
 * treatment advice, and binds the model to the reference range the issuing lab
 * printed. Qualification as a medical device turns almost entirely on the
 * stated intended purpose, so that purpose has to travel with every request.
 *
 * Two code paths now send it. The hosted one goes through this service; the
 * bring-your-own one is sent by the phone directly to the user's provider and
 * never passes through here at all. A hand-copied prompt would drift, and the
 * drift would be invisible: the answers would simply get a little less careful
 * on one path than the other, with nothing failing.
 *
 * So it is generated, exactly like the analyte table, and CI fails when the
 * committed Swift is out of date with its TypeScript source.
 *
 *   npm run generate:prompt
 *   npm run generate:prompt -- --check
 */
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SYSTEM_PROMPT, renderValues } from "./analyse.js";

const HERE = dirname(fileURLToPath(import.meta.url));
export const SWIFT_TARGET = resolve(
  HERE,
  "../../../clients/ios/Sources/Shared/PromptText.generated.swift",
);

function swiftString(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n");
}

export function render(): string {
  // The rendering is reproduced rather than exported, because the shapes differ:
  // TypeScript takes its own SharedValue, Swift takes CloudAnalysis.SharedValue.
  // The golden below pins them to the same output for the same input.
  const sample = renderValues([
    {
      label: "LDL-Cholesterin",
      value: 141,
      unit: "mg/dL",
      loinc: "2089-1",
      referenceHigh: 116,
      status: "preliminary",
    },
  ]);

  return `// GENERATED FILE, DO NOT EDIT.
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
  public static let system = "${swiftString(SYSTEM_PROMPT)}"

  /// Renders the selected values as the only health content in the request.
  public static func values(_ values: [CloudAnalysis.SharedValue]) -> String {
    var lines = ["Selected values:"]
    for v in values {
      let range: String
      if let low = v.referenceLow, let high = v.referenceHigh {
        range = "\\(trim(low)) to \\(trim(high))"
      } else if let high = v.referenceHigh {
        range = "< \\(trim(high))"
      } else if let low = v.referenceLow {
        range = "> \\(trim(low))"
      } else {
        range = "none printed"
      }
      lines.append(
        "- \\(v.label) (LOINC \\(v.loinc)): \\(trim(v.value)) \\(v.unit); "
          + "printed reference \\(range); \\(v.status)")
    }
    return lines.joined(separator: "\\n")
  }

  public static func user(values: [CloudAnalysis.SharedValue], question: String) -> String {
    let asked = question.trimmingCharacters(in: .whitespacesAndNewlines)
    return [
      Self.values(values), "",
      asked.isEmpty ? "Please explain these values." : asked,
    ].joined(separator: "\\n")
  }

  /// Matches JavaScript number rendering: an integral value prints without a
  /// fractional part, so the two paths produce the same prompt bytes.
  private static func trim(_ value: Double) -> String {
    value == value.rounded() && abs(value) < 1e15
      ? String(Int64(value)) : String(value)
  }

  /// One rendered line, pinned so the Swift and TypeScript renderings cannot
  /// drift apart unnoticed.
  public static let goldenSample = "${swiftString(sample)}"
}
`;
}

async function main(): Promise<void> {
  const next = render();
  if (process.argv.includes("--check")) {
    const current = await readFile(SWIFT_TARGET, "utf8").catch(() => null);
    if (current !== next) {
      console.error(
        `${SWIFT_TARGET} is out of date with analyse.ts. Run: npm run generate:prompt`,
      );
      process.exit(1);
    }
    console.log(`${SWIFT_TARGET} is up to date`);
    return;
  }
  await writeFile(SWIFT_TARGET, next, "utf8");
  console.log(`wrote ${SWIFT_TARGET}`);
}

if (
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].split("/").pop()!)
) {
  await main();
}
