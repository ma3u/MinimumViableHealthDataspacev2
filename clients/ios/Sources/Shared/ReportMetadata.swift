import Foundation

/// What a lab report says about itself: who issued it and when.
///
/// The first real scan (#186) was filed under the day it was photographed,
/// because nothing read the dates printed on the sheet, and a report scanned in
/// September from a stack going back years is not a September result. The lab
/// date is what a trend needs and what FHIR `effectiveDateTime` means, so it is
/// read from the page, shown to the person for confirmation, and stored with
/// its provenance alongside the values.
///
/// Everything here is best effort and editable. A wrong lab name is a nuisance;
/// a wrong date puts a value on the wrong point of a trend, which is why the
/// date carries a `DateSource` and every date found on the page is kept.
public struct ReportMetadata: Sendable, Equatable, Codable {

  /// Where the report's date came from, in descending order of trust.
  public enum DateSource: String, Sendable, Codable {
    /// Printed on the report and accepted as read.
    case printed = "printed-on-report"
    /// Set or changed by the person holding the paper.
    case user = "confirmed-by-user"
    /// Nothing usable was found on the page; the scan date stands in.
    case scan = "scan-date-fallback"
    /// Read off the month axis of a chart, so it is precise to a month and
    /// not to a day. A scale plots a year of readings and labels only the
    /// latest; the rest can be recovered, but only that far.
    case chartMonth = "read-from-a-chart-axis"
  }

  /// How exact a date is.
  ///
  /// A month is as far as a chart's axis goes, and a value dated to the first
  /// of a month it was measured somewhere inside is not a value measured on
  /// the first. Saying which of the two a date is costs one field and stops
  /// every reader downstream from having to guess.
  public enum DatePrecision: String, Sendable, Codable {
    case day
    case month
  }

  /// What a printed date is the date of.
  public enum DateRole: String, Sendable, Codable, CaseIterable {
    /// The specimen was taken. The date a trend should use.
    case collection
    /// The specimen reached the laboratory.
    case received
    /// The report was issued, validated or printed.
    case reported
    /// The patient's date of birth. Never a lab date.
    case birth
    /// A date with no recognisable label.
    case other
  }

  /// One date found on the page, with the evidence for its role.
  public struct DetectedDate: Sendable, Equatable, Codable {
    public let date: Date
    public let role: DateRole
    /// The word that decided the role, as printed, or nil for `other`.
    public let keyword: String?
    /// The recognised line it was read from, for the reviewer.
    public let line: String
    public let page: Int

    public init(date: Date, role: DateRole, keyword: String?, line: String, page: Int) {
      self.date = date
      self.role = role
      self.keyword = keyword
      self.line = line
      self.page = page
    }
  }

  /// Issuing laboratory, study centre or practice, as printed.
  public var laboratory: String?
  public var collectedOn: Date?
  public var receivedOn: Date?
  public var reportedOn: Date?
  /// The lab's own order, sample or report number.
  public var reportNumber: String?
  /// The referring practice or physician, as printed.
  public var orderingPhysician: String?
  /// Every date found, birth dates included, so the reviewer can see what was
  /// on the page and the extractor's choice can be checked.
  public var dates: [DetectedDate]
  /// The date the report is filed under. Collection first, then receipt, then
  /// issue, then the latest unlabelled date that is not in the future.
  public var labDate: Date?
  public var labDateRole: DateRole?
  public var dateSource: DateSource

  public init(
    laboratory: String? = nil, collectedOn: Date? = nil, receivedOn: Date? = nil,
    reportedOn: Date? = nil, reportNumber: String? = nil, orderingPhysician: String? = nil,
    dates: [DetectedDate] = [], labDate: Date? = nil, labDateRole: DateRole? = nil,
    dateSource: DateSource = .scan
  ) {
    self.laboratory = laboratory
    self.collectedOn = collectedOn
    self.receivedOn = receivedOn
    self.reportedOn = reportedOn
    self.reportNumber = reportNumber
    self.orderingPhysician = orderingPhysician
    self.dates = dates
    self.labDate = labDate
    self.labDateRole = labDateRole
    self.dateSource = dateSource
  }

  public static let empty = ReportMetadata()

  /// The calendar day of `date` in `timeZone`, as noon UTC, the form every
  /// detected date takes. A `DatePicker` hands back the moment it was tapped;
  /// what the report needs is the day.
  public static func calendarDay(_ date: Date, in timeZone: TimeZone = .current) -> Date {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = timeZone
    let parts = calendar.dateComponents([.year, .month, .day], from: date)
    return ReportMetadataExtractor.day(parts.year!, parts.month!, parts.day!) ?? date
  }

