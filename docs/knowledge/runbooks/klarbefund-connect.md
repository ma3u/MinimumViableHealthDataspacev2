# Runbook: Connect to EHDS (Klarbefund and the patient screen)

#473, [ADR-049](../../ADRs/ADR-049-klarbefund-connects-by-device-grant.md). The Klarbefund
iPhone app connects to a patient's record by scanning a QR code on
`/patient/profile`. The website starts an OAuth 2.0 device grant (RFC 8628) for
the public Keycloak client `klarbefund-app`, the patient approves on Keycloak's
consent page, and the phone polls Keycloak for its token.

## Parts

| Part                             | Where                                                                                             |
| -------------------------------- | ------------------------------------------------------------------------------------------------- |
| Keycloak client `klarbefund-app` | `jad/keycloak-realm.json`; a running realm gets it from `scripts/azure/wire-klarbefund-client.sh` |
| Pairing (Neo4j, 2 min + 5 grace) | `ui/src/lib/app-pairing.ts`, `POST /api/patient/app-pairing`, `GET /api/patient/app-pairing/{id}` |
| The app's token check            | `ui/src/lib/app-auth.ts` (`requireAppToken`)                                                      |
| Connected phones (Neo4j)         | `ui/src/lib/app-connections.ts`, `(:AppConnection)`, `/api/patient/app-devices`                   |
| The record for the phone         | `GET /api/patient/app/record`, a FHIR R4 Bundle                                                   |
| The website card                 | `ui/src/components/ConnectAppCard.tsx`                                                            |
| The app                          | `clients/ios/Sources/Shared/EHDSConnect.swift`, `EHDSConnection.swift`, `ConnectView.swift`       |

## Set up

The realm file is imported only when the realm is created, so an existing
Keycloak needs the client added:

```bash
./scripts/azure/wire-klarbefund-client.sh --local   # compose stack, localhost:8080
./scripts/azure/wire-klarbefund-client.sh           # Azure, auth.ehds.mabu.red (Key Vault admin password)
./scripts/azure/wire-klarbefund-client.sh --check   # report only
```

It ends by asking the device endpoint for a code, so a green run proves the
grant answers. Neo4j needs the constraint from `neo4j/init-schema.cypher`
(`app_connection_device`); `MERGE` works without it, but two phones could then
race to one device id.

## An account the app creates (ADR-054)

Without a QR code: **More › Connect to EHDS › Create an EHDS account**. The app
asks the hub for a challenge, has Apple attest a new Secure Enclave key over
`SHA256(challenge|deviceId)`, and posts the attestation to
`POST /api/app-accounts`. The hub verifies it (`ui/src/lib/app-attest.ts`),
creates the Keycloak user `kb-xxxxxxxx` in the group `klarbefund-patients`
through the service account `ehds-account-service`, an empty
`(:Patient {id: "KB-XXXXXXXX", sandbox: true})` and the phone's connection, and
answers the password once. The app keeps it in the Keychain, shows it, and
signs in with the password grant of the public client `klarbefund-account`,
again by itself whenever a session ends. **Delete account** calls
`DELETE /api/patient/app/account`.

Set up a running realm and, on Azure, `mvhd-ui`'s
`KEYCLOAK_ACCOUNT_SERVICE_SECRET` (a Key Vault reference):

```bash
./scripts/azure/wire-klarbefund-accounts.sh --local   # compose stack
./scripts/azure/wire-klarbefund-accounts.sh           # Azure
./scripts/azure/wire-klarbefund-accounts.sh --check
```

The compose UI needs `KEYCLOAK_ACCOUNT_SERVICE_SECRET=dev-account-service-secret`
(the realm file's development secret). The simulator cannot attest; there the
account flow runs only under `-MBDemoSeed` (`AccountUITests`).

## Check it

```bash
NEXTAUTH_SECRET=<the UI's secret> ./scripts/check-klarbefund-connect.sh http://localhost:3000
```

Pairing, approval (as the seeded test patient), token, registration, record,
disconnect, and the refusal after it. Local only.

The app side, against the same stack, with the real app in the simulator:

```bash
cd clients/ios && xcodegen generate
xcodebuild build-for-testing -project MeinBefund.xcodeproj -scheme MeinBefund \
  -destination "platform=iOS Simulator,name=iPhone 17 Pro" CODE_SIGN_IDENTITY=- CODE_SIGNING_REQUIRED=YES
# create a pairing and approve it (steps 1 and 2 of the check script), then:
TEST_RUNNER_KLARBEFUND_LINK='<appLink>' xcodebuild test-without-building ... \
  -only-testing:MeinBefundUITests/LiveConnectUITests
```

A debug build trusts `http://localhost:3000`, `:3003` and `:3021` with the
issuer `http://localhost:8080/realms/edcv`; a release build trusts only
`ehds.mabu.red` with `auth.ehds.mabu.red`.

## Gotchas found building it

- **No `sub` in the token.** The realm defines its client scopes without
  Keycloak's `basic` scope, so access tokens carry `preferred_username` but no
  `sub` (Keycloak 26.6.4). The hub identifies the user by the login name, as
  `ownPatientIdForSession()` already did.
- **A client description over 255 characters** makes the admin API answer 500
  (`value too long for type character varying(255)`), and would break a fresh
  realm import the same way.
- **The pairing map lives on `globalThis`.** `next dev` loaded the module once
  per route, so the status route answered 404 for a pairing the start route had
  just made.
- **Keycloak answers with URLs on the host it was asked on.** Inside compose
  that is `keycloak:8080`, so the approval link is rewritten to the public URL
  (`toPublicUrl`).
- **iOS asks before following `klarbefund://`.** A prompt left from an earlier
  `simctl openurl` opens that older, expired link when tapped. The app now keeps
  a working connection when a bad link arrives later, and says so in a notice.
- **`XCUIApplication.open(_:)` relaunches the app**; `XCUIDevice.shared.system.open(_:)`
  hands the link to the running one.

## Not done yet

DPoP-bound tokens, writing a scanned report into the record (phase 3), and
research and consent sync (phase 4). Tracked in #473.
