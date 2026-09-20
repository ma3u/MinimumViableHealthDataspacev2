import Foundation

/// The request the phone sends when the user asks a cloud model about values,
/// and the reply it gets back.
///
/// The wire shape is defined by `services/claude-federation/src/analyse.ts` and
/// pinned by a fixture both sides test against, for the same reason the FHIR
/// writer is: two implementations of one format drift, and the drift shows up
/// as a 400 from a server the phone cannot debug.
///
/// Everything here is built so that the payload is the smallest thing that can
/// answer the question. It carries no name, no birth date, no insurance number
/// and no scan, because the local store holds none of those and this is not the
/// place to start.
public enum CloudAnalysis {

  /// Named at the moment of use, and sent with the call.
  ///
  /// Issue #186 section 4.3: on-device by default, a cloud provider only by an
  /// explicit per-call act with the provider named. Carrying the name in the
  /// request is what stops a blanket setting elsewhere from satisfying it.
  public struct Consent: Sendable, Equatable, Codable {
    public let provider: String
    public let at: String

    public init(provider: String, at: Date = Date()) {
      self.provider = provider
      self.at = ISO8601DateFormatter().string(from: at)
    }
  }

  /// One value the user ticked. Not the whole store, and not the document.
  public struct SharedValue: Sendable, Equatable, Codable {
    public let label: String
    public let value: Double
    public let unit: String
    public let loinc: String?
    public let referenceLow: Double?
    public let referenceHigh: Double?
    /// FHIR Observation status, so the model can see what it is being handed.
    /// A value transcribed from a photograph is `preliminary` and the prompt
    /// tells the model to treat it as possibly misread.
    public let status: String

    public init(from coded: CodedLabValue) {
      self.label = coded.raw.label
      self.value = coded.raw.value
      self.unit = coded.coding.ucum
      self.loinc = coded.coding.loinc
      self.referenceLow = coded.raw.referenceLow
      self.referenceHigh = coded.raw.referenceHigh
      self.status = coded.source.observationStatus
    }

    public init(
      label: String, value: Double, unit: String, loinc: String?,
      referenceLow: Double? = nil, referenceHigh: Double? = nil, status: String
    ) {
      self.label = label
      self.value = value
      self.unit = unit
      self.loinc = loinc
      self.referenceLow = referenceLow
      self.referenceHigh = referenceHigh
      self.status = status
    }
  }

  public struct Request: Sendable, Equatable, Codable {
    public let consent: Consent
    public let values: [SharedValue]
    public let question: String

    public init(consent: Consent, values: [SharedValue], question: String) {
      self.consent = consent
      self.values = values
      self.question = question
    }
  }

  public struct Reply: Sendable, Equatable, Codable {
    public let text: String
    public let model: String
    /// Echoed back so the UI can show which provider actually answered, rather
    /// than which one it believes it asked.
    public let provider: String

    public init(text: String, model: String, provider: String) {
      self.text = text
      self.model = model
      self.provider = provider
    }
  }

  /// The server's own cap, mirrored so the app can refuse before sending
  /// rather than after. The server still enforces it: a check that lives only
  /// in the client is a check an attacker skips.
  public static let maxValues = 40

  public enum RefusalReason: Sendable, Equatable {
    case nothingSelected
    case tooMany(Int)

    public var message: String {
      switch self {
      case .nothingSelected:
        return "Select the values you want to ask about."
      case let .tooMany(count):
        return "\(count) values selected. At most \(maxValues) can be sent at once."
      }
    }
  }

  /// Checks locally what the server will check anyway, so the user is told in
  /// the sheet rather than by a failed request.
  public static func refusal(for values: [SharedValue]) -> RefusalReason? {
    if values.isEmpty { return .nothingSelected }
    if values.count > maxValues { return .tooMany(values.count) }
    return nil
  }

  /// Encodes the request exactly as the service expects it.
  ///
  /// Key order does not matter to the server, but stable output does matter to
  /// the contract test, so keys are sorted.
  public static func encode(_ request: Request) throws -> Data {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]
    return try encoder.encode(request)
  }
}
