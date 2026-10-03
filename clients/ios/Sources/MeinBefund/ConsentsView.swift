import Shared
import SwiftUI

/// The three consent decisions, side by side and never one switch.
///
/// #186 criterion 6. Each section has its own state, its own date, its own
/// holder and its own button, and recording one leaves the other two exactly
/// as they were: `ConsentLedger.record` takes one kind and is the only way to
/// change anything. There is deliberately no "withdraw all", because the
/// three are given to three different parties on three different legal bases
/// and withdrawing from a study says nothing about the ePA.
///
/// The app records; it does not transmit. A withdrawal here is the person's
/// own note of what they told the study centre, the insurer or the registry,
/// and the screen says so, so that nobody believes tapping a button here has
/// informed anyone.
struct ConsentsView: View {
  let ledger: ConsentLedger
  let onRecord: (ConsentKind, Bool, Date, String?) -> Void
  let onClose: () -> Void

  var body: some View {
    NavigationStack {
      Form {
        Section {
          Text(
            "Three separate decisions, given to three different parties. Changing one never changes another. Klarbefund keeps your own record of them on this phone and tells nobody: to give or withdraw one, contact whoever holds it."
          )
          .font(.footnote)
          .foregroundStyle(.secondary)
        }
        ForEach(ConsentKind.allCases, id: \.self) { kind in
          ConsentSection(
            kind: kind, current: ledger.current(kind), history: ledger.history(of: kind),
            onRecord: { active, effective, holder in onRecord(kind, active, effective, holder) })
        }
      }
      .navigationTitle("Consents")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .confirmationAction) { Button("Done", action: onClose) }
      }
    }
  }
}

private struct ConsentSection: View {
  let kind: ConsentKind
  let current: ConsentEvent?
  let history: [ConsentEvent]
  let onRecord: (Bool, Date, String?) -> Void

  @State private var holder = ""
  @State private var effective = Date()
  @State private var seeded = false

  private var active: Bool { current?.active ?? false }

  var body: some View {
    Section {
      Text(Copy.explanation(kind))
        .font(.footnote)
        .foregroundStyle(.secondary)

      Label {
        Text(Copy.status(kind, current))
      } icon: {
        Image(systemName: active ? "checkmark.seal.fill" : "seal")
          .foregroundStyle(active ? Color.accentColor : .secondary)
      }
      // One element that reads the words. Left to itself VoiceOver read the
      // seal as "Verified", which claims something nobody checked.
      .accessibilityElement(children: .ignore)
      .accessibilityLabel(Text(Copy.status(kind, current)))
      .accessibilityIdentifier("consent-status-\(kind.rawValue)")

      TextField(Copy.holderPrompt(kind), text: $holder)
        .textInputAutocapitalization(.words)
        .accessibilityIdentifier("consent-holder-\(kind.rawValue)")
      DatePicker("Effective from", selection: $effective, displayedComponents: .date)

      Button(active ? Copy.withdraw(kind) : Copy.give(kind)) {
        onRecord(!active, ReportMetadata.calendarDay(effective), holder)
      }
      .accessibilityIdentifier("consent-toggle-\(kind.rawValue)")

      if history.count > 1 {
        DisclosureGroup("History") {
          ForEach(Array(history.enumerated().reversed()), id: \.offset) { _, event in
            Text(Copy.status(kind, event))
              .font(.caption)
          }
        }
      }
    } header: {
      Text(Copy.title(kind))
    }
    .onAppear {
      guard !seeded else { return }
      seeded = true
      holder = current?.holder ?? ""
    }
  }
}

/// Every sentence on the screen, per kind, in one place.
///
/// Built with `String(localized:)` so the extractor sees each one: an
/// interpolated sentence assembled at the call site is invisible to it, and
/// that is how English once shipped to German phones.
private enum Copy {
  static func title(_ kind: ConsentKind) -> String {
    switch kind {
    case .study: String(localized: "Study participation")
    case .epaObjection: String(localized: "Electronic patient record (ePA)")
    case .registry: String(localized: "Registry and research use")
    }
  }

  static func explanation(_ kind: ConsentKind) -> String {
    switch kind {
    case .study:
      String(
        localized:
          "Your consent to a study, given to the study centre. You can withdraw it at any time, and withdrawing it does not touch your ePA or any registry."
      )
    case .epaObjection:
      String(
        localized:
          "The ePA exists unless you object to your health insurer. Record an objection here only if you lodged one; it says nothing about a study or a registry."
      )
    case .registry:
      String(
        localized:
          "Your consent for a registry or research database to use your values. Separate from any study and from the ePA."
      )
    }
  }

  static func holderPrompt(_ kind: ConsentKind) -> String {
    switch kind {
    case .study: String(localized: "Study centre")
    case .epaObjection: String(localized: "Health insurer")
    case .registry: String(localized: "Registry")
    }
  }

  static func give(_ kind: ConsentKind) -> String {
    kind == .epaObjection
      ? String(localized: "Record my objection") : String(localized: "Record my consent")
  }

  static func withdraw(_ kind: ConsentKind) -> String {
    kind == .epaObjection
      ? String(localized: "Record that I withdrew my objection")
      : String(localized: "Record that I withdrew my consent")
  }

  static func status(_ kind: ConsentKind, _ event: ConsentEvent?) -> String {
    guard let event else { return String(localized: "Nothing recorded") }
    let day = event.effective.formatted(date: .abbreviated, time: .omitted)
    let holder = event.holder.map { " · \($0)" } ?? ""
    switch (kind == .epaObjection, event.active) {
    case (true, true): return String(localized: "Objected on \(day)\(holder)")
    case (true, false): return String(localized: "Objection withdrawn on \(day)\(holder)")
    case (false, true): return String(localized: "Consent given on \(day)\(holder)")
    case (false, false): return String(localized: "Consent withdrawn on \(day)\(holder)")
    }
  }
}
