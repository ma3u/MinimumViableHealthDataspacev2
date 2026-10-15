# Threat model: Klarbefund, the iPhone app

The hub's threat model is [`threat-model.md`](threat-model.md). This one is
for the app in `clients/ios`, which runs on a person's phone, holds their
laboratory values and sends nothing anywhere unless they say so. Written
2026-10-15 against commit `64737039`; each mitigation names the code or test
that shows it, and `clients/ios/Tests/SharedTests/SecurityPostureTests.swift`
pins the ones that are build settings. STRIDE, as in the hub's model.

## System context

```
   paper report ──camera──▶ ┌──────────────────────────────┐
   lab PDF ──files/share──▶ │ Klarbefund (iOS 26, Swift 6)  │
   Apple Health ──read───▶ │  OCR · coding · AES-GCM store │
                           └──────┬──────────┬────────────┘
                 optional, consent│          │optional, consent
                                  ▼          ▼
                 ┌──────────────────┐   ┌─────────────────────────┐
                 │ EHDS hub         │   │ explanation service      │
                 │ (ADR-049/054/057)│   │ on device by default;    │
                 │ OIDC+PKCE, App   │   │ hosted: Azure OpenAI EU  │
                 │ Attest, Bearer   │   │ data zone, or own key    │
                 └──────────────────┘   └─────────────────────────┘
```

Trust boundaries: the device (Secure Enclave, data protection, app sandbox)
is trusted as Apple provides it. Everything that leaves the device crosses a
boundary and does so only after a consent the person gave for that purpose.

## Assets

| Asset                                   | Where                                        | Why it matters                                         |
| --------------------------------------- | -------------------------------------------- | ------------------------------------------------------ |
| Laboratory values, reports, page images | the store, `ReportStore.swift`               | Art. 9 GDPR health data                                |
| The store key                           | Keychain, `WhenUnlockedThisDeviceOnly`       | decrypts everything above                              |
| Hub tokens (device grant, app token)    | Keychain, `ThisDeviceOnly`, `EHDSConnection` | write access to the person's own hub record            |
| App Attest key                          | Secure Enclave, `DeviceCheck`                | proves a genuine app to the hub when creating accounts |
| Consents and their history              | `Consents.swift`                             | the legal basis for every transfer                     |
| Diagnostics export                      | written on request only, ADR-038             | contains values; must never enter the repository       |

## STRIDE

### Spoofing

| Threat                                                    | Mitigation                                                                                                                           | Status |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| A fake app creates hub accounts or pushes data as the app | Account creation needs an Apple App Attest attestation the hub verifies (ADR-054); every later call carries the app token            | met    |
| A fake hub harvests tokens                                | OIDC discovery from the configured issuer only, PKCE S256, `ASWebAuthenticationSession`; ATS forbids plaintext (`OIDCSession.swift`) | met    |
| A fake explanation service reads values                   | The provider is named in the request the person approves (`CloudConsentSheet.swift`); HTTPS by ATS                                   | met    |
| Someone else at the unlocked phone                        | App lock: Face ID, Touch ID or the passcode before the cover lifts, on by default (`AppLock.swift`, ADR-060)                         | met    |

### Tampering

| Threat                                         | Mitigation                                                                                                            | Status   |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | -------- |
| Stored records altered on disk or over a cable | Each record AES-GCM sealed (authenticated), key in the Keychain; a cable test could not copy stored data              | met      |
| A misread value treated as a laboratory result | Provenance keeps OCR values `preliminary`; only a laboratory's own PDF text layer yields `final` (`Provenance.swift`) | met      |
| A tampered build                               | App Attest proves the app to the hub, not to itself; jailbreak and debugger detection declined with reasons (ADR-060) | accepted |
| A dependency with a backdoor                   | No third-party package at all (`Package.swift`, `project.yml`, `docs/sbom/klarbefund-ios.cdx.json`)                   | met      |

### Repudiation

| Threat                                | Mitigation                                                                                           | Status |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------ |
| "I never consented to that transfer"  | Consent events with time, holder and effective date, revocable, with history (`Consents.swift`)      | met    |
| What was sent cannot be reconstructed | A sync is a FHIR Bundle with a SHA-256 fingerprint the app records (`EHDSConnection.swift`, ADR-057) | met    |

### Information disclosure

| Threat                                     | Mitigation                                                                                                                      | Status   |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Values leave the device without the person | On-device OCR, coding, analysis and export; the only network calls are the two optional ones above, each behind its own consent | met      |
| Backups or iCloud carry the store          | Store excluded from backup; `NSFileProtectionComplete` default; exports and diagnostics written with complete protection        | met      |
| The app switcher shows values              | `PrivacyCover.swift` covers the window when the app is not active                                                               | met      |
| Logs carry values                          | Log lines carry counts and codes only (`Logging.swift`)                                                                         | met      |
| A cloud question identifies the person     | At most 40 values, no name, date of birth or insurance number; the service enforces the same (`CloudAnalysis.swift`, ADR-034)   | met      |
| Transfer to a third country                | Default on device; hosted default Azure OpenAI in the EU data zone; the Anthropic option is opt-in and says "United States"     | partly   |
| Screenshots or screen recording            | Not prevented (iOS allows no reliable block)                                                                                    | accepted |

### Denial of service

| Threat                           | Mitigation                                                                                                                             | Status   |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| The hub is down                  | The app works without the hub; the record is on the device                                                                             | met      |
| A hostile scan floods the parser | Vision and the parser run on bounded images; a degraded scan loses rows, never hangs (`ScanningTests.swift`, `AccuracyBenchmarkTests`) | met      |
| Lost phone                       | Export in four formats for the person to keep; no recovery from the hub by design                                                      | accepted |

### Elevation of privilege

| Threat                                  | Mitigation                                                                                             | Status |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------ |
| Debug entry points in a release build   | `-MBSelfTest`, `-MBDemoSeed`, `-MBShot` are compiled out (`#if DEBUG`)                                 | met    |
| The app writes to Apple Health          | Read-only authorisation (`WearableSource.swift`); pinned by `SecurityPostureTests`                     | met    |
| The app token does more than the record | The hub scopes the token to the sandbox record of that account; `isSandboxUsername` on every app route | met    |

## Residual risks and what closes them

1. **App lock**: decided and implemented 2026-10-15 (ADR-060). (TR-03161 O.Auth)
2. **No tamper or jailbreak detection**: declined with reasons in ADR-060; the sealed store and App Attest are the controls. (O.Resi)
3. **No certificate pinning**: declined with reasons in ADR-060; ATS without an exception domain, managed rotation. (O.Ntwk)
4. **Hosted Anthropic option.** Opt-in, named on screen, but a transfer to the
   United States; the operator needs a transfer basis or must switch it off.
5. **Independent test.** This model and the tests are the project's own. An
   independent penetration test against a release build on a device, and the
   requirement-level TR-03161 gap list, remain open; see
   [`security-test-report-2026-10-15.md`](security-test-report-2026-10-15.md).