  /// The evidence behind `labDate`, for the review screen.
  public var labDateEvidence: DetectedDate? {
    guard let labDate, let role = labDateRole else { return nil }
    return dates.first { $0.role == role && $0.date == labDate }
  }
}

/// Reads `ReportMetadata` from the recognised text of a scan.
///
/// Pure and deterministic, so the same page always yields the same answer and
/// the rules can be tested without a camera. Works on the reading-order text
/// of each page, which is everything both Vision passes saw.
public enum ReportMetadataExtractor {

  /// Words that give a printed date its role. Matched on the folded line,
  /// most specific first, so `Blutentnahme` wins over the `Datum` in the same
  /// header. Written without diacritics because OCR drops them.
  static let keywords: [(ReportMetadata.DateRole, [String])] = [
    (.birth, ["geburtsdatum", "geburtsdat", "geboren", "geb.", "geb:", "geb ", "birth", "dob"]),
    (
      .collection,
      [
        "probenentnahme", "probenahme", "blutentnahme", "blutabnahme", "materialentnahme",
        "entnahmedatum", "abnahmedatum", "entnahme", "abnahme", "entnommen", "abgenommen",
        "collection", "collected", "sampling", "specimen",
      ]
    ),
    (
      .received,
      [
        "materialeingang", "probeneingang", "laboreingang", "eingangsdatum", "eingang",
        "eingegangen", "received",
      ]
    ),
    (
      .reported,
      [
        "befunddatum", "befund vom", "befundausgabe", "befundbericht", "befund", "validiert",
        "validierung", "freigegeben", "freigabe", "ausdruck", "druckdatum", "gedruckt", "erstellt",
        "berichtsdatum", "report date", "printed",
      ]
    ),
  ]

  /// Words that say "a date" without saying which. Consulted only when no
  /// specific keyword is on the line, so `Entnahmedatum` stays a collection
  /// and is not outranked by its own suffix.
  static let genericDateWords = ["datum", "date"]

  static let laboratoryWords = [
    "labor", "laboratorium", "mvz", "institut", "klinik", "praxis", "zentrum", "center",
    "centrum", "medizin", "diagnostik", "arzte", "aerzte", "gemeinschaftspraxis",
  ]

  /// What the document calls itself. Not a laboratory, however much `Labor` is
  /// inside `Laborbefund`: the title is usually the first line on the page, so
  /// without this it wins every time and the real issuer two lines below never
  /// gets looked at.
  /// Lines that mention a laboratory but are not its name: a record
  /// identifier, a document state. Practice software prints
  /// `ID: 11688893, LA(Endbefund) - Labor Berg`, and without this the issuer
  /// becomes that whole string.
  static let notALaboratoryLine = ["id:", "endbefund", "vorbefund", "teilbefund", "auftrag"]

  static let documentTitleWords: Set<String> = [
    "laborbefund", "laborbericht", "laborergebnis", "laborergebnisse", "befund",
    "befundbericht", "arztbrief", "laborblatt", "analysenbericht", "laboratory report",
  ]

  static let physicianWords = [
    "einsender", "uberweiser", "ueberweiser", "behandelnder arzt", "einsendende", "auftraggeber",
  ]

