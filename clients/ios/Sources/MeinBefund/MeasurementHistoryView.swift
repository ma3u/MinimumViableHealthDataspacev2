import Shared
import SwiftUI

/// A run of past measurements, entered in one go.
///
/// The profile screen holds the latest of each measurement and the day it was
/// taken, which is right for keeping up but wrong for catching up: a year of
/// weights in a notebook meant saving, reopening, moving the date and saving
/// again for every morning, and each save re-seeded the screen from the newest
/// value, so the previous figure came back as you typed the next.
///
/// Here a date carries several quantities and several dates are saved at once.
/// Each becomes an ordinary report with `self-tracked` provenance, the same as
/// a measurement entered in the profile, so they join the trends, the document
/// for a doctor and the exports by the same path. A day that already has a
/// report is corrected rather than doubled.
struct MeasurementHistoryView: View {
  let profile: Profile
  let onSave: ([BodyMeasurements.DayReading]) -> Void
  let onClose: () -> Void

  @State private var rows: [Row] = [Row(date: ReportMetadata.calendarDay(Date()))]

  struct Row: Identifiable {
    let id = UUID()
    var date: Date
    var waist = ""
    var weight = ""
  }

  /// The rows that carry a number, as days to write.
  private var readings: [BodyMeasurements.DayReading] {
    rows.compactMap { row in
      let reading = BodyMeasurements.DayReading(
        id: row.id, measuredOn: row.date, waistCm: number(row.waist),
        weightKg: number(row.weight))
      return reading.isEmpty ? nil : reading
    }
  }

  var body: some View {
    NavigationStack {
      List {
        Section {
          ForEach(Array(zip(rows.indices, rows)), id: \.1.id) { index, _ in
            entryRow(index)
          }
          .onDelete { rows.remove(atOffsets: $0) }

          Button {
            rows.append(Row(date: nextDate))
          } label: {
            Label("Add a date", systemImage: "plus.circle")
          }
          .accessibilityIdentifier("history-add")
        } header: {
          Text("Measurements by date")
        } footer: {
          VStack(alignment: .leading, spacing: 4) {
            Text(
              "One date per line, with whatever you measured that day. Saving stores them as reports marked entered by you, one per date, so they appear in your trends and exports beside everything else."
            )
            if profile.heightCm == nil {
              // Said here rather than silently leaving the column out: the
              // BMI is not missing because the app cannot work it out.
              Text("Set your height in the profile and a BMI is worked out for every weight.")
            }
          }
        }
      }
      .navigationTitle("Earlier measurements")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) { Button("Cancel", action: onClose) }
        ToolbarItem(placement: .confirmationAction) {
          Button("Save") {
            onSave(readings)
            onClose()
          }
          .disabled(readings.isEmpty)
          .accessibilityIdentifier("history-save")
        }
      }
    }
  }

  /// One day: when, what was measured, and what it works out to.
  private func entryRow(_ index: Int) -> some View {
    VStack(alignment: .leading, spacing: 6) {
      DatePicker(
        "Measured", selection: $rows[index].date, in: ...Date(), displayedComponents: .date
      )
      .datePickerStyle(.compact)
      .accessibilityIdentifier("history-date-\(index)")

      field("Waist", text: $rows[index].waist, unit: "cm", id: "history-waist-\(index)")
      field("Weight", text: $rows[index].weight, unit: "kg", id: "history-weight-\(index)")

      if let weight = number(rows[index].weight), let bmi = profile.bodyMassIndex(weightKg: weight)
      {
        let waist = number(rows[index].waist)
        let ratio = waist.flatMap { profile.waistToHeight(waistCm: $0) }
        HStack(spacing: 8) {
          Text("BMI \(String(format: "%.1f", bmi))")
          if let ratio {
            Text("·")
            Text("Waist to height \(String(format: "%.2f", ratio))")
          }
        }
        .font(.caption)
        .foregroundStyle(.secondary)
      }
    }
    .padding(.vertical, 2)
  }

  private func field(_ title: String, text: Binding<String>, unit: String, id: String)
    -> some View
  {
    HStack {
      Text(title)
      Spacer(minLength: 12)
      TextField(text: text, prompt: nil) { Text(title) }
        .keyboardType(.decimalPad)
        .multilineTextAlignment(.trailing)
        .labelsHidden()
        .accessibilityIdentifier(id)
      Text(unit).foregroundStyle(.secondary)
    }
  }

  /// The day a new line starts on: a month before the oldest one there.
  ///
  /// Backwards, because this screen is for catching up rather than keeping
  /// up, and a month is the step a notebook of weights usually takes. Forward
  /// was the first attempt and it was useless: no date may be in the future,
  /// so every new line came back reading today.
  private var nextDate: Date {
    guard let oldest = rows.map(\.date).min() else { return ReportMetadata.calendarDay(Date()) }
    let stepped =
      Calendar(identifier: .gregorian).date(byAdding: .month, value: -1, to: oldest) ?? oldest
    return ReportMetadata.calendarDay(stepped)
  }

  /// A decimal comma is what a German keyboard offers, so both separators are
  /// accepted. An empty field is absence, never zero.
  private func number(_ text: String) -> Double? {
    let trimmed = text.trimmingCharacters(in: .whitespaces)
    guard !trimmed.isEmpty else { return nil }
    return LabLineParser.parseNumber(trimmed)
  }
}
