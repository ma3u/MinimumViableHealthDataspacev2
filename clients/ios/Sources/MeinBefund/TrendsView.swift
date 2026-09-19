import Charts
import Shared
import SwiftUI

/// The same analyte across every report, on one timeline.
///
/// This is what the store was built as a time series for (#186): repeated
/// panels over years, each value keeping its own provenance and its own
/// printed reference range.
///
/// Three rules the chart obeys.
///
/// A series is keyed by analyte **and** unit. Lp(a) in mg/dL and in nmol/L are
/// different LOINC codes, and drawing them on one axis would invent a trend.
///
/// A transcription is never drawn as if it were the laboratory's own figure.
/// A point read by the recogniser is hollow; a value from a laboratory's own
/// document is filled.
///
/// The band drawn behind the line is the published optimal range, labelled and
/// sourced. The range your laboratory printed is listed under each point,
/// unchanged, because that is the one that describes the assay you were
/// measured with.
struct TrendsView: View {
  let reports: [LabReport]
  let onClose: () -> Void

  @State private var sex: RangeSex = RangePreferences.sex
  @State private var onlyWithHistory = false

  private var series: [TrendSeries] {
    let all = Trends.series(from: reports, sex: sex)
    return onlyWithHistory ? Trends.withHistory(all) : all
  }

  var body: some View {
    NavigationStack {
      Group {
        if series.isEmpty {
          ContentUnavailableView {
            Label("Nothing to plot yet", systemImage: "chart.xyaxis.line")
          } description: {
            Text("Add a second report and the values that appear in both will show a trend.")
          }
        } else {
          List {
            Section {
              Toggle("Only analytes measured more than once", isOn: $onlyWithHistory)
            } footer: {
              Tally(series: Trends.series(from: reports, sex: sex))
            }

            ForEach(series) { item in
              Section {
                SeriesChart(series: item)
              } header: {
                SeriesHeader(series: item)
              } footer: {
                SeriesFooter(series: item)
              }
            }

            Section { DoctorReminder() }
          }
        }
      }
      .navigationTitle("Trends")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .confirmationAction) { Button("Done", action: onClose) }
      }
    }
  }
}

private struct Tally: View {
  let series: [TrendSeries]

  var body: some View {
    let counts = Trends.tally(series)
    let optimal = counts[.withinOptimal] ?? 0
    let outside = (counts[.outsideOptimal] ?? 0) + (counts[.outsideGuideline] ?? 0)
    let none = counts[.noRange] ?? 0
    Text(
      "\(series.count) analytes: \(optimal) in the optimal band, \(outside) outside it, \(none) with no published range."
    )
  }
}

private struct SeriesHeader: View {
  let series: TrendSeries

  var body: some View {
    HStack(alignment: .firstTextBaseline) {
      Text(AnalyteNames.title(series.analyteKey))
      Spacer()
      if let latest = series.latest {
        Text(
          "\(latest.comparator?.rawValue ?? "")\(Measurement.text(latest.value)) \(series.ucum)"
        )
        .font(.caption.monospacedDigit())
      }
    }
  }
}

private struct SeriesFooter: View {
  let series: TrendSeries

  private var changeText: String? {
    guard let change = series.change, change != 0 else { return nil }
    let arrow = change > 0 ? "↑" : "↓"
    return "\(arrow) \(Measurement.text(abs(change))) \(series.ucum) since the previous measurement"
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      if let range = series.range {
        // The published band, named and sourced. Never presented as a verdict.
        if let optimal = range.optimalText(formatter: Measurement.text) {
          Text("Optimal \(optimal) \(series.ucum). Latest value is \(series.placement.label).")
        }
        Link(range.source.label, destination: URL(string: range.source.url)!)
          .font(.caption2)
      } else {
        Text("No published range is quoted for this analyte.")
      }
      if let changeText { Text(changeText) }
      if let printed = printedRangeText {
        // The laboratory's own range, verbatim, because it describes the assay.
        Text("Your laboratory printed \(printed) beside the latest value.")
      }
      if !series.allLabIssued {
        Text("Hollow points were read from a photograph and are preliminary.")
      }
    }
  }

  private var printedRangeText: String? {
    guard let latest = series.latest else { return nil }
    switch (latest.printedLow, latest.printedHigh) {
    case let (low?, high?): return "\(Measurement.text(low)) – \(Measurement.text(high))"
    case let (nil, high?): return "< \(Measurement.text(high))"
    case let (low?, nil): return "> \(Measurement.text(low))"
    default: return nil
    }
  }
}

private struct SeriesChart: View {
  let series: TrendSeries

  private var bounds: (low: Double, high: Double) {
    var values = series.points.map(\.value)
    if let low = series.range?.optimalLow { values.append(low) }
    if let high = series.range?.optimalHigh { values.append(high) }
    let minimum = values.min() ?? 0
    let maximum = values.max() ?? 1
    let padding = Swift.max((maximum - minimum) * 0.15, Swift.max(abs(maximum) * 0.05, 0.1))
    return (minimum - padding, maximum + padding)
  }

  var body: some View {
    Chart {
      if let range = series.range {
        // The optimal band, behind everything else.
        RectangleMark(
          yStart: .value("from", range.optimalLow ?? bounds.low),
          yEnd: .value("to", range.optimalHigh ?? bounds.high)
        )
        .foregroundStyle(.green.opacity(0.12))
      }

      ForEach(series.points) { point in
        LineMark(x: .value("Date", point.date), y: .value("Value", point.value))
          .foregroundStyle(.blue)
          .interpolationMethod(.monotone)
        PointMark(x: .value("Date", point.date), y: .value("Value", point.value))
          .foregroundStyle(point.source == .labIssuedDigital ? .blue : .orange)
          .symbol(point.source == .labIssuedDigital ? .circle : .diamond)
      }
    }
    .chartYScale(domain: bounds.low...bounds.high)
    .chartXAxis { AxisMarks(values: .automatic(desiredCount: 3)) }
    .frame(height: 170)
    .padding(.vertical, 6)
    .accessibilityLabel(
      Text(
        "\(AnalyteNames.title(series.analyteKey)), \(series.points.count) measurements, latest \(series.placement.label)"
      ))
  }
}