  private static let germanDate = try! NSRegularExpression(
    pattern: #"(?<!\d)(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{4}|\d{2})(?!\d)"#)
  private static let isoDate = try! NSRegularExpression(
    pattern: #"(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)"#)
  private static let reportNumber = try! NSRegularExpression(
    pattern:
      #"(?:auftrag(?:s-?nr\.?|snummer|s-?nummer)?|befund-?nr\.?|befundnummer|labor-?nr\.?|labornummer|proben-?nr\.?|probennummer|barcode)\s*[:.]?\s*((?=[A-Za-z0-9\-/]*\d)[A-Za-z0-9][A-Za-z0-9\-/]{3,})"#,
    options: [.caseInsensitive])

  /// Lowercases and strips the diacritics OCR tends to lose, so a keyword
  /// matches whether or not the umlaut survived.
  static func fold(_ text: String) -> String {
    text.lowercased()
      .replacingOccurrences(of: "ä", with: "a")
      .replacingOccurrences(of: "ö", with: "o")
      .replacingOccurrences(of: "ü", with: "u")
      .replacingOccurrences(of: "ß", with: "ss")
  }

  /// Noon UTC, so the calendar day survives display in any time zone.
  ///
  /// Public because a date a test or the self-test compares against has to be
  /// built the same way the extractor builds one; a `DateComponents` in the
  /// local zone is a different instant and the comparison would fail for a
  /// reason that has nothing to do with the rule under test.
  public static func day(_ year: Int, _ month: Int, _ dayOfMonth: Int) -> Date? {
    guard (1...12).contains(month), (1...31).contains(dayOfMonth), (1900...2100).contains(year)
    else { return nil }
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = TimeZone(identifier: "UTC")!
    let components = DateComponents(year: year, month: month, day: dayOfMonth, hour: 12)
    guard let date = calendar.date(from: components),
      calendar.component(.day, from: date) == dayOfMonth
    else { return nil }
    return date
  }

  public static func extract(pages: [String], now: Date = Date()) -> ReportMetadata {
    var metadata = ReportMetadata()
    var lines: [(text: String, page: Int)] = []
    for (index, page) in pages.enumerated() {
      for line in page.components(separatedBy: .newlines) {
        let trimmed = line.trimmingCharacters(in: .whitespaces)
        if !trimmed.isEmpty { lines.append((trimmed, index + 1)) }
      }
    }

    metadata.dates = detectDates(lines)
    let usable = metadata.dates.filter {
      $0.role != .birth && $0.date <= now.addingTimeInterval(86_400)
    }
    metadata.collectedOn = usable.first { $0.role == .collection }?.date
    metadata.receivedOn = usable.first { $0.role == .received }?.date
    metadata.reportedOn = usable.first { $0.role == .reported }?.date

    if let collected = metadata.collectedOn {
      metadata.labDate = collected
      metadata.labDateRole = .collection
    } else if let received = metadata.receivedOn {
      metadata.labDate = received
      metadata.labDateRole = .received
    } else if let reported = metadata.reportedOn {
      metadata.labDate = reported
      metadata.labDateRole = .reported
    } else if let latest = usable.filter({ $0.role == .other }).max(by: { $0.date < $1.date }) {
      // The latest unlabelled date on a report is normally its issue date; a
      // birth date is earlier and a future date cannot be a result.
      metadata.labDate = latest.date
      metadata.labDateRole = .other
    }
    metadata.dateSource = metadata.labDate == nil ? .scan : .printed

    metadata.laboratory = detectLaboratory(lines)
    metadata.reportNumber = detectReportNumber(lines)
    metadata.orderingPhysician = detectPhysician(lines)
    return metadata
  }

  static func detectDates(_ lines: [(text: String, page: Int)]) -> [ReportMetadata.DetectedDate] {
    var found: [ReportMetadata.DetectedDate] = []
    for (index, entry) in lines.enumerated() {
      let text = entry.text
      let range = NSRange(text.startIndex..., in: text)
      var matches: [(date: Date, location: Int)] = []
      for m in germanDate.matches(in: text, range: range) {
        guard let d = Int(group(m, 1, text)), let mo = Int(group(m, 2, text)),
          var y = Int(group(m, 3, text))
        else { continue }
        if y < 100 { y += 2000 }
        if let date = day(y, mo, d) { matches.append((date, m.range.location)) }
      }
      for m in isoDate.matches(in: text, range: range) {
        guard let y = Int(group(m, 1, text)), let mo = Int(group(m, 2, text)),
          let d = Int(group(m, 3, text))
        else { continue }
        if let date = day(y, mo, d) { matches.append((date, m.range.location)) }
      }
      guard !matches.isEmpty else { continue }

      let folded = fold(text)
      let previous = index > 0 ? fold(lines[index - 1].text) : ""
      // A row of bare dates under a row of headings: pair them by position,
      // which is the only geometry the text still carries.
      let headings = folded.contains(where: \.isLetter) ? [] : keywordsInOrder(previous)
      for (offset, match) in matches.enumerated() {
        // The words before the date on its own line decide first; then the
        // whole line; then the heading above it.
        let before = String(folded.prefix(max(0, match.location)))
        let role =
          classify(before) ?? classify(folded)
          ?? (headings.count == matches.count ? headings[offset] : nil)
        found.append(
          ReportMetadata.DetectedDate(
            date: match.date, role: role?.role ?? .other, keyword: role?.keyword,
            line: text, page: entry.page))
      }
    }
    return found
  }

  /// The role of the **last** keyword in the text, so `Eingang 12.09. Entnahme
  /// 11.09.` attributes each date to the word nearest before it. A generic
  /// word (`Datum`) counts only when nothing specific is there.
  static func classify(_ folded: String) -> (role: ReportMetadata.DateRole, keyword: String)? {
    if let last = keywordsInOrder(folded).last { return last }
    if let generic = genericDateWords.first(where: { folded.contains($0) }) {
      return (.reported, generic)
    }
    return nil
  }

  /// Every specific keyword in the text, left to right. Overlapping hits at
  /// one position keep the longer word (`Befunddatum` over `Befund`).
  static func keywordsInOrder(_ folded: String)
    -> [(role: ReportMetadata.DateRole, keyword: String)]
  {
    var hits: [(role: ReportMetadata.DateRole, keyword: String, position: Int)] = []
    for (role, words) in keywords {
      for word in words {
        var searchRange = folded.startIndex..<folded.endIndex
        while let range = folded.range(of: word, range: searchRange) {
          let position = folded.distance(from: folded.startIndex, to: range.lowerBound)
          hits.append((role, word, position))
          searchRange = range.upperBound..<folded.endIndex
        }
      }
    }
    // Drop a hit that sits inside a longer hit, then order by position.
    let kept = hits.filter { hit in
      !hits.contains { other in
        other.keyword.count > hit.keyword.count && other.position <= hit.position
          && hit.position + hit.keyword.count <= other.position + other.keyword.count
      }
    }
    return kept.sorted { $0.position < $1.position }.map { ($0.role, $0.keyword) }
  }

  static func detectLaboratory(_ lines: [(text: String, page: Int)]) -> String? {
    for entry in lines.prefix(14) where entry.page == 1 {
      let folded = fold(entry.text)
      let bare = folded.filter { $0.isLetter || $0.isWhitespace }
        .trimmingCharacters(in: .whitespaces)
      guard folded.count <= 90, !folded.hasPrefix("patient"),
        !documentTitleWords.contains(bare),
        !notALaboratoryLine.contains(where: { folded.contains($0) }),
        germanDate.firstMatch(in: entry.text, range: NSRange(entry.text.startIndex..., in: entry.text)) == nil,
        laboratoryWords.contains(where: { folded.contains($0) })
      else { continue }
      return trimPageNumber(entry.text)
    }
    return nil
  }

  /// Removes a trailing `Seite 1` / `Page 2 of 3`.
  ///
  /// A table recogniser puts everything on one printed line into one cell, and
  /// the page number is printed on the same line as the issuer, on the right.
  /// Keeping it would name the laboratory "MVZ Labor Musterstadt GmbH Seite 1".
  static func trimPageNumber(_ text: String) -> String {
    let trimmed = text.replacingOccurrences(
      of: #"\s*[-–—|]?\s*(?:seite|page|blatt)\s*\d+(?:\s*(?:von|of|/)\s*\d+)?\s*$"#,
      with: "", options: [.regularExpression, .caseInsensitive])
    return trimmed.trimmingCharacters(in: .whitespaces)
  }

  static func detectReportNumber(_ lines: [(text: String, page: Int)]) -> String? {
    for entry in lines {
      let text = entry.text
      if let m = reportNumber.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)) {
        return group(m, 1, text)
      }
    }
    return nil
  }

