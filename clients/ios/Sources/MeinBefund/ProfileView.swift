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
/// Body measurements are entered here too, and become an ordinary report with
/// `self-tracked` provenance. That way they appear in the timeline, the
/// document for a doctor and the OMOP export through the same path as a
/// laboratory's values, and are never mistaken for them.
///
/// The section shows the **current** figures rather than an empty form. It was
/// write-only before: a value could be typed and saved but never seen again or
/// corrected, and a reading transferred from a scale's screen never appeared
/// here at all. Now the latest of each measurement is loaded whatever its
/// source, so photographing a gym scale updates what this screen shows.
struct ProfileView: View {
  let profile: Profile
  /// Latest value per body analyte, from every stored report.
  let latest: [String: (value: Double, ucum: String, date: Date)]
  let onSave: (Profile) -> Void
  let onMeasurements:
    (Double?, Double?, Double?, BodyMeasurements.VisceralFatUnit, Date) -> Void
  let onClose: () -> Void

  @State private var sex: RangeSex
  @State private var hasBirthDate: Bool
  @State private var birthDate: Date
  @State private var height: String

  @State private var measuredOn: Date
  @State private var waist: String
  @State private var weight: String
  @State private var visceralFat: String
  @State private var visceralFatUnit: BodyMeasurements.VisceralFatUnit

  /// What each field was prefilled with, so the note under it can vanish the
  /// moment the person types something else. A date under a number they just
  /// changed would be a claim about when that number was measured, which
  /// would be false.
  private let prefilled: [String: String]

  init(
    profile: Profile,
    latest: [String: (value: Double, ucum: String, date: Date)] = [:],
    onSave: @escaping (Profile) -> Void,
    onMeasurements: @escaping
      (Double?, Double?, Double?, BodyMeasurements.VisceralFatUnit, Date) -> Void,
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

    // Prefilled from the most recent measurement of each, so the screen opens
    // on what is true today and every field can be corrected in place.
    _waist = State(initialValue: latest["waist-circumference"].map { Measurement.text($0.value) } ?? "")
    _weight = State(initialValue: latest["body-weight"].map { Measurement.text($0.value) } ?? "")
    let fat = latest["visceral-fat"]
    _visceralFat = State(initialValue: fat.map { Measurement.text($0.value) } ?? "")
    _visceralFatUnit = State(
      initialValue: fat.flatMap { BodyMeasurements.VisceralFatUnit(rawValue: $0.ucum) } ?? .area)
    // The day those figures were measured, so saving corrects that reading
    // rather than silently redating it. Moving the date forward records a new
    // measurement instead.
    let newest = [latest["waist-circumference"], latest["body-weight"], fat]
      .compactMap { $0?.date }.max()
    _measuredOn = State(initialValue: newest ?? Date())

    prefilled = [
      "waist-circumference": latest["waist-circumference"].map { Measurement.text($0.value) } ?? "",
      "body-weight": latest["body-weight"].map { Measurement.text($0.value) } ?? "",
      "visceral-fat": fat.map { Measurement.text($0.value) } ?? "",
    ]
  }

  /// When the value still showing in a field was measured, or nil once it has
  /// been edited or was never found.
  private func measuredNote(_ key: String, current: String) -> String? {
    guard let found = latest[key], prefilled[key] == current, !current.isEmpty else { return nil }
    return String(
      format: String(localized: "Last measured %@"),
      found.date.formatted(date: .abbreviated, time: .omitted))
  }

  private var edited: Profile {
    Profile(
      sex: sex, birthDate: hasBirthDate ? ReportMetadata.calendarDay(birthDate) : nil,
      heightCm: number(height), updatedAt: profile.updatedAt)
  }

  private var enteredMeasurements: [BodyMeasurements.Entry] {
    BodyMeasurements.entries(
      waistCm: number(waist), weightKg: number(weight), visceralFat: number(visceralFat),
      visceralFatUnit: visceralFatUnit, heightCm: nil, profile: edited)
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
          entryField("Height", text: $height, unit: "cm")
        } header: {
          Text("You")
        } footer: {
          Text(
            "Used only to pick the published ranges that apply to you. Encrypted on this device, and never sent anywhere: a question you ask about your values carries the values and their codes, never anything about you."
          )
        }

        Section {
          DatePicker("Measured", selection: $measuredOn, in: ...Date(), displayedComponents: .date)
          entryField(
            "Waist", text: $waist, unit: "cm",
            note: measuredNote("waist-circumference", current: waist))
          entryField(
            "Weight", text: $weight, unit: "kg",
            note: measuredNote("body-weight", current: weight))
          visceralFatField
          if let waistValue = number(waist), let ratio = edited.waistToHeight(waistCm: waistValue) {
            LabeledContent("Waist to height", value: String(format: "%.2f", ratio))
          }
          if let weightValue = number(weight), let bmi = edited.bodyMassIndex(weightKg: weightValue)
          {
            LabeledContent("BMI", value: String(format: "%.1f", bmi))
          }
          Button("Save these measurements") {
            onMeasurements(
              number(waist), number(weight), number(visceralFat), visceralFatUnit, measuredOn)
          }
          .disabled(enteredMeasurements.isEmpty)
        } header: {
          Text("Body measurements")
        } footer: {
          VStack(alignment: .leading, spacing: 4) {
            Text(
              "Saved as their own report, marked as entered by you rather than measured by a laboratory, so they appear in your trends and exports. Saving on the same date corrects that measurement; move the date to record a new one."
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
          Button("Save") {
            onSave(edited)
            onClose()
          }
        }
      }
    }
  }

  /// Visceral fat, with the unit as a choice rather than an assumption.
  private var visceralFatField: some View {
    VStack(alignment: .leading, spacing: 2) {
      LabeledContent("Visceral fat") {
        HStack {
          TextField(text: $visceralFat, prompt: nil) { Text("Visceral fat") }
            .keyboardType(.decimalPad)
            .multilineTextAlignment(.trailing)
            .labelsHidden()
          Picker("Unit", selection: $visceralFatUnit) {
            Text("cm²").tag(BodyMeasurements.VisceralFatUnit.area)
            Text("kg").tag(BodyMeasurements.VisceralFatUnit.mass)
          }
          .pickerStyle(.menu)
          .labelsHidden()
        }
      }
      if let note = measuredNote("visceral-fat", current: visceralFat) {
        Text(note).font(.caption2).foregroundStyle(.secondary)
      }
    }
  }

  /// A number with its unit beside it.
  ///
  /// The unit is not also used as the field's placeholder: an empty field then
  /// reads as though it already held the text "cm²", which is what made this
  /// screen look uneditable.
  private func entryField(
    _ title: String, text: Binding<String>, unit: String, note: String? = nil
  ) -> some View {
    VStack(alignment: .leading, spacing: 2) {
      LabeledContent(title) {
        HStack {
          TextField(text: text, prompt: nil) { Text(title) }
            .keyboardType(.decimalPad)
            .multilineTextAlignment(.trailing)
            .labelsHidden()
          Text(unit).foregroundStyle(.secondary)
        }
      }
      if let note {
        Text(note).font(.caption2).foregroundStyle(.secondary)
      }
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
