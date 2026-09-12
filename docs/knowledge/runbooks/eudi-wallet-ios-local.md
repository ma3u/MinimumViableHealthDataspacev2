---
type: runbook
title: German national EUDI wallet iOS app — build it from the mirror and run it on a simulator
description: What the published iOS mirror strips, the four scripts that make it buildable, and how to point a source build at a locally-run wallet backend.
resource: scripts/eudi/build-ios.sh, build-ios-device.sh, patch-ios-spm.py, patch-ios-resources.sh, configure-ios-dev.sh, trust-ca-simulator.sh
tags: [runbook, eudi-wallet, issue-182, ios, xcode]
timestamp: 2026-09-10T00:00:00Z
---

**Licence note first.** The app is **EUPL-1.2** and is deliberately **not** vendored
into this repo. Clone it somewhere else and point `EUDI_IOS_DIR` at the clone; the
scripts here only drive Xcode and write into that clone.

```bash
git clone https://github.com/german-national-wallet/de-eudi-wallet-ios \
  ~/projects/dataspaces/eudi-wallet-de/ios
scripts/eudi/build-ios.sh            # patch, configure, build, install, launch
scripts/eudi/build-ios.sh build      # build only
```

Verified with Xcode 26.6 against the iOS 26.5 simulator SDK.

## Why a naive `xcodebuild` fails, in the order you hit it

The mirror publishes the full app source. What it strips is everything around it:
tests, licensed assets, and every real configuration value. Each strip leaves a
live reference behind, and each reference is a separate failure.

| Failure                                                                                         | Cause                                                                                                                                                                                                                                                                                                                                | Fix                                                                                                                                                             |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `the package at 'Modules/feature-test' cannot be accessed`, 13× `invalid custom path './Tests'` | `Modules/*/Tests` and the `logic-test`/`feature-test` packages are stripped; the SPM manifests still declare them                                                                                                                                                                                                                    | `patch-ios-spm.py` drops the dangling test targets and package deps                                                                                             |
| `Macro "CopyablePlugin" … must be enabled before it can be used`                                | Xcode will not run an unapproved macro plugin non-interactively                                                                                                                                                                                                                                                                      | `-skipMacroValidation`                                                                                                                                          |
| `CustomFonts.swift: 'module' is inaccessible due to 'internal' protection level`                | `logic-ui` declares `resources: [.process("DesignSystem/Resources/EUDI Diatype")]`, the licensed typeface is stripped, so SPM will not synthesise `Bundle.module`                                                                                                                                                                    | `patch-ios-spm.py` creates the directory with a placeholder file so the resource bundle exists again — the fonts stay absent and `registerFont` returns quietly |
| five × `The file "…" couldn't be opened` in Copy Bundle Resources                               | `.env`, `NFC_Scan_iOS.mp4`, `Wallet/Sample/EUDI_sample_data.json` and both `.xctestplan`s are stripped but still listed in the target                                                                                                                                                                                                | `patch-ios-resources.sh` writes honest placeholders                                                                                                             |
| `swift-crypto_Crypto.bundle couldn't be opened`, `Ld … __preview.dylib failed`                  | **`-configuration Debug` does not exist in this project.** The configurations are `DevDebug`/`DevRelease`/`Staging*`/`Sandbox*`. Passing `Debug` splits the build: the SwiftPM package projects use their own `Debug`, the app target falls back to `DevRelease`, and the app then looks for bundles in the wrong products directory | build with `-configuration DevDebug`                                                                                                                            |
| code-signing failures                                                                           | the project pins SPRIND's development team (`RKHWDWUG28`)                                                                                                                                                                                                                                                                            | ad-hoc: `CODE_SIGN_IDENTITY="-" CODE_SIGN_STYLE=Manual DEVELOPMENT_TEAM=""` — **not** `CODE_SIGNING_ALLOWED=NO`, see below                                      |
| `Build input file cannot be found: Wallet/Config/GoogleService-Info.plist`                      | the Firebase config identifies a real project and is omitted                                                                                                                                                                                                                                                                         | `patch-ios-resources.sh` writes a well-formed placeholder                                                                                                       |
| launches, then quits to the home screen                                                         | `FIRInstallations` validates `API_KEY` (39 characters, leading `A`) and raises an uncaught exception on a malformed one                                                                                                                                                                                                              | the placeholder plist uses a syntactically valid key                                                                                                            |
| launches, sits on the splash screen forever                                                     | unsigned ⇒ no `application-identifier` entitlement ⇒ every Keychain / Secure Enclave call fails `-34018` ⇒ `SecureEnclaveController` cannot create the wallet key ⇒ `StartupViewModel.registerWallet()` fails                                                                                                                        | ad-hoc sign with a placeholder `IDGo.entitlements` (the mirror omits that too)                                                                                  |
| `Feature flag refresh failed: DecodingFailure` on every launch                                  | SwiftDotenv throws on a bare `KEY=`                                                                                                                                                                                                                                                                                                  | the `.env` placeholder uses non-empty values                                                                                                                    |

