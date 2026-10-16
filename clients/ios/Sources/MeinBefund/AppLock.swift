import Foundation
import LocalAuthentication
import Shared

/// Face ID, Touch ID or the passcode in front of the results (ADR-060,
/// TR-03161 O.Auth). `AppLockPolicy` says when a challenge is due; this
/// asks the system for it and keeps the `locked` state the cover reads.
///
/// `deviceOwnerAuthentication` falls back from biometrics to the passcode by
/// itself. A phone with no passcode at all has nothing to check against and
/// nothing the device lock would have protected either; the lock then opens,
/// which is the same posture as before the lock existed.
@MainActor
final class AppLock: ObservableObject {
  @Published private(set) var locked: Bool
  private var leftAt: Date?
  private var authenticating = false

  var policy: AppLockPolicy {
    AppLockPolicy(enabled: Self.enabledByDefaults, graceSeconds: 0)
  }

  init() {
    locked = AppLockPolicy(enabled: Self.enabledByDefaults).locksAtLaunch
  }

  /// The person's choice, on unless switched off. A demo launch (the UI
  /// tests and the screenshots, `-MBDemoSeed` or `-MBDevData`) shows
  /// fictional data only and runs where nobody can answer a passcode
  /// prompt, so it is never locked; the check is compiled out of a release
  /// build with the seed itself.
  private static var enabledByDefaults: Bool {
    #if DEBUG
      if DemoSeed.isRequested { return false }
    #endif
    return UserDefaults.standard.object(forKey: AppLockPolicy.defaultsKey) as? Bool ?? true
  }

  /// The app left the foreground: note when, and lock if the policy is on.
  func didEnterBackground() {
    leftAt = Date()
    if policy.enabled { locked = true }
  }

  /// The app is in front again: challenge if one is due, open if the lock is off.
  func didBecomeActive() async {
    if !policy.enabled {
      locked = false
      return
    }
    guard locked, !authenticating else { return }
    guard policy.challengeDue(leftAt: leftAt, now: Date()) else {
      locked = false
      return
    }
    await authenticate()
  }

  /// Ask the system. Also what the Unlock button on the cover calls after a
  /// cancelled or failed attempt.
  func authenticate() async {
    guard !authenticating else { return }
    authenticating = true
    defer { authenticating = false }
    let context = LAContext()
    context.localizedCancelTitle = String(localized: "Not now")
    var unavailable: NSError?
    guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &unavailable) else {
      // No passcode on the device: see the type comment.
      locked = false
      return
    }
    do {
      let ok = try await context.evaluatePolicy(
        .deviceOwnerAuthentication,
        localizedReason: String(localized: "Unlock your results"))
      locked = !ok
    } catch {
      locked = true
    }
  }
}
