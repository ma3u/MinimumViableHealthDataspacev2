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
struct ProfileView: View {
  let profile: Profile
  let onSave: (Profile) -> Void
  let onMeasurements: (Double?, Double?, Double?, Date) -> Void
  let onClose: () -> Void

  @State private var sex: RangeSex
  @State private var hasBirthDate: Bool
  @State private var birthDate: Date
  @State private var height: String

  @State private var measuredOn = Date()
  @State private var waist = ""
  @State private var weight = ""
  @State private var visceralFat = ""

  init(
    profile: Profile, onSave: @escaping (Profile) -> Void,
    onMeasurements: @escaping (Double?, Double?, Double?, Date) -> Void,
    onClose: @escaping () -> Void
  ) {
    self.profile = profile
    self.onSave = onSave
    self.onMeasurements = onMeasurements
    self.onClose = onClose
    _sex = State(initialValue: profile.sex)
    _hasBirthDate = State(initialValue: profile.birthDate != nil)
    _birthDate = State(
      initialValue: profile.birthDate ?? ReportMetadataExtractor.day(1980, 1, 1) ?? Date())
    _height = State(initialValue: profile.heightCm.map { Measurement.text($0) } ?? "")
  }

  private var edited: Profile {
    Profile(
      sex: sex, birthDate: hasBirthDate ? ReportMetadata.calendarDay(birthDate) : nil,
      heightCm: number(height), updatedAt: profile.updatedAt)
  }

  private var enteredMeasurements: [BodyMeasurements.Entry] {
    BodyMeasurements.entries(
      waistCm: number(waist), weightKg: number(weight), visceralFatCm2: number(visceralFat),
      heightCm: nil, profile: edited)
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
          LabeledContent("Height") {
            HStack {
              TextField("cm", text: $height)
                .keyboardType(.decimalPad)
                .multilineTextAlignment(.trailing)
              Text("cm").foregroundStyle(.secondary)
            }
          }
        } header: {
          Text("You")
        } footer: {
          Text(
            "Used only to pick the published ranges that apply to you. Encrypted on this device, and never sent anywhere: a question you ask about your values carries the values and their codes, never anything about you."
          )
        }

        Section {
          DatePicker("Measured", selection: $measuredOn, in: ...Date(), displayedComponents: .date)
          entryField("Waist", text: $waist, unit: "cm")
          entryField("Weight", text: $weight, unit: "kg")
          entryField("Visceral fat", text: $visceralFat, unit: "cm²")
          if let waistValue = number(waist), let ratio = edited.waistToHeight(waistCm: waistValue) {
            LabeledContent("Waist to height", value: String(format: "%.2f", ratio))
          }
          if let weightValue = number(weight), let bmi = edited.bodyMassIndex(weightKg: weightValue)
          {
            LabeledContent("BMI", value: String(format: "%.1f", bmi))
          }
          Button("Save these measurements") {
            onMeasurements(number(waist), number(weight), number(visceralFat), measuredOn)
            waist = ""
            weight = ""
            visceralFat = ""
          }
          .disabled(enteredMeasurements.isEmpty)
        } header: {
          Text("Body measurements")
        } footer: {
          Text(
            "Saved as their own report, marked as entered by you rather than measured by a laboratory, so they appear in your trends and exports. Visceral fat is an area in square centimetres, as a body-composition device reports it; a scale's rating from 1 to 59 is a different quantity and does not belong here."
          )
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

  private func entryField(_ title: String, text: Binding<String>, unit: String) -> some View {
    LabeledContent(title) {
      HStack {
        TextField(unit, text: text)
          .keyboardType(.decimalPad)
          .multilineTextAlignment(.trailing)
        Text(unit).foregroundStyle(.secondary)
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
