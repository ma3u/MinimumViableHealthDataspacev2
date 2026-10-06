import Foundation

/// Weekly device values as FHIR R4, for the person's own EHDS record (ADR-057).
///
/// Only when the person turned on "Send my device trends to my EHDS record":
/// the four series the Trends screen draws, one Observation per metric and
/// week, exactly the points on the chart. Never a single day and never a raw
/// sample. These are their own Observations, never a `CodedLabValue` and never
/// part of a report's bundle (#186 criterion 3): status `final`, because the
/// value is computed from the device's measurements rather than read from
/// paper, and the week as `effectivePeriod`.
///
/// The hub accepts exactly these codes and units and nothing else
/// (`ui/src/lib/patient/app-wearables.ts`).
public enum WearableFHIR {

  public struct Coding: Sendable, Equatable {
    public let loinc: String
    public let display: String
    /// The UCUM code, which is also the unit sent.
    public let ucum: String
    /// FHIR observation category.
    public let category: String
    /// Decimal places a weekly mean is sent with.
    public let decimals: Int
  }

  public static func coding(_ metric: WearableMetric) -> Coding {
    switch metric {
    case .restingHeartRate:
      return Coding(
        loinc: "40443-4", display: "Heart rate --resting", ucum: "/min",
        category: "vital-signs", decimals: 1)
    case .heartRateVariability:
      return Coding(
        loinc: "80404-7", display: "R-R interval.standard deviation (Heart rate variability)",
        ucum: "ms", category: "vital-signs", decimals: 1)
    case .steps:
      return Coding(
        loinc: "41950-7", display: "Number of steps in 24 hour Measured", ucum: "/d",
        category: "activity", decimals: 0)
    case .bodyMass:
      return Coding(
        loinc: "29463-7", display: "Body weight", ucum: "kg", category: "vital-signs",
        decimals: 1)
    }
  }

  /// The series as a FHIR R4 `collection` Bundle of Observations.
  public static func bundle(
    _ series: [WearableSeries], calendar: Calendar = .iso8601Monday
  ) -> [String: Any] {
    var entries: [[String: Any]] = []
    for one in series {
      let coding = coding(one.metric)
      let devices = one.sources.joined(separator: ", ")
      for point in one.points {
        let start = day(point.weekStart, calendar)
        let end = day(
          calendar.date(byAdding: .day, value: 6, to: point.weekStart) ?? point.weekStart,
          calendar)
        var observation: [String: Any] = [
          "resourceType": "Observation",
          "id": "wear-\(one.metric.rawValue)-\(start)",
          "status": "final",
          "category": [
            [
              "coding": [
                [
                  "system": "http://terminology.hl7.org/CodeSystem/observation-category",
                  "code": coding.category,
                ]
              ]
            ]
          ],
          "code": [
            "coding": [
              ["system": "http://loinc.org", "code": coding.loinc, "display": coding.display]
            ],
            "text": one.metric.title,
          ],
          "effectivePeriod": ["start": start, "end": end],
          "valueQuantity": [
            "value": rounded(point.value, coding.decimals),
            "unit": coding.ucum,
            "system": "http://unitsofmeasure.org",
            "code": coding.ucum,
          ],
          "note": [["text": "Weekly mean of \(point.days) day(s) of device readings"]],
        ]
        if !devices.isEmpty { observation["device"] = ["display": devices] }
        entries.append(["resource": observation])
      }
    }
    return ["resourceType": "Bundle", "type": "collection", "entry": entries]
  }

  /// The bundle as JSON bytes, keys sorted so the same series sends the same bytes.
  public static func json(_ series: [WearableSeries], calendar: Calendar = .iso8601Monday)
    -> Data
  {
    (try? JSONSerialization.data(
      withJSONObject: bundle(series, calendar: calendar), options: [.sortedKeys])) ?? Data()
  }

  /// How many weekly values the bundle holds.
  public static func count(_ series: [WearableSeries]) -> Int {
    series.reduce(0) { $0 + $1.points.count }
  }

  private static func rounded(_ value: Double, _ decimals: Int) -> Double {
    let factor = pow(10, Double(decimals))
    return (value * factor).rounded() / factor
  }

  private static func day(_ date: Date, _ calendar: Calendar) -> String {
    let parts = calendar.dateComponents([.year, .month, .day], from: date)
    return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
  }
}
