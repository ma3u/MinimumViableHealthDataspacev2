import Foundation

extension DeviceScreen {

  /// The values a scale plots behind its current one.
  ///
  /// A body-composition scale shows a year of readings and prints the number
  /// beside each point, but names only the latest in words. Reading just that
  /// one throws away eleven months of measurements that are on the screen and
  /// would otherwise have to be photographed card by card, if the scale even
  /// still offers them.
  ///
  /// Lines cannot do this. The recogniser emits "38,4  39%" as one line and
  /// the months as "Feb. Marz Apr. Mal" on another: which value belongs to
  /// which month is a question about where they sit, not about what order
  /// they were read in. So this works on positioned fragments.
  ///
  /// The date it can recover is a **month**, never a day, and it says so:
  /// these readings carry `DateSource.chartMonth`.
  public enum ChartHistory {

    /// A value plotted on the chart, and the month it sits over.
    public struct Point: Sendable, Equatable {
      public let value: Double
      public let month: Date
      public let x: Double
    }

    /// German month names as a scale prints them, with the way the
    /// recogniser mangles each. `Mai` comes back as `Mal`, `Jan.` as `gan.`,
    /// `März` as `Marz`: all measured, not guessed.
    static let monthNames: [(names: [String], month: Int)] = [
      (["januar", "jan", "gan", "jan.", "januar."], 1),
      (["februar", "feb", "feb."], 2),
      (["marz", "maerz", "mrz", "march", "mar"], 3),
      (["april", "apr", "apr."], 4),
      (["mai", "mal", "may"], 5),
      (["juni", "jun", "june"], 6),
      (["juli", "jul", "july"], 7),
      (["august", "aug", "aug."], 8),
      (["september", "sept", "sep"], 9),
      (["oktober", "okt", "oct", "0kt", "okt", "0ct"], 10),
      (["november", "nov"], 11),
      (["dezember", "dez", "dec"], 12),
    ]

    /// The first number in a fragment, unit and all.
    ///
    /// An axis prints `37%` and a badge prints `23,8 BMI`, and the ordinary
    /// parser refuses both because neither is only a number. Refusing them
    /// here loses the value scale, and without the scale nothing on the plot
    /// can be told from anything else.
    public static func numeric(_ text: String) -> Double? {
      var token = ""
      for character in text {
        if character.isNumber || character == "," || character == "." {
          token.append(character)
        } else if !token.isEmpty {
          break
        }
      }
      return LabLineParser.parseNumber(token)
    }

    public static func month(of text: String) -> Int? {
      let folded = ReportMetadataExtractor.fold(text)
        .trimmingCharacters(in: CharacterSet(charactersIn: ". "))
      for (names, number) in monthNames where names.contains(folded) {
        return number
      }
      return nil
    }

    /// The months along the bottom of the chart, left to right.
    ///
    /// Fitted, not listed. The recogniser drops a label, merges two into
    /// `März Apr-`, and reads `Okt.` as `0kt.`, so demanding twelve clean
    /// labels in a row gets none. Months are evenly spaced, so three good
    /// ones give the spacing and the rest follow.
    ///
    /// Years come from walking backwards from the update date, because a
    /// month name carries none. The rightmost column is the month the screen
    /// was updated in.
    public static func axis(
      in fragments: [DocumentReconciler.TextFragment], updatedOn: Date
    ) -> [(x: Double, month: Date)] {
      var calendar = Calendar(identifier: .gregorian)
      calendar.timeZone = TimeZone(identifier: "UTC") ?? .current
      let current = calendar.dateComponents([.year, .month], from: updatedOn)
      guard let currentMonth = current.month,
        let currentStart = calendar.date(
          from: DateComponents(year: current.year, month: currentMonth, day: 1))
      else { return [] }

      let labelled = fragments.compactMap { fragment -> (x: Double, back: Int, y: Double)? in
        guard let number = month(of: fragment.text) else { return nil }
        // How many months before the update month this label is, taking the
        // reading that lands inside the year the chart shows.
        let back = ((currentMonth - number) % 12 + 12) % 12
        return (fragment.region.x + fragment.region.width / 2, back, fragment.region.y)
      }
      guard labelled.count >= 3 else { return [] }

      // They sit in one band along the axis. Anything else that reads as a
      // month name is somewhere else on the screen.
      let median = labelled.map(\.y).sorted()[labelled.count / 2]
      let band = labelled.filter { abs($0.y - median) < 0.06 }
      guard band.count >= 3 else { return [] }

      // x = intercept + slope * (-back), by least squares.
      let n = Double(band.count)
      let xs = band.map { -Double($0.back) }
      let ys = band.map(\.x)
      let meanX = xs.reduce(0, +) / n
      let meanY = ys.reduce(0, +) / n
      let covariance = zip(xs, ys).map { ($0 - meanX) * ($1 - meanY) }.reduce(0, +)
      let variance = xs.map { ($0 - meanX) * ($0 - meanX) }.reduce(0, +)
      guard variance > 0.0001 else { return [] }
      let slope = covariance / variance
      let intercept = meanY - slope * meanX
      // Months run left to right and a chart is wider than it is empty.
      guard slope > 0.01, slope < 0.25 else { return [] }
      // A label far from where the fit puts it means this is not an axis.
      for entry in band where abs(intercept + slope * -Double(entry.back) - entry.x) > slope * 0.6 {
        return []
      }

      var result: [(x: Double, month: Date)] = []
      for back in 0...11 {
        guard let date = calendar.date(byAdding: .month, value: -back, to: currentStart) else {
          continue
        }
        let x = intercept + slope * -Double(back)
        guard x > -0.05, x < 1.05 else { continue }
        result.append((x, date))
      }
      return result.sorted { $0.x < $1.x }
    }

