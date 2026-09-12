---
type: runbook
title: German national EUDI wallet backend — build and run it locally
description: How to build the published Apache-2.0 wallet-provider backend from its mirror, what the mirror does not ship, and how to boot it against Postgres for the issue #182 integration demo.
resource: services/eudi-wallet-backend/, scripts/eudi/, docker-compose.eudi.yml, vendor/eudi-wallet-backend (gitignored)
tags: [runbook, eudi-wallet, issue-182, backend, kotlin, spring-boot]
timestamp: 2026-09-10T00:00:00Z
---

**What this gets you:** the German national wallet's WPB, RWSCA, MDVM, PNS and
status-list services running in one process against a local Postgres, serving
23 REST endpoints and an OpenAPI document. Wallet-**provider** side only — this
is not a verifier and does not close the RP-side gap in ADR-028. See
`docs/planning/current/issue-182-german-national-wallet-integration.md`.

## Quickstart

```bash
scripts/eudi/gen-dev-certs.sh   # four self-signed dev roots (required)
docker compose -f docker-compose.yml -f docker-compose.eudi.yml up -d wallet-backend
#   depends_on pulls in postgres, minio, the HSM provisioning and the cert
#   upload, in that order. Naming the service keeps the base stack out of it.
curl -s localhost:8081/actuator/health          # {"status":"UP"} - all components
curl -sX POST localhost:8081/v1/wpb/challenge \
  -H 'Content-Type: application/json' -d '{}'   # a real signed JWT
open http://localhost:8081/swagger-ui.html
```

`scripts/eudi/build-backend.sh bootJar` builds the same jar on the host (it
fetches JDK 25 and Gradle itself) when you want to iterate without the image.

Verified 2026-09-10: the image builds from the mirror in ~7 minutes, the
container reports `healthy`, Flyway applies the schema on first start, and the
stack comes up **signing** — `docker-compose.eudi.yml` provisions a software HSM
first, so `build-docs` is not used. Set `SPRING_PROFILES_ACTIVE=build-docs` on
`wallet-backend` to fall back to the stubbed profile.

To iterate faster, skip the image and run the jar on the host against the
compose Postgres — that is what the env block in `docker-compose.eudi.yml`
mirrors.

One container gotcha worth keeping: `/bin/sh` in `eclipse-temurin:*-jre` is
dash, which has no `/dev/tcp`, and the image carries no curl or wget — so the
`HEALTHCHECK` probes with `/bin/bash`. With `sh` it fails as
`cannot create /dev/tcp/127.0.0.1/8080: Directory nonexistent` and the container
sits `unhealthy` while serving perfectly well.

## The mirror does not ship a buildable project

`github.com/german-national-wallet/de-eudi-wallet-backend` publishes
`src/main/kotlin` (123 files, ~11.4k LOC) and `gradle/libs.versions.toml`. It
ships **no** `settings.gradle.kts`, `build.gradle.kts`, wrapper, or
`src/main/resources`. Its README says "Configuration file is coming".

`services/eudi-wallet-backend/overlay/` supplies the missing half. Everything in
it is derived from the published source, not invented:

| Overlay file                                              | Why it exists                                                                                                                                                 |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `settings.gradle.kts`, `build.gradle.kts`                 | No build files are published. Dependencies are the catalogue entries the source actually imports.                                                             |
| `src/main/kotlin/**/ApiDocsStubs.kt`                      | `WpbApi`/`RwscaApi`/`MdvmApi`/`PnsApi` reference ~40 OpenAPI description and example constants the mirror never declares. Without them `compileKotlin` fails. |
| `src/main/resources/application.yaml`                     | Read off the `@ConfigurationProperties` classes, which is where the README says the contract lives.                                                           |
| `src/main/resources/db/migration/V1__init.sql`            | Seven tables, derived from the `@Table`/`@Column` annotations and the literal SQL in the `@Query` methods.                                                    |
| `src/main/resources/android/certificate-revocations.json` | `AndroidIntegrityConfig` defaults to this classpath resource and `MakotoConfiguration` opens it eagerly.                                                      |

`build-backend.sh` copies only the two `.kts` files into the checkout (Gradle
insists they sit at the project root) and points the build at the rest in place
with `-PwalletBackendOverlay=`, so `vendor/eudi-wallet-backend/` stays a
verbatim mirror (ADR-005).

## Five things that stop it starting, in the order you hit them

