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

  static func show() {
    guard window == nil else { return }
    let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
    guard let scene = scenes.first(where: { $0.activationState != .background }) ?? scenes.first
    else { return }

    let cover = UIWindow(windowScene: scene)
    // Above every sheet and alert, and deaf to touches: this is a blind, not
    // a lock screen, and it must never be something to get stuck behind.
    cover.windowLevel = .alert + 1
    cover.isUserInteractionEnabled = false
    let host = UIHostingController(rootView: CoverView())
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
  var body: some View {
    VStack(spacing: 12) {
      Image(systemName: "lock.doc")
        .font(.system(size: 44, weight: .light))
        .foregroundStyle(.secondary)
      Text("Klarbefund")
        .font(.title3.weight(.semibold))
      Text("Your results are hidden until you come back.")
        .font(.footnote)
        .foregroundStyle(.secondary)
        .multilineTextAlignment(.center)
    }
    .padding(32)
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(Color(.systemBackground))
  }
}
