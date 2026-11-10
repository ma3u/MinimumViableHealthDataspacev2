import Foundation

/// Bonus programs from another data space, as the hub lists them (#934, step 4).
///
/// A program, such as AlphaKasse DE's active year bonus, receives a yes or no
/// per year and never the data behind it (ADR-080). Joining is the person's
/// consent to that one program, GDPR Art. 9(2)(a), withdrawable at any time
/// under Art. 7(3). It is its own record on the hub, `ProgrammeConsent`, and
/// it is neither a study consent nor the Art. 71 opt-out (ADR-080, decision
/// 6), which is why none of this touches `ConsentLedger`: the ledger is the
/// person's own note of decisions held elsewhere, while a program consent is
/// held by the hub and given from here.
///
/// The hub answers the app at `/api/patient/app/programmes`, the app-token
/// twin of the portal's `/api/patient/programmes`: the same queries, the same
/// JSON. What is decoded here is that JSON, so the phone and the browser read
/// one shape.
public struct BonusProgramme: Codable, Equatable, Sendable, Identifiable {
  public let programmeId: String
  public let title: String
  public let description: String?
  public let publisherName: String?
  public let publisherDid: String?
  /// The data space the publisher belongs to, e.g. `insurance-wellbeing`.
  public let dataSpace: String?
  public let ruleTitle: String?
  public let ruleDescription: String?
  /// `2025.1` is the rule for 2025.
  public let ruleVersion: String?

  public var id: String { programmeId }

  /// Who receives the yes or no, by name where the crawler found one.
  public var publisher: String { publisherName ?? publisherDid ?? "" }

  /// The year a "Send my answer" asks for: the one the rule version names,
  /// or this year when the version names none. The portal does the same.
  public func ruleYear(now: Date = Date()) -> Int {
    if let version = ruleVersion, let year = Int(version.prefix(4)), year > 0 { return year }
    return Calendar(identifier: .gregorian).component(.year, from: now)
  }

  public init(
    programmeId: String, title: String, description: String? = nil,
    publisherName: String? = nil, publisherDid: String? = nil, dataSpace: String? = nil,
    ruleTitle: String? = nil, ruleDescription: String? = nil, ruleVersion: String? = nil
  ) {
    self.programmeId = programmeId
    self.title = title
    self.description = description
    self.publisherName = publisherName
    self.publisherDid = publisherDid
    self.dataSpace = dataSpace
    self.ruleTitle = ruleTitle
    self.ruleDescription = ruleDescription
    self.ruleVersion = ruleVersion
  }
}

/// One consent of the person to one program; open while `withdrawnAt` is nil.
public struct ProgrammeConsent: Codable, Equatable, Sendable {
  public let consentId: String
  public let programmeId: String
  /// Neo4j datetimes as the hub prints them, e.g. `2026-11-09T10:00:00.123Z`.
  public let joinedAt: String
  public let withdrawnAt: String?

  public init(consentId: String, programmeId: String, joinedAt: String, withdrawnAt: String?) {
    self.consentId = consentId
    self.programmeId = programmeId
    self.joinedAt = joinedAt
    self.withdrawnAt = withdrawnAt
  }

  public var isOpen: Bool { withdrawnAt == nil }
  public var joinedDay: Date? { Self.day(joinedAt) }
  public var withdrawnDay: Date? { withdrawnAt.flatMap(Self.day) }

  /// The calendar day of a hub datetime, as the portal shows it (the first
  /// ten characters), read as a local day so it prints as the same date.
  static func day(_ iso: String) -> Date? {
    let formatter = DateFormatter()
    formatter.calendar = Calendar(identifier: .gregorian)
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.dateFormat = "yyyy-MM-dd"
    return formatter.date(from: String(iso.prefix(10)))
  }
}

/// A year's answer the person asked the hub to send: the program, the year
/// and goal met, worked out by the hub inside the record (#934 step 6,
/// ADR-087). Nothing else is stored with it.
public struct ProgrammeTransfer: Codable, Equatable, Sendable {
  public let transferId: String
  public let programmeId: String
  public let year: Int
  public let goalMet: Bool?
  public let status: String
}

/// What `GET /api/patient/app/programmes` answers: the offer and the
/// person's own consents, newest first.
public struct ProgrammeOffer: Codable, Equatable, Sendable {
  public private(set) var programmes: [BonusProgramme]
  public private(set) var consents: [ProgrammeConsent]

  public init(programmes: [BonusProgramme], consents: [ProgrammeConsent] = []) {
    self.programmes = programmes
    self.consents = consents
  }

  /// The hub's JSON, or nil when it is not that shape. A missing `consents`
  /// is an empty list, as the portal reads it.
  public static func parse(_ data: Data) -> ProgrammeOffer? {
    struct Wire: Decodable {
      let programmes: [BonusProgramme]
      let consents: [ProgrammeConsent]?
    }
    guard let wire = try? JSONDecoder().decode(Wire.self, from: data) else { return nil }
    return ProgrammeOffer(programmes: wire.programmes, consents: wire.consents ?? [])
  }

  /// The open consent to a program, if the person joined and has not withdrawn.
  public func open(_ programmeId: String) -> ProgrammeConsent? {
    consents.first { $0.programmeId == programmeId && $0.isOpen }
  }

  /// The newest consent to a program, open or withdrawn.
  public func last(_ programmeId: String) -> ProgrammeConsent? {
    consents.first { $0.programmeId == programmeId }
  }

  /// Takes in what a join or a withdrawal returned: the consent, newest first,
  /// replacing the one with the same id.
  public mutating func apply(_ consent: ProgrammeConsent) {
    consents.removeAll { $0.consentId == consent.consentId }
    consents.insert(consent, at: 0)
  }
}