    /// Numbers that label the value axis rather than a measurement.
    ///
    /// They stand in one column, three or more of them, at the far edge. A
    /// data label sits beside its own point and so shares its x with nothing.
    public static func axisColumn(_ numbers: [(x: Double, y: Double, value: Double)]) -> Set<Int> {
      var columns: [Int: [Int]] = [:]
      for (index, number) in numbers.enumerated() {
        let bucket = Int((number.x * 50).rounded())
        columns[bucket, default: []].append(index)
      }
      // Most members wins, and where two columns tie the rightmost one does:
      // a value axis is printed at the edge of the plot, while two tab labels
      // that happen to line up are in the middle of the card.
      let ranked = columns.values.sorted { left, right in
        if left.count != right.count { return left.count > right.count }
        let leftX = left.map { numbers[$0].x }.max() ?? 0
        let rightX = right.map { numbers[$0].x }.max() ?? 0
        return leftX > rightX
      }
      guard let biggest = ranked.first, biggest.count >= 3 else { return [] }
      return Set(biggest)
    }

    /// Every plotted value, with the month it sits over.
    ///
    /// `headline` is the reading the screen names in words. Its own point is
    /// on the chart too, so it is dropped from the history: one measurement
    /// recorded twice, once with a day and once with only a month, is two
    /// measurements as far as a trend is concerned.
    public static func points(
      in fragments: [DocumentReconciler.TextFragment], updatedOn: Date,
      headline: Double? = nil
    ) -> [Point] {
      let months = axis(in: fragments, updatedOn: updatedOn)
      guard months.count >= 3 else { return [] }
      let axisTop = months.map(\.x).count  // keeps the compiler honest about use
      _ = axisTop

      // Everything above the month labels and below the headline is the plot.
      let monthY = fragments.compactMap { month(of: $0.text) != nil ? $0.region.y : nil }
      guard let plotFloor = monthY.max() else { return [] }

      let numbers = fragments.compactMap { fragment -> (x: Double, y: Double, value: Double)? in
        guard fragment.region.y > plotFloor, let value = numeric(fragment.text) else { return nil }
        return (fragment.region.x + fragment.region.width / 2, fragment.region.y, value)
      }
      guard numbers.count >= 4 else { return [] }

      let axisIndices = axisColumn(numbers)
      let scale = axisIndices.map { numbers[$0].value }
      guard let lowest = scale.min(), let highest = scale.max(), highest > lowest else { return [] }
      // The value axis marks the top of the plot. Above it are the date range,
      // the day-and-month tabs and the current reading itself, and the current
      // reading sits far enough left to be assigned to a month it has nothing
      // to do with.
      guard let ceiling = axisIndices.map({ numbers[$0].y }).max() else { return [] }
      // A little outside the printed scale is still on the chart; far outside
      // is a tab label, a page number or a date that parsed as a number.
      let margin = (highest - lowest) * 0.3
      let spacing = months.count > 1 ? (months[1].x - months[0].x) : 0.08

      var points: [Point] = []
      for (index, number) in numbers.enumerated() where !axisIndices.contains(index) {
        guard number.y <= ceiling + 0.02 else { continue }
        guard number.value >= lowest - margin, number.value <= highest + margin else { continue }
        guard
          let nearest = months.min(by: { abs($0.x - number.x) < abs($1.x - number.x) }),
          abs(nearest.x - number.x) < spacing * 0.75
        else { continue }
        points.append(Point(value: number.value, month: nearest.month, x: number.x))
      }
      // One reading per month: two labels over one month means one of them
      // belongs to a neighbour the recogniser placed badly, and the nearer
      // wins rather than both being kept.
      var best: [Date: Point] = [:]
      for point in points {
        let distance = abs((months.first { $0.month == point.month }?.x ?? 0) - point.x)
        if let held = best[point.month],
          abs((months.first { $0.month == point.month }?.x ?? 0) - held.x) <= distance
        {
          continue
        }
        best[point.month] = point
      }
      var calendar = Calendar(identifier: .gregorian)
      calendar.timeZone = TimeZone(identifier: "UTC") ?? .current
      let currentMonth = calendar.date(
        from: calendar.dateComponents([.year, .month], from: updatedOn))
      if let headline, let currentMonth, let plotted = best[currentMonth],
        abs(plotted.value - headline) < 0.05
      {
        best[currentMonth] = nil
      }
      return best.values.sorted { $0.month < $1.month }
    }
  }
}
