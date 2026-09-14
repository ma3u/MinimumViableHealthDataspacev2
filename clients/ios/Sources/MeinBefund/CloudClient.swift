import Foundation
import Shared

/// Calls `services/claude-federation`.
///
/// The app holds no Anthropic credential of any kind. It sends the user's ID
/// token and the values the user ticked; the service verifies the token, proves
/// its own identity to Azure, exchanges that for a short-lived Anthropic token
/// and makes the call. See ADR-034 for why the phone is deliberately not the
/// thing that federates.
struct CloudClient {

  struct Configuration: Sendable {
    let baseURL: URL

    static func fromBundle(_ bundle: Bundle = .main) -> Configuration? {
      guard
        let raw = bundle.object(forInfoDictionaryKey: "MBFederationBaseURL") as? String,
        let url = URL(string: raw), url.scheme == "https"
      else { return nil }
      return Configuration(baseURL: url)
    }
  }

  enum ClientError: LocalizedError {
    case notConfigured
    case notSignedIn
    case refused(String)
    case failed(Int, String)

    var errorDescription: String? {
      switch self {
      case .notConfigured:
        return "No analysis endpoint configured."
      case .notSignedIn:
        return "Please sign in before sending values."
      case let .refused(message):
        return message
      case let .failed(status, detail):
        return "Analysis failed (\(status)). \(detail)"
      }
    }
  }

  let configuration: Configuration

  /// Sends the selected values and returns the reply.
  ///
  /// `values` is what the user ticked and nothing else. The source line and the
  /// bounding box stay on the phone: they are an audit trail for the person
  /// holding the paper and of no use to a model.
  func analyse(
    values: [CloudAnalysis.SharedValue], question: String, identityToken: String
  ) async throws -> CloudAnalysis.Reply {
    if let refusal = CloudAnalysis.refusal(for: values) {
      throw ClientError.refused(refusal.message)
    }

    var request = URLRequest(url: configuration.baseURL.appendingPathComponent("v1/analyse"))
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("Bearer \(identityToken)", forHTTPHeaderField: "Authorization")
    request.httpBody = try CloudAnalysis.encode(
      CloudAnalysis.Request(
        // Named here, at the moment of use, and sent with the call. A setting
        // somewhere else cannot satisfy the service's check.
        consent: CloudAnalysis.Consent(provider: "anthropic"),
        values: values,
        question: question))

    let (data, response) = try await URLSession.shared.data(for: request)
    let status = (response as? HTTPURLResponse)?.statusCode ?? 0
    guard status == 200 else {
      let detail = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["error"]
        as? String
      throw ClientError.failed(status, detail ?? String(decoding: data.prefix(200), as: UTF8.self))
    }
    return try JSONDecoder().decode(CloudAnalysis.Reply.self, from: data)
  }
}
