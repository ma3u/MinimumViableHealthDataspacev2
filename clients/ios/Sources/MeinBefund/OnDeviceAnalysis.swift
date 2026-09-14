import Foundation
import FoundationModels
import Shared

/// Explains values using Apple's on-device model. Nothing leaves the phone.
///
/// ## Why this is the default
///
/// Issue #186 §4.3 says on-device by default and a cloud provider only by an
/// explicit per-call act. Until now the app had no on-device path at all, so
/// the "default" was a network service, and every question required a working
/// cluster, a sign-in and a per-call consent.
///
/// The cluster is not always up. More to the point, a person scanning a lab
/// report at home should not need anyone else's infrastructure to read their own
/// results. This path needs no network, no account, no quota and no consent
/// screen, because there is nothing to consent to: the values never leave the
/// device.
///
/// ## What it costs
///
/// The on-device model is small. It will be less fluent than a frontier model
/// and will sometimes decline. That is an acceptable trade for the default,
/// because the alternative default was "unavailable when the cluster is down",
/// and the cloud options remain one tap away for anyone who wants them.
enum OnDeviceAnalysis {

  enum Availability: Equatable {
    case available
    case appleIntelligenceOff
    case deviceNotEligible
    case modelNotReady
    case unsupportedOS

    /// Said plainly, including what the person can actually do about it.
    /// "Unavailable" on its own invites a bug report; naming the switch does not.
    var explanation: String? {
      switch self {
      case .available:
        return nil
      case .appleIntelligenceOff:
        return String(
          localized:
            "Turn on Apple Intelligence in Settings to have your values explained on this device.")
      case .deviceNotEligible:
        return String(
          localized:
            "This iPhone cannot run the on-device model. You can still configure a provider of your own.")
      case .modelNotReady:
        return String(
          localized: "The on-device model is still downloading. Try again shortly.")
      case .unsupportedOS:
        return String(
          localized: "On-device explanations need a newer version of iOS.")
      }
    }
  }

  static var availability: Availability {
    guard #available(iOS 26.0, *) else { return .unsupportedOS }
    switch SystemLanguageModel.default.availability {
    case .available:
      return .available
    case .unavailable(.appleIntelligenceNotEnabled):
      return .appleIntelligenceOff
    case .unavailable(.deviceNotEligible):
      return .deviceNotEligible
    case .unavailable(.modelNotReady):
      return .modelNotReady
    case .unavailable:
      return .modelNotReady
    }
  }

  static var isAvailable: Bool { availability == .available }

  enum AnalysisError: LocalizedError {
    case unavailable(Availability)
    case refused(String)

    var errorDescription: String? {
      switch self {
      case let .unavailable(state):
        return state.explanation ?? String(localized: "On-device analysis is unavailable.")
      case let .refused(detail):
        return detail
      }
    }
  }

  /// Runs the same prompt the cloud paths use.
  ///
  /// `PromptText` is generated from the service's TypeScript source, so the
  /// intended purpose that keeps this outside IVDR scope is identical on every
  /// path. An on-device model given laxer instructions would be the one place
  /// the safety wording quietly differed, which is exactly what generating it
  /// is meant to prevent.
  @available(iOS 26.0, *)
  static func analyse(
    values: [CloudAnalysis.SharedValue], question: String
  ) async throws -> CloudAnalysis.Reply {
    let state = availability
    guard state == .available else { throw AnalysisError.unavailable(state) }

    let session = LanguageModelSession(instructions: PromptText.system)
    do {
      let response = try await session.respond(
        to: PromptText.user(values: values, question: question))
      return CloudAnalysis.Reply(
        text: response.content,
        model: String(localized: "Apple on-device model"),
        provider: "on-device")
    } catch {
      // A guardrail refusal is a normal outcome for a small model asked about
      // health, not a crash. Reported as itself so the person can rephrase or
      // pick another provider, rather than as "something went wrong".
      throw AnalysisError.refused(
        String(
          localized:
            "The on-device model did not answer this one. Rephrasing helps, or use another provider."
        ))
    }
  }
}
