import Shared
import SwiftUI

/// Bonus programs from other data spaces (#934, step 4; ADR-080).
///
/// The phone's half of the portal's `/patient/programmes`, in the same words
/// (`ui/src/messages/*/patient.json`, area `patient`). A program receives a
/// yes or no per year and never the data behind it. Joining is the person's
/// consent to that one program, withdrawn here at any time, and "Send my
/// answer" goes out only while that consent is open: after a withdrawal the
/// hub answers 403 and records nothing. Before it can be tapped, the member
/// sees their own result for the ended year, worked out by the hub inside
/// their record (#934 step 6, ADR-087).
///
/// Reached from Connect to EHDS, not from Consents. The Consents screen is
/// the person's own note of a study consent, an ePA objection and a registry
/// consent held by others; a program consent is given to the hub from here,
/// and ADR-080 decision 6 keeps it apart from study consent and the opt-out.
struct BonusProgrammesView: View {
  @ObservedObject var connection: EHDSConnection

  @State private var busy: String?
  @State private var message: ProgrammeMessage?

  var body: some View {
    List {
      Section {
        Text(
          "Offers from other data spaces that reward what you do for your health. A program receives a yes or no once a year, never the data behind it. Whether you join is your decision alone (GDPR Art. 9(2)(a))."
        )
        Text(
          "A bonus program is not research and not the opt-out. Joining one never enrolls you in a study, and your opt-out from secondary use (EHDS Art. 71) does not stop sharing you start yourself."
        )
        .foregroundStyle(.secondary)
        .accessibilityIdentifier("programmes-not-research")
      }
      .font(.footnote)

      if let offer = connection.programmes {
        if offer.programmes.isEmpty {
          Section {
            Text(
              "No bonus program is on offer. The catalogue crawler has not found one in another data space yet."
            )
            .accessibilityIdentifier("programmes-empty")
          }
        }
        ForEach(offer.programmes) { programme in
          ProgrammeSection(
            programme: programme,
            evaluation: connection.evaluations[programme.programmeId],
            evaluationError: connection.evaluationErrors[programme.programmeId],
            open: offer.open(programme.programmeId),
            last: offer.last(programme.programmeId),
            busy: busy == programme.programmeId,
            message: message?.programmeId == programme.programmeId ? message : nil,
            onJoin: { act(programme) { await connection.joinProgramme(programme) } },
            onWithdraw: { act(programme) { await connection.withdrawProgramme(programme) } },
            onSend: {
              act(programme) {
                await connection.sendProgrammeAnswer(programme, year: programme.ruleYear())
              }
            })
        }
      } else if let error = connection.programmesError {
        Section {
          Label(error, systemImage: "exclamationmark.triangle")
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(Text(error))
            .accessibilityIdentifier("programmes-error")
        }
      } else if connection.loadingProgrammes {
        Section {
          HStack(spacing: 12) {
            ProgressView()
            Text("Loading bonus programs…")
          }
        }
      }
    }
    .navigationTitle("Bonus programs")
    .task { await connection.loadProgrammes() }
    // The result for each program joined, read again after a join.
    .task(id: joinedKey) {
      for programme in joinedProgrammes { await connection.loadEvaluation(programme) }
    }
    .refreshable { await connection.loadProgrammes() }
  }

  private var joinedProgrammes: [BonusProgramme] {
    guard let offer = connection.programmes else { return [] }
    return offer.programmes.filter { offer.open($0.programmeId) != nil }
  }

  private var joinedKey: String { joinedProgrammes.map(\.programmeId).joined(separator: " ") }

  /// Runs one join, withdrawal or send, and says what came of it.
  private func act(
    _ programme: BonusProgramme, _ call: @escaping () async -> ProgrammeAnswer
  ) {
    busy = programme.programmeId
    message = nil
    Task {
      let answer = await call()
      busy = nil
      message = ProgrammeMessage(programme: programme, answer: answer)
    }
  }
}

