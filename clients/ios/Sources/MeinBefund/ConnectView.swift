import Shared
import SwiftUI
import VisionKit

/// "Connect to EHDS": the phone's half of #473 (ADR-049).
///
/// Two ways to the same link. On a computer, the person opens the patient
/// screen (the address is here to copy, share or open) and scans the QR code
/// it shows. On the phone itself, the patient screen's "Open in Klarbefund"
/// hands the link straight to the app. A pasted link works too, for a phone
/// without a camera scanner and for the UI tests.
///
/// After the patient approves in their browser, the app shows which account it
/// connected to and asks whether that is theirs. A code someone else printed
/// would connect the phone to their account; asking is how that is noticed.
struct ConnectView: View {
  @ObservedObject var connection: EHDSConnection
  let onClose: () -> Void

  @State private var scanning = false
  @State private var pasted = ""
  @State private var showingRecord = false
  @State private var username = ""
  @State private var password = ""
  @State private var confirmingDelete = false

  private var hub: TrustedHub { EHDSConnection.trusted[0] }

  var body: some View {
    NavigationStack {
      Form {
        if let notice = connection.notice {
          Section {
            Label(notice, systemImage: "info.circle")
              .accessibilityElement(children: .ignore)
              .accessibilityLabel(Text(notice))
              .accessibilityIdentifier("connect-notice")
          }
        }
        switch connection.state {
        case .disconnected, .failed:
          disconnected
        case let .waiting(link):
          waiting(link)
        case let .confirming(hub, username):
          confirming(hub: hub, username: username)
        case let .connected(hub, username):
          connected(hub: hub, username: username)
        case .signingIn:
          Section {
            HStack(spacing: 12) {
              ProgressView()
              Text("Signing in to the EHDS demo hub…")
            }
            .accessibilityIdentifier("connect-signing-in")
          }
        }
      }
      .navigationTitle("Connect to EHDS")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .confirmationAction) { Button("Done", action: onClose) }
      }
      .sheet(isPresented: $scanning) {
        QRScanner { text in
          scanning = false
          connection.connect(with: text)
        } onCancel: {
          scanning = false
        }
        .ignoresSafeArea()
      }
      .navigationDestination(isPresented: $showingRecord) {
        DataspaceRecordView(connection: connection)
      }
    }
  }

  // MARK: - Not connected

  @ViewBuilder private var disconnected: some View {
    if case let .failed(message) = connection.state {
      Section {
        Label(message, systemImage: "exclamationmark.triangle")
          .foregroundStyle(.orange)
          .accessibilityElement(children: .ignore)
          .accessibilityLabel(Text(message))
          .accessibilityIdentifier("connect-error")
      }
    }
    if let account = connection.account {
      Section {
        AccountCredentials(account: account)
        Button {
          Task { await connection.signIn(username: account.username, password: account.password) }
        } label: {
          Label("Sign in again", systemImage: "arrow.clockwise")
        }
        .accessibilityIdentifier("account-sign-in-again")
        Button("Forget on this phone", role: .destructive) { connection.forgetAccount() }
      } header: {
        Text("Your EHDS account")
      } footer: {
        Text("Forgetting removes the password from this phone only; the account stays on the hub.")
      }
    } else {
      Section {
        Button {
          Task { await connection.createAccount() }
        } label: {
          Label("Create an EHDS account", systemImage: "person.crop.circle.badge.plus")
        }
        .disabled(!connection.canCreateAccount)
        .accessibilityIdentifier("account-create")
      } header: {
        Text("No account yet?")
      } footer: {
        Text(
          connection.canCreateAccount
            ? "Creates an account with its own, empty record on the EHDS demo hub, and connects this phone to it. You get a username and password to sign in on the website too. Apple confirms to the hub that the request comes from this app."
            : "This device cannot prove to the hub that it runs Klarbefund, so it cannot create an account. Sign in with an existing account instead."
        )
      }
      Section {
        TextField("Username", text: $username)
          .textContentType(.username)
          .textInputAutocapitalization(.never)
          .autocorrectionDisabled()
          .accessibilityIdentifier("account-username")
        SecureField("Password", text: $password)
          .textContentType(.password)
          .accessibilityIdentifier("account-password")
        Button("Sign in") {
          Task { await connection.signIn(username: username, password: password) }
        }
        .disabled(username.isEmpty || password.isEmpty)
        .accessibilityIdentifier("account-sign-in")
      } header: {
        Text("Sign in with an EHDS account")
      }
    }

    Section {
      Text(
        "Connect Klarbefund to your record in the European Health Data Space demo, so the app can read it. You approve on the website; no password is typed on this phone."
      )
      .font(.footnote)
      .foregroundStyle(.secondary)
    } header: {
      Text("Or connect an account by QR code")
    }

    Section {
      Text(hub.patientScreen.absoluteString)
        .font(.callout.monospaced())
        .textSelection(.enabled)
        .accessibilityIdentifier("connect-website")
      HStack {
        Button("Copy", systemImage: "doc.on.doc") {
          UIPasteboard.general.url = hub.patientScreen
        }
        Spacer()
        ShareLink(item: hub.patientScreen) { Label("Share", systemImage: "square.and.arrow.up") }
        Spacer()
        Link(destination: hub.patientScreen) { Label("Open", systemImage: "safari") }
      }
      .buttonStyle(.borderless)
    } header: {
      Text("1. Open the patient screen on a computer")
    } footer: {
      Text("Sign in as a patient and choose Show QR code.")
    }

    Section {
      if QRScanner.isAvailable {
        Button {
          scanning = true
        } label: {
          Label("Scan QR code", systemImage: "qrcode.viewfinder")
        }
        .accessibilityIdentifier("connect-scan")
      } else {
        Text("This device cannot scan codes with its camera. Paste the link instead, or use the iPhone camera app, which opens Klarbefund from the code.")
          .font(.footnote)
          .foregroundStyle(.secondary)
      }
      TextField("Or paste the link", text: $pasted, axis: .vertical)
        .textInputAutocapitalization(.never)
        .autocorrectionDisabled()
        .font(.footnote.monospaced())
        .accessibilityIdentifier("connect-paste")
      Button("Connect") {
        connection.connect(with: pasted)
      }
      .disabled(pasted.isEmpty)
      .accessibilityIdentifier("connect-go")
    } header: {
      Text("2. Scan the code")
    }
  }

  // MARK: - Waiting for the approval

  private func waiting(_ link: ConnectLink) -> some View {
    Section {
      HStack(spacing: 12) {
        ProgressView()
        Text("Approve the connection on \(link.hub.host) in your browser.")
      }
      LabeledContent("Code on the website", value: link.userCode)
        .accessibilityIdentifier("connect-user-code")
      Button("Cancel", role: .cancel) { connection.cancel() }
    } footer: {
      Text("The code shown on the website must read the same. If it does not, cancel.")
    }
  }

  // MARK: - Is this you?

  private func confirming(hub: TrustedHub, username: String) -> some View {
    Section {
      Label {
        Text("Connected to \(hub.host) as \(username).")
      } icon: {
        Image(systemName: "person.crop.circle.badge.questionmark")
      }
      // One element that reads the words, not the symbol's name.
      .accessibilityElement(children: .ignore)
      .accessibilityLabel(Text("Connected to \(hub.host) as \(username)."))
      .accessibilityIdentifier("connect-account")
      Button("This is my account") { connection.confirm() }
        .accessibilityIdentifier("connect-confirm")
      Button("Not me, disconnect", role: .destructive) {
        Task { await connection.disconnect() }
      }
    } header: {
      Text("Is this your account?")
    } footer: {
      Text("A code someone else showed you would connect this phone to their account. If the name is not yours, disconnect.")
    }
  }

  // MARK: - Connected

  private func connected(hub: TrustedHub, username: String) -> some View {
    Group {
      Section {
        LabeledContent("Hub", value: hub.host)
        LabeledContent("Account", value: username)
          .accessibilityIdentifier("connect-connected-account")
        Button {
          showingRecord = true
        } label: {
          Label("Show my EHDS record", systemImage: "list.bullet.clipboard")
        }
        .accessibilityIdentifier("connect-show-record")
      } header: {
        Text("Connected")
      } footer: {
        Text("Klarbefund reads your record when you open it and keeps no copy. Your scanned reports stay on this phone; nothing is sent to the hub.")
      }
      if let account = connection.account {
        Section {
          AccountCredentials(account: account)
        } header: {
          Text("Your EHDS account")
        } footer: {
          Text("Sign in on \(hub.host) with these as well. They are kept only on this phone; Klarbefund signs in with them again by itself when a session ends.")
        }
      }
      Section {
        Button("Disconnect", role: .destructive) {
          Task { await connection.disconnect() }
        }
        .accessibilityIdentifier("connect-disconnect")
        if connection.account?.createdByApp == true {
          Button("Delete account", role: .destructive) { confirmingDelete = true }
            .accessibilityIdentifier("account-delete")
        }
      } footer: {
        Text("You can also disconnect this phone on the patient screen.")
      }
      .confirmationDialog(
        "Delete the account and its record on the hub?", isPresented: $confirmingDelete,
        titleVisibility: .visible
      ) {
        Button("Delete account", role: .destructive) {
          Task { await connection.deleteAccount() }
        }
        .accessibilityIdentifier("account-delete-confirm")
      } message: {
        Text("This deletes the login, its record and its phones on the EHDS demo hub. Your scanned reports stay on this phone.")
      }
    }
  }
}

