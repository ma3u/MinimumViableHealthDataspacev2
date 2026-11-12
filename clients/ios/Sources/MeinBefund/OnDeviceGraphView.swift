import Shared
import SwiftUI

/// The sheet behind "Health graph on this iPhone".
struct OnDeviceGraphView: View {
  @ObservedObject var graph: OnDeviceGraph
  let reports: () -> [LabReport]
  let onClose: () -> Void

  @State private var confirmingDelete = false

  var body: some View {
    NavigationStack {
      Form {
        Section {
          Text("Keep a connected graph of your values on this iPhone, in Relate, Neo4j's embedded graph database: every value linked to its report, its LOINC code and where it came from. It is built here from your reports, encrypted by iOS while the phone is locked, never backed up and never sent anywhere.")
        }
        if let notice = graph.notice {
          Section {
            Label(notice, systemImage: "exclamationmark.triangle")
              .accessibilityIdentifier("graph-notice")
          }
        }
        Section {
          Toggle(
            "Keep a graph on this iPhone",
            isOn: Binding(
              get: { graph.enabled },
              set: { on in Task { await graph.setEnabled(on, reports: reports()) } })
          )
          .accessibilityIdentifier("graph-enabled")
          Toggle(
            "Include Apple Health weekly means",
            isOn: Binding(
              get: { graph.includesWearables },
              set: { on in Task { await graph.setIncludesWearables(on, reports: reports()) } })
          )
          .disabled(!graph.enabled)
          .accessibilityIdentifier("graph-wearables")
        } footer: {
          Text("The graph follows your reports: scanning, correcting or deleting one updates it. Switching off deletes the graph; your reports stay.")
        }
        if graph.enabled {
          contents
        }
      }
      .navigationTitle("Health graph")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .confirmationAction) {
          Button("Done", action: onClose)
        }
      }
      .task { await graph.refresh() }
    }
  }

  @ViewBuilder
  private var contents: some View {
    Section("In the graph") {
      if let s = graph.summary {
        LabeledContent("Reports", value: "\(s.reports)")
          .accessibilityIdentifier("graph-reports")
        LabeledContent("Lab values", value: "\(s.labValues)")
          .accessibilityIdentifier("graph-values")
        LabeledContent("Kinds of test (LOINC)", value: "\(s.codedAnalytes)")
        LabeledContent("Values without a code", value: "\(s.unmapped)")
        if graph.includesWearables {
          LabeledContent("Apple Health weekly values", value: "\(s.weekly)")
        }
        LabeledContent("OMOP measurements", value: "\(s.omop)")
      }
      Button {
        Task { await graph.rebuild(reports()) }
      } label: {
        Label("Rebuild now", systemImage: "arrow.clockwise")
      }
      .disabled(graph.busy)
      .accessibilityIdentifier("graph-rebuild")
      if graph.busy { ProgressView() }
    }
    if !graph.analytes.isEmpty {
      Section {
        ForEach(graph.analytes) { analyte in
          NavigationLink {
            GraphTrendView(graph: graph, analyte: analyte)
          } label: {
            LabeledContent(analyte.label, value: "\(analyte.count)")
          }
          .accessibilityIdentifier("graph-analyte")
        }
      } header: {
        Text("Your tests over time")
      } footer: {
        Text("Each list is a Cypher query answered by the graph on this iPhone.")
      }
    }
    if let s = graph.summary, s.unmapped > 0 {
      Section {
        NavigationLink {
          GraphUncodedView(graph: graph)
        } label: {
          Label("Values without a code", systemImage: "questionmark.circle")
        }
      }
    }
    Section {
      Button("Delete the graph", role: .destructive) { confirmingDelete = true }
        .confirmationDialog(
          "Delete the graph on this iPhone?", isPresented: $confirmingDelete, titleVisibility: .visible
        ) {
          Button("Delete", role: .destructive) {
            Task { await graph.setEnabled(false, reports: []) }
          }
        } message: {
          Text("Your reports stay. You can build the graph again at any time.")
        }
    }
  }
}

private struct GraphTrendView: View {
  @ObservedObject var graph: OnDeviceGraph
  let analyte: OnDeviceGraph.Analyte
  @State private var points: [OnDeviceGraph.TrendPoint] = []

  var body: some View {
    List {
      Section {
        ForEach(points) { p in
          VStack(alignment: .leading, spacing: 2) {
            HStack {
              Text(p.date).monospacedDigit()
              Spacer()
              Text(verbatim: "\(p.value) \(p.unit)").bold().monospacedDigit()
            }
            Text(verbatim: [p.lab, Self.source(p.source)].filter { !$0.isEmpty }.joined(separator: " · "))
              .font(.caption)
              .foregroundStyle(.secondary)
          }
          .accessibilityElement(children: .combine)
          .accessibilityIdentifier("graph-trend-row")
        }
      } footer: {
        Text("LOINC \(analyte.loinc)")
      }
    }
    .navigationTitle(analyte.label)
    .task { points = await graph.trend(analyte.loinc) }
  }

  /// The app's own words for each kind of evidence (the chart legend's).
  static func source(_ kind: String) -> String {
    if let source = SourceKind(rawValue: kind) { return ProvenanceStyle.legendText(for: source) }
    if kind == "device-weekly-mean" {
      return String(localized: "Weekly mean from a device, not a lab value")
    }
    return kind
  }
}

private struct GraphUncodedView: View {
  @ObservedObject var graph: OnDeviceGraph
  @State private var rows: [OnDeviceGraph.Uncoded] = []

  var body: some View {
    List(rows) { row in
      VStack(alignment: .leading, spacing: 2) {
        HStack {
          Text(row.label)
          Spacer()
          Text(row.date).monospacedDigit().foregroundStyle(.secondary)
        }
        Text(row.reason).font(.caption).foregroundStyle(.secondary)
      }
    }
    .navigationTitle("Values without a code")
    .task { rows = await graph.uncoded() }
  }
}

/// The sheet, and keeping the graph in step with the reports while it is on.
struct OnDeviceGraphSheet: ViewModifier {
  @Binding var isPresented: Bool
  @ObservedObject var graph: OnDeviceGraph
  let reports: [LabReport]

  func body(content: Content) -> some View {
    content
      .sheet(isPresented: $isPresented) {
        OnDeviceGraphView(graph: graph, reports: { reports }) { isPresented = false }
      }
      .onChange(of: reports) { _, reports in
        Task { await graph.rebuild(reports) }
      }
  }
}
