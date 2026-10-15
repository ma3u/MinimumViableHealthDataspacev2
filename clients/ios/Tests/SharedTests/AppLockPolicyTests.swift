import Foundation
import Testing

@testable import Shared

@Suite("App lock policy (ADR-060)")
struct AppLockPolicyTests {
  @Test("on by default, locked at launch, challenges at a cold start")
  func defaults() {
    let p = AppLockPolicy()
    #expect(p.enabled)
    #expect(p.locksAtLaunch)
    #expect(p.challengeDue(leftAt: nil, now: Date()))
  }

  @Test("switched off: never locks, never challenges")
  func off() {
    let p = AppLockPolicy(enabled: false)
    #expect(!p.locksAtLaunch)
    #expect(!p.challengeDue(leftAt: nil))
    #expect(!p.challengeDue(leftAt: Date(timeIntervalSinceNow: -3600)))
  }

  @Test("no grace: every return from the background challenges")
  func noGrace() {
    let p = AppLockPolicy(enabled: true, graceSeconds: 0)
    let now = Date()
    #expect(p.challengeDue(leftAt: now, now: now))
    #expect(p.challengeDue(leftAt: now.addingTimeInterval(-1), now: now))
  }

  @Test("with a grace period, a quick switch back does not challenge, a long one does")
  func grace() {
    let p = AppLockPolicy(enabled: true, graceSeconds: 60)
    let now = Date()
    #expect(!p.challengeDue(leftAt: now.addingTimeInterval(-10), now: now))
    #expect(p.challengeDue(leftAt: now.addingTimeInterval(-60), now: now))
    #expect(p.challengeDue(leftAt: now.addingTimeInterval(-600), now: now))
  }

  @Test("a negative grace is treated as zero")
  func negativeGrace() {
    #expect(AppLockPolicy(graceSeconds: -5).graceSeconds == 0)
  }
}