/// The username and password of the account this phone holds, to read off
/// or copy into the website's sign-in. The password is hidden until asked for.
struct AccountCredentials: View {
  let account: EHDSAccount
  @State private var revealed = false

  var body: some View {
    LabeledContent("Username") {
      HStack {
        Text(account.username).font(.body.monospaced()).textSelection(.enabled)
        Button("Copy username", systemImage: "doc.on.doc") {
          UIPasteboard.general.string = account.username
        }
        .labelStyle(.iconOnly)
        .buttonStyle(.borderless)
      }
    }
    .accessibilityIdentifier("account-shown-username")
    LabeledContent("Password") {
      HStack {
        Text(revealed ? account.password : "••••••••••")
          .font(.body.monospaced())
          .textSelection(.enabled)
          .accessibilityIdentifier("account-shown-password")
        Button(revealed ? "Hide password" : "Show password", systemImage: revealed ? "eye.slash" : "eye") {
          revealed.toggle()
        }
        .labelStyle(.iconOnly)
        .buttonStyle(.borderless)
        .accessibilityIdentifier("account-reveal")
        Button("Copy password", systemImage: "doc.on.doc") {
          UIPasteboard.general.string = account.password
        }
        .labelStyle(.iconOnly)
        .buttonStyle(.borderless)
      }
    }
  }
}

