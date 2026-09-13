import Foundation
import Security
import Shared

/// A provider the user configured themselves, called directly from the phone.
///
/// ## Why this bypasses the backend entirely
///
/// The obvious design is to post the user's key to `claude-federation` and let
/// it make the call. This does the opposite: when someone brings their own
/// provider, the phone talks to it and the operator's service is not involved.
///
/// That is not a shortcut, it is the better shape. Their key never reaches the
/// operator's server, their values never pass through it, and there is one less
/// place holding either. Fewer parties is the whole argument.
///
/// It is also why this path has no daily limit. The quota in ADR-035 exists
/// because the operator pays; here nobody's money but the user's is being
/// spent, so rationing it would be an imposition with nothing behind it.
enum BringYourOwnProvider {

  enum Kind: String, Codable, CaseIterable, Sendable {
    /// The operator's service: OIDC sign-in, EU by default, daily limit.
    case hosted
    /// The user's own Azure OpenAI resource.
    case azure
    /// The user's own Anthropic API key.
    case anthropic

    var label: String {
      switch self {
      case .hosted: return "MeinBefund service (EU, limited)"
      case .azure: return "Your own Azure OpenAI"
      case .anthropic: return "Your own Anthropic API key"
      }
    }

    var explanation: String {
      switch self {
      case .hosted:
        return
          "Runs on the app provider's service in the EU. Up to 20 analyses per day."
      case .azure:
        return
          "Your values go straight to your own Azure resource. No limit, you pay."
      case .anthropic:
        return
          "Your values go straight to Anthropic in the United States. No limit, you pay."
      }
    }
  }

  struct Configuration: Codable, Equatable, Sendable {
    var kind: Kind
    /// Azure only: `https://<resource>.openai.azure.com`.
    var endpoint: String
    /// Azure only: the deployment name.
    var deployment: String
    /// Anthropic only.
    var model: String

    static let hosted = Configuration(
      kind: .hosted, endpoint: "", deployment: "", model: "")

    /// True when the configuration is complete enough to attempt a call.
    ///
    /// Checked before the button is offered, so a half-filled form does not
    /// look usable and then fail on the values the user just chose to send.
    var isUsable: Bool {
      switch kind {
      case .hosted: return true
      case .azure:
        return URL(string: endpoint)?.scheme == "https" && !deployment.isEmpty
      case .anthropic: return !model.isEmpty
      }
    }

    var euResident: Bool {
      switch kind {
      case .hosted: return true
      // The user chose the region when they created the resource. The app
      // cannot know it and must not claim to.
      case .azure: return false
      case .anthropic: return false
      }
    }
  }

  // MARK: - Storage

  /// The key lives in the Keychain, never in `UserDefaults`.
  ///
  /// `UserDefaults` is a plist in the container, readable by anything that can
  /// read the container and included in a backup. A provider key is a bearer
  /// credential for someone's paid account, so it gets the same treatment as
  /// the store key: `ThisDeviceOnly`, so it is unavailable while locked and
  /// never restored onto another device.
  private static let keyTag = "red.mabu.meinbefund.byok.apikey"
  private static let configKey = "red.mabu.meinbefund.byok.config"

  static func saveAPIKey(_ key: String) throws {
    let data = Data(key.utf8)
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrAccount as String: keyTag,
    ]
    SecItemDelete(query as CFDictionary)
    guard !key.isEmpty else { return }

    var add = query
    add[kSecValueData as String] = data
    add[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
    let status = SecItemAdd(add as CFDictionary, nil)
    guard status == errSecSuccess else { throw KeychainError(status: status) }
  }

