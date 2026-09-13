# Getting MeinBefund onto TestFlight

## Status

**Nothing has been uploaded.** Not to internal testers, not to external ones.
The blocker is not the app and not App Review; it is that this machine has no
credential that can sign for distribution.

```
security find-identity     Apple Development only, no Apple Distribution
~/.appstoreconnect          no API keys
xcodebuild -allowProvisioningUpdates
                            error: No Accounts: Add a new account in Accounts settings
```

Xcode shows an account in its preferences, but nothing that `xcodebuild` can
use is on disk: no `IDEProvisioningTeams`, no `idmsa.apple.com` keychain entry.
A GUI session is not what a command-line archive authenticates with.

## What unblocks it

An **App Store Connect API key**. It works headless, does not depend on an
Xcode GUI session, and is the same credential that creates the app record and
performs the upload, so one thing unlocks all three steps.

1. App Store Connect → **Users and Access** → **Integrations** → **App Store
   Connect API** → **Team Keys** → **Generate API Key**. Role **App Manager**
   is enough; **Admin** is needed only if you also want it to manage users.
2. Note the **Key ID** and the **Issuer ID**, and download the `.p8`. Apple
   allows the download **once**.
3. Put it where the tools look:

   ```bash
   mkdir -p ~/.appstoreconnect/private_keys
   mv ~/Downloads/AuthKey_XXXXXXXXXX.p8 ~/.appstoreconnect/private_keys/
   chmod 600 ~/.appstoreconnect/private_keys/AuthKey_XXXXXXXXXX.p8
   ```

4. Tell me the Key ID and Issuer ID. They are identifiers, not secrets; the
   `.p8` is the secret and never needs to leave your machine or appear in a
   message.

With that I can create the App Store Connect record, register the Data
Protection capability, archive, and upload, without further input.

## The entitlement, and why the device build differs

The archive also fails on:

```
Provisioning profile "iOS Team Provisioning Profile: *" doesn't include the
Data Protection capability
```

The wildcard team profile predates this app and lacks the capability. With an
API key, `-allowProvisioningUpdates` registers it and creates a matching
profile automatically. Until then the **device** builds drop the entitlement,
which changes only the container-wide default: the store still writes every
record with explicit complete file protection and seals it individually.

## Internal versus external

|          | Review                              | Testers                         |
| -------- | ----------------------------------- | ------------------------------- |
| Internal | **None.** No Beta App Review at all | Up to 100, members of your team |
| External | **Beta App Review** required        | Up to 10,000                    |

Internal testing needs nothing from Apple beyond a build. External does, and the
gaps that mattered are now closed:

| Guideline  | Requirement                                            | State                                                       |
| ---------- | ------------------------------------------------------ | ----------------------------------------------------------- |
| 5.1.1(i)   | Privacy policy in App Store Connect **and** in the app | Written, published, linked and summarised in-app            |
| 5.1.1(ii)  | Explicit consent before collecting health data         | Per-request consent sheet, and enforced server-side         |
| 5.1.1(iii) | Collect only what the function needs                   | At most 40 selected values; no image, no identifiers        |
| 5.1.3(i)   | Health data not used for advertising or data mining    | None of either; stated in the policy                        |
| 5.1.3(ii)  | No personal health information in iCloud               | Store excluded from backup. **This was a real defect**      |
| 1.4.1      | Remind users to consult a doctor                       | Shown with every result and under every answer              |
| 1.4.1      | Disclose methodology behind health measurements        | OCR values marked preliminary; printed ranges kept verbatim |

Privacy policy URL, required in App Store Connect metadata:

```
https://ma3u.github.io/MinimumViableHealthDataspacev2/meinbefund/privacy.html
```

## Answers App Store Connect will ask for

- **Export compliance**: the app uses only standard platform cryptography
  (CryptoKit AES-GCM, Keychain, HTTPS). That is normally the exempt answer, but
  confirm it against your own filing.
- **Does the app use encryption?** Yes, exempt.
- **Health data**: collected, stored on device, and shared with the named model
  provider only on the user's per-request instruction.
- **Data used to track you**: none.

## What I would still not claim

The app is positioned to explain rather than interpret, which is what keeps it
outside IVDR (issue #186 §5, MDCG 2019-11). External review may still read an
LLM explaining lab values as closer to the line than the intended purpose says.
If a reviewer pushes back, the answer is the stated intended purpose and the
system prompt that enforces it, not a change of wording after the fact.
