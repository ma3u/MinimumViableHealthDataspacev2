import Shared
import SwiftUI

@main
struct MeinBefundApp: App {
  var body: some Scene {
    WindowGroup { ContentView() }
  }
}

@MainActor
final class AppModel: ObservableObject {
  @Published var reports: [ReportStore.StoredReport] = []
  @Published var pending: ExtractionResult?
  @Published var busy = false
  @Published var error: String?

  private let store = ReportStore()

  func refresh() async {
    do { reports = try await store.load() } catch { self.error = error.localizedDescription }
  }

  func process(_ images: [UIImage]) async {
    busy = true
    defer { busy = false }
    do {
      pending = try await TextRecognizer.extract(from: images)
    } catch {
      self.error = error.localizedDescription
    }
  }

  func confirm(title: String) async {
    guard let extraction = pending else { return }
    let report = ReportStore.StoredReport(
      id: UUID(), scannedAt: Date(), collectedOn: nil,
      title: title.isEmpty ? "Laborbefund" : title, extraction: extraction)
    do {
      try await store.save(report)
      pending = nil
      await refresh()
    } catch {
      self.error = error.localizedDescription
    }
  }

  func delete(_ id: UUID) async {
    do {
      try await store.delete(id)
      await refresh()
    } catch { self.error = error.localizedDescription }
  }

  // MARK: - Cloud analysis (ADR-034)

  @Published var consenting: [CodedLabValue]?
  @Published var reply: CloudAnalysis.Reply?
  @Published var asking = false

  let signIn = OIDCSession()

  /// True only when both halves are configured. Without either, the button is
  /// not offered at all rather than shown and then failing: an action that
  /// cannot work should not look available.
  var cloudAvailable: Bool {
    OIDCSession.Configuration.fromBundle() != nil && CloudClient.Configuration.fromBundle() != nil
  }

  func askCloud(_ values: [CloudAnalysis.SharedValue], question: String) async {
    consenting = nil
    guard let clientConfig = CloudClient.Configuration.fromBundle(),
      let oidcConfig = OIDCSession.Configuration.fromBundle()
    else {
      error = CloudClient.ClientError.notConfigured.localizedDescription
      return
    }

    asking = true
    defer { asking = false }
    do {
      // Sign in lazily, and only when the user has already chosen to send
      // something. Asking someone to authenticate before they have decided
      // what they want is how a consent step becomes a habit.
      if signIn.currentIdentityToken() == nil {
        try await signIn.signIn(configuration: oidcConfig)
      }
      guard let token = signIn.currentIdentityToken() else {
        error = CloudClient.ClientError.notSignedIn.localizedDescription
        return
      }
      reply = try await CloudClient(configuration: clientConfig)
        .analyse(values: values, question: question, identityToken: token)
    } catch {
      self.error = error.localizedDescription
    }
  }
}

struct ContentView: View {
  @StateObject private var model = AppModel()
  @State private var scanning = false