  static func apiKey() -> String? {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrAccount as String: keyTag,
      kSecReturnData as String: true,
    ]
    var item: CFTypeRef?
    guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
      let data = item as? Data
    else { return nil }
    return String(decoding: data, as: UTF8.self)
  }

  struct KeychainError: LocalizedError {
    let status: OSStatus
    var errorDescription: String? {
      "The key could not be saved (\(status))."
    }
  }

  /// The non-secret half. Endpoint and deployment name are configuration, not
  /// credentials, and keeping them out of the Keychain keeps that distinction
  /// visible rather than blurring everything into one bucket.
  static func saveConfiguration(_ configuration: Configuration) {
    guard let data = try? JSONEncoder().encode(configuration) else { return }
    UserDefaults.standard.set(data, forKey: configKey)
  }

  static func configuration() -> Configuration {
    guard let data = UserDefaults.standard.data(forKey: configKey),
      let decoded = try? JSONDecoder().decode(Configuration.self, from: data)
    else { return .hosted }
    return decoded
  }

  // MARK: - Calling

  enum CallError: LocalizedError {
    case notConfigured
    case noKey
    case failed(Int, String)

    var errorDescription: String? {
      switch self {
      case .notConfigured: return "Your own provider is not fully configured."
      case .noKey: return "No API key stored."
      case let .failed(status, detail): return "The provider answered with \(status). \(detail)"
      }
    }
  }

  /// Calls the user's own provider. Nothing here touches the operator.
  static func analyse(
    values: [CloudAnalysis.SharedValue],
    question: String,
    configuration: Configuration
  ) async throws -> CloudAnalysis.Reply {
    guard configuration.isUsable else { throw CallError.notConfigured }
    guard let key = apiKey(), !key.isEmpty else { throw CallError.noKey }

    let prompt = PromptText.user(values: values, question: question)
    switch configuration.kind {
    case .hosted:
      throw CallError.notConfigured
    case .azure:
      return try await callAzure(configuration, key: key, prompt: prompt)
    case .anthropic:
      return try await callAnthropic(configuration, key: key, prompt: prompt)
    }
  }

  private static func callAzure(
    _ configuration: Configuration, key: String, prompt: String
  ) async throws -> CloudAnalysis.Reply {
    let url = URL(
      string:
        "\(configuration.endpoint.trimmingCharacters(in: CharacterSet(charactersIn: "/")))"
        + "/openai/deployments/\(configuration.deployment)"
        + "/chat/completions?api-version=2024-10-21")!
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue(key, forHTTPHeaderField: "api-key")
    request.httpBody = try JSONSerialization.data(withJSONObject: [
      "messages": [
        ["role": "system", "content": PromptText.system],
        ["role": "user", "content": prompt],
      ],
      "max_completion_tokens": 1500,
    ])

    let (data, response) = try await URLSession.shared.data(for: request)
    let status = (response as? HTTPURLResponse)?.statusCode ?? 0
    guard status == 200 else {
      throw CallError.failed(status, String(decoding: data.prefix(200), as: UTF8.self))
    }
    let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
    let choices = json?["choices"] as? [[String: Any]]
    let text = (choices?.first?["message"] as? [String: Any])?["content"] as? String
    return CloudAnalysis.Reply(
      text: text ?? "", model: configuration.deployment, provider: "azure (your resource)")
  }

  private static func callAnthropic(
    _ configuration: Configuration, key: String, prompt: String
  ) async throws -> CloudAnalysis.Reply {
    var request = URLRequest(url: URL(string: "https://api.anthropic.com/v1/messages")!)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue(key, forHTTPHeaderField: "x-api-key")
    request.setValue("2023-06-01", forHTTPHeaderField: "anthropic-version")
    request.httpBody = try JSONSerialization.data(withJSONObject: [
      "model": configuration.model,
      "max_tokens": 1500,
      "system": PromptText.system,
      "messages": [["role": "user", "content": prompt]],
    ])

    let (data, response) = try await URLSession.shared.data(for: request)
    let status = (response as? HTTPURLResponse)?.statusCode ?? 0
    guard status == 200 else {
      throw CallError.failed(status, String(decoding: data.prefix(200), as: UTF8.self))
    }
    let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
    let blocks = json?["content"] as? [[String: Any]]
    let text = blocks?.compactMap { $0["text"] as? String }.joined(separator: "\n")
    return CloudAnalysis.Reply(
      text: text ?? "", model: configuration.model, provider: "anthropic (your key)")
  }
}
