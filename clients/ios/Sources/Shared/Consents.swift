import Foundation

/// The three decisions a person makes about their health data, kept apart.
///
/// #186 criterion 6: the study's consent, the ePA opt-out and any registry
/// consent are three separately revocable things, never one switch. They have
/// three different legal bases (issue section 1, "Three flows, three different
/// legal bases") and three different holders:
///
/// - **Study consent.** Given to a study centre under GDPR Art. 9(2)(a), and
///   revocable at any time under Art. 7(3). The centre holds it, not the app.
/// - **ePA objection.** The ePA has been opt-out since January 2025: a record
///   exists unless the insured person objects, and the objection goes to the
///   insurer. Recorded here as what it is, an objection, so "on" means "I
///   objected" and never reads as consent.
/// - **Registry consent.** Given to a registry or a research data space for
///   secondary use. Under the EHDS, secondary use is opt-out at the access
///   body (Art. 71); a registry asking for consent on top is a separate grant.
///
/// The app is the person's own record of what they decided and when. It
/// transmits none of it. The value of keeping it here is that the three can
/// be seen side by side, each with its own date, and that withdrawing one is
/// visibly not withdrawing the others.
///
/// ## Why the type makes one switch impossible
///
/// Every event names exactly one kind, and the only mutation is `record`,
/// which takes one kind. There is no "all", no "reset" short of deleting the
/// store, and the history is append-only, so a withdrawal never erases the
/// grant it withdraws: Art. 7(1) asks the controller to be able to show that
/// consent was given, and a person keeping their own record deserves the same.
public enum ConsentKind: String, Codable, CaseIterable, Sendable {
  case study
  case epaObjection = "epa-objection"
  case registry
}

/// One decision, on one kind, at one moment.
public struct ConsentEvent: Codable, Equatable, Sendable {
  public let kind: ConsentKind
  /// For `study` and `registry`, consent given. For `epaObjection`, the
  /// objection lodged. False withdraws it.
  public let active: Bool
  /// The day the decision took effect, as the person states it.
  public let effective: Date
  /// Who holds the decision: the study centre, the insurer, the registry.
  /// Free text the person types; the app never fills it in.
  public let holder: String?
  /// When it was written here, which may be later than `effective`.
  public let recordedAt: Date

  public init(
    kind: ConsentKind, active: Bool, effective: Date, holder: String?, recordedAt: Date
  ) {
    self.kind = kind
    self.active = active
    self.effective = effective
    let trimmed = holder?.trimmingCharacters(in: .whitespacesAndNewlines)
    self.holder = (trimmed?.isEmpty ?? true) ? nil : trimmed
    self.recordedAt = recordedAt
  }
}

/// Every consent decision the person recorded, oldest first.
public struct ConsentLedger: Codable, Equatable, Sendable {
  public private(set) var history: [ConsentEvent]

  public init(history: [ConsentEvent] = []) {
    self.history = history
  }

  public static let empty = ConsentLedger()

  /// The latest decision on one kind, or nil when none was ever recorded.
  ///
  /// "Never recorded" is kept distinct from "withdrawn": a registry the
  /// person never answered and one they said no to are different facts.
  public func current(_ kind: ConsentKind) -> ConsentEvent? {
    history.last { $0.kind == kind }
  }

  /// True only when the latest decision on this kind is active.
  public func isActive(_ kind: ConsentKind) -> Bool {
    current(kind)?.active ?? false
  }

  /// Every decision on one kind, oldest first.
  public func history(of kind: ConsentKind) -> [ConsentEvent] {
    history.filter { $0.kind == kind }
  }

  /// Records one decision on one kind. The other two are untouched by
  /// construction: this is the only mutation there is.
  public mutating func record(
    _ kind: ConsentKind, active: Bool, effective: Date, holder: String? = nil,
    recordedAt: Date = Date()
  ) {
    history.append(
      ConsentEvent(
        kind: kind, active: active, effective: effective,
        holder: holder ?? current(kind)?.holder, recordedAt: recordedAt))
  }
}