The `Debug`-configuration one is worth remembering: it fails ~35k log lines in,
after everything has compiled and linked, with an error that looks like a broken
dependency rather than a wrong flag.

## The placeholders, and what each one costs

`patch-ios-resources.sh` writes files that are honestly empty rather than faked:

- **`.env`** — required at **runtime**, not just to build: `AnalyticsProvider`
  calls `fatalError("Missing .env file")` when it is absent. `API_KEY` and
  `X_AUTH_API_TOKEN` are written with non-empty placeholder values, because
  SwiftDotenv throws on a bare `KEY=`. API calls therefore carry a meaningless
  key and telemetry export goes nowhere.
- **`IDGo.entitlements`** — the project references it; the mirror omits it.
  Without it there is no Keychain access at all. Written with an ad-hoc
  `LOCALDEV.` prefix that identifies nothing; no profile validates a simulator
  signature.
- **`GoogleService-Info.plist`** — a hard build input. The placeholder is
  well-formed but belongs to no Firebase project, so push notifications do not
  work.
- **`NFC_Scan_iOS.mp4`** — `IssuanceCardView` force-unwraps
  `Bundle.main.url(forResource:)`, so the file must exist or that screen crashes.
  Empty file: the scan animation is blank, nothing else changes.
- **EUDI Diatype fonts** — not restorable, the typeface is licensed. The app
  falls back to system fonts, so it looks wrong but behaves correctly.
- **`EUDI_sample_data.json`, the two `.xctestplan`s** — copy-phase only.

## The configuration is placeholders by design, and that is the point

`Wallet/Config/WalletDev.xcconfig` in the mirror is entirely `PLACEHOLDER_*`, and
the file says why: the real values are deployment endpoints and TestFlight app
ids. The keys are published so the shape is visible; the values are not.

So a source build **cannot** reach the German deployment. It can only talk to a
backend you run yourself — which is why the Apache-2.0 backend matters. Running
`configure-ios-dev.sh` fills the file in and points `WALLET_HOST_URL` at
`http://localhost:8081`, the backend from
[`eudi-wallet-backend-local`](eudi-wallet-backend-local.md). The published file is
kept beside it as `WalletDev.xcconfig.published`, and the script refuses to
overwrite an already-configured file.

xcconfig treats `//` as a comment, so URLs must break the pair with `$()` —
`http:/$()/localhost:8081`. That is upstream's own idiom; see
`BURGERAMT_SERVICE_LINK` in the published file.

There is also a runtime override path: `DebugConfigInteractor` /
`ConfigLogicImpl` let the wallet host URL, PID provider URL and OTLP endpoint be
overridden from inside the app in DEV and SANDBOX builds, so the xcconfig value
is a default rather than a hard binding.

## "Server is currently unavailable" — the Simulator trust store

```
Failed to resolve issuer metadata: OpenID4VCI.CredentialIssuerMetadataError error 0.
```

This one is not the wallet. **The Simulator has its own trust store and does not
inherit the Mac's.** Behind a TLS-intercepting proxy the host trusts the proxy's
root, so `curl` and Safari work while every HTTPS call from an app in the
Simulator fails:

```
NSURLErrorDomain -1200 "A TLS error caused the secure connection to fail."
  NSErrorPeerCertificateChainKey = ("<cert s: issuer.eudiw.dev i: <proxy CA>>")
```

