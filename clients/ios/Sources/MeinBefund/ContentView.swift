import CoreGraphics
import UIKit
import Shared
import PhotosUI
import SwiftUI
import UniformTypeIdentifiers

@main
struct KlarbefundApp: App {
  @Environment(\.scenePhase) private var scenePhase

  var body: some Scene {
    WindowGroup { ContentView() }
      .onChange(of: scenePhase) { _, phase in
        // `.inactive` is the moment the switcher snapshot is taken;
        // `.background` is already too late to cover it.
        if phase == .active { PrivacyCover.hide() } else { PrivacyCover.show() }
      }
  }
}

@MainActor
final class AppModel: ObservableObject {
  @Published var reports: [LabReport] = []
  @Published var pending: ScanProduct?
  @Published var busy = false
  @Published var importing = false
  /// Photographs chosen from the library, waiting to be read.
  @Published var photos: [PhotosPickerItem] = []
  @Published var pickingPhotos = false
  @Published var picking = false
  @Published var error: String?
  @Published var viewingScan: Data?
  @Published var diagnosticsRequest: DiagnosticsExport.Request?
  @Published var buildingDiagnostics = false
  @Published var sharingDiagnostics: URL?
  /// The person's own copy of everything, once built.
  @Published var sharingData: URL?
  @Published var buildingData = false
  /// True while the "delete everything" question is on screen.
  @Published var erasing = false

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
      if DevDataset.isRequested {
        if DemoSeed.live.count <= DemoSeed.reports.count {
          DemoSeed.live = DevDataset.reports
        }
        reports = DemoSeed.live
        profile = DemoSeed.liveProfile
        return
      }
      if DemoSeed.isRequested {
        reports = DemoSeed.live
        profile = DemoSeed.liveProfile
        return
      }
    #endif
    do {
      reports = try await store.load()
      var loaded = try await store.profile()
      // One migration: the sex used to be a preference in UserDefaults.
      if loaded.sex == .any, let legacy = LegacyRangePreference.take() {
        loaded.sex = legacy
        try await store.saveProfile(loaded)
      }
      profile = loaded
    } catch { self.error = error.localizedDescription }
  }

  func saveProfile(_ updated: Profile) async {
    var next = updated
    next.updatedAt = Date()
    #if DEBUG
      if DemoSeed.isRequested {
        DemoSeed.liveProfile = next
        profile = next
        return
      }
    #endif
    do {
      try await store.saveProfile(next)
      profile = next
    } catch { self.error = error.localizedDescription }
  }

  /// Stores entered body measurements as a report of their own.
  ///
  /// The same shape a scan produces, with `self-tracked` provenance, so they
  /// join the timeline, the doctor's document and the OMOP export without a
  /// second path to keep in step. A tape measure is not a laboratory, and the
  /// provenance already says so.
  func saveBodyMeasurements(
    waist: BodyMeasurements.Reading?, weight: BodyMeasurements.Reading?,
    visceralFat: BodyMeasurements.Reading?,
    visceralFatUnit: BodyMeasurements.VisceralFatUnit
  ) async {
    let byDay = BodyMeasurements.entriesByDay(
      waist: waist, weight: weight, visceralFat: visceralFat,
      visceralFatUnit: visceralFatUnit, profile: profile)
    guard !byDay.isEmpty else { return }
    let title = String(localized: "Body measurements")
    var saved = 0
    do {
      for (day, entries) in byDay {
        // Saving the same day again corrects that measurement instead of
        // stacking a second one beside it. Without this, opening the profile,
        // changing one figure and saving left two reports for one morning,
        // and the trend drew both.
        let existing = reports.first {
          $0.extraction.source == .selfTracked && $0.title == title
            && ReportMetadata.calendarDay($0.effectiveDate) == day
        }
        guard
          let report = BodyMeasurements.report(
            entries: entries, on: day, id: existing?.id ?? UUID(), title: title)
        else { continue }
        #if DEBUG
          if DemoSeed.isRequested {
            DemoSeed.keep(report)
            saved += 1
            continue
          }
        #endif
        try await store.save(report)
        saved += 1
      }
      Log.store.notice("body measurements saved across \(saved, privacy: .public) day(s)")
      await refresh()
    } catch { self.error = error.localizedDescription }
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
  /// Reads photographs straight from the library.
  ///
  /// The file picker does not show the photo library at all, so a card
  /// photographed with the Camera app could only be imported by first saving
  /// it into Files. Several at once, because a shelf of body-composition
  /// cards is one scan of several pages and the app already groups them by
  /// the day each was measured.
  ///
  /// `PhotosPicker` runs outside this app, so it needs no access to the
  /// library and asks for no permission: what comes back is only what was
  /// chosen.
  func importPhotos(_ items: [PhotosPickerItem]) async {
    guard !items.isEmpty else { return }
    importing = true
    defer {
      importing = false
      photos = []
    }
    do {
      var images: [CGImage] = []
      for item in items {
        guard let data = try await item.loadTransferable(type: Data.self) else { continue }
        guard let image = LabImport.decodeImage(data) else { continue }
        images.append(image)
      }
      guard !images.isEmpty else {
        error = String(localized: "Those photographs could not be read.")
        return
      }
      pending = try await LabImport.images(images)
    } catch {
      self.error = error.localizedDescription
    }
  }

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
      scan: LabReport.ScanAttachment(
              pageCount: product.pages.count, bytes: product.pdf.count,
              sourcePixelWidth: product.sourcePixelWidth),
      hasDiagnostics: true)
    let diagnostics = ScanDiagnostics(
      reportId: id, createdAt: Date(), environment: ScanDiagnostics.Environment.current,
      pages: product.pages, extraction: product.extraction, metadata: metadata)
    do {
      try await store.save(report)
      try await store.saveScan(product.pdf, for: id)
      try await store.saveDiagnostics(diagnostics, for: id)
      // One scan of a scale's screens can carry a year of measurement days,
      // and a value belongs to the day it was measured on rather than to the
      // day the photographs were taken.
      //
      // A scale offers the same year again on the next photograph, and five
      // cards photographed one morning offer the same months five times over,
      // so anything already on the phone is dropped rather than stored twice.
      var known = Duplicates.keys(of: reports)
      known.formUnion(Duplicates.keys(of: report))
      var saved = 0
      var skipped = 0
      for extra in product.extraReports {
        guard let fresh = Duplicates.strip(extra, known: known) else {
          skipped += 1
          continue
        }
        try await store.save(fresh)
        known.formUnion(Duplicates.keys(of: fresh))
        saved += 1
      }
      Log.store.notice(
        "further measurement dates: \(saved, privacy: .public) saved, \(skipped, privacy: .public) already known"
      )
      pending = nil
      await refresh()
    } catch {
      self.error = error.localizedDescription
    }
  }

  /// Reads a stored report again with the current version of the app.
  ///
  /// The pages are kept precisely so that a value can be recovered when the
  /// parser improves. An audit of seven real reports found a reference bound
  /// stored as 50 where the sheet printed 0.050, and a chemistry panel that
  /// read nothing because its column order was refused; both are fixed in
  /// code, and neither correction reaches a record that was extracted before.
  ///
  /// What the person decided is kept: the title, and the lab date they
  /// confirmed. What the machine read is replaced.
  func reextract(_ report: LabReport) async {
    busy = true
    defer { busy = false }
    do {
      guard let pdf = try await store.scan(for: report.id) else {
        error = String(localized: "This report has no stored pages to read again.")
        return
      }
      // At the resolution the values were first read at.
      //
      // A stored PDF carries no resolution of its own, so a re-read has to
      // choose one. Measured on a real practice printout: rasterising its
      // stored pages at a fixed 300 dpi upsamples a 1206 pixel photograph and
      // reads *worse*, 11 coded values where 19 were stored. Records written
      // from now on say what resolution they were read at; older ones are
      // tried at two, and the better reading wins.
      let attempts: [CGFloat] =
        report.scan?.sourcePixelWidth.map { width in
          [max(72, min(600, CGFloat(width) / (ScanDocument.pageWidth / 72)))]
        } ?? [150, 300]

      var best: LabImport.Result?
      for dpi in attempts {
        let attempt = try await LabImport.pdf(pdf, dpi: dpi)
        if attempt.extraction.coded.count > (best?.extraction.coded.count ?? -1) {
          best = attempt
        }
      }
      guard let product = best else {
        error = String(localized: "This report could not be read again.")
        return
      }

      // A re-read must never cost the person values. The pages that survive a
      // round trip through PDF and back are not always the pages the
      // recogniser first saw, so a worse reading is discarded rather than
      // saved over a better one.
      let before = report.extraction.coded.count
      let after = product.extraction.coded.count
      guard after >= before else {
        error = String(
          localized:
            "Reading again found \(after) values where \(before) are stored, so the stored ones were kept."
        )
        Log.store.notice(
          "re-read discarded: \(after, privacy: .public) coded against \(before, privacy: .public) stored"
        )
        return
      }

      var metadata = product.metadata
      // A date the person confirmed outranks one read from the sheet again.
      if report.metadata.dateSource == .user {
        metadata.labDate = report.collectedOn
        metadata.dateSource = .user
      }
      let updated = LabReport(
        id: report.id, scannedAt: report.scannedAt, collectedOn: metadata.labDate ?? report.collectedOn,
        title: report.title, extraction: product.extraction, metadata: metadata,
        pageTexts: product.pageTexts,
        scan: report.scan.map {
          LabReport.ScanAttachment(
            pageCount: $0.pageCount, bytes: $0.bytes, contentType: $0.contentType,
            sourcePixelWidth: $0.sourcePixelWidth ?? product.sourcePixelWidth)
        },
        hasDiagnostics: true)
      try await store.save(updated)
      try await store.saveDiagnostics(
        ScanDiagnostics(
          reportId: report.id, createdAt: Date(),
          environment: ScanDiagnostics.Environment.current, pages: product.pages,
          extraction: product.extraction, metadata: metadata),
        for: report.id)
      Log.store.notice(
        "re-read: \(report.extraction.coded.count, privacy: .public) coded before, \(product.extraction.coded.count, privacy: .public) now"
      )
      await refresh()
    } catch {
      self.error = error.localizedDescription
    }
  }

  /// Every stored report as OMOP CDM v5.4 tables, zipped for the share sheet.
  ///
  /// A research format rather than a clinical one, so it is a separate action
  /// from the document for a doctor. Concept ids are 0 and the LOINC codes
  /// travel as source values, which is the convention the graph in this
  /// repository already follows: mapping belongs where the vocabulary is, and
  /// doing it twice is how two mappings drift apart.
  func exportOmop() async {
    busy = true
    defer { busy = false }
    do {
      let bundle = OmopExport.bundle(from: reports, profile: profile)
      let count = reports.count
      let day = ISO8601DateFormatter()
      day.formatOptions = [.withYear, .withMonth, .withDay, .withDashSeparatorInDate]
      let name = "klarbefund-omop-\(day.string(from: Date()))"
      let folder = FileManager.default.temporaryDirectory
        .appendingPathComponent(name, isDirectory: true)
      try? FileManager.default.removeItem(at: folder)
      try FileManager.default.createDirectory(
        at: folder, withIntermediateDirectories: true,
        attributes: [.protectionKey: FileProtectionType.complete])
      for (file, contents) in bundle.files {
        try Data(contents.utf8).write(
          to: folder.appendingPathComponent(file), options: [.atomic, .completeFileProtection])
      }
      let zip = FileManager.default.temporaryDirectory.appendingPathComponent("\(name).zip")
      try DiagnosticsBundle.zip(directory: folder, to: zip)
      try? FileManager.default.removeItem(at: folder)
      Log.export.notice(
        "omop export: \(bundle.measurementCount, privacy: .public) measurements from \(count, privacy: .public) report(s)"
      )
      sharingOmop = zip
    } catch {
      self.error = error.localizedDescription
    }
  }

  /// The scanned pages of a report, from wherever they are kept.
  ///
  /// The store, for a report a person scanned. A debug build's demo reports
  /// never reached the store, so their pages come from the seed beside it.
  func pages(of report: LabReport) async throws -> Data? {
    #if DEBUG
      if DevDataset.isRequested, let pages = DevDataset.scans[report.id] { return pages }
      if DemoSeed.isRequested, let pages = DemoSeed.scanPDF { return pages }
    #endif
    return try await store.scan(for: report.id)
  }

  func openScan(_ report: LabReport) async {
    do {
      guard let pdf = try await pages(of: report) else {
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

  /// Builds the person's own copy of everything the app holds.
  ///
  /// Not gated behind a confirmation dialog the way diagnostics are. The
  /// dialog there exists because a tester exporting a bug report does not
  /// expect to be handing over their scans; somebody asking for all their data
  /// is asking for exactly that, and being warned about it would be strange.
  /// What it is and that it leaves the encryption behind is written on the
  /// first page of the archive instead.
  func exportData() async {
    buildingData = true
    defer { buildingData = false }
    do {
      sharingData = try await DataExport.build(
        reports: reports, profile: profile, provider: providerConfig.kind, pages: pages(of:))
    } catch {
      self.error = error.localizedDescription
    }
  }

  /// Article 17, locally: every sealed file and the key that opens them.
  func eraseEverything() async {
    do {
      try await store.deleteEverything()
      profile = .empty
      await refresh()
      Log.store.notice("all data erased on request")
    } catch { self.error = error.localizedDescription }
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

    /// `-MBExportData`: the same for the person's own archive, so that a test
    /// can open what a share sheet would have handed over and check that
    /// every report, every page and the profile are really in it. Debug builds
    /// only.
    func debugExportDataIfRequested() async {
      guard ProcessInfo.processInfo.arguments.contains("-MBExportData") else { return }
      do {
        let zip = try await DataExport.build(
          reports: reports, profile: profile, provider: providerConfig.kind, pages: pages(of:))
        let pulled = FileManager.default.temporaryDirectory
          .appendingPathComponent("pull-my-data.zip")
        try? FileManager.default.removeItem(at: pulled)
        try FileManager.default.moveItem(at: zip, to: pulled)
        try FileManager.default.setAttributes(
          [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication],
          ofItemAtPath: pulled.path)
        Log.export.notice("data archive ready for pull")
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
  @Published var sharingOmop: URL?
  @Published var profile: Profile = .empty
  @Published var showingProfile = false
  /// A report the person asked to see, from a point on a chart.
  @Published var openReport: UUID?
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
                report: report, sex: model.profile.sex,
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
                if report.scan != nil {
                  ToolbarItem(placement: .secondaryAction) {
                    Button {
                      Task { await model.reextract(report) }
                    } label: {
                      Label("Read again with this version", systemImage: "arrow.clockwise")
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
            // The file picker does not show the photo library, so a card
            // photographed with the Camera app needed saving into Files
            // first. Several at once: a shelf of cards is one scan.
            Button {
              model.pickingPhotos = true
            } label: {
              Label("Import from Photos", systemImage: "photo.on.rectangle")
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
              Button {
                Task { await model.exportOmop() }
              } label: {
                Label("Export for research (OMOP)", systemImage: "tablecells")
              }
            }
            Button {
              model.showingReference = true
            } label: {
              Label("Reference values", systemImage: "text.book.closed")
            }
            Button {
              model.showingProfile = true
            } label: {
              Label("Profile", systemImage: "person.text.rectangle")
            }
            Button {
              model.showingPrivacy = true
            } label: {
              Label("Privacy and safety", systemImage: "hand.raised")
            }
            if !model.reports.isEmpty {
              // Above diagnostics and phrased for a person rather than a
              // tester: this is the one a person looking for their data is
              // looking for, and "diagnostics" reads like something for
              // somebody else.
              Button {
                Task { await model.exportData() }
              } label: {
                Label("Export all my data", systemImage: "square.and.arrow.up.on.square")
              }
              Button {
                model.diagnosticsRequest = .everything
              } label: {
                Label("Export diagnostics", systemImage: "ladybug")
              }
              Button(role: .destructive) {
                model.erasing = true
              } label: {
                Label("Delete all my data", systemImage: "trash")
              }
            }
          } label: {
            Label("More", systemImage: "ellipsis.circle")
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
    .modifier(AppSheets(model: model))
    .onChange(of: model.openReport) { _, id in
      // Following a point on a chart back to the document it was read from.
      guard let id else { return }
      path = [id]
      model.openReport = nil
    }
    .task {
      // Plain archives from an interrupted share, or a pull that never came,
      // have no reason to survive a launch.
      DiagnosticsExport.removeLeftovers()
      DataExport.removeLeftovers()
      await model.refresh()
      #if DEBUG
        // The self-test first: with `-MBSelfTest` the report it saves is the
        // one a screenshot should open, and it does not exist until it has run.
        await model.runSelfTestIfRequested()
        await model.debugImportIfRequested()
        await model.reextractAllIfRequested()
        await openScreenshotScreen()
        await model.debugExportIfRequested()
        await model.debugExportDataIfRequested()
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

/// Every sheet, dialog, overlay and alert the model drives.
///
/// Pulled out of `ContentView.body` because the compiler gave up on it: a
/// chain of a dozen modifiers, each with a closure and a `Binding` built
/// inline, is more than the type checker will infer in reasonable time. The
/// error it gives ("unable to type-check this expression in reasonable time")
/// names no line, so the cure is structural rather than a smaller edit.
private struct AppSheets: ViewModifier {
  @ObservedObject var model: AppModel

  func body(content: Content) -> some View {
    content
      .photosPicker(
      isPresented: $model.pickingPhotos, selection: $model.photos, maxSelectionCount: 12,
      matching: .images
    )
      .onChange(of: model.photos) { _, chosen in
      Task { await model.importPhotos(chosen) }
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
      .sheet(item: Binding(get: { model.sharingOmop.map(ArchiveBox.init) }, set: { _ in })) { box in
      ShareSheet(items: [box.url]) {
        // Plain health data in the temporary directory has no reason to
        // outlive the share sheet.
        try? FileManager.default.removeItem(at: box.url)
        model.sharingOmop = nil
      }
    }
      .sheet(item: Binding(get: { model.sharingData.map(ArchiveBox.init) }, set: { _ in })) { box in
      ShareSheet(items: [box.url]) {
        // Plain health data in the temporary directory has no reason to
        // outlive the share sheet.
        try? FileManager.default.removeItem(at: box.url)
        model.sharingData = nil
      }
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
      .modifier(AppDialogs(model: model))
  }
}

/// The dialog, the progress overlays and the error alert.
///
/// Split from `AppSheets` for the same reason that one was split from the
/// view: one chain of a dozen modifiers, each carrying a closure and an
/// inline `Binding`, is past what the type checker will infer.
private struct AppDialogs: ViewModifier {
  @ObservedObject var model: AppModel

  func body(content: Content) -> some View {
    content
    // Asked every time, in words: the archive is the person's health data in
    // the clear, and the share sheet cannot tell them that.
      .alert(
      "Export diagnostics?",
      isPresented: Binding(
        get: { model.diagnosticsRequest != nil },
        set: { if !$0 { model.diagnosticsRequest = nil } })
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
      TrendsView(
        reports: model.reports, sex: model.profile.sex,
        onOpenReport: { id in
          model.showingTrends = false
          model.openReport = id
        }
      ) {
        model.showingTrends = false
      }
    }
      .sheet(isPresented: $model.showingReference) {
      ReferenceValuesView(sex: model.profile.sex) { model.showingReference = false }
    }
      .sheet(isPresented: $model.showingProfile) {
      ProfileView(
        profile: model.profile,
        latest: BodyMeasurements.latest(from: model.reports),
        onSave: { updated in Task { await model.saveProfile(updated) } },
        onMeasurements: { waist, weight, visceral, unit in
          Task {
            await model.saveBodyMeasurements(
              waist: waist, weight: weight, visceralFat: visceral, visceralFatUnit: unit)
          }
        },
        onClose: { model.showingProfile = false })
    }
      .sheet(item: Binding(get: { model.sharing.map(ShareBox.init) }, set: { _ in })) { box in
      ShareSheet(items: [box.artefacts.pdf, box.artefacts.fhir]) {
        // The share sheet needs real files, so a lab report is written to the
        // container's temporary directory to be handed over. Found there,
        // days later, by a look inside the container: two reports still
        // sitting in `tmp/export-…`. Protected at rest, because the app's
        // entitlement puts every file it writes under complete protection,
        // and still one copy more of a person's results than anything needs.
        ReportExport.discard(model.sharing)
        model.sharing = nil
      }
    }
      .overlay { if model.asking { ProgressView("Waiting for an answer…").padding().background(.regularMaterial, in: .rect(cornerRadius: 12)) } }
      .overlay { if model.importing { ProgressView("Reading the document…").padding().background(.regularMaterial, in: .rect(cornerRadius: 12)) } }
      .overlay { if model.busy { ProgressView("Recognising text…").padding().background(.regularMaterial, in: .rect(cornerRadius: 12)) } }
      .overlay { if model.buildingDiagnostics { ProgressView("Building the diagnostics archive…").padding().background(.regularMaterial, in: .rect(cornerRadius: 12)) } }
      .overlay { if model.buildingData { ProgressView("Collecting your data…").padding().background(.regularMaterial, in: .rect(cornerRadius: 12)) } }
      // Asked in words, because there is no undo and no copy anywhere else.
      //
      // An alert and not a `confirmationDialog`. Raised from a menu, that one
      // renders the destructive action alone and leaves "Cancel" out of the
      // view hierarchy entirely (measured: the sheet holds one button), so
      // the only way back is to tap somewhere else and hope. For a deletion
      // with no undo, the way out has to be a button.
      .alert(
        "Delete all your data?", isPresented: $model.erasing
      ) {
        Button("Delete everything", role: .destructive) {
          Task { await model.eraseEverything() }
        }
        Button("Cancel", role: .cancel) {}
      } message: {
        Text(
          "Every report, every scanned page and your profile will be removed from this phone, along with the key that opens them. They are stored nowhere else, so this cannot be undone. Export your data first if you want to keep a copy."
        )
      }
      .alert("Error", isPresented: Binding(get: { model.error != nil }, set: { _ in model.error = nil })) {
      Button("OK", role: .cancel) {}
    } message: {
      Text(model.error ?? "")
    }
  }
}