  var body: some View {
    NavigationStack {
      Group {
        if model.reports.isEmpty {
          EmptyStateView()
        } else {
          List {
            ForEach(model.reports) { report in
              NavigationLink(value: report.id) {
                ReportRow(report: report)
              }
            }
            .onDelete { offsets in
              let ids = offsets.map { model.reports[$0].id }
              Task { for id in ids { await model.delete(id) } }
            }
          }
          .navigationDestination(for: UUID.self) { id in
            if let report = model.reports.first(where: { $0.id == id }) {
              ResultList(extraction: report.extraction, title: report.title)
                .toolbar {
                  if model.cloudAvailable, !report.extraction.coded.isEmpty {
                    ToolbarItem(placement: .primaryAction) {
                      Button {
                        model.consenting = report.extraction.coded
                      } label: {
                        Label("Claude fragen", systemImage: "sparkles")
                      }
                    }
                  }
                }
            }
          }
        }
      }
      .navigationTitle("MeinBefund")
      .toolbar {
        ToolbarItem(placement: .primaryAction) {
          Button {
            scanning = true
          } label: {
            Label("Befund scannen", systemImage: "doc.viewfinder")
          }
        }
      }
    }
    .fullScreenCover(isPresented: $scanning) {
      DocumentScanner(
        onScan: { images in
          scanning = false
          Task { await model.process(images) }
        },
        onCancel: { scanning = false }
      )
      .ignoresSafeArea()
    }
    .sheet(item: Binding(get: { model.pending.map(PendingBox.init) }, set: { _ in })) { box in
      ReviewSheet(extraction: box.extraction) { title in
        Task { await model.confirm(title: title) }
      } onDiscard: {
        model.pending = nil
      }
    }
    .sheet(item: Binding(get: { model.consenting.map(ConsentBox.init) }, set: { _ in })) { box in
      CloudConsentSheet(
        candidates: box.values,
        onSend: { values, question in
          Task { await model.askCloud(values, question: question) }
        },
        onCancel: { model.consenting = nil })
    }
    .sheet(item: Binding(get: { model.reply.map(ReplyBox.init) }, set: { _ in })) { box in
      CloudReplySheet(reply: box.reply) { model.reply = nil }
    }
    .overlay { if model.asking { ProgressView("Claude antwortet…").padding().background(.regularMaterial, in: .rect(cornerRadius: 12)) } }
    .overlay { if model.busy { ProgressView("Text wird erkannt…").padding().background(.regularMaterial, in: .rect(cornerRadius: 12)) } }
    .alert("Fehler", isPresented: Binding(get: { model.error != nil }, set: { _ in model.error = nil })) {
      Button("OK", role: .cancel) {}
    } message: {
      Text(model.error ?? "")
    }
    .task { await model.refresh() }
  }
}

private struct ConsentBox: Identifiable {
  let values: [CodedLabValue]
  var id: Int { values.count }
  init(_ values: [CodedLabValue]) { self.values = values }
}

private struct ReplyBox: Identifiable {
  let reply: CloudAnalysis.Reply
  var id: String { reply.text }
  init(_ reply: CloudAnalysis.Reply) { self.reply = reply }
}

private struct PendingBox: Identifiable {
  let extraction: ExtractionResult
  var id: Int { extraction.coded.count &* 1000 &+ extraction.unmapped.count }
  init(_ extraction: ExtractionResult) { self.extraction = extraction }
}

private struct EmptyStateView: View {
  var body: some View {
    ContentUnavailableView {
      Label("Noch kein Befund", systemImage: "doc.text.magnifyingglass")
    } description: {
      Text("Scannen Sie einen Laborbefund. Die Werte bleiben verschlüsselt auf diesem Gerät.")
    }
  }
}

private struct ReportRow: View {
  let report: ReportStore.StoredReport

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(report.title).font(.headline)
      HStack(spacing: 8) {
        Text(report.scannedAt.formatted(date: .abbreviated, time: .omitted))
        Text("·")
        Text("\(report.extraction.coded.count) Werte")
        if report.extraction.needsReview > 0 {
          Text("·")
          Text("\(report.extraction.needsReview) zu prüfen").foregroundStyle(.orange)
        }
      }
      .font(.caption)
      .foregroundStyle(.secondary)
      ProvenanceBadge(source: report.extraction.source)
    }
    .padding(.vertical, 2)
  }
}

/// The badge that must never be omitted.
///
/// A GP is under no obligation to adopt what the insured uploaded, and the app
/// must not present a transcription as a result. Colour alone is not the
/// signal. The text says it too, for anyone who cannot see the colour.
struct ProvenanceBadge: View {
  let source: SourceKind

  private var tint: Color {
    switch source {
    case .labIssuedDigital: .green
    case .ocrTranscribed: .orange
    case .selfTracked: .blue
    }
  }

  var body: some View {
    Text("\(source.shortLabel) · \(source.observationStatus)")
      .font(.caption2.weight(.medium))
      .padding(.horizontal, 6)
      .padding(.vertical, 2)
      .background(tint.opacity(0.15), in: .rect(cornerRadius: 4))
      .foregroundStyle(tint)
  }
}