The giveaway is the chain's issuer: a certificate for a public host signed by an
internal CA. Fix:

```bash
scripts/eudi/trust-ca-simulator.sh          # installs the Mac's admin-domain roots
```

then restart the app. **Erasing a simulator wipes the trust store**, so this
needs re-running afterwards.

Same interception broke Gradle's foojay toolchain resolver on the backend side
(`PKIX path building failed`) — see
[`eudi-wallet-backend-local`](eudi-wallet-backend-local.md). Worth recognising
once: it presents completely differently in each toolchain.

## Running it on a physical iPhone

```bash
scripts/eudi/build-ios-device.sh          # patch, sign, build, install
```

Two things about the published project make a device build different from a
simulator build, and neither can be worked around:

**The bundle id is not yours.** `org.sprind.wallet[.dev|.sandbox]` is registered
to team `RKHWDWUG28`; nobody else can sign it. A device build therefore ships
under your own bundle id — which changes the App Attest identity, so the backend
has to be told about it:

```bash
IOS_TEAM_ID=<your team> \
IOS_BUNDLE_IDS=<your bundle id> \
WALLET_PUBLIC_URL=http://<mac LAN ip>:8081 \
  docker compose -f docker-compose.yml -f docker-compose.eudi.yml up -d wallet-backend
```

`ios.integrity.app-id` is the Apple Team ID and `acceptable-bundle-id-list` the
bundle id; a mismatch fails attestation, not registration, so the error points
somewhere unhelpful.

**A device cannot reach `localhost`.** `WALLET_HOST_URL` becomes the Mac's LAN
address, and App Transport Security blocks cleartext to it. The script sets
`NSAllowsLocalNetworking` in `Wallet.plist` — the narrow exception meant for
exactly this, covering private-range addresses and `.local` names and nothing
else. It leaves the mirror's NIAP TLS restriction alone. The original plist is
kept as `Wallet.plist.published`.

`WALLET_PUBLIC_URL` matters as much as `WALLET_HOST_URL`: it is what the backend
stamps into the `iss` of every token it issues. Left at `localhost`, a device
gets tokens naming a host it cannot resolve.

Entitlements differ too. The simulator build uses a literal ad-hoc prefix; a
device build needs `$(AppIdentifierPrefix)$(CFBundleIdentifier)` so the
entitlement matches whichever App ID gets provisioned, so the script writes a
separate `IDGo.device.entitlements`.

### Prerequisite: an Apple ID signed in to Xcode

`-allowProvisioningUpdates` creates the App ID and profile through the developer
portal, which needs an account: **Xcode → Settings → Accounts → + → Apple ID**.
Without one the build fails with `No Accounts: Add a new account in Accounts
settings`, which reads like a project fault and is not one — the script
preflights for it and says so before spending ten minutes compiling.

Also required, and easy to forget: Developer Mode on the device
(Settings → Privacy & Security → Developer Mode), and the device paired.
`xcrun devicectl list devices` shows both.

### The device must be on the same network as the Mac

Obvious in hindsight, invisible in the error. If the phone is on cellular, the
Mac's LAN address is unroutable and the app reports only:

```
StartupViewModel registerWallet(): .networkError URLSessionTask failed with error: The request timed out.
```

after a 60-second wait, with nothing about why. The app's own OpenTelemetry span
gives it away — capture the console with

```bash
xcrun devicectl device process launch --device <id> --terminate-existing --console <bundle-id>
```

and look at the request span's attributes:

```json
"network.connection.type": {"description": "cell"},
"network.connection.subtype": {"description": "NRNSA"},
"http.url": {"description": "http://10.x.x.x:8081/v1/mdvm/challenge"},
"http.status_code": {"description": "0"}
```

`cell` plus `status_code: 0` means it never reached anything.

**USB link-local does not work, so do not spend time on it.** The cable gives the
Mac an `iPhone USB` interface with a 169.254.x address, the phone answers ping on
it in ~2 ms, and the backend serves fine on that address from the Mac — but iOS
will not route _app_ traffic over it. Pointing `WALLET_HOST_URL` at the
link-local address gets

```
wallet registration failed: .networkError — The Internet connection appears to be offline.
"network.connection.type": "cell"
```

