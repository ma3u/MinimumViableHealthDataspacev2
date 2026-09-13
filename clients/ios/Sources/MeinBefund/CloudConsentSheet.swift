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
          Label("Diese Werte verlassen Ihr Gerät", systemImage: "arrow.up.forward.app")
            .font(.headline)
          Text(
            """
            Die ausgewählten Werte werden an Anthropic (Claude) in den USA \
            gesendet. Ihr Name, Ihr Geburtsdatum und der gescannte Befund \
            werden nicht gesendet. Ohne Auswahl verlässt nichts das Gerät.
            """
          )
          .font(.footnote)
          .foregroundStyle(.secondary)
        }

        Section("Werte auswählen") {
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
                  Text("gescannt")
                    .font(.caption2)
                    .padding(.horizontal, 6).padding(.vertical, 2)
                    .background(.quaternary, in: Capsule())
                }
              }
            }
            .buttonStyle(.plain)
          }
        }

        Section("Ihre Frage") {
          TextField("Was möchten Sie wissen?", text: $question, axis: .vertical)
            .lineLimit(2...5)
        }

        Section {
          Text(
            """
            Claude erklärt Messwerte. Es stellt keine Diagnose, schätzt kein \
            Risiko ein und empfiehlt keine Behandlung. Für all das ist Ihre \
            Ärztin oder Ihr Arzt zuständig.
            """
          )
          .font(.footnote)
          .foregroundStyle(.secondary)
        }
      }
      .navigationTitle("An Claude senden")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Abbrechen", action: onCancel)
        }
        ToolbarItem(placement: .confirmationAction) {
          Button("\(chosen.count) senden") { onSend(chosen, question) }
            .disabled(CloudAnalysis.refusal(for: chosen) != nil)
        }
      }
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
          Text(
            """
            Antwort von \(reply.provider), Modell \(reply.model). Keine \
            Diagnose und keine Behandlungsempfehlung. Die gesendeten Werte \
            wurden aus einem Scan gelesen und können Lesefehler enthalten.
            """
          )
          .font(.footnote)
          .foregroundStyle(.secondary)
        }
        .padding()
      }
      .navigationTitle("Antwort")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .confirmationAction) { Button("Fertig", action: onClose) }
      }
    }
  }
}
