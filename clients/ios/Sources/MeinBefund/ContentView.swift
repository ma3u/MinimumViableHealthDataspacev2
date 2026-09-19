import UIKit
import Shared
import SwiftUI
import UniformTypeIdentifiers

@main
struct KlarbefundApp: App {
  var body: some Scene {
    WindowGroup { ContentView() }
  }
}

@MainActor
final class AppModel: ObservableObject {
  @Published var reports: [LabReport] = []
  @Published var pending: ScanProduct?
  @Published var busy = false
  @Published var importing = false
  @Published var picking = false
  @Published var error: String?
  @Published var viewingScan: Data?
  @Published var diagnosticsRequest: DiagnosticsExport.Request?
  @Published var buildingDiagnostics = false
  @Published var sharingDiagnostics: URL?

  /// Internal rather than private so the DEBUG self-test can reach it, and a
  /// `let` set once at init so the self-test's own store cannot be swapped in
  /// later by anything else.
  let store: ReportStore

  /// True when the app is running against the self-test's own store rather
  /// than the person's reports.
  ///
  /// Shown in the title, because a store swap that is invisible looks exactly
  /// like data loss: a verification run left the app listing one synthetic
  /// report, and the reports it was hiding looked deleted.
  let isSelfTestStore: Bool

  init() {
    // The self-test writes a fictional report through the real save path. It
    // gets its own directory, so even if the argument were somehow passed on a
    // real device it could not touch a person's own reports.
    #if DEBUG
      if ProcessInfo.processInfo.arguments.contains("-MBSelfTest") {
        store = ReportStore(
          directory: FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("SelfTestReports", isDirectory: true))
        isSelfTestStore = true
        return
      }
    #endif
    store = ReportStore()
    isSelfTestStore = false
  }

