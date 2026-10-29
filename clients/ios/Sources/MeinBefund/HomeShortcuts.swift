import Shared
import SwiftUI

/// What used to sit in the ⋯ menu but is part of looking at your reports
/// (2026-10-29): how the values moved, where your record on the hub stands,
/// and reports that look like the same one. At the top of the list, so a
/// person sees them rather than having to know to look; the menu keeps only
/// settings and the rights over your data.
struct HomeShortcuts: View {
  @ObservedObject var model: AppModel
  @ObservedObject var connection: EHDSConnection

  var body: some View {
    Section {
      ShortcutRow(
        title: "Trends", detail: Text("How your values moved over time"),
        systemImage: "chart.xyaxis.line", id: "home-trends"
      ) { model.showingTrends = true }
      ShortcutRow(
        title: "My EHDS record", detail: Text(recordDetail),
        systemImage: "link", id: "home-ehds"
      ) { model.showingConnect = true }
      // Only when there is something to review: the search used to be a menu
      // entry a person had to think of.
      if model.hasDuplicates {
        ShortcutRow(
          title: "Possible duplicates",
          detail: Text("Some reports look like the same one. Review them."),
          systemImage: "doc.on.doc", id: "home-duplicates"
        ) { model.findDuplicates(startingOver: false) }
      }
    }
  }

  /// Where the record stands, in one line.
  private var recordDetail: String {
    guard let account = connection.account else {
      return String(localized: "Not connected")
    }
    guard connection.isConnected else {
      return String(localized: "Signed out. Open to sign in again.")
    }
    return connection.sendsReportsSince != nil
      ? String(localized: "Connected as \(account.username), sending on")
      : String(localized: "Connected as \(account.username)")
  }
}

/// One row of the shortcuts: an icon, a title, a line under it, and the
/// disclosure a row that opens something carries.
private struct ShortcutRow: View {
  let title: LocalizedStringKey
  let detail: Text
  let systemImage: String
  let id: String
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      HStack(spacing: 12) {
        Image(systemName: systemImage)
          .font(.body)
          .foregroundStyle(.tint)
          .frame(width: 28)
        VStack(alignment: .leading, spacing: 2) {
          Text(title).foregroundStyle(.primary)
          detail.font(.footnote).foregroundStyle(.secondary)
        }
        Spacer(minLength: 0)
        Image(systemName: "chevron.right")
          .font(.footnote.weight(.semibold))
          .foregroundStyle(.tertiary)
      }
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .accessibilityIdentifier(id)
  }
}
