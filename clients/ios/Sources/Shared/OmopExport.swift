import Foundation

/// The stored reports as OMOP CDM v5.4 tables.
///
/// ## Why the concept ids are zero
///
/// Mapping a LOINC code to an OMOP `measurement_concept_id` needs the Athena
/// vocabulary, which is a licensed download of hundreds of megabytes and is
/// not on the phone. Inventing an id from memory would put a wrong identifier
/// on a real measurement, which is the same class of error as coding an
/// analyte by its label.
///
/// OMOP has a convention for exactly this, and it is the one the graph in this
/// repository already follows: `measurement_concept_id = 0` with the source
/// code preserved in `measurement_source_value`. The mapping then happens
/// once, downstream, where the vocabulary lives, rather than twice.
///
/// ## What the tables carry
///
/// - `measurement.csv` is the content: one row per coded value, with the LOINC
///   code as the source value, the UCUM unit as `unit_source_value`, and the
///   **laboratory's own printed reference range** in `range_low` and
///   `range_high`, which is what those columns mean in the CDM.
/// - `person.csv` is deliberately a placeholder. The app holds no name, no
///   birth date and no insurance number, so there is nothing to put in the
///   identifying columns, and a research export is the last place to start
///   inventing them.
/// - `observation_period.csv` spans the first to the last measurement.
///
/// A quantity LOINC does not code, such as the visceral fat **mass** a
/// bioimpedance scale reports, carries its printed label in
/// `measurement_source_value` instead of a code. The column means the source's
/// own value, so a label is the honest content, and a downstream mapper sees
/// something unmappable rather than a plausible wrong code.
///
/// Provenance travels too: an OCR transcription is not the laboratory's own
/// figure, so `value_source_value` carries the comparator and the reading, and
/// every row names the source document it came from.
public enum OmopExport {

  /// CDM v5.4 column order, as the specification lists it.
  static let measurementColumns = [
    "measurement_id", "person_id", "measurement_concept_id", "measurement_date",
    "measurement_datetime", "measurement_time", "measurement_type_concept_id",
    "operator_concept_id", "value_as_number", "value_as_concept_id", "unit_concept_id",
    "range_low", "range_high", "provider_id", "visit_occurrence_id", "visit_detail_id",
    "measurement_source_value", "measurement_source_concept_id", "unit_source_value",
    "unit_source_concept_id", "value_source_value", "measurement_event_id",
    "meas_event_field_concept_id",
  ]

  static let personColumns = [
    "person_id", "gender_concept_id", "year_of_birth", "month_of_birth", "day_of_birth",
    "birth_datetime", "race_concept_id", "ethnicity_concept_id", "location_id", "provider_id",
    "care_site_id", "person_source_value", "gender_source_value", "gender_source_concept_id",
    "race_source_value", "race_source_concept_id", "ethnicity_source_value",
    "ethnicity_source_concept_id",
  ]

  static let observationPeriodColumns = [
    "observation_period_id", "person_id", "observation_period_start_date",
    "observation_period_end_date", "period_type_concept_id",
  ]

  /// The person id used throughout. One person, whose identity the app does
  /// not hold.
  public static let personId = 1

  public struct Bundle: Sendable, Equatable {
    /// File name to contents.
    public let files: [String: String]
    public let measurementCount: Int

    public init(files: [String: String], measurementCount: Int) {
      self.files = files
      self.measurementCount = measurementCount
    }
  }

