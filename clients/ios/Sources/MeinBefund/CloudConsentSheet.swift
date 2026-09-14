import Shared
import SwiftUI

/// The screen that decides whether health data leaves the phone.
///
/// Issue #186 section 4.3: on-device by default, and a cloud provider only by
/// an explicit per-call act with the provider named at the moment of use. The
/// design consequence is that this sheet cannot be a settings toggle the user
/// flipped once and forgot. It appears per request, it names the provider, and
/// it shows every value that will leave, by name and number, before anything is
/// sent.
///
/// The service refuses a request that does not carry the same consent, so this
/// is the visible half of a rule enforced on both sides rather than a promise
/// the UI makes on its own.
struct CloudConsentSheet: View {
  let candidates: [CodedLabValue]
  /// Which provider will answer, so the sheet can tell the truth about where
  /// the values go. Claiming "these values leave your device" when the
  /// on-device model is selected would be false, and a consent screen that
  /// overstates is as bad as one that understates: both teach people to stop
  /// reading it.
  let provider: BringYourOwnProvider.Kind
  let onSend: ([CloudAnalysis.SharedValue], String) -> Void
  let onCancel: () -> Void

  @State private var selected: Set<String> = []
  @State private var question: String = ""

  private var chosen: [CloudAnalysis.SharedValue] {
    candidates
      .filter { selected.contains(key(for: $0)) }
      .map(CloudAnalysis.SharedValue.init(from:))
  }

  private func key(for value: CodedLabValue) -> String {
    "\(value.coding.loinc)-\(value.raw.lineNumber)"
  }

  var body: some View {
    NavigationStack {
      Form {
        Section {
          if provider == .onDevice {
            Label("Stays on this iPhone", systemImage: "iphone")
              .font(.headline)
            Text(
              "The selected values are explained by the model on this device. Nothing is sent anywhere, and no network is used."
            )
            .font(.footnote)
            .foregroundStyle(.secondary)
          } else {
            Label("These values leave your device", systemImage: "arrow.up.forward.app")
              .font(.headline)
            Text(destinationNote)
              .font(.footnote)
              .foregroundStyle(.secondary)
          }
        }

        Section("Select values") {
          ForEach(candidates, id: \.raw.lineNumber) { value in
            Button {
              let id = key(for: value)
              if selected.contains(id) { selected.remove(id) } else { selected.insert(id) }
            } label: {
              HStack {
                Image(
                  systemName: selected.contains(key(for: value))
                    ? "checkmark.circle.fill" : "circle"
                )
                .foregroundStyle(selected.contains(key(for: value)) ? Color.accentColor : .secondary)
                VStack(alignment: .leading, spacing: 2) {
                  Text(value.raw.label)
                  Text("\(formatted(value.raw.value)) \(value.coding.ucum) · LOINC \(value.coding.loinc)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                }
                Spacer()
                if value.source != .labIssuedDigital {
                  // The reviewer should know an OCR value may be misread before
                  // deciding to ask a question about it.
                  Text("scanned")
                    .font(.caption2)
                    .padding(.horizontal, 6).padding(.vertical, 2)
                    .background(.quaternary, in: Capsule())
                }
              }
            }
            .buttonStyle(.plain)
          }
        }

        Section("Your question") {
          TextField("What would you like to know?", text: $question, axis: .vertical)
            .lineLimit(2...5)
        }

        Section {
          DoctorReminder()
        }
      }
      .navigationTitle("Send for analysis")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Cancel", action: onCancel)
        }
        ToolbarItem(placement: .confirmationAction) {
          Button("Send \(chosen.count)") { onSend(chosen, question) }
            .disabled(CloudAnalysis.refusal(for: chosen) != nil)
        }
      }
      .task {
        #if DEBUG
          // Screenshot mode only. Nothing is preselected in a real run: each
          // value leaves the phone because someone ticked it, not because the
          // app ticked it for them.
          if DemoSeed.screen == .consent {
            selected = Set(candidates.prefix(4).map(key(for:)))
            question = "Which of these should I ask my doctor about?"
          }
        #endif
      }
    }
  }

  /// Names the destination precisely. "A third party" is not a disclosure.
  private var destinationNote: String {
    switch provider {
    case .onDevice:
      return ""
    case .hosted:
      return String(
        localized:
          "The selected values go to the MeinBefund service in the EU. Your name, date of birth and the scanned image are not sent.")
    case .azure:
      return String(
        localized:
          "The selected values go to your own Azure resource. Your name, date of birth and the scanned image are not sent.")
    case .anthropic:
      return String(
        localized:
          "The selected values go to Anthropic in the United States. Your name, date of birth and the scanned image are not sent.")
    }
  }

  private func formatted(_ value: Double) -> String {
    value == value.rounded() ? String(Int(value)) : String(format: "%.2f", value)
  }
}

/// Shows the answer, and says plainly where it came from.
///
/// The provider is echoed from the response rather than from what the app
/// believes it asked, so the label cannot drift from the fact.
struct CloudReplySheet: View {
  let reply: CloudAnalysis.Reply
  let onClose: () -> Void

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 16) {
          Text(reply.text).font(.body)
          Divider()
          DoctorReminder()
          Text(
            """
            Answered by \(reply.provider), model \(reply.model). Not a \
            diagnosis and not a treatment recommendation. The values sent were \
            read from a scan and may contain recognition errors.
            """
          )
          .font(.footnote)
          .foregroundStyle(.secondary)
        }
        .padding()
      }
      .navigationTitle("Answer")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .confirmationAction) { Button("Done", action: onClose) }
      }
    }
  }
}