/// What the last action on one program came to, or nil when there is nothing
/// to say (a join or withdrawal shows itself in the consent line).
private struct ProgrammeMessage: Equatable {
  let programmeId: String
  let text: String
  let ok: Bool

  init?(programme: BonusProgramme, answer: ProgrammeAnswer) {
    programmeId = programme.programmeId
    switch answer {
    case .consent:
      return nil
    case let .transfer(transfer):
      ok = true
      text =
        transfer.goalMet == true
        ? String(
          localized:
            "Recorded for \(String(transfer.year)): goal met, yes. Only this answer goes to \(programme.publisher), once the hub's delivery is connected."
        )
        : String(
          localized:
            "Recorded for \(String(transfer.year)): goal met, no. Only this answer goes to \(programme.publisher), once the hub's delivery is connected."
        )
    case .yearNotOver:
      ok = false
      text = String(
        localized:
          "\(String(programme.ruleYear())) is not over yet. Nothing was sent; the hub works out the result once the year has ended."
      )
    case .noOpenConsent:
      ok = false
      text = String(
        localized:
          "Nothing was sent: there is no open consent to this program. If you withdrew, nothing is sent any more; join again to send an answer."
      )
    case let .failed(status, _) where status > 0:
      ok = false
      text = String(localized: "That did not work (HTTP \(status)). Please try again.")
    case let .failed(_, reason):
      ok = false
      text = reason ?? String(localized: "That did not work. Please try again.")
    }
  }
}

private struct ProgrammeSection: View {
  let programme: BonusProgramme
  let evaluation: ProgrammeEvaluation?
  let evaluationError: String?
  let open: ProgrammeConsent?
  let last: ProgrammeConsent?
  let busy: Bool
  let message: ProgrammeMessage?
  let onJoin: () -> Void
  let onWithdraw: () -> Void
  let onSend: () -> Void

  /// Send is offered only for an ended year the hub has worked out.
  private var evaluated: Bool {
    if case .evaluated = evaluation { return true }
    return false
  }

  private var dataSpace: String {
    programme.dataSpace == "insurance-wellbeing"
      ? String(localized: "Insurance and wellbeing data space")
      : String(localized: "Another data space")
  }

  private static func day(_ date: Date?) -> String {
    date?.formatted(date: .abbreviated, time: .omitted) ?? ""
  }

