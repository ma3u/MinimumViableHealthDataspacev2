import Foundation

/// A name and a laboratory to suggest for a new report, from what was read.
///
/// The person can change both; the suggestion only saves typing and keeps
/// the list readable: "Langzeit-EKG, Praxis Muster" says more than the
/// laboratory's name alone, which the list would otherwise show for every
/// report from one practice.
public enum ReportSuggestion {

  /// What kind of report the values make, in words.
  public static func kind(of coded: [CodedLabValue]) -> String? {
    let codes = Set(coded.compactMap(\.coding.loinc))
    let keys = Set(coded.map(\.coding.analyteKey))
    if codes.contains("76637-8") { return String(localized: "Holter ECG") }
    if !codes.isDisjoint(with: ["8897-1", "8625-6", "8633-0", "8634-8", "76635-2"]) {
      return String(localized: "Resting ECG")
    }
    if !codes.isDisjoint(with: ["8490-5", "8472-3"]) {
      return String(localized: "24-hour blood pressure")
    }
    if !codes.isDisjoint(with: ["103749-8", "94122-9", "94124-5"]) {
      return String(localized: "Cardiopulmonary exercise test")
    }
    if !codes.isDisjoint(with: ["19868-9", "20150-9"]) {
      return String(localized: "Spirometry")
    }
    if !keys.isDisjoint(with: ["anaerobic-threshold-power", "lactate-threshold-power"]) {
      return String(localized: "Lactate test")
    }
    if codes.contains("93342-4") || !keys.isDisjoint(with: ["pwc-130", "pwc-150", "pwc-170"]) {
      return String(localized: "Exercise ECG")
    }
    if !keys.isDisjoint(with: ["lean-soft-tissue", "bmd-total-body", "android-fat"]) {
      return String(localized: "Body composition (DXA)")
    }
    if !codes.isDisjoint(with: ["97507-8", "105273-7", "97510-2", "97506-0"]) {
      return String(localized: "Glucose sensor")
    }
    guard !coded.isEmpty else { return nil }
    let bloodCount: Set<String> = [
      "haemoglobin", "hemoglobin", "leukocytes", "erythrocytes", "platelets", "haematocrit",
      "hematocrit", "mcv", "mch", "mchc",
    ]
    let lipids: Set<String> = [
      "cholesterol-total", "cholesterol-ldl", "cholesterol-hdl", "triglycerides", "lipoprotein-a",
      "apolipoprotein-b",
    ]
    if keys.isSubset(of: lipids.union(["hba1c"])), keys.count >= 2 {
      return String(localized: "Lipid profile")
    }
    if Double(keys.intersection(bloodCount).count) >= Double(keys.count) * 0.7, keys.count >= 3 {
      return String(localized: "Blood count")
    }
    return String(localized: "Lab report")
  }

  /// "Kind, Laboratory", or whichever of the two is known.
  public static func title(
    coded: [CodedLabValue], laboratory: String?, fallback: String? = nil
  ) -> String {
    let lab = laboratory.map(shortened)?.trimmingCharacters(in: .whitespaces)
    switch (kind(of: coded), lab) {
    case let (kind?, lab?) where !lab.isEmpty: return "\(kind), \(lab)"
    case let (kind?, _): return kind
    case let (nil, lab?) where !lab.isEmpty: return lab
    default: return fallback ?? String(localized: "Lab report")
    }
  }

  /// A laboratory's name without its legal form and address tail, so a
  /// title stays short: `MVZ Labor Musterstadt GmbH, Musterstraße 1` becomes
  /// `MVZ Labor Musterstadt`.
  static func shortened(_ laboratory: String) -> String {
    var name = laboratory.components(separatedBy: CharacterSet(charactersIn: ",|·")).first
      ?? laboratory
    name = name.replacingOccurrences(
      of: #"\s+(GmbH|AG|e\.\s?V\.|mbH|GbR|KG|Ltda?\.?|Inc\.?)\b.*$"#, with: "",
      options: [.regularExpression, .caseInsensitive])
    return String(name.trimmingCharacters(in: .whitespaces).prefix(40))
  }
}