  func refresh() async {
    #if DEBUG
      // Screenshot mode: fictional reports, never persisted, so nothing here
      // can reach a real store or a real person's device.
      if DemoSeed.isRequested {
        reports = DemoSeed.reports
        return
      }
    #endif
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

  /// Imports a document the person already has: a laboratory's PDF, a
  /// download from a portal, a photograph in the library.
  ///
  /// The file is read inside its security scope and only the bytes survive it.
  /// A PDF with the laboratory's own text layer is `lab-issued-digital` and
  /// its values are `final`; anything else goes through the recogniser and
  /// stays `preliminary`. The file is never copied anywhere but the sealed
  /// store.
  func importFile(_ url: URL) async {
    importing = true
    defer { importing = false }
    let scoped = url.startAccessingSecurityScopedResource()
    defer { if scoped { url.stopAccessingSecurityScopedResource() } }
    do {
      let data = try Data(contentsOf: url)
      pending = try await LabImport.data(
        data, fileExtension: url.pathExtension, name: url.lastPathComponent)
    } catch {
      self.error = error.localizedDescription
    }
  }

  /// Stores what the person confirmed: the values, the sheet's own date and
  /// details, the recognised text, the pages, and the scan's diagnostics.
  ///
  /// The date is always the one confirmed on the review screen. Where it
  /// matches what was read from the sheet its provenance stays `printed`;
  /// where the person changed it, or nothing was found, it is `user`.
  func confirm(title: String, labDate: Date, laboratory: String) async {
    guard let product = pending else { return }
    let day = ReportMetadata.calendarDay(labDate)
    var metadata = product.metadata
    let lab = laboratory.trimmingCharacters(in: .whitespaces)
    metadata.laboratory = lab.isEmpty ? nil : lab
    metadata.dateSource = metadata.labDate == day ? .printed : .user
    metadata.labDate = day

    let id = UUID()
    let report = LabReport(
      id: id, scannedAt: Date(), collectedOn: day,
      title: title.isEmpty ? String(localized: "Lab report") : title,
      extraction: product.extraction, metadata: metadata, pageTexts: product.pageTexts,
      scan: LabReport.ScanAttachment(pageCount: product.pages.count, bytes: product.pdf.count),
      hasDiagnostics: true)
    let diagnostics = ScanDiagnostics(
      reportId: id, createdAt: Date(), environment: ScanDiagnostics.Environment.current,
      pages: product.pages, extraction: product.extraction, metadata: metadata)
    do {
      try await store.save(report)
      try await store.saveScan(product.pdf, for: id)
      try await store.saveDiagnostics(diagnostics, for: id)
      pending = nil
      await refresh()
    } catch {
      self.error = error.localizedDescription
    }
  }

  func openScan(_ report: LabReport) async {
    do {
      guard let pdf = try await store.scan(for: report.id) else {
        error = String(localized: "The scanned pages of this report are not stored.")
        return
      }
      viewingScan = pdf
    } catch {
      self.error = error.localizedDescription
    }
  }

  /// Builds the diagnostics archive the person has just confirmed.
  func exportDiagnostics(_ request: DiagnosticsExport.Request) async {
    buildingDiagnostics = true
    defer { buildingDiagnostics = false }
    let selected: [LabReport]
    switch request {
    case .everything: selected = reports
    case .report(let id): selected = reports.filter { $0.id == id }
    }
    do {
      sharingDiagnostics = try await DiagnosticsExport.build(reports: selected, store: store)
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

  #if DEBUG
    /// `-MBExportDiagnostics`: builds the archive and leaves it in the
    /// container's temporary directory for `Scripts/pull-diagnostics.sh` to
    /// fetch over USB, so a tester's Mac can read a scan without the share
    /// sheet. Debug builds only; the argument does not exist in a release.
    ///
    /// The one deliberate downgrade of file protection in the app: a paired
    /// Mac's file service cannot open a file under complete protection
    /// (measured, `EPERM` on the store), so this file is
    /// `completeUntilFirstUserAuthentication`, the iOS default class. It holds
    /// the person's health data in the clear for as long as it exists, which
    /// is until the pull finishes or the app next launches, whichever is first.
    func debugExportIfRequested() async {
      guard ProcessInfo.processInfo.arguments.contains("-MBExportDiagnostics") else { return }
      do {
        let zip = try await DiagnosticsExport.build(reports: reports, store: store)
        let pulled = DiagnosticsExport.pullURL
        try? FileManager.default.removeItem(at: pulled)
        try FileManager.default.moveItem(at: zip, to: pulled)
        try FileManager.default.setAttributes(
          [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication],
          ofItemAtPath: pulled.path)
        Log.diagnostics.notice("diagnostics archive ready for pull")
      } catch {
        self.error = error.localizedDescription
      }
    }
  #endif

  // MARK: - Cloud analysis (ADR-034)

  @Published var consenting: [CodedLabValue]?
  @Published var reply: CloudAnalysis.Reply?
  @Published var asking = false

  let signIn = OIDCSession()

  /// True only when both halves are configured. Without either, the button is
  /// not offered at all rather than shown and then failing: an action that
  /// cannot work should not look available.
  /// Whether asking a question is possible at all right now.
  ///
  /// Deliberately not "is the operator's service configured". On-device needs
  /// nothing from anyone, so on a phone with Apple Intelligence the feature is
  /// available even with no network, no account and no backend deployed.
  var analysisAvailable: Bool {
    if providerConfig.kind != .hosted { return providerConfig.isUsable }
    return OIDCSession.Configuration.fromBundle() != nil
      && CloudClient.Configuration.fromBundle() != nil
  }

  @Published var providerConfig = BringYourOwnProvider.configuration()
  @Published var showingSettings = false
  @Published var showingPrivacy = false
  @Published var showingTrends = false
  @Published var showingReference = false
  @Published var sharing: ReportExport.Artefacts?

  /// Builds the PDF and FHIR bundle for one report. Entirely local: this is
  /// the step that has to work in a GP's waiting room, where the cluster and
  /// often the network are irrelevant.
  func export(_ report: LabReport) async {
    do {
      let scan = try await store.scan(for: report.id)
      sharing = try ReportExport.write(report, scan: scan)
    } catch {
      self.error = error.localizedDescription
    }
  }

  func askCloud(_ values: [CloudAnalysis.SharedValue], question: String) async {
    consenting = nil
    asking = true
    defer { asking = false }

    // On device: no network at all. This is the path that keeps working when
    // the cluster is down, which is most of the reason it is the default.
    if providerConfig.kind == .onDevice {
      do {
        if #available(iOS 26.0, *) {
          reply = try await OnDeviceAnalysis.analyse(values: values, question: question)
        } else {
          self.error = OnDeviceAnalysis.Availability.unsupportedOS.explanation
        }
      } catch {
        self.error = error.localizedDescription
      }
      return
    }

    // Your own provider: no sign-in, no backend, no quota.
    //
    // Signing in exists for one reason, to tell people apart so the daily limit
    // can be applied per person. On this path there is no limit, because the
    // operator is not paying for anything, so asking someone to authenticate
    // would be collecting an identity for no purpose. The call goes straight
    // from the phone to the endpoint they configured.
    if providerConfig.kind != .hosted {
      do {
        reply = try await BringYourOwnProvider.analyse(
          values: values, question: question, configuration: providerConfig)
      } catch {
        self.error = error.localizedDescription
      }
      return
    }

    guard let clientConfig = CloudClient.Configuration.fromBundle(),
      let oidcConfig = OIDCSession.Configuration.fromBundle()
    else {
      error = CloudClient.ClientError.notConfigured.localizedDescription
      return
    }

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
  @State private var path: [UUID] = []

  var body: some View {
    NavigationStack(path: $path) {
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
              ResultList(
                report: report,
                onOpenScan: report.scan == nil ? nil : { Task { await model.openScan(report) } }
              )
              .toolbar {
                if !report.extraction.coded.isEmpty {
                  ToolbarItem(placement: .primaryAction) {
                    Button {
                      Task { await model.export(report) }
                    } label: {
                      Label("Share for my doctor", systemImage: "square.and.arrow.up")
                    }
                  }
                }
                if model.analysisAvailable, !report.extraction.coded.isEmpty {
                  ToolbarItem(placement: .secondaryAction) {
                    Button {
                      model.consenting = report.extraction.coded
                    } label: {
                      Label("Ask about these values", systemImage: "sparkles")
                    }
                  }
                }
                ToolbarItem(placement: .secondaryAction) {
                  Button {
                    model.diagnosticsRequest = .report(report.id)
                  } label: {
                    Label("Export diagnostics for this report", systemImage: "ladybug")
                  }
                }
              }
            }
          }
        }
      }
      .navigationTitle(model.isSelfTestStore ? "Self-test store" : "Klarbefund")
      .toolbar {
        ToolbarItem(placement: .primaryAction) {
          Menu {
            Button {
              scanning = true
            } label: {
              Label("Scan report", systemImage: "doc.viewfinder")
            }
            // Paper is the starting condition, not the only one: a laboratory
            // may already have sent a PDF, and that document carries its own
            // characters rather than our reading of them.
            Button {
              model.picking = true
            } label: {
              Label("Import a PDF or photo", systemImage: "folder")
            }
          } label: {
            Label("Add report", systemImage: "plus")
          }
        }
        ToolbarItem(placement: .topBarLeading) {
          Menu {
            Button {
              model.showingSettings = true
            } label: {
              Label("Analysis provider", systemImage: "gearshape")
            }
            if !model.reports.isEmpty {
              Button {
                model.showingTrends = true
              } label: {
                Label("Trends", systemImage: "chart.xyaxis.line")
              }
            }
            Button {
              model.showingReference = true
            } label: {
              Label("Reference values", systemImage: "text.book.closed")
            }
            Button {
              model.showingPrivacy = true
            } label: {
              Label("Privacy and safety", systemImage: "hand.raised")
            }
            if !model.reports.isEmpty {
              Button {
                model.diagnosticsRequest = .everything
              } label: {
                Label("Export diagnostics", systemImage: "ladybug")
              }
            }
          } label: {
            Label("More", systemImage: "ellipsis.circle")
          }
        }
      }
    }
    .fileImporter(
      isPresented: $model.picking,
      allowedContentTypes: [.pdf, .image],
      allowsMultipleSelection: false
    ) { outcome in
      switch outcome {
      case .success(let urls):
        if let url = urls.first { Task { await model.importFile(url) } }
      case .failure(let error):
        model.error = error.localizedDescription
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
      ReviewSheet(product: box.product) { title, labDate, laboratory in
        Task { await model.confirm(title: title, labDate: labDate, laboratory: laboratory) }
      } onDiscard: {
        model.pending = nil
      }
    }
    .sheet(item: Binding(get: { model.viewingScan.map(ScanBox.init) }, set: { _ in })) { box in
      ScanViewer(pdf: box.pdf) { model.viewingScan = nil }
    }
    .sheet(item: Binding(get: { model.sharingDiagnostics.map(ArchiveBox.init) }, set: { _ in })) {
      box in
      ShareSheet(items: [box.url]) {
        // Plain health data in the temporary directory has no reason to
        // outlive the share sheet.
        try? FileManager.default.removeItem(at: box.url)
        model.sharingDiagnostics = nil
      }
    }
    // Asked every time, in words: the archive is the person's health data in
    // the clear, and the share sheet cannot tell them that.
    .confirmationDialog(
      "Export diagnostics?",
      isPresented: Binding(
        get: { model.diagnosticsRequest != nil },
        set: { if !$0 { model.diagnosticsRequest = nil } }),
      titleVisibility: .visible
    ) {
      Button("Export") {
        if let request = model.diagnosticsRequest {
          model.diagnosticsRequest = nil
          Task { await model.exportDiagnostics(request) }
        }
      }
      Button("Cancel", role: .cancel) { model.diagnosticsRequest = nil }
    } message: {
      Text(
        "The archive contains your scanned pages, every value and the recognised text, unencrypted. Share it only with yourself."
      )
    }
    .sheet(item: Binding(get: { model.consenting.map(ConsentBox.init) }, set: { _ in })) { box in
      CloudConsentSheet(
        candidates: box.values,
        provider: model.providerConfig.kind,
        onSend: { values, question in
          Task { await model.askCloud(values, question: question) }
        },
        onCancel: { model.consenting = nil })
    }
    .sheet(item: Binding(get: { model.reply.map(ReplyBox.init) }, set: { _ in })) { box in
      CloudReplySheet(reply: box.reply) { model.reply = nil }
    }
    .sheet(isPresented: $model.showingSettings) {
      ProviderSettings(configuration: $model.providerConfig) {
        model.showingSettings = false
      }
    }
    .sheet(isPresented: $model.showingPrivacy) {
      PrivacySummary { model.showingPrivacy = false }
    }
    .sheet(isPresented: $model.showingTrends) {
      TrendsView(reports: model.reports) { model.showingTrends = false }
    }
    .sheet(isPresented: $model.showingReference) {
      ReferenceValuesView { model.showingReference = false }
    }
    .sheet(item: Binding(get: { model.sharing.map(ShareBox.init) }, set: { _ in })) { box in
      ShareSheet(items: [box.artefacts.pdf, box.artefacts.fhir]) {
        model.sharing = nil
      }
    }
    .overlay { if model.asking { ProgressView("Waiting for an answer…").padding().background(.regularMaterial, in: .rect(cornerRadius: 12)) } }
    .overlay { if model.importing { ProgressView("Reading the document…").padding().background(.regularMaterial, in: .rect(cornerRadius: 12)) } }
    .overlay { if model.busy { ProgressView("Recognising text…").padding().background(.regularMaterial, in: .rect(cornerRadius: 12)) } }
    .overlay { if model.buildingDiagnostics { ProgressView("Building the diagnostics archive…").padding().background(.regularMaterial, in: .rect(cornerRadius: 12)) } }
    .alert("Error", isPresented: Binding(get: { model.error != nil }, set: { _ in model.error = nil })) {
      Button("OK", role: .cancel) {}
    } message: {
      Text(model.error ?? "")
    }
    .task {
      // Plain archives from an interrupted share, or a pull that never came,
      // have no reason to survive a launch.
      DiagnosticsExport.removeLeftovers()
      await model.refresh()
      #if DEBUG
        // The self-test first: with `-MBSelfTest` the report it saves is the
        // one a screenshot should open, and it does not exist until it has run.
        await model.runSelfTestIfRequested()
        await model.debugImportIfRequested()
        await openScreenshotScreen()
        await model.debugExportIfRequested()
      #endif
    }
  }

