import Charts
import Shared
import SwiftUI

/// How a chart tells the three kinds of evidence apart (#186 criterion 2).
///
/// A shape per kind first, a colour second, and the words in a legend under
/// every chart that mixes them, so the distinction never rests on hue alone
/// and never needs a tap. Orange is deliberately absent: `RangePalette` uses
/// it for a value outside a guideline range, and a colour that meant two
/// things on one chart would mean neither.
enum ProvenanceStyle {

  static func colour(for source: SourceKind) -> Color {
    switch source {
    case .labIssuedDigital: return .blue
    case .ocrTranscribed: return .indigo
    case .selfTracked: return .gray
    }
  }

  static func chartSymbol(for source: SourceKind) -> BasicChartSymbolShape {
    switch source.markShape {
    case .circle: return .circle
    case .diamond: return .diamond
    case .triangle: return .triangle
    }
  }

  /// The same shape as an SF Symbol, for the legend.
  static func legendSymbol(for source: SourceKind) -> String {
    switch source.markShape {
    case .circle: return "circle.fill"
    case .diamond: return "diamond.fill"
    case .triangle: return "triangle.fill"
    }
  }

  static func legendText(for source: SourceKind) -> String {
    switch source {
    case .labIssuedDigital: return String(localized: "Lab-issued, from the laboratory's own file")
    case .ocrTranscribed: return String(localized: "Read from a photo, preliminary")
    case .selfTracked: return String(localized: "Entered or from a device, not a lab value")
    }
  }
}

/// The legend under a chart, naming each kind of evidence it shows.
struct ProvenanceLegend: View {
  let sources: [SourceKind]

  var body: some View {
    VStack(alignment: .leading, spacing: 3) {
      ForEach(sources, id: \.self) { source in
        HStack(spacing: 6) {
          Image(systemName: ProvenanceStyle.legendSymbol(for: source))
            .foregroundStyle(ProvenanceStyle.colour(for: source))
            .accessibilityHidden(true)
          Text(ProvenanceStyle.legendText(for: source))
        }
      }
    }
    .accessibilityElement(children: .combine)
    .accessibilityIdentifier("provenance-legend")
  }
}
