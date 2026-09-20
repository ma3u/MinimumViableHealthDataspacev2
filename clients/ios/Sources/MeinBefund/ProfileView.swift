import Shared
import SwiftUI

/// The few facts about the person that a published range needs.
///
/// Sex, because haemoglobin, HDL, ALT and waist circumference all have
/// sex-specific thresholds. Date of birth, because a guideline states an age
/// it applies to. Height, because a waist reading means little without one.
/// Nothing here is collected for its own sake, and all of it is sealed in the
/// store rather than kept in `UserDefaults`, where anything that can read the
/// container could read it.
///
/// Body measurements are entered here too, and become ordinary reports with
/// `self-tracked` provenance, so they appear in the timeline, the document for
/// a doctor and the OMOP export through the same path as a laboratory's
/// values, and are never mistaken for them.
///
/// Two things this screen got wrong and no longer does. It was write-only: a
/// value could be typed and saved but never seen again or corrected, and a
/// reading transferred from a scale's screen never appeared here at all. And
/// it carried **one** date for every measurement, which is almost never true:
/// the tape measure comes out at home, the scale stands in a gym, and the
/// laboratory weighs you on a third day. Each field now shows what was last
/// measured, when, and lets both be changed.
struct ProfileView: View {
  let profile: Profile
  /// Latest value per body analyte, from every stored report.
  let latest: [String: (value: Double, ucum: String, date: Date)]
  let onSave: (Profile) -> Void
  /// Each measurement with its own day, so they can be filed apart.
  let onMeasurements:
    (
      BodyMeasurements.Reading?, BodyMeasurements.Reading?, BodyMeasurements.Reading?,
      BodyMeasurements.VisceralFatUnit
    ) -> Void
  let onClose: () -> Void

  @State private var sex: RangeSex
  @State private var hasBirthDate: Bool
  @State private var birthDate: Date
  @State private var height: String

  @State private var waist: String
  @State private var waistDate: Date
  @State private var weight: String
  @State private var weightDate: Date
  @State private var visceralFat: String
  @State private var visceralFatDate: Date
  @State private var visceralFatUnit: BodyMeasurements.VisceralFatUnit

  init(
    profile: Profile,
    latest: [String: (value: Double, ucum: String, date: Date)] = [:],
    onSave: @escaping (Profile) -> Void,
    onMeasurements: @escaping (
      BodyMeasurements.Reading?, BodyMeasurements.Reading?, BodyMeasurements.Reading?,
      BodyMeasurements.VisceralFatUnit
    ) -> Void,
    onClose: @escaping () -> Void
  ) {
    self.profile = profile
    self.latest = latest
    self.onSave = onSave
    self.onMeasurements = onMeasurements
    self.onClose = onClose
    _sex = State(initialValue: profile.sex)
    _hasBirthDate = State(initialValue: profile.birthDate != nil)
    _birthDate = State(
      initialValue: profile.birthDate ?? ReportMetadataExtractor.day(1980, 1, 1) ?? Date())
    _height = State(initialValue: profile.heightCm.map { Measurement.text($0) } ?? "")

    // Prefilled from the most recent measurement of each, with the day it was
    // taken, so the screen opens on what is true and every part is editable.
    let waistFound = latest["waist-circumference"]
    let weightFound = latest["body-weight"]
    let fatFound = latest["visceral-fat"]
    _waist = State(initialValue: waistFound.map { Measurement.text($0.value) } ?? "")
    _waistDate = State(initialValue: waistFound?.date ?? Date())
    _weight = State(initialValue: weightFound.map { Measurement.text($0.value) } ?? "")
    _weightDate = State(initialValue: weightFound?.date ?? Date())
    _visceralFat = State(initialValue: fatFound.map { Measurement.text($0.value) } ?? "")
    _visceralFatDate = State(initialValue: fatFound?.date ?? Date())
    _visceralFatUnit = State(
      initialValue: fatFound.flatMap { BodyMeasurements.VisceralFatUnit(rawValue: $0.ucum) }
        ?? .area)
  }

  private var edited: Profile {
    Profile(
      sex: sex, birthDate: hasBirthDate ? ReportMetadata.calendarDay(birthDate) : nil,
      heightCm: number(height), updatedAt: profile.updatedAt)
  }

  private var waistReading: BodyMeasurements.Reading? {
    number(waist).map { .init(value: $0, measuredOn: waistDate) }
  }
  private var weightReading: BodyMeasurements.Reading? {
    number(weight).map { .init(value: $0, measuredOn: weightDate) }
  }
  private var visceralReading: BodyMeasurements.Reading? {
    number(visceralFat).map { .init(value: $0, measuredOn: visceralFatDate) }
  }

