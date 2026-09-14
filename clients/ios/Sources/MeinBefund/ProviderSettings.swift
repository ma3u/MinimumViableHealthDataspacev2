import Shared
import SwiftUI

/// Where the user chooses who answers their questions.
///
/// The hosted option is the default and the only one that needs no setup. The
/// other two exist because "external configuration is preferred" is a real
/// preference: someone who already pays a provider should not be metered by an
/// operator, and their data should not take a detour through one.
struct ProviderSettings: View {
  @Binding var configuration: BringYourOwnProvider.Configuration
  @State private var apiKey: String = ""
  @State private var saved = false
  let onClose: () -> Void

  var body: some View {
    NavigationStack {
      Form {
        Section("Provider") {
          Picker("Provider", selection: $configuration.kind) {
            ForEach(BringYourOwnProvider.Kind.allCases, id: \.self) { kind in
              Text(kind.label).tag(kind)
            }
          }
          .pickerStyle(.inline)
          .labelsHidden()
          Text(configuration.kind.explanation)
            .font(.footnote)
            .foregroundStyle(.secondary)

          // When the on-device model cannot run, say which switch to flip.
          // "Unavailable" alone invites a bug report; naming the setting does
          // not, and the person can usually fix it in ten seconds.
          if configuration.kind == .onDevice,
            let blocked = OnDeviceAnalysis.availability.explanation
          {
            Label(blocked, systemImage: "exclamationmark.triangle")
              .font(.footnote)
              .foregroundStyle(.orange)
          }
        }

        if configuration.kind == .azure {
          Section("Azure OpenAI") {
            TextField("https://<name>.openai.azure.com", text: $configuration.endpoint)
              .textInputAutocapitalization(.never)
              .autocorrectionDisabled()
            TextField("Deployment name", text: $configuration.deployment)
              .textInputAutocapitalization(.never)
              .autocorrectionDisabled()
            SecureField("API key", text: $apiKey)
          }
          Section {
            // The app cannot know which region the user's resource is in and
            // must not claim to. Saying so is more useful than a reassuring
            // badge that might be wrong.
            Text(
              """
              The region of your resource decides where the values are \
              processed. The app cannot check that.
              """
            )
            .font(.footnote)
            .foregroundStyle(.secondary)
          }
        }

        if configuration.kind == .anthropic {
          Section("Anthropic") {
            TextField("Model, e.g. claude-opus-5", text: $configuration.model)
              .textInputAutocapitalization(.never)
              .autocorrectionDisabled()
            SecureField("API key", text: $apiKey)
          }
          Section {
            Text("Anthropic processes the values in the United States.")
              .font(.footnote)
              .foregroundStyle(.secondary)
          }
        }

        // On device there is no key and no endpoint, so this note would be
        // answering a question nobody asked. It belongs to the two kinds that
        // actually take a key.
        if configuration.kind == .azure || configuration.kind == .anthropic {
          Section {
            Text(
              """
              The key stays on this device, in the keychain, and is never sent \
              to the provider of this app. The values go straight from your \
              iPhone to your own service.
              """
            )
            .font(.footnote)
            .foregroundStyle(.secondary)
          }
        }
      }
      .navigationTitle("Analysis provider")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) { Button("Cancel", action: onClose) }
        ToolbarItem(placement: .confirmationAction) {
          Button("Save") {
            BringYourOwnProvider.saveConfiguration(configuration)
            try? BringYourOwnProvider.saveAPIKey(apiKey)
            saved = true
            onClose()
          }
          .disabled(!configuration.isUsable)
        }
      }
      .onAppear {
        // The stored key is never shown back. Reading it into a visible field
        // would put a live credential on screen for no purpose; an empty field
        // means "leave it as it is", and typing replaces it.
        apiKey = ""
      }
    }
  }
}