/// How the hub answered a join, a withdrawal or a transfer, read from the
/// status and body. Kept here rather than in the app so the one answer that
/// matters most, the 403 after a withdrawal, is pinned by a unit test.
/// The member's own result for one program year, worked out inside their
/// record before anything is sent (#934 step 6; ADR-080, decision 3;
/// ADR-087). The breakdown is for the member's eyes; a transfer carries the
/// year and goal met only.
public enum ProgrammeEvaluation: Equatable, Sendable {
  /// The year has not ended; the hub works it out from `evaluableFrom`
  /// (`yyyy-MM-dd`), and nothing can be sent before.
  case yearNotOver(year: Int, evaluableFrom: String)
  case evaluated(ProgrammeResult)

  public var year: Int {
    switch self {
    case let .yearNotOver(year, _): year
    case let .evaluated(result): result.year
    }
  }

  /// `GET /api/patient/app/programmes/evaluation`, or nil for another shape.
  public static func parse(_ data: Data) -> ProgrammeEvaluation? {
    struct Wire: Decodable { let evaluation: Body }
    struct Body: Decodable {
      let year: Int
      let status: String
      let evaluableFrom: String?
      let goalMet: Bool?
      let activity: Activity?
      let checkUp: CheckUp?
    }
    struct Activity: Decodable {
      let minutesPerWeek: Int
      let required: Int
      let weeksWithData: Int
      let met: Bool
    }
    struct CheckUp: Decodable {
      let count: Int
      let required: Int
      let met: Bool
    }
    guard let body = (try? JSONDecoder().decode(Wire.self, from: data))?.evaluation else {
      return nil
    }
    switch body.status {
    case "year-not-over":
      guard let from = body.evaluableFrom else { return nil }
      return .yearNotOver(year: body.year, evaluableFrom: from)
    case "evaluated":
      guard let goalMet = body.goalMet, let activity = body.activity, let checkUp = body.checkUp
      else { return nil }
      return .evaluated(
        ProgrammeResult(
          year: body.year, goalMet: goalMet, minutesPerWeek: activity.minutesPerWeek,
          requiredMinutesPerWeek: activity.required, weeksWithData: activity.weeksWithData,
          activityMet: activity.met, checkUps: checkUp.count, checkUpMet: checkUp.met))
    default:
      return nil
    }
  }
}

/// An ended year, worked out: goal met, and why, for the member to read.
public struct ProgrammeResult: Equatable, Sendable {
  public let year: Int
  public let goalMet: Bool
  public let minutesPerWeek: Int
  public let requiredMinutesPerWeek: Int
  public let weeksWithData: Int
  public let activityMet: Bool
  public let checkUps: Int
  public let checkUpMet: Bool

  public init(
    year: Int, goalMet: Bool, minutesPerWeek: Int, requiredMinutesPerWeek: Int,
    weeksWithData: Int, activityMet: Bool, checkUps: Int, checkUpMet: Bool
  ) {
    self.year = year
    self.goalMet = goalMet
    self.minutesPerWeek = minutesPerWeek
    self.requiredMinutesPerWeek = requiredMinutesPerWeek
    self.weeksWithData = weeksWithData
    self.activityMet = activityMet
    self.checkUps = checkUps
    self.checkUpMet = checkUpMet
  }
}

public enum ProgrammeAnswer: Equatable, Sendable {
  /// 201 to a join, 200 to a withdrawal: the consent as it now stands.
  case consent(ProgrammeConsent)
  /// 202: the hub recorded the instruction and evaluates the year.
  case transfer(ProgrammeTransfer)
  /// 409 to a transfer: the year has not ended, so nothing was sent.
  case yearNotOver(evaluableFrom: String)
  /// 403 to a transfer: no open consent, so nothing was sent or recorded.
  /// Withdrawn in the portal while this screen still showed "joined", or
  /// never joined at all.
  case noOpenConsent
  /// Anything else, with the status and the hub's `error` when it gave one.
  case failed(status: Int, reason: String?)

  public static func join(status: Int, body: Data) -> ProgrammeAnswer {
    consent(expecting: 201, status: status, body: body)
  }

  public static func withdraw(status: Int, body: Data) -> ProgrammeAnswer {
    consent(expecting: 200, status: status, body: body)
  }

  public static func transfer(status: Int, body: Data) -> ProgrammeAnswer {
    struct Wire: Decodable { let transfer: ProgrammeTransfer }
    if status == 403 { return .noOpenConsent }
    if status == 409 {
      struct NotOver: Decodable {
        struct Evaluation: Decodable { let evaluableFrom: String }
        let evaluation: Evaluation
      }
      let from = (try? JSONDecoder().decode(NotOver.self, from: body))?.evaluation.evaluableFrom
      return .yearNotOver(evaluableFrom: from ?? "")
    }
    if status == 202, let wire = try? JSONDecoder().decode(Wire.self, from: body) {
      return .transfer(wire.transfer)
    }
    return .failed(status: status, reason: reason(body))
  }

  private static func consent(expecting: Int, status: Int, body: Data) -> ProgrammeAnswer {
    struct Wire: Decodable { let consent: ProgrammeConsent }
    if status == expecting, let wire = try? JSONDecoder().decode(Wire.self, from: body) {
      return .consent(wire.consent)
    }
    return .failed(status: status, reason: reason(body))
  }

  private static func reason(_ body: Data) -> String? {
    struct Wire: Decodable { let error: String? }
    return (try? JSONDecoder().decode(Wire.self, from: body))?.error
  }
}
