import CoreGraphics
import Foundation

extension DeviceScreen.ChartHistory {

  /// Values measured off the drawn points, where the scale prints no number.
  ///
  /// Most of a body-composition scale's cards label only the newest reading
  /// and draw the rest as circles on a line. The numbers are not on the
  /// picture, so they cannot be read; they can only be **measured**, by
  /// finding each circle and converting its height into a value through the
  /// printed axis.
  ///
  /// So these are estimates and are marked as estimates, all the way into the
  /// export. On a clean screenshot a circle can be located to within a
  /// fraction of a percent of the plot's height, which on a body-mass index
  /// axis spanning three units is a few hundredths. A photograph taken at an
  /// angle, with the ceiling light in it, is worse than that.
  public enum Plot {

    /// The value axis: where a number sits, and which number it is.
    struct Scale {
      let lowValue: Double
      let lowY: Double
      let highValue: Double
      let highY: Double

      func value(atY y: Double) -> Double {
        let span = highY - lowY
        guard abs(span) > 0.0001 else { return lowValue }
        return lowValue + (y - lowY) / span * (highValue - lowValue)
      }
    }

    /// The printed value axis, from the column of numbers at the edge.
    static func scale(in fragments: [DocumentReconciler.TextFragment], above floor: Double)
      -> Scale?
    {
      let numbers = fragments.compactMap { fragment -> (x: Double, y: Double, value: Double)? in
        guard fragment.region.y > floor, let value = numeric(fragment.text) else { return nil }
        return (fragment.region.x + fragment.region.width / 2, fragment.region.y, value)
      }
      let column = axisColumn(numbers)
      guard column.count >= 3 else { return nil }
      let marks = column.map { (y: numbers[$0].y, value: numbers[$0].value) }
        .sorted { $0.y < $1.y }
      guard let first = marks.first, let last = marks.last, last.value > first.value else {
        return nil
      }
      return Scale(
        lowValue: first.value, lowY: first.y, highValue: last.value, highY: last.y)
    }

    /// The circles, one per month, measured against the axis.
    ///
    /// `headline` is dropped as before: its point is on the chart too, and it
    /// is already known to the nearest day.
    public static func measured(
      in image: CGImage, fragments: [DocumentReconciler.TextFragment], updatedOn: Date,
      headline: Double? = nil
    ) -> [Point] {
      let months = axis(in: fragments, updatedOn: updatedOn)
      guard months.count >= 3 else { return [] }
      let monthY = fragments.compactMap { month(of: $0.text) != nil ? $0.region.y : nil }
      guard let floor = monthY.max() else { return [] }
      // Without a readable value axis there is no scale, and a height
      // without a scale is not a measurement. Two of five sample cards print
      // their axis too small for the recogniser, and those give nothing.
      guard let scale = scale(in: fragments, above: floor) else { return [] }
      guard let grey = Greyscale(image) else { return [] }

      let spacing = months[1].x - months[0].x
      // A circle is about a third of the gap between two months across, so a
      // strip a little wider than that holds one and only one, and leaves
      // room to tell a circle from a grid line.
      let stripWidth = spacing * 0.6
      let stripPixels = stripWidth * Double(grey.width)
      let minimumRun = max(4, Int(spacing * 0.12 * Double(grey.width)))
      // A horizontal grid line crosses the whole strip. A circle's arc is
      // two thirds of it at most. Without this, every month with no reading
      // at all came back with the value of the nearest grid line, which is
      // the worst kind of wrong: plausible.
      let maximumRun = Int(stripPixels * 0.8)
      let threshold = grey.inkThreshold(
        x: months[0].x - spacing / 2, width: Double(months.count) * spacing,
        y: scale.lowY, height: scale.highY - scale.lowY)

      var found: [Point] = []
      for month in months {
        guard
          let centre = grey.circleCentre(
            x: month.x - stripWidth / 2, width: stripWidth,
            y: scale.lowY, height: scale.highY - scale.lowY,
            threshold: threshold, minimumRun: minimumRun, maximumRun: maximumRun)
        else { continue }
        found.append(Point(value: rounded(scale.value(atY: centre)), month: month.month, x: month.x))
      }

      var calendar = Calendar(identifier: .gregorian)
      calendar.timeZone = TimeZone(identifier: "UTC") ?? .current
      if headline != nil,
        let currentMonth = calendar.date(
          from: calendar.dateComponents([.year, .month], from: updatedOn))
      {
        found.removeAll { $0.month == currentMonth }
      }
      return found.sorted { $0.month < $1.month }
    }

    /// Two decimals. A measurement off a photograph does not earn a third.
    static func rounded(_ value: Double) -> Double {
      (value * 100).rounded() / 100
    }
  }

