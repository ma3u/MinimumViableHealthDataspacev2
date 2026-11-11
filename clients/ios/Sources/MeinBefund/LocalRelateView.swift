import Shared
import SwiftUI

/// The sheet behind "Export to my Mac (Relate)".
struct LocalRelateView: View {
  @ObservedObject var export: LocalRelateExport
  let reports: () -> [LabReport]
  let onClose: () -> Void

  @State private var scanning = false
  @State private var pasted = ""
  @State private var confirmingForget = false

  var body: some View {
    NavigationStack {
      Form {
        if let notice = export.notice {
          Section {
            Label(notice, systemImage: "info.circle")
              .accessibilityIdentifier("relate-notice")
          }
        }
        if let link = export.link {
          paired(link)
        } else {
          unpaired
        }
      }
      .navigationTitle("Export to my Mac")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .confirmationAction) {
          Button("Done", action: onClose)
        }
      }
      .sheet(isPresented: $scanning) {
        QRScanner(prefix: "klarbefund://relate") { text in
          scanning = false
          Task { await export.pair(with: text) }
        } onCancel: {
          scanning = false
        }
      }
      .task { await export.refreshStatus() }
    }
  }

  private var unpaired: some View {
    Group {
      Section {
        Text("Keep a connected copy of your values in a Relate graph on your own Mac: your reports with their LOINC codes and where each value came from, and your Apple Health weekly means. It goes over your Wi-Fi, encrypted, to that Mac only. No cloud is involved.")
      }
      Section("On the Mac") {
        Text("Run the receiver from the relate-hackathon-team repository:")
        // A command line, not prose: never translated.
        Text(verbatim: "python -m health_graph receive --db health.rl")
          .font(.system(.footnote, design: .monospaced))
          .textSelection(.enabled)
      }
      Section("On this phone") {
        if QRScanner.isAvailable {
          Button {
            scanning = true
          } label: {
            Label("Scan the Mac's QR code", systemImage: "qrcode.viewfinder")
          }
          .accessibilityIdentifier("relate-scan")
        }
        TextField("Or paste the klarbefund://relate link", text: $pasted, axis: .vertical)
          .textInputAutocapitalization(.never)
          .autocorrectionDisabled()
          .accessibilityIdentifier("relate-paste")
        Button("Pair") {
          Task { await export.pair(with: pasted) }
        }
        .disabled(pasted.isEmpty || export.busy)
        .accessibilityIdentifier("relate-pair")
      }
      if export.busy {
        Section { ProgressView() }
      }
    }
  }

  private func paired(_ link: LocalRelateLink) -> some View {
    Group {
      Section("Paired") {
        LabeledContent("Mac", value: link.name)
        LabeledContent("Graph", value: link.store)
        if let n = export.macObservations {
          LabeledContent("Values on the Mac", value: "\(n)")
            .accessibilityIdentifier("relate-count")
        }
      }
      Section {
        Toggle(
          "Send my reports",
          isOn: Binding(get: { export.sendsReports }, set: { export.setSendsReports($0) })
        )
        .accessibilityIdentifier("relate-sends-reports")
        Toggle(
          "Send Apple Health weekly means",
          isOn: Binding(get: { export.sendsWearables }, set: { export.setSendsWearables($0) })
        )
        .accessibilityIdentifier("relate-sends-wearables")
      } footer: {
        Text("While on, each report you scan or correct goes to the Mac. Device trends are the weekly means of resting heart rate, heart rate variability, steps and weight that Trends shows. Switching off stops further sending; the Mac keeps what it has.")
      }
      Section {
        Button {
          Task {
            await export.export(reports(), all: true)
            await export.exportWearables(
              reportDates: reports().map(\.effectiveDate), force: export.sendsWearables)
          }
        } label: {
          Label("Send everything now", systemImage: "arrow.up.circle")
        }
        .disabled(export.busy)
        .accessibilityIdentifier("relate-send-all")
        if export.busy { ProgressView() }
        if let result = export.lastResult {
          Text(result)
            .font(.footnote)
            .accessibilityIdentifier("relate-result")
        }
      }
      Section {
        Button("Forget this Mac", role: .destructive) { confirmingForget = true }
          .confirmationDialog(
            "Forget \(link.name)?", isPresented: $confirmingForget, titleVisibility: .visible
          ) {
            Button("Forget", role: .destructive) { export.forget() }
          } message: {
            Text("This phone stops sending. The graph on the Mac stays as it is; delete health.rl there to remove it.")
          }
      }
    }
  }
}