1. **No JDK 25, and Gradle cannot fetch one.** The catalogue pins `java = "25"`
   and Gradle's foojay resolver fails behind a TLS-intercepting proxy
   (`PKIX path building failed`). `build-backend.sh` curls Temurin 25 into
   `vendor/tools/` and passes `JAVA_HOME` explicitly.
2. **`Unresolved reference 'postgresql'`.** `shared/json/KotlinSerializationConfig.kt`
   puts `io.r2dbc.postgresql.codec.Json` in the signature of `toPostgresJson()`,
   so `r2dbc-postgresql` is a compile dependency, not `runtimeOnly`.
3. **`NoSuchMethodError: BuildersKt.runBlockingK`** while building the `makoto`
   bean. `warden-makoto` 1.1.3 pulls `indispensable` 3.26.0, which needs
   kotlinx-coroutines **1.11.0**; Spring Boot 4.1.1's BOM pins 1.10.2 and the
   BOM wins. The overlay raises `kotlin-coroutines.version`.
4. **`No apps configured`.** `MakotoConfiguration` maps
   `android.integrity.expected-package-names` straight onto
   `AndroidAttestationConfiguration.applications`, which rejects an empty list.
   The overlay configures one entry that matches no real build; set
   `ANDROID_PACKAGE_NAME`/`ANDROID_SIGNER_FINGERPRINT` to accept a real one.
5. **`required a bean of type 'GitProperties'`.** `TelemetryResponseHeaderFilter`
   puts `gitProperties.shortCommitId` in the `X-Service-Version` header. The
   overlay generates `git.properties` from the mirror's own checkout, so that
   header reports the upstream commit that is actually running.

## The `build-docs` profile: booting with no HSM at all

Every signing key lives in a PKCS#11 HSM behind an `AsymmetricSigningLineage` or
`SymmetricKeyLineage`. The `build-docs` profile replaces all of them with stubs
and installs a `BuildDocsHsmProvider` whose every call raises _"HSM is not
available in the build-docs profile"_.

So under `build-docs`, measured 2026-09-10:

- the service starts, serves, talks to Postgres, and publishes its full OpenAPI
  document;
- `/actuator/health` reports **DOWN**, because the `hsm` and `rwscaWiHsm`
  indicators are DOWN by design. `/actuator/health/readiness` is **UP** and is
  the probe to use — the container `HEALTHCHECK` uses it;
- **every endpoint that touches a key returns 500.** `POST /v1/wpb/challenge`
  gives `{"code":"INTERNAL_SERVER_ERROR"}` with
  `IllegalStateException: HSM is not available in the build-docs profile` in the
  log. That is not a misconfiguration — it is what the profile is.

Be precise about what this mode is good for: routing, request binding, schema,
persistence, and the OpenAPI contract. It is **not** good for registering a
wallet instance, and a wallet app pointed at it fails at the first authenticated
call.

It is the fallback, not the default: the compose stack provisions a software HSM
and runs without it.

Certificates: `StatusListConfiguration` reads and `checkValidity()`s each pool's
root cert **eagerly in the constructor**, so the four certs must exist even
under `build-docs`. `gen-dev-certs.sh` writes them to a git-ignored directory;
they are throwaway local anchors.

## The software HSM (SoftHSM2) — what makes it sign

Every signing key lives behind PKCS#11. `scripts/eudi/gen-dev-certs.sh` makes the
four dev roots; `services/eudi-wallet-backend/provision-hsm.sh` then does the
rest inside the container, driven by two compose one-shots:

| Service             | Image       | Does                                                                                                                                           |
| ------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `wallet-hsm-init`   | the backend | creates both SoftHSM tokens, imports the four signing keys with a leaf certificate each, generates the four secret keys, writes the PEM chains |
| `wallet-certs-init` | `minio/mc`  | uploads those chains into the `wallet-certs` bucket                                                                                            |

`wallet-backend` waits for both (`service_completed_successfully`).

### The contract the provisioning has to satisfy

Read off `shared/keyrollover` and `shared/hsm`, because nothing documents it:

- `AsymmetricSigningLineage.initialize()` scans the token for **EC private keys
  whose `CKA_LABEL` starts with the lineage's key prefix**. `CKA_ID` must be
  non-empty — `HsmKey.from` returns `null` without it and the key is invisible.
- For each candidate it fetches a PEM chain from S3 at
  **`<slotLabel>/<label minus the -prvk suffix>.pem`** (`HsmKey.certObjectKey`)
  and validates it to that lineage's pinned root.
- Then it **signs a random challenge with the HSM key and verifies it with the
  leaf certificate's public key**. The HSM key and the published leaf must be
  the same keypair, or startup fails.
