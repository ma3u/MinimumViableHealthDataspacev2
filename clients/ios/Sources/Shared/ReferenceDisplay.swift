import Foundation

/// How a person reads a UCUM unit.
///
/// UCUM is a machine format and the app stores it exactly: `10*9/L` selects a
/// LOINC code, travels in a FHIR bundle and matches a value to its range. It
/// is not what anybody writes on paper, and printing it on screen next to a
/// number makes a reading screen look like a database dump. The exports keep
/// the code; the screens show this.
public enum UnitText {

  /// Only the units that are unreadable as written. Everything else, `mg/dL`
  /// and `g/L` and the rest, is already what a laboratory prints and passes
  /// through untouched.
  private static let spellings: [String: String] = [
    "10*3/uL": "10³/µL",
    "10*6/uL": "10⁶/µL",
    "10*9/L": "10⁹/L",
    "10*12/L": "10¹²/L",
    "/uL": "/µL",
    "ug/dL": "µg/dL",
    "ug/L": "µg/L",
    "umol/L": "µmol/L",
    "ukat/L": "µkat/L",
    "u[IU]/mL": "µIU/mL",
    "m[IU]/L": "mIU/L",
    "mL/min/{1.73_m2}": "mL/min/1,73m²",
    "cm2": "cm²",
    "kg/m2": "kg/m²",
    "[pH]": "pH",
    "{ratio}": "",
  ]

  public static func display(_ ucum: String) -> String {
    spellings[ucum] ?? ucum
  }
}

/// One line of a reference card: a set of bounds, and every unit it is
/// published in.
///
/// `ng/L` and `pg/mL` are the same unit spelled two ways, so vitamin B12 in
/// both is one line and not two identical ones.
public struct RangeUnitLine: Identifiable, Sendable, Equatable {
  public let units: [String]
  public let range: ReferenceRange

  public var id: String { units.joined(separator: ",") }

  /// The units as a reader writes them, for one label.
  public var unitText: String {
    units.map(UnitText.display).filter { !$0.isEmpty }.joined(separator: ", ")
  }
}

extension ReferenceRanges {

  /// The ranges gathered into one card per measurement.
  ///
  /// The table states a range **per unit**, which is right and must stay:
  /// lipoprotein(a) by mass and by particle count are different measurements
  /// with different codes and different thresholds, and a value is matched to
  /// its range by the unit it carries. Rendered one card per row, though, the
  /// same measurement appeared as many times as it has units, so vitamin D
  /// filled the screen twice and B12 three times, which reads as a mistake.
  ///
  /// Order is the table's own, and sex is part of the key so that a sex
  /// specific range never shares a card with a sex neutral one.
  public static func byAnalyte(_ ranges: [ReferenceRange]) -> [[ReferenceRange]] {
    var order: [String] = []
    var buckets: [String: [ReferenceRange]] = [:]
    for range in ranges {
      let key = "\(range.analyteKey)|\(range.sex.rawValue)"
      if buckets[key] == nil { order.append(key) }
      buckets[key, default: []].append(range)
    }
    return order.compactMap { buckets[$0] }
  }

  /// The lines of one card: one per distinct set of bounds, carrying every
  /// unit that states them.
  public static func unitLines(_ ranges: [ReferenceRange]) -> [RangeUnitLine] {
    var order: [String] = []
    var units: [String: [String]] = [:]
    var first: [String: ReferenceRange] = [:]
    for range in ranges {
      let bounds: [Double?] = [
        range.guidelineLow, range.guidelineHigh, range.optimalLow, range.optimalHigh,
      ]
      let key: String = bounds.map { value in value.map { "\($0)" } ?? "-" }
        .joined(separator: "|")
      if units[key] == nil {
        order.append(key)
        first[key] = range
      }
      units[key, default: []].append(range.ucum)
    }
    return order.compactMap { key in
      guard let range = first[key], let list = units[key] else { return nil }
      return RangeUnitLine(units: list, range: range)
    }
  }
}