  #if DEBUG
    /// Opens the screen named by `-MBShot`, once the reports are loaded.
    ///
    /// Screenshots are taken this way rather than by scripting taps, so a
    /// re-shoot after a layout change needs no new coordinates.
    private func openScreenshotScreen() async {
      switch DemoSeed.screen {
      case .detail:
        if let first = model.reports.first { path = [first.id] }
      case .scan:
        if let first = model.reports.first {
          path = [first.id]
          await model.openScan(first)
        }
      case .consent:
        model.consenting = model.reports.first?.extraction.coded
      case .settings:
        model.showingSettings = true
      case .privacy:
        model.showingPrivacy = true
      case .trends:
        model.showingTrends = true
      case .reference:
        model.showingReference = true
      case .list, nil:
        break
      }
    }
  #endif
}

private struct ShareBox: Identifiable {
  let artefacts: ReportExport.Artefacts
  var id: String { artefacts.pdf.lastPathComponent }
  init(_ artefacts: ReportExport.Artefacts) { self.artefacts = artefacts }
}

/// The system share sheet, so the files can go wherever the person's insurer
/// wants them: the ePA app, Files, AirDrop to a desktop client, or mail.
///
/// Deliberately not a bespoke upload. There is no API into the ePA for a
/// non-DiGA, so the citizen is the integration point, and the share sheet is
/// what respects that rather than pretending otherwise.
private struct ShareSheet: UIViewControllerRepresentable {
  let items: [Any]
  let onDismiss: () -> Void

