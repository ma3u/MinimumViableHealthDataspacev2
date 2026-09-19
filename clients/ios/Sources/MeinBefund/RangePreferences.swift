import Foundation
import Shared

/// Which sex-specific ranges apply, when the person has said.
///
/// Several published ranges differ by sex: haemoglobin, HDL and ALT among
/// them. Without an answer the app uses only the sex-neutral entries and shows
/// nothing for the rest, because putting a man's haemoglobin threshold beside
/// a woman's value is worse than showing no threshold at all.
///
/// Kept in `UserDefaults`, on the device, and never sent anywhere. The
/// analysis request carries values and their codes, never anything about the
/// person (ADR-034).
enum RangePreferences {
  private static let key = "range-sex"

  static var sex: RangeSex {
    get {
      guard let raw = UserDefaults.standard.string(forKey: key),
        let value = RangeSex(rawValue: raw)
      else { return .any }
      return value
    }
    set { UserDefaults.standard.set(newValue.rawValue, forKey: key) }
  }
}

extension RangeSex {
  var label: String {
    switch self {
    case .any: return String(localized: "Not specified")
    case .female: return String(localized: "Female")
    case .male: return String(localized: "Male")
    }
  }
}

extension RangeGroup {
  var title: String {
    switch self {
    case .cardiovascular: return String(localized: "Cardiovascular")
    case .metabolic: return String(localized: "Metabolic")
    case .kidney: return String(localized: "Kidney")
    case .liver: return String(localized: "Liver")
    case .haematology: return String(localized: "Blood count and iron")
    case .vitamins: return String(localized: "Vitamins")
    }
  }
}

extension RangeBasis {
  var label: String {
    switch self {
    case .guideline: return String(localized: "Guideline")
    case .consensus: return String(localized: "Consensus statement")
    case .cohort: return String(localized: "Cohort study")
    }
  }
}

extension RangePlacement {
  var label: String {
    switch self {
    case .withinOptimal: return String(localized: "in the optimal band")
    case .outsideOptimal: return String(localized: "outside the optimal band")
    case .outsideGuideline: return String(localized: "outside the guideline range")
    case .noRange: return String(localized: "no published range")
    }
  }
}

/// Formats a measurement the way the reports print it.
enum Measurement {
  static func text(_ value: Double) -> String {
    if value == value.rounded() && abs(value) < 100_000 { return String(Int(value)) }
    return String(format: "%g", value)
  }
}