That interface is reserved for Xcode/CoreDevice services. The phone genuinely has
to be on a network that reaches the Mac:

- **Personal Hotspot on the iPhone** — the reliable option, and the only one on
  an isolating network. With the USB cable connected, the Mac picks up a
  172.20.10.x address on its `iPhone USB` interface while keeping its normal
  Wi-Fi for internet (Wi-Fi outranks iPhone USB in the service order), and the
  phone can reach the Mac there. `build-ios-device.sh` prefers a 172.20.10.x
  address automatically when one exists.
- **Same Wi-Fi as the Mac** — cleanest when it works, but often it does not.

**Same Wi-Fi is not sufficient.** Managed wireless commonly isolates clients
from each other, so the phone reports `connection.type: wifi` and still times out
with `status_code: 0`. Check the Mac's ARP table:

```bash
arp -a | grep <the Mac's subnet>
```

If the only entries are the gateway and the Mac itself, the network is isolating
and no amount of being "on the same Wi-Fi" will help — use Personal Hotspot.

Watch out for the Mac's address moving under you: it auto-rejoins the corporate
SSID, and each switch changes the address the app was built with. The symptom is
a build that worked ten minutes ago now timing out. Re-run the script; it
re-detects the address every time.

### Verified on a physical device, 2026-09-12

iPhone 17 Pro, iOS 26.6.2 (build 23G90), on a home network with the Mac at
`192.168.178.154`. All four registration calls returned 200:

```
POST /v1/mdvm/challenge     200
POST /v1/mdvm/ios/register  200
POST /v1/wpb/challenge      200
POST /v1/wpb/register       200
network.connection.type: wifi
```

and the backend stored a real attestation:

```
device_type  attested  note
IOS          f         simulator - bypass used, nothing stored
IOS          t         physical device - real App Attest data stored
```

`attested` is `ios_devicecheck_attestation IS NOT NULL`. It is the single most
useful check that the real path ran: `MdvmService.verifyIosDeviceAttestation`
returns `null` — storing nothing — when the skip header is honoured, and only
decodes and stores the attestation when it actually verifies one. A populated
column therefore cannot come from the bypass.

### Attestation is real on a device

An iOS simulator has no App Attest hardware, which is why the demo stack sets
`ALLOW_SKIP_KEY_ATTESTATION=true`. A physical device does not need that, so a
device build is the only way to exercise the real attestation path — turn it
off (`ALLOW_SKIP_KEY_ATTESTATION=false`) once the app installs and registers,
and the MDVM flow is then doing what it does in production.

`allow-app-attest-dev-environment` stays `true`: a development-signed build
produces sandbox attestations.

## What you get

Measured 2026-09-10 — Xcode 26.6, iPhone 17 Pro simulator, iOS 26.5, against the
compose stack from [`eudi-wallet-backend-local`](eudi-wallet-backend-local.md).

**The wallet registers.** It builds, installs, launches, calls
`POST /v1/mdvm/challenge`, completes MDVM device registration and WPB
registration, and reaches onboarding ("Set up wallet loss protection", showing
the revocation key WPB issued). The backend has the rows to match:

```
device_account  1   (device_type = IOS, wi_handle set, revoked_at null)
wpb_account     1
```

Two things had to be true for that, both on the backend side:

- the stack must run **with a provisioned software HSM**, not `build-docs` —
  otherwise every key operation returns 500;
- **`ALLOW_SKIP_KEY_ATTESTATION=true`**, because a simulator has no App Attest
  hardware. Without it, `MdvmService` rejects registration with
  `SKIP_INTEGRITY_CHECKS_NOT_ALLOWED`. This disables device attestation
  entirely — fine for a simulator demo, never anywhere else.

Expected noise, safe to ignore:

- `Keychain: -25300` — `errSecItemNotFound`, nothing stored yet on a given key.
  (`-34018` is the one that means entitlements are missing.)
- `Failed to register for remote notifications` — the simulator has no APNs.
- `Feature flag refresh failed: NetworkError` — `FEATURE_FLAG_BASE_URL` is a
  placeholder host that resolves to nothing.

Android is untried: it ships no Gradle files at all and needs the
Governikus-operated Maven repository for the AusweisApp2 SDK.
