# Klarbefund on TestFlight

## Links

| What                                     | Where                                                                         |
| ---------------------------------------- | ----------------------------------------------------------------------------- |
| App in App Store Connect                 | https://appstoreconnect.apple.com/apps/6811688174                             |
| TestFlight, iOS builds and testers       | https://appstoreconnect.apple.com/apps/6811688174/testflight/ios              |
| App information and privacy policy field | https://appstoreconnect.apple.com/apps/6811688174/distribution/info           |
| Certificates, identifiers and profiles   | https://developer.apple.com/account/resources/certificates/list               |
| App Store Connect API keys               | https://appstoreconnect.apple.com/access/integrations/api                     |
| Privacy policy, live                     | https://ma3u.github.io/MinimumViableHealthDataspacev2/meinbefund/privacy.html |

## What exists now

| Resource                 | Identifier                                                               |
| ------------------------ | ------------------------------------------------------------------------ |
| App record               | `6811688174`, Klarbefund, SKU `MEINBEFUND2026`, primary language en-GB   |
| Bundle ID                | `red.mabu.meinbefund`, portal id `9KXVUG8LAQ`                            |
| Capability               | Data Protection, `COMPLETE_PROTECTION`                                   |
| Distribution certificate | `4429B495JU`, Apple Distribution, expires 2027-09-13                     |
| Provisioning profile     | `MeinBefund App Store`, `c73ad4d7-45d1-4e57-97b3-3d16a795864b`           |
| API key                  | `ML87CK674N`, App Manager. Issuer `2b8e93dd-c6c9-40a9-a198-3028d3d7b944` |
| Archive                  | Release, signed, Data Protection entitlement present                     |

The archive builds. The IPA is one `codesign` run away.

## The two things blocking the upload

Both are environmental. Neither is the app.

### 1. `timestamp.apple.com` is blocked on this network

```
host timestamp.apple.com    resolves to 17.32.213.161
TCP 443                     connection refused
developer.apple.com         200
api.appstoreconnect.apple.com  302
```

DNS resolves and the rest of Apple is reachable, so this is one host being
filtered, which is what a corporate proxy or VPN split-tunnel looks like.
`codesign --timestamp` contacts it and waits forever, which is why three
`xcodebuild -exportArchive` runs appeared to do nothing: they were alive and
stuck inside codesign.

App Store distribution normally expects a secure timestamp, so
`--timestamp=none` is a test rather than a fix.

**What helps:** disconnect the VPN, or run the signing step on a network that
allows `timestamp.apple.com:443`.

### 2. A keychain dialog is waiting for a click

`SecurityAgent` is running, which means macOS is asking permission for
`codesign` to use the distribution private key. A background shell cannot answer
it, so codesign waits.

**What helps:** click **Always Allow** on that dialog. If it has gone, this
grants it permanently, and it needs your login password, so run it yourself:

```bash
security set-key-partition-list -S apple-tool:,apple:,codesign: \
  -s -k "$(read -rsp 'login keychain password: ' p; echo "$p")" \
  ~/Library/Keychains/login.keychain-db
```

## Then

```bash
cd /tmp/claude-502
./package.sh                                   # signs and zips the IPA
xcrun altool --upload-app -f MeinBefund.ipa -t ios \
  --apiKey ML87CK674N \
  --apiIssuer 2b8e93dd-c6c9-40a9-a198-3028d3d7b944
```

`altool` reads the key from `~/.appstoreconnect/private_keys` and needs no Xcode
account, which is what made the API key the right credential for this.

## Internal versus external testers

|          | Review          | Testers              | State                       |
| -------- | --------------- | -------------------- | --------------------------- |
| Internal | none            | up to 100, your team | ready once a build uploads  |
| External | Beta App Review | up to 10,000         | requirements met, see below |

Internal testing has never needed App Review. Once a build is processed, add
yourself under **TestFlight → Internal Testing** and it appears in the app.

For external testing the guideline work is done:

| Guideline  | Requirement                                        | Where                                                  |
| ---------- | -------------------------------------------------- | ------------------------------------------------------ |
| 5.1.1(i)   | Privacy policy in App Store Connect and in the app | URL above; `PrivacySummary` in-app                     |
| 5.1.1(ii)  | Explicit consent before collecting health data     | Per-request sheet, enforced server-side too            |
| 5.1.1(iii) | Collect only what is needed                        | 40 values max, no image, no identifiers                |
| 5.1.3(i)   | No advertising or data-mining use                  | None; stated in the policy                             |
| 5.1.3(ii)  | No personal health information in iCloud           | Store excluded from backup                             |
| 1.4.1      | Remind users to consult a doctor                   | With every result and under every answer               |
| 1.4.1      | Disclose methodology                               | OCR values marked preliminary; printed ranges verbatim |

Paste the privacy policy URL into **App Information → Privacy Policy URL**
before submitting for external review; App Store Connect requires it there and
not only in the app.

### Export compliance

Standard platform cryptography only: CryptoKit AES-GCM, Keychain, HTTPS. That
is normally the exempt answer. Confirm against your own filing.

### One thing I would not claim

The app is positioned to explain rather than interpret, which is what keeps it
outside IVDR (issue #186 §5, MDCG 2019-11). A reviewer may still read an LLM
explaining lab values as nearer that line than the stated intended purpose. If
so, the answer is the intended purpose and the system prompt that enforces it,
not a change of wording afterwards.
