import Foundation

/// When the app brings the person's EHDS record up to date by itself
/// (2026-10-28). Sending is the person's one decision (#473 phase 3); until
/// now the app acted on it only when a report changed or the switch was
/// turned on, so reports scanned while the hub was asleep (ADR-053 stops it
/// every evening) waited until someone opened the connect screen, signed in
/// again by hand and tapped "Sync all reports now".
///
/// The rule is pure so it can be tested without a device: the app target
/// decides *how* to catch up (sign in with the kept password, then send what
/// the hub has not had); this decides *whether* one is due.
public struct RecordCatchUp: Sendable, Equatable {
  /// Seconds between two attempts. Coming to the foreground twice in a row
  /// (the app lock's own prompt does that) must not sign in twice.
  public var minimumGap: TimeInterval

  public init(minimumGap: TimeInterval = 60) {
    self.minimumGap = max(0, minimumGap)
  }

  /// Whether to catch up now. Only for the account the app created (one the
  /// person typed in belongs to someone, and the app sends nothing for it),
  /// only while sending is on, never while a send is running, and not again
  /// within `minimumGap` of the last attempt.
  public func due(
    account: EHDSAccount?, sending: Bool, busy: Bool, lastAttempt: Date?, now: Date = Date()
  ) -> Bool {
    guard let account, account.createdByApp, sending, !busy else { return false }
    guard let lastAttempt else { return true }
    return now.timeIntervalSince(lastAttempt) >= minimumGap
  }
}

extension EHDSAccount {
  /// The account a typed sign-in stands for. Typing the username and password
  /// of the account the app made, as "Sign in again" does, is still that
  /// account: it keeps `createdByApp`, and with it the switch that sends the
  /// person's reports and the button that deletes the account. Before this,
  /// signing in again stored the app's own account as a borrowed one and the
  /// sending switch disappeared.
  public static func signedIn(
    ehds: String, issuer: String, username: String, password: String, kept: EHDSAccount?
  ) -> EHDSAccount {
    let name = username.trimmingCharacters(in: .whitespacesAndNewlines)
    if let kept, kept.username == name, kept.ehds == ehds, kept.issuer == issuer {
      return EHDSAccount(
        ehds: ehds, issuer: issuer, client: kept.client,
        username: name, password: password, createdByApp: kept.createdByApp)
    }
    return EHDSAccount(
      ehds: ehds, issuer: issuer, username: name, password: password, createdByApp: false)
  }
}