- `CKA_START_DATE` / `CKA_END_DATE` are left unset on purpose: `HsmKey.from`
  falls back to `LocalDate.MIN`/`MAX`, so a dev key never expires and never
  needs a rollover run.

Eight objects across two tokens:

| Token       | Object                         | Class          | Prefix / root     |
| ----------- | ------------------------------ | -------------- | ----------------- |
| `wallet`    | `wpb-wia-auth-prvk`            | EC private     | `wpb-wia-root`    |
| `wallet`    | `rwsca-wte-auth-prvk`          | EC private     | `rwsca-wte-root`  |
| `wallet`    | `mdvm-attestation-prvk`        | EC private     | `mdvm-root`       |
| `wallet`    | `statuslist-wpb-wia-auth-prvk` | EC private     | `statuslist-root` |
| `wallet`    | `challenge-symk`               | generic secret | —                 |
| `wallet`    | `rwsca-pin-symk`               | generic secret | —                 |
| `wallet`    | `rwsca-aead-symk`              | AES-256        | —                 |
| `wallet-wi` | `rwsca-master`                 | AES-256, wrap  | —                 |

`rwsca-master` is in the **second** token: `RwscaKeyProvider` takes it from the
`RWSCA_WI_HSM_PROVIDER` qualifier, i.e. `rwsca.wi-slot`, not the default slot.

### Three traps worth knowing

- **`pkcs11-tool --token-label` is not honoured** by the build in this image.
  With two tokens present it silently used the first slot, so objects landed in
  the wrong token and the lineages could not find them. The script resolves the
  slot id from the label and passes `--slot`.
- **`openssl x509 -CAcreateserial` writes `<ca>.srl` next to the CA certificate**,
  and the dev-cert directory is mounted read-only. Pass `-CAserial` into a temp
  directory.
- **Named volumes arrive owned by root** unless the image pre-creates the mount
  point with the right ownership, and the container runs as uid 10001. Without
  the `mkdir`+`chown` in the Dockerfile, provisioning fails with
  `mkdir: Permission denied`.

### What it is not

SoftHSM keeps key material in ordinary files on a Docker volume. It provides the
PKCS#11 _interface_, not the protection an HSM exists for. Everything it signs is
verifiable — which is the point, and also exactly why none of it should be
trusted outside this stack. The PINs are `1234` in a committed compose file.

The dev stack also sets **`ALLOW_SKIP_KEY_ATTESTATION=true`**, because an iOS
simulator has no App Attest hardware: without it `MdvmService` rejects
registration with `SKIP_INTEGRITY_CHECKS_NOT_ALLOWED`. That disables device
attestation entirely — the backend registers any client that asks, with no proof
it is a genuine wallet on genuine hardware.

## What is actually served

23 endpoints — `/v1/wpb/{challenge,register,attestation,revoke,deleteAccount}`,
`/v1/rwsca/{challenge,register,initializePinAndStartPinSession,startPinSession,createKeys,signData,deleteAccount}`,
`/v1/mdvm/{challenge,android/register,android/renewal,ios/register,ios/renewal,deleteAccount}`,
`/v1/pns/{challenge,register,delete}`, and the public status-list read surface
`/status-lists/{segment}/{poolId}/{listId}` plus `/aggregation`.

Ports: **8081** backend, **5433** Postgres, **9100/9101** MinIO — all shifted
off the defaults because the JAD stack already holds 8080 and 5432.

## Gotchas

- The mirror is one-way and read-only; issue tracking is not enabled on it.
  Findings go through `SECURITY.md`, not a public issue. Hold anything
  security-relevant privately (issue #182 constraint).
- `Invocation of close method failed on bean 'ioDispatcher'` on shutdown is
  upstream calling `close()` on `Dispatchers.IO`. Harmless, cosmetic.
- `mdvm-token.issuer` must equal `mdvm.issuer`. `MdvmTokenBuilder` stamps `iss`
  from the first and `MdvmTokenParser` checks it against the second, so a
  mismatch makes WPB reject every token MDVM just issued, with
  `MDVM_TOKEN_VERIFICATION_FAILURE`. `application.yaml` binds one to the other.
- Editing anything under `overlay/` invalidates the Gradle layer, so an image
  rebuild is ~7 minutes even for a one-line config change. Iterate by running
  the jar on the host and rebuild the image once at the end.
- Bumping the mirror re-runs the derivation: if a new `@Column` or a new
  `@ConfigurationProperties` field appears, `V1__init.sql` and
  `application.yaml` need the matching edit. There is no upstream schema to
  diff against.
