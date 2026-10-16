import Foundation

/// When the app asks the person to prove it is them before showing the
/// results (BSI TR-03161 O.Auth, ADR-060). The rule is pure so it can be
/// tested without a device: the app target decides *how* to challenge
/// (Face ID, Touch ID or the passcode, through LocalAuthentication); this
/// decides *whether* a challenge is due.
///
/// The lock is on by default. A person who switches it off relies on the
/// device lock alone, which the settings screen says in as many words.
public struct AppLockPolicy: Sendable, Equatable {
  /// The person's choice; on unless switched off.
  public var enabled: Bool
  /// How long the app may stay in the background before it locks again.
  /// Zero means every return from the background asks again.
  public var graceSeconds: TimeInterval

  public static let defaultsKey = "appLock.enabled"

  public init(enabled: Bool = true, graceSeconds: TimeInterval = 0) {
    self.enabled = enabled
    self.graceSeconds = max(0, graceSeconds)
  }

  /// Whether the app must challenge before showing anything, given when it
  /// last left the foreground (`nil` at a cold start) and the time now.
  public func challengeDue(leftAt: Date?, now: Date = Date()) -> Bool {
    guard enabled else { return false }
    guard let leftAt else { return true }
    return now.timeIntervalSince(leftAt) >= graceSeconds
  }

  /// The state to start in: locked when the policy is on, open otherwise.
  public var locksAtLaunch: Bool { enabled }
}