  var body: some View {
    NavigationStack {
      Form {
        Section {
          Picker("Sex", selection: $sex) {
            ForEach(RangeSex.allCases, id: \.self) { Text($0.label).tag($0) }
          }
          Toggle("Date of birth", isOn: $hasBirthDate.animation())
          if hasBirthDate {
            DatePicker(
              "Born", selection: $birthDate, in: ...Date(), displayedComponents: .date)
            if let age = edited.age() {
              LabeledContent("Age", value: "\(age)")
            }
          }
          numberRow("Height", text: $height, unit: "cm")
        } header: {
          Text("You")
        } footer: {
          Text(
            "Used only to pick the published ranges that apply to you. Encrypted on this device, and never sent anywhere: a question you ask about your values carries the values and their codes, never anything about you."
          )
        }

        Section {
          measurementRow("Waist", text: $waist, unit: "cm", date: $waistDate, key: "waist-circumference")
          measurementRow("Weight", text: $weight, unit: "kg", date: $weightDate, key: "body-weight")
          visceralFatRow
          if let waistValue = number(waist), let ratio = edited.waistToHeight(waistCm: waistValue) {
            LabeledContent("Waist to height", value: String(format: "%.2f", ratio))
          }
          if let weightValue = number(weight), let bmi = edited.bodyMassIndex(weightKg: weightValue)
          {
            LabeledContent("BMI", value: String(format: "%.1f", bmi))
          }
        } header: {
          Text("Body measurements")
        } footer: {
          VStack(alignment: .leading, spacing: 4) {
            Text(
              "Each measurement keeps its own date, because they are rarely taken on the same day. Save stores them as reports marked entered by you rather than measured by a laboratory, one per date, so they appear in your trends and exports."
            )
            if visceralFatUnit == .mass {
              Text(
                "An area in square centimetres and a mass in kilograms are different quantities, so pick the one your device shows. LOINC has a code for the area and none for the mass, and a reading in kilograms is exported with its label instead of a code rather than with a code that would be wrong."
              )
            }
          }
        }
      }
      .navigationTitle("Profile")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) { Button("Cancel", action: onClose) }
        ToolbarItem(placement: .confirmationAction) {
          // Saves everything on the screen. There used to be a second button
          // for the measurements alone, and a waist typed above it was thrown
          // away by the obvious button up here.
          Button("Save") {
            onSave(edited)
            onMeasurements(waistReading, weightReading, visceralReading, visceralFatUnit)
            onClose()
          }
        }
      }
    }
  }

  /// Visceral fat, with the unit as a choice rather than an assumption.
  private var visceralFatRow: some View {
    VStack(alignment: .leading, spacing: 6) {
      HStack {
        Text("Visceral fat")
        Spacer(minLength: 12)
        TextField(text: $visceralFat, prompt: nil) { Text("Visceral fat") }
          .keyboardType(.decimalPad)
          .multilineTextAlignment(.trailing)
          .labelsHidden()
          .accessibilityIdentifier("profile-visceral-fat")
        Picker("Unit", selection: $visceralFatUnit) {
          Text("cm²").tag(BodyMeasurements.VisceralFatUnit.area)
          Text("kg").tag(BodyMeasurements.VisceralFatUnit.mass)
        }
        .pickerStyle(.menu)
        .labelsHidden()
      }
      dateRow($visceralFatDate, key: "visceral-fat")
    }
  }

  /// A number, its unit, and the day it was measured.
  ///
  /// A plain `HStack` rather than `LabeledContent`: that container presents
  /// its content as a value to read, and a text field inside one is easy to
  /// miss as something you can tap.
  private func measurementRow(
    _ title: String, text: Binding<String>, unit: String, date: Binding<Date>, key: String
  ) -> some View {
    VStack(alignment: .leading, spacing: 6) {
      HStack {
        Text(title)
        Spacer(minLength: 12)
        TextField(text: text, prompt: nil) { Text(title) }
          .keyboardType(.decimalPad)
          .multilineTextAlignment(.trailing)
          .labelsHidden()
          .accessibilityIdentifier("profile-\(key)")
        Text(unit).foregroundStyle(.secondary)
      }
      dateRow(date, key: key)
    }
  }

  /// The day one measurement was taken, and where that day came from.
  private func dateRow(_ date: Binding<Date>, key: String) -> some View {
    HStack {
      DatePicker("Measured", selection: date, in: ...Date(), displayedComponents: .date)
        .datePickerStyle(.compact)
        .font(.caption)
      if let found = latest[key], ReportMetadata.calendarDay(found.date) == ReportMetadata.calendarDay(date.wrappedValue) {
        Text("from your reports").font(.caption2).foregroundStyle(.secondary)
      }
    }
  }

  /// A plain number with its unit, for the profile's own fields.
  private func numberRow(_ title: String, text: Binding<String>, unit: String) -> some View {
    HStack {
      Text(title)
      Spacer(minLength: 12)
      TextField(text: text, prompt: nil) { Text(title) }
        .keyboardType(.decimalPad)
        .multilineTextAlignment(.trailing)
        .labelsHidden()
      Text(unit).foregroundStyle(.secondary)
    }
  }

  /// A decimal comma is what a German keyboard offers, so both separators are
  /// accepted. An empty field is absence, never zero.
  private func number(_ text: String) -> Double? {
    let trimmed = text.trimmingCharacters(in: .whitespaces)
    guard !trimmed.isEmpty else { return nil }
    return LabLineParser.parseNumber(trimmed)
  }
}
