import Foundation

/// Values a sheet does not print, worked out from the ones it does.
///
/// Derived at read time and never stored. A stored copy would have to be kept
/// in step with the values it came from, and a report re-read with a better
/// parser would carry a figure computed from numbers that have since changed.
///
/// Two rules.
///
/// **Only from one report.** A ratio of a triglyceride measured in March and
/// an HDL measured in September is a ratio of nothing.
///
/// **Only in one unit.** Triglycerides over HDL is a different number in
/// mg/dL and in mmol/L, by a factor of about two. The unit the sheet printed
/// travels with the result, and two values in different units are not
/// combined at all.
public enum DerivedValues {

  /// What a derived value is computed from, for the audit trail.
  static func line(_ parts: [String], _ result: Double, _ unit: String) -> String {
    "\(parts.joined(separator: " / ")) = \(result) \(unit)"
  }

  /// Everything that can be worked out from one report's coded values.
  public static func from(_ coded: [CodedLabValue]) -> [CodedLabValue] {
    guard !coded.isEmpty else { return [] }
    let source = coded.first?.source ?? .labIssuedDigital
    let existing = Set(coded.map { "\($0.coding.analyteKey)|\($0.coding.ucum)" })

    func value(_ key: String, _ ucum: String) -> Double? {
      coded.first { $0.coding.analyteKey == key && $0.coding.ucum == ucum }?.raw.value
    }
    /// The unit a lipid panel was printed in, when it printed one at all.
    let lipidUnits = ["mg/dL", "mmol/L"].filter { value("cholesterol-hdl", $0) != nil }

    var derived: [CodedLabValue] = []
    var line = (coded.first?.raw.lineNumber ?? 0) + 9000

    func add(_ key: String, _ ucum: String, _ result: Double, _ label: String, from parts: [String]) {
      guard existing.contains("\(key)|\(ucum)") == false,
        let coding = Analytes.lookup(label: label, unit: ucum),
        result.isFinite
      else { return }
      line += 1
      derived.append(
        CodedLabValue(
          raw: RawLabValue(
            label: label, value: (result * 100).rounded() / 100, unitRaw: ucum,
            line: DerivedValues.line(parts, (result * 100).rounded() / 100, ucum),
            lineNumber: line),
          coding: coding, source: source))
    }

    for unit in lipidUnits {
      let total = value("cholesterol-total", unit)
      let hdl = value("cholesterol-hdl", unit)
      let ldl = value("cholesterol-ldl", unit)
      let triglycerides = value("triglycerides", unit)

      // Non-HDL is everything carried in particles that can deposit in an
      // artery wall. It is the one derived value here that has a published
      // band of its own, so it is worth the most.
      if let total, let hdl {
        add("cholesterol-non-hdl", unit, total - hdl, "Non-HDL-Cholesterin",
            from: ["Cholesterin gesamt", "HDL"])
      }
      if let total, let hdl, let ldl {
        add("cholesterol-remnant", unit, total - hdl - ldl, "Remnant-Cholesterin",
            from: ["Cholesterin gesamt", "HDL", "LDL"])
      }
      if let triglycerides, let hdl, hdl > 0 {
        add("ratio-tg-hdl", "{ratio}", triglycerides / hdl, "TG/HDL",
            from: ["Triglyzeride (\(unit))", "HDL"])
      }
      if let ldl, let hdl, hdl > 0 {
        add("ratio-ldl-hdl", "{ratio}", ldl / hdl, "LDL/HDL", from: ["LDL", "HDL"])
      }
    }

    // The apolipoproteins are printed in the same unit as each other, so the
    // ratio is the same number whichever it is.
    for unit in ["mg/dL", "g/L"] {
      if let apoB = value("apolipoprotein-b", unit), let apoA = value("apolipoprotein-a1", unit),
        apoA > 0
      {
        add("ratio-apob-apoa1", "{ratio}", apoB / apoA, "ApoB/ApoA1", from: ["ApoB", "ApoA1"])
        break
      }
    }
    return derived
  }
}
