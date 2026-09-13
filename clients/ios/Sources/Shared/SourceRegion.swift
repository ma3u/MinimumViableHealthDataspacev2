import Foundation

/// Where on the page a value was read from.
///
/// Acceptance criterion 5 of #186: every analyte carries page and bounding box
/// back to the source document, so a clinician can check the number against the
/// paper instead of trusting the extractor. ADR-033 names the absence of this as
/// a known gap; until now an Observation carried only the source line.
///
/// Coordinates are **normalised to 0...1 with the origin at the bottom left**,
/// which is Vision's convention and not UIKit's. Drawing a highlight in a
/// `UIView` means flipping y (`1 - y - height`); doing it without flipping puts
/// the box on the wrong row, and on a lab sheet the wrong row is a different
/// analyte. `SourceRegion` deliberately does not flip on your behalf, because a
/// silent flip in one direction is indistinguishable from a silent flip in the
/// other.
public struct SourceRegion: Sendable, Equatable, Codable {
  /// 1-based page number within the scan.
  public let page: Int
  public let x: Double
  public let y: Double
  public let width: Double
  public let height: Double

  public init(page: Int, x: Double, y: Double, width: Double, height: Double) {
    self.page = page
    self.x = x
    self.y = y
    self.width = width
    self.height = height
  }

  public var midX: Double { x + width / 2 }
  public var midY: Double { y + height / 2 }
  public var maxX: Double { x + width }
  public var maxY: Double { y + height }

  /// True when a point on the same page falls inside this region.
  ///
  /// Used to decide which recognised text belongs to which table cell, so the
  /// test is on the fragment's centre rather than on overlap: a fragment that
  /// merely grazes a cell border belongs to whichever cell holds its middle,
  /// and exactly one cell can.
  public func contains(page: Int, x pointX: Double, y pointY: Double) -> Bool {
    page == self.page && pointX >= x && pointX <= maxX && pointY >= y && pointY <= maxY
  }

  /// Smallest region covering both. Regions on different pages do not combine;
  /// the receiver's page wins and the caller should not be mixing pages.
  public func union(_ other: SourceRegion) -> SourceRegion {
    guard other.page == page else { return self }
    let minX = Swift.min(x, other.x)
    let minY = Swift.min(y, other.y)
    return SourceRegion(
      page: page,
      x: minX,
      y: minY,
      width: Swift.max(maxX, other.maxX) - minX,
      height: Swift.max(maxY, other.maxY) - minY
    )
  }
}