  func makeUIViewController(context: Context) -> UIActivityViewController {
    let controller = UIActivityViewController(activityItems: items, applicationActivities: nil)
    controller.completionWithItemsHandler = { _, _, _, _ in onDismiss() }
    return controller
  }

  func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
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
  let product: ScanProduct
  var id: Int { product.pdf.count &* 1000 &+ product.extraction.coded.count }
  init(_ product: ScanProduct) { self.product = product }
}

private struct ScanBox: Identifiable {
  let pdf: Data
  var id: Int { pdf.count }
  init(_ pdf: Data) { self.pdf = pdf }
}

private struct ArchiveBox: Identifiable {
  let url: URL
  var id: String { url.path }
  init(_ url: URL) { self.url = url }
}

private struct EmptyStateView: View {
  var body: some View {
    ContentUnavailableView {
      Label("No reports yet", systemImage: "doc.text.magnifyingglass")
    } description: {
      Text("Scan a lab report. The values stay encrypted on this device.")
    }
  }
}

private struct ReportRow: View {
  let report: LabReport

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(report.title).font(.headline)
      if let laboratory = report.metadata.laboratory, laboratory != report.title {
        Text(laboratory).font(.subheadline).foregroundStyle(.secondary)
      }
      HStack(spacing: 8) {
        // The report's own date. Only a record from before dates were read
        // from the sheet falls back to the day it was scanned, and says so.
        Text(report.effectiveDate.formatted(date: .abbreviated, time: .omitted))
        if report.dateIsScanFallback { Text("scanned") }
        Text("·")
        Text("\(report.extraction.coded.count) values")
        if report.extraction.needsReview > 0 {
          Text("·")
          Text("\(report.extraction.needsReview) to review").foregroundStyle(.orange)
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

  /// What the person reads.
  ///
  /// Deliberately not `source.shortLabel` interpolated into the `Text`.
  /// `shortLabel` and `observationStatus` are the stable wire words that go
  /// into a FHIR export and must not move, and interpolating them looked
  /// right while shipping English to every German phone: the string extractor
  /// only ever saw "%@ · %@", so there was nothing for a translation to
  /// attach to and nothing for the localisation gate to report.
  private var label: String {
    switch source {
    case .labIssuedDigital: String(localized: "Lab-issued, final")
    case .ocrTranscribed: String(localized: "Scanned, preliminary")
    case .selfTracked: String(localized: "Self-tracked, preliminary")
    }
  }

  var body: some View {
    Text(label)
      .font(.caption2.weight(.medium))
      .padding(.horizontal, 6)
      .padding(.vertical, 2)
      .background(tint.opacity(0.15), in: .rect(cornerRadius: 4))
      .foregroundStyle(tint)
  }
}