  /// Builds the tables from every stored report.
  ///
  /// Rows are ordered by date and then by LOINC code, so two exports of the
  /// same data are byte-identical and a diff between them means something.
  public static func bundle(
    from reports: [LabReport], profile: Profile = .empty, generatedAt: Date = Date()
  ) -> Bundle {
    let day = DateFormatter.omopDay
    let stamp = DateFormatter.omopStamp

    struct Row {
      let date: Date
      /// What goes in `measurement_source_value`: the LOINC code, or the
      /// printed label where LOINC has no code for the quantity. That column
      /// means "the code as it appears in the source data", and for a
      /// bioimpedance scale's visceral fat mass the label is that.
      let sourceValue: String
      let value: CodedLabValue
      let reportTitle: String
    }

    var rows: [Row] = []
    for report in reports {
      for value in report.extraction.coded {
        rows.append(
          Row(
            date: report.effectiveDate,
            sourceValue: value.coding.loinc ?? value.raw.label, value: value,
            reportTitle: report.title))
      }
    }
    rows.sort {
      ($0.date, $0.sourceValue, $0.value.raw.label)
        < ($1.date, $1.sourceValue, $1.value.raw.label)
    }

    var measurement = [measurementColumns.joined(separator: ",")]
    for (index, row) in rows.enumerated() {
      let raw = row.value.raw
      let comparator = raw.comparator?.rawValue ?? ""
      measurement.append(
        [
          String(index + 1),
          String(personId),
          "0",  // no vocabulary on the device; mapped downstream
          day.string(from: row.date),
          stamp.string(from: row.date),
          "",
          "0",  // measurement_type_concept_id
          "0",  // operator_concept_id: the comparator is in value_source_value
          number(raw.value),
          "0",
          "0",  // unit_concept_id: UCUM is in unit_source_value
          raw.referenceLow.map(number) ?? "",
          raw.referenceHigh.map(number) ?? "",
          "", "", "",
          csv(row.sourceValue),
          "0",
          csv(row.value.coding.ucum),
          "0",
          csv("\(comparator)\(number(raw.value)) \(raw.unitRaw)"),
          "", "",
        ].joined(separator: ","))
    }

    // What the profile knows, and nothing more. The year of birth is what the
    // CDM asks for and what an age-adjusted analysis needs; the day is not,
    // so the day is not written.
    let person =
      [
        personColumns.joined(separator: ","),
        [
          String(personId),
          "0",  // gender_concept_id: see gender_source_value
          profile.birthYear.map(String.init) ?? "",
          "", "", "",
          "0", "0", "", "", "",
          csv("klarbefund-local"),
          csv(profile.sex == .any ? "" : profile.sex.rawValue),
          "0", "", "0", "", "0",
        ].joined(separator: ","),
      ].joined(separator: "\n") + "\n"

    var files = [
      "measurement.csv": measurement.joined(separator: "\n") + "\n",
      "person.csv": person,
      "README.txt": readme(
        measurements: rows.count, reports: reports.count, generatedAt: generatedAt),
    ]

    if let first = rows.first?.date, let last = rows.last?.date {
      files["observation_period.csv"] =
        [
          observationPeriodColumns.joined(separator: ","),
          ["1", String(personId), day.string(from: first), day.string(from: last), "0"].joined(
            separator: ","),
        ].joined(separator: "\n") + "\n"
    }

    return Bundle(files: files, measurementCount: rows.count)
  }

  static func readme(measurements: Int, reports: Int, generatedAt: Date) -> String {
    """
    OMOP CDM v5.4 export from Klarbefund
    Generated \(DateFormatter.omopStamp.string(from: generatedAt))

    \(measurements) measurements from \(reports) report(s), for one person.

    Concept ids are 0 throughout, and this is deliberate rather than
    unfinished. Mapping LOINC to an OMOP concept_id requires the Athena
    vocabulary, which is not present on a phone. OMOP's convention for that
    case is concept_id 0 with the original code preserved in the *_source_value
    column, and that is what these files do:

      measurement_source_value  the LOINC code
      unit_source_value         the UCUM unit
      value_source_value        the value as printed, with its comparator
      range_low, range_high     the reference range the laboratory printed

    Map them where the vocabulary lives. Doing it twice, once here and once
    downstream, is how two mappings drift apart.

    Values read from a photograph are transcriptions, not the laboratory's own
    figures. The accompanying FHIR bundle carries that distinction per
    observation in Observation.status; the CDM has no column for it, so treat
    an export that mixes both as provisional unless the FHIR bundle says
    otherwise.

    Not a clinical dataset. Not a diagnosis.
    """
  }

  /// OMOP CSV is plain: quote only what needs it, never localise a number.
  static func csv(_ field: String) -> String {
    guard field.contains(where: { $0 == "," || $0 == "\"" || $0 == "\n" }) else { return field }
    return "\"" + field.replacingOccurrences(of: "\"", with: "\"\"") + "\""
  }

  static func number(_ value: Double) -> String {
    if value == value.rounded() && abs(value) < 1e15 { return String(Int(value)) }
    return String(format: "%g", value)
  }
}

extension DateFormatter {
  /// `yyyy-MM-dd`, UTC, as the CDM expects.
  static let omopDay: DateFormatter = {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.timeZone = TimeZone(identifier: "UTC")
    formatter.dateFormat = "yyyy-MM-dd"
    return formatter
  }()

  static let omopStamp: DateFormatter = {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.timeZone = TimeZone(identifier: "UTC")
    formatter.dateFormat = "yyyy-MM-dd HH:mm:ss"
    return formatter
  }()
}
