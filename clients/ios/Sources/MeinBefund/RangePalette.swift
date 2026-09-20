import Shared
import SwiftUI

/// One colour system for the published ranges, used everywhere they appear.
///
/// ## Why this is not a red flag
///
/// ADR-039 rejected colouring a person's values, because flagging
/// out-of-range results is one of the two features that would make this a
/// regulated device under IVDR. The decision here is narrower and the
/// guardrails are what keep it on the right side:
///
/// - **Colour never carries meaning alone.** Every coloured figure has the
///   same information in words beside it, which is also what makes it legible
///   to someone who cannot distinguish the hues.
/// - **There is no red, and no pass or fail.** Green marks the band a source
///   calls lowest-risk, amber that a value sits outside it, and orange that it
///   sits outside the guideline range. None of them says normal, abnormal,
///   good or bad.
/// - **Nothing is scored, ranked or summed.** A colour restates a comparison
///   to a published number; it does not add a judgement of its own.
enum RangePalette {

  /// The band a guideline states for the general adult population.
  static let guideline = Color.accentColor

  /// The lowest-risk band a source names.
  static let optimal = Color.green

  static func colour(for placement: RangePlacement) -> Color {
    switch placement {
    case .withinOptimal: return .green
    case .outsideOptimal: return .yellow
    case .outsideGuideline: return .orange
    case .noRange: return .secondary
    }
  }

  /// A shape as well as a colour, so the distinction survives without hue.
  static func symbol(for placement: RangePlacement) -> String {
    switch placement {
    case .withinOptimal: return "checkmark.circle"
    case .outsideOptimal: return "circle.lefthalf.filled"
    case .outsideGuideline: return "exclamationmark.circle"
    case .noRange: return "questionmark.circle"
    }
  }
}

/// The legend, shown wherever the colours are.
struct RangeLegend: View {
  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      ForEach(
        [RangePlacement.withinOptimal, .outsideOptimal, .outsideGuideline], id: \.self
      ) { placement in
        HStack(spacing: 6) {
          Image(systemName: RangePalette.symbol(for: placement))
            .foregroundStyle(RangePalette.colour(for: placement))
          Text(placement.label)
        }
      }
      Text("Colour repeats what the words say. It is a comparison to a published number, not a finding.")
        .padding(.top, 2)
    }
    .font(.caption2)
  }
}
