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

  // Seeded once, when the screen appears, and never again.
  //
  // These used to be filled by `State(initialValue:)` in the initialiser.
  // That runs every time the sheet's content is rebuilt, and SwiftUI then
  // puts the stored value back: a weight typed by hand reverted to the one
  // from the reports a moment later, which is the opposite of what a field
  // is for.
  @State private var seeded = false
  @State private var sex: RangeSex = .any
  @State private var hasBirthDate = false
  @State private var birthDate = Date()
  @State private var height = ""

  @State private var waist = Entry()
  @State private var weight = Entry()
  @State private var visceralFat = Entry()
  @State private var visceralFatUnit: BodyMeasurements.VisceralFatUnit = .area

  /// One measurement being edited: what it says, when it was measured, and
  /// whether the person changed it here.
  struct Entry: Equatable {
    var text = ""
    var date = Date()
    /// Entered on this screen rather than read from a report. A value changed
    /// by hand was measured now, not when the old one was, so its date moves
    /// to today and says who put it there.
    var manual = false
    /// What it was seeded with, to tell an edit from a redraw.
    var seededText = ""

    mutating func edited(to newText: String) {
      guard newText != text else { return }
      text = newText
      if newText == seededText {
        manual = false
      } else {
        manual = true
        date = ReportMetadata.calendarDay(Date())
      }
    }

    var binding: Binding<String> { .constant(text) }
  }

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
  }

  /// Fills the screen from the profile and the most recent measurements.
  private func seed() {
    guard !seeded else { return }
    seeded = true
    sex = profile.sex
    hasBirthDate = profile.birthDate != nil
    birthDate = profile.birthDate ?? ReportMetadataExtractor.day(1980, 1, 1) ?? Date()
    height = profile.heightCm.map { Measurement.text($0) } ?? ""

    func fill(_ key: String) -> Entry {
      guard let found = latest[key] else { return Entry() }
      let text = Measurement.text(found.value)
      return Entry(text: text, date: found.date, manual: false, seededText: text)
    }
    waist = fill("waist-circumference")
    weight = fill("body-weight")
    visceralFat = fill("visceral-fat")
    visceralFatUnit =
      latest["visceral-fat"].flatMap { BodyMeasurements.VisceralFatUnit(rawValue: $0.ucum) }
      ?? .area
  }

  private var edited: Profile {
    Profile(
      sex: sex, birthDate: hasBirthDate ? ReportMetadata.calendarDay(birthDate) : nil,
      heightCm: number(height), updatedAt: profile.updatedAt)
  }

  private var waistReading: BodyMeasurements.Reading? {
    number(waist.text).map { .init(value: $0, measuredOn: waist.date) }
  }
  private var weightReading: BodyMeasurements.Reading? {
    number(weight.text).map { .init(value: $0, measuredOn: weight.date) }
  }
  private var visceralReading: BodyMeasurements.Reading? {
    number(visceralFat.text).map { .init(value: $0, measuredOn: visceralFat.date) }
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
          measurementRow("Waist", entry: $waist, unit: "cm", key: "waist-circumference")
          measurementRow("Weight", entry: $weight, unit: "kg", key: "body-weight")
          visceralFatRow
          if let waistValue = number(waist.text),
            let ratio = edited.waistToHeight(waistCm: waistValue)
          {
            LabeledContent("Waist to height", value: String(format: "%.2f", ratio))
          }
          if let weightValue = number(weight.text),
            let bmi = edited.bodyMassIndex(weightKg: weightValue)
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
      .onAppear(perform: seed)
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
        TextField(text: text(of: $visceralFat), prompt: nil) { Text("Visceral fat") }
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
      dateRow($visceralFat)
    }
  }

  /// A number, its unit, and the day it was measured.
  ///
  /// A plain `HStack` rather than `LabeledContent`: that container presents
  /// its content as a value to read, and a text field inside one is easy to
  /// miss as something you can tap.
  private func measurementRow(
    _ title: String, entry: Binding<Entry>, unit: String, key: String
  ) -> some View {
    VStack(alignment: .leading, spacing: 6) {
      HStack {
        Text(title)
        Spacer(minLength: 12)
        TextField(text: text(of: entry), prompt: nil) { Text(title) }
          .keyboardType(.decimalPad)
          .multilineTextAlignment(.trailing)
          .labelsHidden()
          .accessibilityIdentifier("profile-\(key)")
        Text(unit).foregroundStyle(.secondary)
      }
      dateRow(entry)
    }
  }

  /// A text binding that records an edit as an edit.
  ///
  /// Typing a figure here means it was measured now, so its date moves to
  /// today and stops claiming to have come from a report. Typing the old
  /// figure back puts both claims back as they were.
  private func text(of entry: Binding<Entry>) -> Binding<String> {
    Binding(
      get: { entry.wrappedValue.text },
      set: { entry.wrappedValue.edited(to: $0) })
  }

  /// The day one measurement was taken, and where that day came from.
  private func dateRow(_ entry: Binding<Entry>) -> some View {
    HStack {
      DatePicker(
        "Measured",
        selection: Binding(
          get: { entry.wrappedValue.date },
          set: { entry.wrappedValue.date = $0 }),
        in: ...Date(), displayedComponents: .date
      )
      .datePickerStyle(.compact)
      .font(.caption)
      if entry.wrappedValue.manual {
        Text("entered by you").font(.caption2).foregroundStyle(.secondary)
      } else if !entry.wrappedValue.text.isEmpty {
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