  static func detectPhysician(_ lines: [(text: String, page: Int)]) -> String? {
    for entry in lines {
      let folded = fold(entry.text)
      guard let range = physicianWords.compactMap({ folded.range(of: $0) })
        .min(by: { $0.lowerBound < $1.lowerBound })
      else { continue }

      // Everything after the keyword, and after its own colon if it has one.
      // Taking the line's first colon instead put the order number in front of
      // the doctor, because a header prints both on one line:
      // `Auftragsnr.: 2609123456   Einsender: Dr. med. Erika Beispiel`.
      let text = entry.text
      let offset = folded.distance(from: folded.startIndex, to: range.upperBound)
      guard offset <= text.count else { continue }
      var rest = String(text.dropFirst(offset))
      if let colon = rest.firstIndex(of: ":"),
        rest.distance(from: rest.startIndex, to: colon) <= 2
      {
        rest = String(rest[rest.index(after: colon)...])
      }
      let cleaned = trimPageNumber(rest.trimmingCharacters(in: .whitespaces))
      if !cleaned.isEmpty { return String(cleaned.prefix(80)) }
    }
    return nil
  }

  private static func group(_ match: NSTextCheckingResult, _ index: Int, _ text: String) -> String {
    guard let range = Range(match.range(at: index), in: text) else { return "" }
    return String(text[range])
  }
}