/// The patient's record on the hub, beside the app's own reports and never
/// mixed into them: a different source, and on the demo hub a synthetic one.
struct DataspaceRecordView: View {
  @ObservedObject var connection: EHDSConnection

  var body: some View {
    List {
      if let record = connection.record {
        if connection.account?.createdByApp == true {
          Section {
            Text("Your own record on the EHDS demo hub. It starts empty and holds only what is added to it; nothing from this phone is sent there.")
              .font(.footnote)
              .foregroundStyle(.secondary)
              .accessibilityIdentifier("record-sandbox")
          }
        } else {
        Section {
          Text(
            record.fictional
              ? String(localized: "From the EHDS demo hub. This is a synthetic record, not your own results, and it is not added to your scanned reports.")
              : String(localized: "From the EHDS hub. It is not added to your scanned reports.")
          )
          .font(.footnote)
          .foregroundStyle(.secondary)
          .accessibilityIdentifier("record-source")
        }
        }
        Section("\(record.observations.count) measurements") {
          ForEach(record.observations) { o in
            VStack(alignment: .leading, spacing: 2) {
              HStack(alignment: .firstTextBaseline) {
                Text(o.display)
                Spacer()
                Text("\(Measurement.text(o.value)) \(o.unit)")
                  .font(.body.monospacedDigit())
              }
              HStack(spacing: 6) {
                Text("LOINC \(o.loinc)")
                if let range = o.range {
                  Text("·")
                  Text("Ref. \(range)")
                }
                if let day = o.effective {
                  Text("·")
                  Text(day.formatted(date: .abbreviated, time: .omitted))
                }
              }
              .font(.caption)
              .foregroundStyle(.secondary)
            }
            // Combined first: an identifier on a container otherwise renames
            // every text inside it (docs/gotchas.md).
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("record-observation")
          }
        }
      } else if connection.loadingRecord {
        ProgressView()
      }
    }
    .navigationTitle("My EHDS record")
    .task { await connection.loadRecord() }
    .refreshable { await connection.loadRecord() }
  }
}

/// VisionKit's live scanner, for QR codes only.
///
/// VisionKit is already what reads the lab sheets, so this adds no framework
/// and no permission: the camera prompt is the one the document scanner uses.
struct QRScanner: UIViewControllerRepresentable {
  let onCode: (String) -> Void
  let onCancel: () -> Void

  /// False in the simulator and on devices without the Neural Engine.
  static var isAvailable: Bool {
    DataScannerViewController.isSupported && DataScannerViewController.isAvailable
  }

  func makeUIViewController(context: Context) -> UINavigationController {
    let scanner = DataScannerViewController(
      recognizedDataTypes: [.barcode(symbologies: [.qr])],
      qualityLevel: .balanced, isHighlightingEnabled: true)
    scanner.delegate = context.coordinator
    scanner.navigationItem.leftBarButtonItem = UIBarButtonItem(
      systemItem: .cancel, primaryAction: UIAction { _ in onCancel() })
    try? scanner.startScanning()
    return UINavigationController(rootViewController: scanner)
  }

  func updateUIViewController(_ controller: UINavigationController, context: Context) {}

  func makeCoordinator() -> Coordinator { Coordinator(onCode: onCode) }

  final class Coordinator: NSObject, DataScannerViewControllerDelegate {
    let onCode: (String) -> Void
    private var done = false
    init(onCode: @escaping (String) -> Void) { self.onCode = onCode }

    func dataScanner(
      _ dataScanner: DataScannerViewController, didAdd addedItems: [RecognizedItem],
      allItems: [RecognizedItem]
    ) {
      // The first Klarbefund link wins; any other QR code is ignored, so a
      // poster in the background cannot hijack the scan.
      for item in addedItems {
        if case let .barcode(code) = item, let text = code.payloadStringValue,
          text.hasPrefix("klarbefund://connect"), !done
        {
          done = true
          dataScanner.stopScanning()
          onCode(text)
          return
        }
      }
    }
  }
}
