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
  /// From the profile, so a sex-specific band appears only once asked for.
  var sex: RangeSex = .any
  /// Opens the report a point came from.
  var onOpenReport: ((UUID) -> Void)?
  let onClose: () -> Void
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
                // Tapping a point names that measurement; tapping the card
                // that appears opens the report it came from. This used to be
                // a row per point under the chart, which pushed the next
                // analyte off the screen on anything measured more than a few
                // times.
                SeriesChart(series: item, onOpenReport: onOpenReport)
              } header: {
                SeriesHeader(series: item)
              } footer: {
                SeriesFooter(series: item)
              }
            }

            Section {
              RangeLegend()
              DoctorReminder()
            }
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
        HStack(spacing: 4) {
          Image(systemName: RangePalette.symbol(for: series.placement))
          Text(
            "\(latest.comparator?.rawValue ?? "")\(Measurement.text(latest.value)) \(series.ucum)"
          )
        }
        .font(.caption.monospacedDigit())
        .foregroundStyle(RangePalette.colour(for: series.placement))
      }
    }
  }
}

/// What one measurement was, shown beside the point when it is tapped.
///
/// The whole card is the button: a person aiming at a dot on a chart has
/// already been precise enough once, and asking them to then hit a small
/// chevron would be asking twice.
private struct PointCallout: View {
  let point: TrendPoint
  let series: TrendSeries
  let onOpen: ((UUID) -> Void)?

  private var card: some View {
    VStack(alignment: .leading, spacing: 2) {
      Text("\(point.comparator?.rawValue ?? "")\(Measurement.text(point.value)) \(series.ucum)")
        .font(.callout.monospacedDigit().weight(.medium))
      Text(point.date.formatted(date: .abbreviated, time: .omitted))
        .font(.caption2)
      HStack(spacing: 4) {
        ProvenanceMark(source: point.source)
        Text("·")
        Text(point.reportTitle).lineLimit(1)
        if onOpen != nil {
          Image(systemName: "chevron.right").font(.caption2.weight(.semibold))
        }
      }
      .font(.caption2)
      .foregroundStyle(.secondary)
    }
    .padding(.horizontal, 10)
    .padding(.vertical, 7)
    .frame(width: PointCallout.width, height: PointCallout.height, alignment: .leading)
    .background(.regularMaterial, in: .rect(cornerRadius: 10))
    .overlay(
      RoundedRectangle(cornerRadius: 10).strokeBorder(.quaternary))
    .shadow(radius: 3, y: 1)
  }

  /// Fixed, so keeping the card inside the chart is arithmetic rather than a
  /// measurement. Measuring it took a render to arrive, and the first render
  /// placed the card at the point with a width of zero, which put it half
  /// outside the chart and clipped at the card's edge.
  static let width: CGFloat = 186
  static let height: CGFloat = 62

  var body: some View {
    Group {
      if let onOpen {
        Button { onOpen(point.reportId) } label: { card }
          .buttonStyle(.plain)
          .accessibilityHint(Text("Opens the report this measurement came from"))
      } else {
        card
      }
    }
    .accessibilityIdentifier("trend-callout")
  }
}

/// Which kind of evidence one point is, in a word.
private struct ProvenanceMark: View {
  let source: SourceKind

  private var label: String {
    switch source {
    case .labIssuedDigital: String(localized: "Lab-issued")
    case .ocrTranscribed: String(localized: "Read from a photo")
    case .selfTracked: String(localized: "Entered or from a device")
    }
  }

  var body: some View {
    Text(label)
  }
}

private struct SeriesFooter: View {
  let series: TrendSeries