  var body: some View {
    Section {
      VStack(alignment: .leading, spacing: 4) {
        Text(programme.publisher)
          .font(.subheadline.weight(.medium))
        Text(dataSpace)
          .font(.caption)
          .foregroundStyle(.secondary)
      }
      .accessibilityElement(children: .combine)
      .accessibilityIdentifier("programme-publisher")

      if let description = programme.description {
        Text(description)
          .font(.footnote)
          .foregroundStyle(.secondary)
      }

      if let rule = programme.ruleDescription {
        VStack(alignment: .leading, spacing: 4) {
          Text("The rule, version \(programme.ruleVersion ?? "")")
            .font(.footnote.weight(.medium))
          Text(rule)
            .font(.footnote)
            .foregroundStyle(.secondary)
        }
      }

      VStack(alignment: .leading, spacing: 4) {
        Label("What \(programme.publisher) receives", systemImage: "checkmark.shield")
          .font(.footnote.weight(.medium))
          .foregroundStyle(.teal)
        Text("The year, and goal met: yes or no.")
          .font(.footnote)
          .foregroundStyle(.secondary)
      }
      .accessibilityElement(children: .combine)
      .accessibilityIdentifier("programme-receives")

      VStack(alignment: .leading, spacing: 4) {
        Label("What never leaves your record", systemImage: "lock")
          .font(.footnote.weight(.medium))
        Text("Steps, heart rate, diagnoses, visit details and any date finer than the year.")
          .font(.footnote)
          .foregroundStyle(.secondary)
      }
      .accessibilityElement(children: .combine)
      .accessibilityIdentifier("programme-never-leaves")

      Text(
        "Joining is your consent to this program alone (GDPR Art. 9(2)(a)). It enrolls you in no study and is separate from your opt-out."
      )
      .font(.footnote)
      .foregroundStyle(.secondary)

      if let open {
        Label("You joined on \(Self.day(open.joinedDay)).", systemImage: "checkmark.circle.fill")
          .foregroundStyle(.teal)
          .accessibilityElement(children: .ignore)
          .accessibilityLabel(Text("You joined on \(Self.day(open.joinedDay))."))
          .accessibilityIdentifier("programme-joined")
        YearResultView(
          programme: programme, evaluation: evaluation, error: evaluationError)
        Button {
          onSend()
        } label: {
          Label(
            busy ? String(localized: "Sending…") : String(localized: "Send my answer for \(String(programme.ruleYear()))"),
            systemImage: "paperplane")
        }
        .disabled(busy || !evaluated)
        .accessibilityIdentifier("programme-send")
        Button(role: .destructive) {
          onWithdraw()
        } label: {
          Label(
            busy ? String(localized: "Withdrawing…") : String(localized: "Withdraw (GDPR Art. 7(3))"),
            systemImage: "xmark.circle")
        }
        .disabled(busy)
        .accessibilityIdentifier("programme-withdraw")
      } else {
        if let withdrawn = last?.withdrawnDay {
          Text("You withdrew on \(Self.day(withdrawn)). Nothing is sent any more.")
            .accessibilityIdentifier("programme-withdrawn")
        }
        Button(busy ? String(localized: "Joining…") : String(localized: "Join this program")) {
          onJoin()
        }
        .disabled(busy)
        .accessibilityIdentifier("programme-join")
      }

      if let message {
        Text(message.text)
          .font(.footnote)
          .foregroundStyle(message.ok ? Color.teal : Color.orange)
          .accessibilityIdentifier("programme-message")
      }
    } header: {
      Text(programme.title)
    }
  }
}

/// The member's own result for the program year, before anything is sent
/// (ADR-080, decision 3; ADR-087). The breakdown stays on this screen: what
/// would go out is the year and goal met, yes or no.
private struct YearResultView: View {
  let programme: BonusProgramme
  let evaluation: ProgrammeEvaluation?
  let error: String?

  var body: some View {
    switch evaluation {
    case let .evaluated(result):
      VStack(alignment: .leading, spacing: 4) {
        Label("Your result for \(String(result.year))", systemImage: "scalemass")
          .font(.footnote.weight(.medium))
        Text(result.goalMet ? "Goal met: yes" : "Goal met: no")
          .font(.body.weight(.semibold))
          .foregroundStyle(result.goalMet ? Color.teal : Color.orange)
          .accessibilityIdentifier("programme-goal")
        Text(
          "Exercise: \(result.minutesPerWeek) minutes a week on average, from \(result.weeksWithData) weeks your tracker shared. The rule asks for \(result.requiredMinutesPerWeek)."
        )
        Text("Check-ups in \(String(result.year)): \(result.checkUps). The rule asks for one.")
        Text(
          "Only the year and goal met, yes or no, would go to \(programme.publisher). This breakdown stays in your record."
        )
        .foregroundStyle(.secondary)
      }
      .font(.footnote)
      .accessibilityElement(children: .combine)
      .accessibilityIdentifier("programme-result")
    case let .yearNotOver(year, from):
      Text(
        "\(String(year)) is not over. The hub works out your result from \(from); nothing can be sent before."
      )
      .font(.footnote)
      .accessibilityIdentifier("programme-year-not-over")
    case nil:
      if let error {
        Label(error, systemImage: "exclamationmark.triangle")
          .font(.footnote)
          .accessibilityIdentifier("programme-result-error")
      } else {
        HStack(spacing: 8) {
          ProgressView()
          Text("Working out your result…")
        }
        .font(.footnote)
      }
    }
  }
}
