---
title: "German National EUDI Wallet + citizen consent demo (issues #182, #72)"
status: current
owner: ma3u
issue: https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/182
also: https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/72
adr: ../../ADRs/ADR-028-patient-qr-login-eudi-wallet.md
knowledge: ../../knowledge/index.md
journeys: ../../persona-journeys/registration-identification-exchange.md
updated: 2026-09-12
---

The source of the German national EUDI Wallet is public
([announcement](https://www.linkedin.com/posts/our-code-is-open-der-quellcode-der-staatlichen-share-7503100478432452608-Fghg/)),
with an open invitation to experiment and to report security findings. This plans what that
publication actually unblocks for the EHDS Integration Platform, and, just as importantly,
what it does not.

**Scope extended 2026-09-12.** W0–W6 supply the _identity source_; on their own they land a
better login. The demo that login exists for is
[#72](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/72) (the wallet as the citizen's channel into the EHDS) which was pitched but never built. W7–W9 below build it,
and they are the reason W2's Token Status List matters: it is the revocation substrate the
#72 pitch listed as roadmap. The actor map they implement is
[`persona-journeys/registration-identification-exchange.md`](../../persona-journeys/registration-identification-exchange.md).

| Component               | Repository                                                                                                                          | Licence    |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| iOS wallet app          | [`de-eudi-wallet-ios`](https://github.com/german-national-wallet/de-eudi-wallet-ios)                                                | EUPL-1.2   |
| Android wallet app      | [`de-eudi-wallet-android`](https://github.com/german-national-wallet/de-eudi-wallet-android)                                        | EUPL-1.2   |
| Wallet provider backend | [`de-eudi-wallet-backend`](https://github.com/german-national-wallet/de-eudi-wallet-backend)                                        | Apache-2.0 |
| Architecture docs       | [wallet-development-documentation-public](https://bmi.usercontent.opencode.de/eudi-wallet/wallet-development-documentation-public/) | none       |

## The problem this solves

[ADR-028](../../ADRs/ADR-028-patient-qr-login-eudi-wallet.md) shipped patient QR login
(OpenID4VP, `ui/src/lib/eudi-verifier.ts`) against the hosted EU reference verifier, and
recorded an explicit tension: the German sandbox wallet validates the Relying Party against
its own trust list and rejects a request object not signed with our RP access certificate,
so `verifier-backend.eudiw.dev` (which signs with its own X.509) can never serve it. The
ADR closes with four facts we had to **request from the RP owner**: the enforced
`client_id_scheme`, the leaf-cert SAN dNSName, the registered `response_uri`, and the
cross-device trust behaviour.

Three of those four are properties of the wallet's validation code. That code is now public.
The plan's centre of gravity is therefore **W0: read the code, write down the RP contract**,
because every later step is a consequence of it.

## What the mirrors do and do not ship (verified 2026-09-10)

- **Both app repos are read-only mirrors with stripped configuration.** iOS: per-environment
  settings under `Wallet/Config/` are `PLACEHOLDER_*`, `GoogleService-Info.plist` omitted,
  signing/CI/tests removed, explicitly _not_ a reproducible App-Store build. Android: no
  Gradle files, no `settings.gradle.kts`, no convention plugins, and "neither is the single
  class that holds the endpoints" published; it also needs the Governikus-operated Maven
  repository for the AusweisApp2 SDK. Build instructions on both: "coming".
- **Issue tracking and PRs are disabled** on the mirrors, planned for September 2026.
- **The backend is the wallet-provider side, not an issuer or a verifier**: WPB (Wallet
  Instance Attestation), RWSCA (PIN sessions, remote signing, Wallet Trust Evidence), MDVM
  (platform integrity), PNS, and Token Status Lists. Each is its own Spring Boot entry point,
  with a combined application running all of them. Configuration file "coming"; today the
  accepted shape is only readable from the settings classes.

**Therefore:** building the German wallet app and pointing it at our verifier is _not_
achievable today, and no schedule should assume it. (Superseded in part on 2026-09-10,
see W2 and W3, which both landed.) W0/W1/W2 are deliberately independent of
W3 so that the demo advances regardless. The EU reference wallet remains the working path
throughout. This is additive, never a swap.

## Workstreams

### W0: Source recon & RP-contract extraction (actionable now, no infra)

Derive, with a file+line citation for every claim:

1. **Request-object contract**: enforced `client_id_scheme` (`x509_san_dns` vs `x509_hash`),
   accepted deep-link scheme(s) (`openid4vp://`, `haip-vp://`, `eudi-openid4vp://`),
   JAR mode, `request_uri_method`, `response_mode` (`direct_post` vs `direct_post.jwt`).
2. **Query & credential contract**: DCQL vs `presentation_definition`; `mso_mdoc` vs
   SD-JWT VC; the PID doctype and the exact claim paths the wallet will disclose.
3. **Trust validation path**: what the wallet checks an RP against (trust list /
   registration certificate), and whether a dev or test anchor can be supplied at all.

Output: a knowledge concept `docs/knowledge/apis/german-wallet-rp-contract.md` (linked
from `docs/knowledge/index.md`), plus a table in ADR-032 mapping each ADR-028 open item to
_answered from source_ or _still needs SPRIND_.

**Gate G0:** if the enforced scheme or trust-anchor handling makes a self-hosted verifier
impossible without SPRIND-side registration, W1 continues (it is worth having for the EU
wallet and for durability anyway) but W3/W4's German path is parked with the reason recorded.

### W1: Self-hosted verifier `mvhd-eudi-verifier`

The one step that turns ADR-028's config switch into a running thing.

- Deploy `eudi-srv-web-verifier-endpoint-23220-4-kt` as a JAD compose service, configured
  with the RP access certificate (`.p12` → JKS). The public hostname must equal the leaf
  cert's SAN dNSName (`x509_san_dns` requires `response_uri` host == `client_id` host).
- Reconcile the wire format with W0's findings using the **existing** env switches,
  `EUDI_VERIFIER_BASE_URL`, `_SCHEME`, `_PROFILE`, `EUDI_PID_DOCTYPE`,
  `EUDI_REQUEST_URI_METHOD`, `EUDI_RESPONSE_MODE`. `ui/src/lib/eudi-verifier.ts` is already
  fully env-driven: **no application code change is expected**, and a change there is a
  signal that W0 was incomplete.
- ACA: new numbered phase under `scripts/azure/`, env re-assert in
  `.github/workflows/deploy-azure.yml` (per gotcha #6, a deploy must push a new revision).
- Replace the in-memory `sid` store (`ui/src/lib/eudi-store.ts`) with a durable one,
  ADR-028 flagged it as dropping in-flight logins on a revision rollover.

### W2: Wallet provider backend

**Status 2026-09-10: the backend builds and runs.** Mirror commit `2ac3984`; it serves 23
REST endpoints plus the public status-list read surface, against Postgres, with
`/actuator/health/readiness` UP. Runbook:
[`knowledge/runbooks/eudi-wallet-backend-local.md`](../../knowledge/runbooks/eudi-wallet-backend-local.md).

Getting there needed more than a build file, because the mirror publishes `src/main/kotlin`
and a version catalogue and **nothing else**, no build files, no resources, no schema. Five
distinct blockers, each fixed in `services/eudi-wallet-backend/overlay/` and each documented
in the runbook:

| Blocker                                                                                                                  | Fix                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| No build files, no wrapper; catalogue pins Java 25 and foojay auto-provisioning fails behind TLS interception            | `scripts/eudi/build-backend.sh`: curls Temurin 25 + Gradle, supplies both `.kts` files                                          |
| ~40 OpenAPI `*_DOCS`/`*_EXAMPLE` constants referenced by the four `*Api.kt` but never declared                           | per-package `ApiDocsStubs.kt` (delete when upstream ships the originals)                                                        |
| `r2dbc-postgresql` needed at compile time (`toPostgresJson()` signature)                                                 | dependency scope raised from `runtimeOnly`                                                                                      |
| `warden-makoto` needs kotlinx-coroutines 1.11.0; Boot 4.1.1's BOM pins 1.10.2 and wins                                   | managed version override, otherwise `NoSuchMethodError` at bean creation                                                        |
| No `application.yaml`, no Flyway migrations, no `git.properties`, no Android revocation list, all four required to start | derived from the `@ConfigurationProperties` classes, the `@Table`/`@Column`/`@Query` annotations, and the mirror's own git HEAD |

`docker-compose.eudi.yml` runs it as an overlay on the base stack (backend 8081, Postgres
5433, MinIO 9100, shifted off the defaults the JAD stack already holds).

**It signs.** The stack provisions a **software HSM (SoftHSM2)** before the backend starts, so
`build-docs` (which stubs every key lineage and makes each stub throw) is now only a
fallback. Two compose one-shots do it: `wallet-hsm-init` (the backend image) creates both
PKCS#11 tokens, imports four EC signing keys each with a leaf certificate issued under the
matching dev root, and generates the four secret keys; `wallet-certs-init` (`minio/mc`)
uploads the chains to the bucket the lineages read from.

Measured 2026-09-10: all four lineages resolve at startup,

```
AsymmetricSigningLineage : mdvm-attestation: rolled over null -> HsmKeyId(23dc5e30…)
AsymmetricSigningLineage : rwsca-wte-auth:   rolled over null -> HsmKeyId(5aeb9781…)
AsymmetricSigningLineage : statuslist-wpb-wia-auth: rolled over null -> HsmKeyId(5e75ee3d…)
AsymmetricSigningLineage : wpb-wia-auth:     rolled over null -> HsmKeyId(a1fed341…)
```

which means the keys were found, the chains validated to the pinned roots, **and the
proof-of-possession signature verified**: `AsymmetricSigningLineage` signs a random challenge
with the HSM key and checks it against the leaf certificate before adopting it. `/actuator/health`
is `UP` including both HSM indicators, and `POST /v1/wpb/challenge` returns a real signed JWT.

**What this is not:** SoftHSM keeps key material in ordinary files on a Docker volume. It
supplies the PKCS#11 _interface_, not the protection an HSM exists for; the PINs are `1234`
in a committed compose file. Everything it signs is verifiable, which is the point, and also
exactly why none of it should be trusted outside this stack.

Remaining in W2:

- Surface **Token Status List** state in the Trust Center. This is the workstream's real
  payoff: credential revocation becomes visible in the EHDS trust surface rather than
  assumed, which is an EHDS-relevant capability the platform does not have today. The
  `status_list` tables are still empty, nothing has allocated a status entry yet, because
  that happens when WPB issues a Wallet Instance Attestation rather than at registration.
- Drive the wallet past onboarding to a WIA issuance, which is what exercises the status-list
  path end to end.
- The **TLS-interception trap**, which is environmental but cost real time: the simulator has
  its own trust store and does not inherit the Mac's. Behind a corporate MITM proxy every
  outbound HTTPS call from the app fails with `-1200` while `curl` on the host succeeds. Fix
  is `xcrun simctl keychain <device> add-root-cert <corporate-root>.crt`. Same interception
  broke Gradle's foojay toolchain resolver in W2.
- Two findings worth sending upstream once the mirror accepts issues (September): the
  missing OpenAPI-constants file, which makes the published tree not compile at all, and the
  coroutines/BOM conflict, which is a runtime failure rather than a build one. Neither is a
  security finding, by `SECURITY.md`'s own scope, source-only observations are out of scope.

### W3: Wallet app build spike

**Status 2026-09-10: the iOS app builds from source, contrary to the assumption above.**
The mirror ships no build instructions, but the obstacles turned out to be mechanical rather
than missing-code:

- The mirror strips `Modules/*/Tests` and the `logic-test`/`feature-test` packages but leaves
  the SPM manifests referencing them, so the package graph will not resolve.
  `scripts/eudi/patch-ios-spm.py` removes the dangling test targets and dependencies
  (13 of 19 manifests, idempotent).
- Xcode refuses unapproved Swift macro plugins in a non-interactive build; `-skipMacroValidation`
  is required.
- Simulator builds need signing disabled (`CODE_SIGNING_ALLOWED=NO`): the project pins
  SPRIND's development team, which nobody else can sign with.
- `Wallet/Config/WalletDev.xcconfig` is entirely `PLACEHOLDER_*` by design; the mirror says so
  in the file. `scripts/eudi/configure-ios-dev.sh` fills it in and points `WALLET_HOST_URL`
  at the W2 backend. The published file is kept alongside as `.published`.

Two more strips only surface at runtime: `GoogleService-Info.plist` is a hard build input, and
`IDGo.entitlements` is missing, so an unsigned build gets `-34018` on every Keychain call,
cannot create the wallet key, and sits on the splash screen forever. Both are handled by
`scripts/eudi/patch-ios-resources.sh`, and the build is ad-hoc signed rather than unsigned.

**Measured end to end 2026-09-10: the wallet registers.** The app launches on the iOS 26.5
simulator, completes MDVM device registration and WPB registration against the backend, and
reaches onboarding. The database agrees, one `device_account` row (`device_type = IOS`,
`wi_handle` set, not revoked) and one `wpb_account` row.

Two backend-side conditions, both stated plainly in the runbooks: the stack must run with the
provisioned software HSM rather than `build-docs`, and `ALLOW_SKIP_KEY_ATTESTATION=true`,
because a simulator has no App Attest hardware, which disables device attestation entirely
and is acceptable only here.

One config defect of mine surfaced on the way and is worth recording, because it is a trap for
anyone else deriving this config: `MdvmTokenBuilder` stamps the token's `iss` from
`mdvm.issuer` while `MdvmTokenParser` validates it against `mdvm-token.issuer`. Letting those
differ makes WPB reject every token MDVM just issued, with `MDVM_TOKEN_VERIFICATION_FAILURE`.
`application.yaml` now binds one to the other.

This is the point of the exercise: the placeholders mean a source build **cannot** reach the
German deployment, so it can only talk to a backend you run yourself, which is exactly what
W2 now provides.

**Physical device**: `scripts/eudi/build-ios-device.sh` handles the two differences that
cannot be worked around, the bundle id belongs to SPRIND, so a device build ships under the
signer's own (which changes the App Attest identity the backend must accept: `IOS_TEAM_ID` /
`IOS_BUNDLE_IDS`), and a device cannot reach `localhost`, so `WALLET_HOST_URL` and
`WALLET_PUBLIC_URL` become the Mac's LAN address with `NSAllowsLocalNetworking` set. It needs
an Apple ID signed in to Xcode for `-allowProvisioningUpdates`; the script preflights for that
rather than failing ten minutes into a compile.

**Verified on a physical iPhone 2026-09-12** (iPhone 17 Pro, iOS 26.6.2): all four
registration calls returned 200 and the backend stored a **real App Attest attestation**:
`ios_devicecheck_attestation` is populated for the device row and null for the simulator's,
and `MdvmService` only stores that column when it actually verifies an attestation rather
than honouring the skip header. So the genuine hardware-attestation path is exercised, which
is the one thing a simulator can never do.

Reaching that took longer than the build did, and none of it was the wallet: the phone must
be on a network that can route to the Mac. A corporate SSID with client isolation fails even
though both devices are "on the same Wi-Fi" (check `arp -a`: if only the gateway appears,
the network is isolating), USB link-local is refused by iOS for app traffic, and the Mac's
address moves whenever Wi-Fi switches, silently invalidating a build. All three are in the
runbook with their diagnostics.

Android is still untried: it ships no Gradle files at all and needs the Governikus-operated
Maven repository for the AusweisApp2 SDK. Left for later; the iOS path is enough for a demo.

The app is EUPL-1.2 and stays outside this repo, the scripts operate on a clone elsewhere.

### W4: Demo journey & UI

- Wallet chooser on `/auth/eudi-qr` (EU reference ⟷ German), the German entry gated on the
  verifier configuration actually being present.
- Static export: the button and page stay gated on `NEXT_PUBLIC_STATIC_EXPORT`; per ADR-028
  §5 **no mock fixture may fake a successful auth**.
- Tests: unit tests for the chooser and its config gating; E2E journeys **J900–J920**
  (J859 is the current maximum).

### W5: Security contribution loop

`SECURITY.md` on the mirrors is precise and constrains this workstream:

- In scope: the **released application** (Play Store distribution) and its **backend
  endpoints**. Out of scope: **findings from source-code analysis alone**, build-related
  issues, third-party dependency CVEs. Only the latest published release qualifies.
- Safe harbour applies to good-faith research in scope, with reasonable remediation time
  before disclosure.
- **No reporting channel is named yet**: "the bug bounty programme for this project is
  being set up. Until it is live, this document does not yet name a reporting channel."

Operationally: hold any finding privately, file nothing publicly (and note PRs/issues are
disabled on the mirrors anyway), and route in-scope observations through the existing pentest
track (#5, #6) until a channel exists. Reading the code for W0 is _not_ security research and
produces no reportable findings by their own scope definition.

### W6: ADR-032

Next free number (ADR-001…031 taken). Records the German-wallet path, extends ADR-028 rather
than superseding it, and resolves the dangling "wallet options A/B/C" ADR that the issue table
references with no file, the `ADR-022` slot was reused for EDC connector cost
(see `docs/planning/future/eudi-wallet-cluster.md`).

### W7: Actor journeys, roles & personas (#72 foundation)

**Status 2026-09-12: the map is written**, in
[`persona-journeys/registration-identification-exchange.md`](../../persona-journeys/registration-identification-exchange.md).
It covers seven actor groups over both EHDS regimes (citizen, home doctor, insurer (primary use); hospital, scientist, patient community, HDAB/Trust Centre (secondary use))
and for each the registration, identification and data-exchange flow, with a status column
separating shipped from gap.

The finding that reshapes the rest of this plan is in its §0, and it comes from #72's own
fact-check: **Chapter IV secondary use runs on an HDAB data permit plus a citizen opt-out,
not on opt-in consent.** The wallet is therefore the citizen's _verifiable channel to
exercise EHDS rights_ (opt-out, access restriction, access log) and the legal basis only
where consent genuinely is the basis (genetic data, a community registry, primary-use
sharing with a GP). Any screen that shows a researcher asking a patient for permission is
wrong and will be called out by the audience this demo is built for.

Remaining in W7:

- [ ] Keycloak realm: add `HEALTH_PROFESSIONAL` and `INSURER` roles (`jad/keycloak-realm.json`),
      the matching `DEMO_PERSONAS` entries, nav groups, role badge colours, middleware route
      guards. Four new fictional orgs: Praxis Dr. Sommerfeld · AlphaKasse DE (already in
      `journey-config.ts`) · AlphaPatients e.V. · AlphaKammer DE (EAA issuer, not a participant).
- [ ] Seed the three new participants with `did:web` identities and DCP credentials.
- [ ] Extend `PersonaJourneyCards` and `/demo` with the new actors.
- [ ] **Rename the Trust Centres.** `neo4j/seed-trust-center.cypher` ships "RKI Trust Center
      DE" and "RIVM Trust Center NL", both real public institutions, named in the default
      build and on the public Pages site, which the fictional-org policy forbids outside
      `NEXT_PUBLIC_DEMO_TK`. Proposed: **Alpha Trust Centre DE** / **Limburg Trust Centre NL**.
      Touches the seed, `14-trust-center.spec.ts`, and four docs. Tracked here rather than
      folded into a journey change because it rewrites seed identities.

### W8: The consent loop (#72 demo spine)

What #72 pitched and nobody built. Three items, in order, each independently demoable:

1. **Opt-out register + boundary check.** A citizen's Chapter IV opt-out, and a study-scoped
   consent, evaluated **where data leaves the holder** (the extraction and the SPE cohort query) not in a React filter. Today `PatientConsent` is read by `/api/patient/insights`
   and the graph query, which stops nothing. Opt-out and consent stay separate columns;
   conflating them reintroduces the legal error W7 §0 corrects.
2. **Consent EAA issuance.** Granting on `/patient/research` issues a verifiable
   secondary-use consent attestation into the wallet over OpenID4VCI, carrying a status
   reference. The `PatientConsent` node remains the dataspace-side record; the EAA is the
   citizen-side copy they can show, and revoke, without us.
3. **Status-list-backed revocation.** The EAA's status entry lives on the **Token Status
   List** that W2's wallet-provider backend already serves. Revoking (in the wallet or on `/patient/research`) flips the status; the next boundary check fails; the researcher's
   cohort shrinks with an explicit `9 excluded: opt-out` count rather than silently.

This is what makes W2 more than plumbing: ADR-028 and the #72 deck both list revocation as
roadmap, and the status list is the mechanism that retires that caveat. It also settles this
plan's open question about whether a signing-capable local run was worth building. It was;
the status list is the reason.

Two honesty constraints that must survive into the UI copy:

- Revocation stops **future** access and is logged. It does not reach into data already
  loaded in a running SPE session, and no screen may imply that it does.
- The EU reference wallet path stays the working demo throughout; the German wallet is a
  config switch (W4), never a fork of the flow.

### W9: ePA ingest path (re-scoped 2026-09-12)

**Re-scoped by the platform owner**, from a real case: study lab results from the Friede
Springer Cardiovascular Prevention Center at Charité, to be combined with Apple Health trends
and read by a Hausarzt. Two corrections came with it, and both narrow the work:

1. **The GP never logs into this platform.** They read the ePA through their practice system
   over the TI. The exchange point between citizen and GP is the **ePA**, not our portal,
   so the `HEALTH_PROFESSIONAL` role and the `/clinical/*` surfaces are **deferred**, not
   planned. What the platform does instead is work **upstream of the ePA**.
2. **The patient community journey is deferred** to
   [`future/longevity-community-data-sharing.md`](../future/longevity-community-data-sharing.md),
   which keeps the research: there is no cardiovascular Fox Insight, the patient-founded
   registries that exist (FH Europe, Family Heart Foundation / CASCADE FH) serve _genetic_
   high risk, and the people actually pooling this data are longevity communities (Rejuvenation Olympics, Blueprint, the DeSci DAOs) with the data and no credible way to
   donate it.

**The premise:** researchers, labs and hospitals are paper-based today. Lab findings reach the
ePA only from the provider who ordered them (§ 347 SGB V), and a cohort study is not GKV
treatment, so nothing pushes a study result into the ePA, and the **citizen is the only
integration point that exists**.

**The constraint that rules out the obvious design:** a third-party app can write to the ePA
only as a listed **DiGA**, with a productive **SMC-B DiGA**, over `gemSST_CS_ePA_DiGA`, after
the insured authorises it in their ePA frontend (§ 6 DiGAV). That is market access, not an
integration, and it is out of scope. **There is no API for us.**

So the platform becomes a **pre-ePA workbench**: it prepares, the citizen uploads:

- [ ] **Acquire**: a "request the digital original" path before scanning: GDPR Art. 15(3)
      copy + Art. 20 portability against the study centre or lab
- [ ] **Digitise**: scan → OCR → searchable PDF, one document per file
- [ ] **Structure**: extract values to FHIR R4 `Observation`s; target **KBV MIO Laborbefund
      1.0.0** (a FHIR bundle; manufacturer-mandatory expected autumn 2026, gematik integration
      under way since May 2026). The repo already models FHIR R4. This is a new producer, not
      a new data model
- [ ] **Combine**: Apple Health `export.xml` → trend summary (resting HR, HRV, VO2max,
      cuff BP, weight). Summarised, never dumped: the raw export routinely exceeds the ePA's
      **25 MB** ceiling and no GP reads 400,000 XML rows. There is **no** Apple Health ↔ ePA
      bridge in Germany; do not imply one
- [ ] **Emit**, one ePA-ready artefact ≤ 25 MB: readable summary + source scan + the
      FHIR/MIO bundle attached for whoever can parse it. Formats the ePA accepts: PDF, JPEG,
      PNG, TIFF (all converted to PDF)
- [ ] **Hand off**: upload instructions for the insurer app **and** the desktop client
      (AOK / BARMER eCare / TK-Safe / DAK; Windows, macOS, Ubuntu 20.04+; eGK + PIN + card
      reader, or the Web2App QR flow)

**Provenance is the acceptance test.** The ePA marks every document, tamper-proofly, as
uploaded by a practice, the insurer, or the insured, and a GP is under no obligation to adopt
what the insured uploaded. The artefact must therefore distinguish a lab-issued value, an
OCR-transcribed value, and a self-tracked metric. The platform must not be weaker than the
thing it feeds.

Tests: **J940–J959** (ePA ingest). J920–J939 stay with the consent loop; J960–J979 stay with
the insurer; J980–J999 reserved for the deferred community registry.

## Sequencing

```
W0 ──┬──> W1 ──┬──> W4 ──────────┐
     │         │                 │
     └──> W2 ──┴──> W8 ──┬──> demo
                         │
          W7 ──> W9 ─────┘
W3 (upstream-blocked, joins at W4 when unblocked)
W5 (continuous, disclosure-gated)   W6 (after G0, before W4 merges)
```

W0 is the only step on every _identity_ path; **W7 is the only step on every _journey_
path**, and it is done. W8 needs W2's status list (running) and W7's role model. W9 is
parallel to W8 (it shares the roles but not the consent substrate) so the primary-use
half can land while the consent loop is still in flight.

Critical path to the #72 demo: **W7 → W8**, with W2 already in place. The German wallet
(W0/W1/W4) improves the _identification_ step of that demo but does not gate it, the EU
reference wallet serves it today.

## Acceptance criteria

**Identity source (W0–W6)**

- [ ] RP contract documented from source with citations; each ADR-028 open item answered or escalated
- [ ] `mvhd-eudi-verifier` runs in JAD and on ACA; existing OpenID4VP login works against it with zero app-code changes
- [ ] Wallet-provider backend runs locally; status-list state visible in the Trust Center
- [ ] EU reference wallet path unregressed (J319–J322 still green)
- [ ] ADR-032 accepted; gates green, `tsc --noEmit` · eslint · Vitest · coverage ≥ 80%

**Journeys & demo (W7–W9)**

- [x] Seven-actor map documented with registration / identification / exchange per actor, and the
      permit-plus-opt-out correction stated where it governs the design
- [ ] `HEALTH_PROFESSIONAL` and `INSURER` roles exist end to end: realm → session → middleware → nav
- [ ] Trust Centres renamed to fictional organisations; no real org outside `NEXT_PUBLIC_DEMO_TK`
- [ ] A revocation demonstrably stops access **at the boundary**: cohort count drops with an
      explicit exclusion count, and the audit trail shows it, not a UI-side filter
- [ ] A Consent EAA reaches the wallet and its status entry is on the Token Status List
- [ ] The GP journey shows a patient-restricted category as _restricted_, never silently absent
- [ ] The HDAB rejects the insurer's prohibited-purpose application, visible in `/compliance`
- [ ] Static export safe: no fixture fakes a successful auth, a valid consent, or a granted permit
- [ ] J920–J999 green; J859-and-below unregressed

## Out of scope

Certifying as a production Relying Party · issuing German PIDs · exploit development or public
posting of findings · vendoring EUPL-1.2 app code into this repo (read and reference only; the
Apache-2.0 backend is safe to run as a service).

## Open questions

- Can the RP access certificate `.p12` (private key + chain) be exported for RP `13e7eccf-…`?
  Without it W1 serves the EU reference wallet only. `UNKNOWN, held by the RP owner.`
- Does the wallet accept any dev/test trust anchor, or is trust-list membership mandatory?
  Answered by W0.
- ~~Does the published backend run without SPRIND-operated dependencies (attestation services,
  push credentials)?~~ **Answered 2026-09-10: yes.** Firebase/FCM is behind
  `pns.fcm.enabled=false`, Kafka behind `messaging.kafka.enabled=false`, and Google's Android
  attestation-revocation list is fetched by the library itself. Postgres is the only hard
  runtime dependency. The HSM is the real constraint, and `build-docs` stubs it.
- ~~Is a signing-capable local run worth building (SoftHSM2 + provisioned keys + MinIO cert
  chains), or does the demo stay honestly stubbed?~~ **Answered 2026-09-12: yes, and W8 is
  why.** The Token Status List is the revocation substrate for the consent EAA; a stubbed
  signer would make every revocation in the demo unverifiable, which is precisely the claim
  the #72 audience probes hardest.
- Where is the citizen opt-out register authoritative, HDAB-side (the regulation's model) or
  Trust-Centre-side (where the status list already lives)? The demo can run either way; the
  choice decides whether the boundary check is one lookup or two.
  `UNKNOWN, decide at the start of W8, record in ADR-032.`
- Does the GP journey need a real treatment-relationship model, or is an explicit patient
  authorisation enough for the demo? A real model is closer to EHDS; an explicit
  authorisation is one screen and demonstrates the restriction mechanism just as well.
  `UNKNOWN, architect call before W9 starts.`