  /// The page as brightness, addressed in the same bottom-left coordinates
  /// the recogniser uses for everything else.
  struct Greyscale {
    let pixels: [UInt8]
    let width: Int
    let height: Int

    init?(_ image: CGImage) {
      let width = image.width
      let height = image.height
      guard width > 0, height > 0 else { return nil }
      var buffer = [UInt8](repeating: 0, count: width * height)
      guard
        let context = CGContext(
          data: &buffer, width: width, height: height, bitsPerComponent: 8,
          bytesPerRow: width, space: CGColorSpaceCreateDeviceGray(),
          bitmapInfo: CGImageAlphaInfo.none.rawValue)
      else { return nil }
      context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
      self.pixels = buffer
      self.width = width
      self.height = height
    }

    /// Normalised y counts up from the bottom; image rows count down from the
    /// top.
    func row(forY y: Double) -> Int {
      min(max(0, Int((1 - y) * Double(height))), height - 1)
    }

    func column(forX x: Double) -> Int {
      min(max(0, Int(x * Double(width))), width - 1)
    }

    func brightness(_ column: Int, _ row: Int) -> UInt8 {
      pixels[row * width + column]
    }

    /// What counts as ink here.
    ///
    /// Adapted rather than fixed: a photograph of a screen under a ceiling
    /// light is nowhere near the black on white it is drawing.
    func inkThreshold(x: Double, width w: Double, y: Double, height h: Double) -> UInt8 {
      var samples: [UInt8] = []
      let left = column(forX: x)
      let right = column(forX: x + w)
      let top = row(forY: y + h)
      let bottom = row(forY: y)
      guard right > left, bottom > top else { return 100 }
      var r = top
      while r < bottom {
        var c = left
        while c < right {
          samples.append(brightness(c, r))
          c += 3
        }
        r += 3
      }
      guard samples.count > 20 else { return 100 }
      samples.sort()
      let dark = Double(samples[samples.count / 20])
      let median = Double(samples[samples.count / 2])
      return UInt8(max(10, min(230, (dark + median) / 2)))
    }

    /// The middle of the circle in one vertical strip, as a normalised y.
    ///
    /// A circle is a **ring**, and that is what tells it from everything else
    /// on the plot. Across its middle it leaves two short marks with a clear
    /// gap between them, the width of the circle. A horizontal grid line
    /// leaves one mark right across the strip. The line joining the points
    /// leaves one short mark. Counting marks per row separates all three,
    /// where counting ink did not: with only a length test, every month with
    /// no reading came back holding the value of the nearest grid line, which
    /// is the worst kind of wrong, because it is plausible.
    func circleCentre(
      x: Double, width w: Double, y: Double, height h: Double,
      threshold: UInt8, minimumRun: Int, maximumRun: Int
    ) -> Double? {
      let left = column(forX: x)
      let right = column(forX: x + w)
      let top = row(forY: y + h)
      let bottom = row(forY: y)
      guard right > left + minimumRun, bottom > top else { return nil }
      let strip = right - left
      let longestAllowed = max(3, strip / 4)
      let gapNeeded = max(4, strip / 3)

      var ringRows: [Int] = []
      for r in top...bottom {
        var runs: [(start: Int, end: Int)] = []
        var runStart: Int?
        for c in left...right {
          if brightness(c, r) <= threshold {
            if runStart == nil { runStart = c }
          } else if let began = runStart {
            runs.append((began, c - 1))
            runStart = nil
          }
        }
        if let began = runStart { runs.append((began, right)) }

        let marks = runs.filter { $0.end - $0.start + 1 >= 2 }
        guard marks.count >= 2, let first = marks.first, let last = marks.last else { continue }
        guard marks.allSatisfy({ $0.end - $0.start + 1 <= longestAllowed }) else { continue }
        guard last.start - first.end >= gapNeeded else { continue }
        ringRows.append(r)
      }
      guard ringRows.count >= 2 else { return nil }

      // One circle per strip, so the longest unbroken band of ring rows is it.
      var bands: [[Int]] = []
      var current: [Int] = [ringRows[0]]
      for r in ringRows.dropFirst() {
        if r - (current.last ?? r) <= 3 {
          current.append(r)
        } else {
          bands.append(current)
          current = [r]
        }
      }
      bands.append(current)
      guard let ring = bands.max(by: { $0.count < $1.count }), ring.count >= 2,
        let first = ring.first, let last = ring.last
      else { return nil }
      let centreRow = Double(first + last) / 2
      return 1 - centreRow / Double(height)
    }
  }
}