  private var changeText: String? {
    guard let change = series.change, change != 0 else { return nil }
    let arrow = change > 0 ? "↑" : "↓"
    // Built through `String(localized:)` rather than interpolated: an
    // interpolated sentence is invisible to the localisation extractor, and
    // this one shipped in English to German phones because of that.
    return String(
      format: String(localized: "%1$@ %2$@ %3$@ since the previous measurement"),
      arrow, Measurement.text(abs(change)), series.ucum)
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      // What the measurement is. A definition of the test, not a reading of
      // this person's value.
      if let description = series.description {
        Text(description).padding(.bottom, 2)
      }
      if let range = series.range {
        // The published band, named and sourced. Never presented as a verdict.
        if let optimal = range.optimalText(formatter: Measurement.text) {
          Text("Optimal \(optimal) \(series.ucum). Latest value is \(series.placement.label).")
        }
        Link(range.source.label, destination: URL(string: range.source.url)!)
          .font(.caption2)
      } else if series.printedRange != nil {
        // Most analytes have no guideline band. The laboratory's own interval
        // is then the only range there is, and it is the one that describes
        // the assay this person was measured with.
        Text(
          "No guideline range is published for this one, so the band is the range your laboratory printed."
        )
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
      // The points are the only way to reach a measurement now, so say so.
      Text("Tap a point to see what it was. Tap the card to open that report.")
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
  var onOpenReport: ((UUID) -> Void)?

  /// Where on the date axis the last tap landed, and so which measurement is
  /// showing its card. Nothing is selected until a tap.
  ///
  /// Set by the button over each measurement. A tap gesture of our own never
  /// fired inside a `List` row, and Swift Charts' `chartXSelection` works for
  /// a finger but is unreachable by VoiceOver and by a UI test, which left
  /// this screen's only action available to sighted precise tapping alone.
  @State private var selectedDate: Date?

  private var selectedPoint: TrendPoint? {
    guard let selectedDate else { return nil }
    return series.points.min {
      abs($0.date.timeIntervalSince(selectedDate)) < abs($1.date.timeIntervalSince(selectedDate))
    }
  }

  /// The band to draw: the published optimal one, or the laboratory's own.
  ///
  /// Two different things, drawn in two different colours and named in the
  /// footer, because a guideline's target and an assay's reference interval
  /// are not the same claim.
  private var band: (low: Double?, high: Double?, colour: Color)? {
    if let range = series.range, range.optimalLow != nil || range.optimalHigh != nil {
      return (range.optimalLow, range.optimalHigh, RangePalette.optimal)
    }
    if let printed = series.printedRange {
      return (printed.low, printed.high, RangePalette.guideline)
    }
    return nil
  }

  private var bounds: (low: Double, high: Double) {
    var values = series.points.map(\.value)
    if let low = band?.low { values.append(low) }
    if let high = band?.high { values.append(high) }
    let minimum = values.min() ?? 0
    let maximum = values.max() ?? 1
    let padding = Swift.max((maximum - minimum) * 0.15, Swift.max(abs(maximum) * 0.05, 0.1))
    return (minimum - padding, maximum + padding)
  }

  var body: some View {
    Chart {
      if let band {
        // The band, behind everything else.
        RectangleMark(
          yStart: .value("from", band.low ?? bounds.low),
          yEnd: .value("to", band.high ?? bounds.high)
        )
        .foregroundStyle(band.colour.opacity(0.12))
      }

      ForEach(series.points) { point in
        LineMark(x: .value("Date", point.date), y: .value("Value", point.value))
          .foregroundStyle(.blue)
          .interpolationMethod(.monotone)
        PointMark(x: .value("Date", point.date), y: .value("Value", point.value))
          .foregroundStyle(point.source == .labIssuedDigital ? .blue : .orange)
          .symbol(point.source == .labIssuedDigital ? .circle : .diamond)
          .symbolSize(point.id == selectedPoint?.id ? 160 : 60)
      }
    }
    .chartYScale(domain: bounds.low...bounds.high)
    // A mark per measurement rather than an automatic scale: with one or two
    // points an automatic axis draws no date at all, and a chart whose points
    // have no date is the thing this app exists to avoid.
    .chartXAxis {
      AxisMarks(values: series.points.map(\.date)) { value in
        AxisGridLine()
        AxisValueLabel {
          if let date = value.as(Date.self) {
            Text(date.formatted(.dateTime.month(.abbreviated).year(.twoDigits)))
          }
        }
      }
    }
    .chartOverlay { proxy in
      GeometryReader { geometry in
        ZStack(alignment: .topLeading) {
          // A real button over each measurement, not just the chart's own
          // selection gesture.
          //
          // Three reasons, and the third is the one that decides it. A drawn
          // dot is about eight points across and a finger is not. Swift
          // Charts' selection cannot be reached by VoiceOver or by a UI test
          // at all, so the one way to this screen's only action was a
          // sighted, precise tap. And a button is testable, which is how the
          // card that hung off the chart's edge was found.
          ForEach(series.points) { point in
            if let anchor = position(of: point, proxy: proxy, in: geometry) {
              Button {
                withAnimation(.easeOut(duration: 0.15)) {
                  selectedDate = (selectedPoint?.id == point.id) ? nil : point.date
                }
              } label: {
                // Not `Color.clear`: a view with nothing to draw is dropped
                // from the accessibility tree, so the button existed for a
                // finger and for nothing else.
                Circle()
                  .fill(Color.primary.opacity(0.001))
                  .frame(width: 40, height: 40)
                  .contentShape(Circle())
              }
              .buttonStyle(.plain)
              .accessibilityIdentifier("trend-point-\(series.analyteKey)")
              .position(x: anchor.x, y: anchor.y)
              .accessibilityLabel(
                Text(
                  "\(Measurement.text(point.value)) \(series.ucum), \(point.date.formatted(date: .abbreviated, time: .omitted))"
                ))
            }
          }
          // Above the buttons, so its own tap is not taken by the one
          // underneath it.
          if let point = selectedPoint,
            let anchor = position(of: point, proxy: proxy, in: geometry)
          {
            PointCallout(point: point, series: series, onOpen: onOpenReport)
              .fixedSize()
              .modifier(CalloutPlacement(anchor: anchor, bounds: geometry.size))
          }
        }
      }
    }
    .frame(height: 170)
    .padding(.vertical, 6)
    // A container, not an element. A bare `accessibilityIdentifier` here
    // replaces the identifier and the label of everything inside, so every
    // point button inherited the chart's name and none could be told apart.
    .accessibilityElement(children: .contain)
    .accessibilityIdentifier("trend-chart-\(series.analyteKey)")
    .accessibilityLabel(
      Text(
        "\(AnalyteNames.title(series.analyteKey)), \(series.points.count) measurements, latest \(series.placement.label)"
      ))
  }

  /// Where one measurement sits, in the overlay's own coordinates.
  private func position(
    of point: TrendPoint, proxy: ChartProxy, in geometry: GeometryProxy
  ) -> CGPoint? {
    guard let plotAnchor = proxy.plotFrame else { return nil }
    let plot = geometry[plotAnchor]
    guard let x = proxy.position(forX: point.date), let y = proxy.position(forY: point.value)
    else { return nil }
    return CGPoint(x: plot.minX + x, y: plot.minY + y)
  }
}

/// Keeps the card beside its point and inside the chart.
///
/// The row clips at the chart's edge, so a card that hangs over it loses the
/// text that hangs over. Above the point where there is room, below it near
/// the top, and pushed sideways so both ends stay in.
private struct CalloutPlacement: ViewModifier {
  let anchor: CGPoint
  let bounds: CGSize

  func body(content: Content) -> some View {
    content.offset(x: x, y: y)
  }

  private var x: CGFloat {
    let wanted = anchor.x - PointCallout.width / 2
    let last = max(0, bounds.width - PointCallout.width)
    return min(max(0, wanted), last)
  }

  private var y: CGFloat {
    let above = anchor.y - PointCallout.height - 8
    if above >= 0 { return above }
    return min(anchor.y + 10, max(0, bounds.height - PointCallout.height))
  }
}
