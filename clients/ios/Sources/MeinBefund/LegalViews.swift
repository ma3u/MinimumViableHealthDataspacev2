import Shared
import SwiftUI

/// The privacy summary and the medical disclaimer, in the app.
///
/// App Review 5.1.1(i) requires a privacy policy both in App Store Connect and
/// inside the app, and 1.4.1 requires a medical app to remind people to consult
/// a doctor. Both are here rather than only on a web page, because a link is
/// not a disclosure if the person never opens it.
///
/// The wording is deliberately concrete. "We take your privacy seriously" tells
/// a reader nothing; "the photograph never leaves this device" is a claim that
/// can be checked, and is the one worth making.
struct PrivacySummary: View {
  let onClose: () -> Void

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 18) {
          Group {
            Text("Your reports stay on this phone")
              .font(.headline)
            Text(
              """
              The photographs never leave this device. The values read from them \
              are encrypted individually, with a key that is unavailable while \
              the phone is locked and is never restored onto another device. \
              The store is excluded from iCloud Backup.
              """)
          }

          Group {
            Text("Nothing is sent unless you send it")
              .font(.headline)
            Text(
              """
              When you ask for an explanation you choose the values, see them \
              listed, and confirm. Only those values and your question travel. \
              Your name, date of birth and insurance number are never sent, \
              because the app does not hold them. The scanned image is never \
              sent either.
              """)
          }

          Group {
            Text("Where the explanation comes from")
              .font(.headline)
            Text(
              """
              By default the MeinBefund service processes your question in the \
              EU. You may instead choose Anthropic, which processes in the \
              United States and is shown as such before you send. Or you can \
              configure your own provider, in which case your phone talks to it \
              directly and neither your key nor your values reach the app \
              provider at all.

              No model vendor uses your values for training.
              """)
          }

          Group {
            Text("Why signing in is sometimes asked for")
              .font(.headline)
            Text(
              """
              Only the default service asks you to sign in, and only so the \
              limit of 20 explanations a day can be counted per person. The \
              counter stores a one-way hash and a number, not your name. With \
              your own provider there is no sign-in and no limit.
              """)
          }

          Divider()

          Group {
            Label("This app does not diagnose", systemImage: "stethoscope")
              .font(.headline)
            Text(
              """
              MeinBefund explains what a measurement is. It does not diagnose, \
              does not assess your risk and does not recommend treatment. \
              Values read from a photograph can be misread and are marked \
              preliminary until you check them against the paper. Reference \
              ranges are shown exactly as your laboratory printed them.

              Always consult a doctor before making any decision about your \
              health.
              """)
          }

          Link(
            "Full privacy policy",
            destination: URL(
              string:
                "https://ma3u.github.io/MinimumViableHealthDataspacev2/meinbefund/privacy.html")!
          )
          .font(.footnote)
        }
        .padding()
      }
      .navigationTitle("Privacy and safety")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .confirmationAction) { Button("Done", action: onClose) }
      }
    }
  }
}

/// The one-line reminder, shown where a result is read rather than buried in a
/// settings screen.
///
/// Guideline 1.4.1 asks that apps remind users to check with a doctor before
/// making medical decisions. The moment that matters is when someone is looking
/// at their own numbers, so it goes there.
struct DoctorReminder: View {
  var body: some View {
    HStack(alignment: .firstTextBaseline, spacing: 6) {
      Image(systemName: "stethoscope")
      Text(
        "Not a diagnosis. Values read from a photo may be misread. Talk to your doctor before acting on them."
      )
    }
    .font(.caption)
    .foregroundStyle(.secondary)
  }
}
