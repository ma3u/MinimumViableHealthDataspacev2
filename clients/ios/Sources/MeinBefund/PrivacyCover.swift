import SwiftUI
import UIKit

/// Hides the screen while the app is not in front.
///
/// iOS photographs a running app as it leaves the foreground, to draw the app
/// switcher with. That picture lands in the app's own container, under the
/// same complete file protection as everything else it writes, so it is safe
/// at rest. It is also shown to anybody holding the unlocked phone who
/// double-taps the home bar, and a page of somebody's blood results is not a
/// thumbnail to meet that way.
///
/// A `.overlay` on the root view would not do it. A sheet is presented in its
/// own controller above that view, so leaving the app with the profile, the
/// trends or a report open would photograph the sheet uncovered. The cover
/// takes a window of its own, above every presentation.
@MainActor
enum PrivacyCover {
  private static var window: UIWindow?

  /// The blind: shown while the app is not in front, deaf to touches.
  static func show() { show(unlock: nil) }

  /// The lock screen: the same cover with an Unlock button, shown while the
  /// app is in front but the person has not yet proved it is them (ADR-060).
  static func show(unlock: (() -> Void)?) {
    if let existing = window {
      // Switch between blind and lock in place rather than stacking windows.
      if let host = existing.rootViewController as? UIHostingController<CoverView> {
        host.rootView = CoverView(unlock: unlock)
      }
      existing.isUserInteractionEnabled = unlock != nil
      return
    }
    let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
    guard let scene = scenes.first(where: { $0.activationState != .background }) ?? scenes.first
    else { return }

    let cover = UIWindow(windowScene: scene)
    // Above every sheet and alert, and deaf to touches: this is a blind, not
    // a lock screen, and it must never be something to get stuck behind.
    cover.windowLevel = .alert + 1
    cover.isUserInteractionEnabled = unlock != nil
    let host = UIHostingController(rootView: CoverView(unlock: unlock))
    host.view.backgroundColor = .systemBackground
    cover.rootViewController = host
    // Visible, never key: taking key status would dismiss a keyboard mid-edit
    // and the text under it with it.
    cover.isHidden = false
    window = cover
  }

  static func hide() {
    window?.isHidden = true
    window = nil
  }
}

/// What the app switcher gets to show instead.
private struct CoverView: View {
  /// Present while the app is locked; nil for the plain blind.
  var unlock: (() -> Void)? = nil

  var body: some View {
    VStack(spacing: 12) {
      Image(systemName: unlock == nil ? "lock.doc" : "faceid")
        .font(.system(size: 44, weight: .light))
        .foregroundStyle(.secondary)
      Text("Klarbefund")
        .font(.title3.weight(.semibold))
      if let unlock {
        Text("Your results open with Face ID, Touch ID or your passcode.")
          .font(.footnote)
          .foregroundStyle(.secondary)
          .multilineTextAlignment(.center)
        Button(action: unlock) {
          Text("Unlock").frame(minWidth: 160)
        }
        .buttonStyle(.borderedProminent)
        .padding(.top, 8)
        .accessibilityIdentifier("appLock.unlock")
      } else {
        Text("Your results are hidden until you come back.")
          .font(.footnote)
          .foregroundStyle(.secondary)
          .multilineTextAlignment(.center)
      }
    }
    .padding(32)
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(Color(.systemBackground))
  }
}
