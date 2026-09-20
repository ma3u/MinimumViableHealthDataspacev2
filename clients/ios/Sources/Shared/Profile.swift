import Foundation

/// What the app knows about the person, as opposed to about their results.
///
/// Three fields, and each is there because a published range needs it:
/// haemoglobin, HDL, ALT and waist circumference all have sex-specific
/// thresholds, and a waist reading means little without a height beside it.
/// Nothing here is collected for its own sake.
///
/// It is **sealed like a report**, not kept in `UserDefaults`. A plist in the
/// container is readable by anything that can read the container, and a date
/// of birth with a height is a good deal closer to identifying a person than
/// a preference. The one exception is which provider answers questions, which
/// is a setting rather than health data.
///
/// It never leaves the device. The analysis request carries values and their
/// codes and is refused server-side if it carries anything that identifies a
/// person (ADR-034); this type is not part of that request and a test asserts
/// it stays that way.
public struct Profile: Codable, Sendable, Equatable {

  /// Which sex-specific ranges apply. `.any` means the person has not said,
  /// and then no sex-specific range is shown at all.
  public var sex: RangeSex
  /// Used for the age a guideline is stated for, and for nothing else. The day
  /// is kept rather than only the year because a person who enters a birthday
  /// expects to see their age, not their age bracket.
  public var birthDate: Date?
  /// Centimetres. Changes rarely, so it is an attribute rather than a
  /// measurement in the timeline.
  public var heightCm: Double?
  public var updatedAt: Date

  public init(
    sex: RangeSex = .any, birthDate: Date? = nil, heightCm: Double? = nil,
    updatedAt: Date = Date()
  ) {
    self.sex = sex
    self.birthDate = birthDate
    self.heightCm = heightCm
    self.updatedAt = updatedAt
  }

  public static let empty = Profile()

  public var isEmpty: Bool {
    sex == .any && birthDate == nil && heightCm == nil
  }

  /// Completed years on a given day, or nil without a birth date.
  public func age(on day: Date = Date()) -> Int? {
    guard let birthDate else { return nil }
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = TimeZone(identifier: "UTC") ?? .current
    let years = calendar.dateComponents([.year], from: birthDate, to: day).year
    guard let years, years >= 0, years < 130 else { return nil }
    return years
  }

  /// The year a research export needs, without the day it does not.
  public var birthYear: Int? {
    guard let birthDate else { return nil }
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = TimeZone(identifier: "UTC") ?? .current
    return calendar.component(.year, from: birthDate)
  }

  /// Waist divided by height, both in centimetres.
  ///
  /// Arithmetic, not a threshold. The app quotes no band for it, because the
  /// guideline that recommends one could not be fetched to be cited, and an
  /// uncited number is what the sites this was modelled on already offer.
  public func waistToHeight(waistCm: Double) -> Double? {
    guard let heightCm, heightCm > 0 else { return nil }
    return waistCm / heightCm
  }

  /// Body mass index from a weight, in kilograms.
  public func bodyMassIndex(weightKg: Double) -> Double? {
    guard let heightCm, heightCm > 0 else { return nil }
    let metres = heightCm / 100
    return weightKg / (metres * metres)
  }

  private enum CodingKeys: String, CodingKey {
    case sex, birthDate, heightCm, updatedAt
  }

  /// Every field is optional on the way in, so a profile written by an older
  /// version still opens.
  public init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    sex = try c.decodeIfPresent(RangeSex.self, forKey: .sex) ?? .any
    birthDate = try c.decodeIfPresent(Date.self, forKey: .birthDate)
    heightCm = try c.decodeIfPresent(Double.self, forKey: .heightCm)
    updatedAt = try c.decodeIfPresent(Date.self, forKey: .updatedAt) ?? Date()
  }
}

/// A body measurement the person entered, on its way into the store.
///
/// Entered measurements become an ordinary report with `self-tracked`
/// provenance, so they appear in the timeline, the export and the OMOP tables
/// exactly like a laboratory's values, and are never mistaken for them: the
/// provenance already means `preliminary`.
public enum BodyMeasurements {

  public struct Entry: Sendable, Equatable {
    public let analyteKey: String
    public let label: String
    public let value: Double
    public let ucum: String

    public init(analyteKey: String, label: String, value: Double, ucum: String) {
      self.analyteKey = analyteKey
      self.label = label
      self.value = value
      self.ucum = ucum
    }
  }

  /// The measurements the profile screen offers, in the order it shows them.
  public static func entries(
    waistCm: Double?, weightKg: Double?, visceralFatCm2: Double?, heightCm: Double?,
    profile: Profile
  ) -> [Entry] {
    var entries: [Entry] = []
    if let heightCm {
      entries.append(
        Entry(analyteKey: "body-height", label: "Körpergröße", value: heightCm, ucum: "cm"))
    }
    if let weightKg {
      entries.append(
        Entry(analyteKey: "body-weight", label: "Körpergewicht", value: weightKg, ucum: "kg"))
      if let bmi = profile.bodyMassIndex(weightKg: weightKg) {
        entries.append(
          Entry(
            analyteKey: "bmi", label: "BMI", value: (bmi * 10).rounded() / 10, ucum: "kg/m2"))
      }
    }
    if let waistCm {
      entries.append(
        Entry(analyteKey: "waist-circumference", label: "Taillenumfang", value: waistCm, ucum: "cm"))
    }
    if let visceralFatCm2 {
      entries.append(
        Entry(
          analyteKey: "visceral-fat-area", label: "Viszerales Fett", value: visceralFatCm2,
          ucum: "cm2"))
    }
    return entries
  }

  /// Turns entries into a report, coded through the same dictionary as a scan.
  ///
  /// An entry the dictionary cannot code is reported as unmapped rather than
  /// dropped, which is the same rule every other path follows.
  public static func report(
    entries: [Entry], on date: Date, id: UUID = UUID(), title: String = "Body measurements"
  ) -> LabReport? {
    guard !entries.isEmpty else { return nil }
    var coded: [CodedLabValue] = []
    var unmapped: [UnmappedLabValue] = []

    for (index, entry) in entries.enumerated() {
      let raw = RawLabValue(
        label: entry.label, value: entry.value, unitRaw: entry.ucum,
        line: "\(entry.label) \(entry.value) \(entry.ucum)", lineNumber: index + 1)
      if let coding = Analytes.lookup(label: entry.label, unit: entry.ucum) {
        coded.append(CodedLabValue(raw: raw, coding: coding, source: .selfTracked))
      } else {
        unmapped.append(UnmappedLabValue(raw: raw, reason: .unknownAnalyte))
      }
    }

    return LabReport(
      id: id, scannedAt: Date(), collectedOn: date, title: title,
      extraction: ExtractionResult(
        coded: coded, unmapped: unmapped, suspiciousLines: [], source: .selfTracked),
      metadata: ReportMetadata(labDate: date, labDateRole: .collection, dateSource: .user))
  }
}
