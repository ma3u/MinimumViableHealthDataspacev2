# ADR-054: Klarbefund creates a sandbox account on the hub, gated by App Attest

**Status:** Proposed
**Date:** 2026-10-04
**Relates to:** [ADR-049](ADR-049-klarbefund-connects-by-device-grant.md), ADR-050 (#477), #473
**Extends:** [ADR-044](ADR-044-every-api-route-needs-a-session.md), by adding two routes that answer without a session: one hands out a challenge, the other creates an account only for a request that proves, through Apple's App Attest, that it comes from the genuine Klarbefund app on a real device. [ADR-049](ADR-049-klarbefund-connects-by-device-grant.md) is unchanged: the QR code still connects an existing account, with Keycloak's consent screen.

## Context

The TestFlight beta (ADR-050, #477) admits up to 200 testers who have no account on
the hub. The QR code of ADR-049 needs a patient already signed in on the
website, and the hub has two demo patients, `patient1` and `patient2`, which
every tester would share. A tester's own scans must never land in a
synthetic patient's record (#473, open question 4).

So the app has to be able to create an account by itself, and an account
creation that anyone on the internet can call is an invitation to fill the
realm. Three limits were weighed:

1. **A rate limit and an expiry.** Cheap, but anyone with `curl` gets the
   per-address quota.
2. **An invite code** in the TestFlight notes. Keeps strangers out until the
   code is shared once.
3. **App Attest.** iOS signs a key generated in the Secure Enclave with a
   certificate chain to Apple's App Attestation Root CA, binding it to this
   team and bundle id and to a challenge from the hub. A script cannot
   produce one; a real device running a build signed by this team can.

## Decision

**App Attest, with a rate limit behind it.** The chosen option of the three,
plus the cheap limit as a second line.

- `POST /api/app-accounts/challenge` answers a challenge: an expiry, random
  bytes and an HMAC over both, keyed by the hub's secret. Nothing is stored,
  so any replica can check it (the in-memory pairing of #511 is the lesson).
- `POST /api/app-accounts` takes the challenge, the App Attest key id and its
  attestation, and the phone's device id. The hub verifies the attestation as
  Apple specifies: the chain to the pinned root, the nonce
  `SHA256(authData ‖ SHA256(challenge|deviceId))` in the leaf certificate,
  the key id as the hash of the leaf's public key, the relying party
  `38R8Z4P7S8.red.mabu.meinbefund`, a counter of zero, and the AAGUID of the
  development or the production environment. A key id creates one account,
  ever.
- The account is a Keycloak user `kb-xxxxxxxx` with a generated password, in
  the group `klarbefund-patients` (role `PATIENT`), created through a service
  account (`ehds-account-service`, `manage-users` only). Its record is an
  empty sandbox, `(:Patient {id: "KB-XXXXXXXX", sandbox: true})`, mapped from
  the login name the way `patient1` maps to `P1`. The phone is connected in
  the same request, so no QR code is needed.
- The response carries the username and password once. The app keeps them in
  the Keychain (`ThisDeviceOnly`) and shows them, so the person can sign in on
  the website as well.
- The app signs in with them through a second public client,
  `klarbefund-account`, which allows the password grant and nothing else.
  `klarbefund-app` keeps its consent screen: Keycloak refuses the password
  grant for any client that requires consent, and a person who just created
  an account in the app has nothing left to consent to. `requireAppToken()`
  accepts a token from either client.
- `DELETE /api/patient/app/account` (app token and connected device) deletes
  the Keycloak user, the sandbox record, the connection and the key's record.
  It refuses any login that is not a sandbox account. App Store guideline
  5.1.1(v) requires deletion in the app wherever an app creates an account.
- 5 accounts per address and 100 in all per hour, in memory per replica, as a
  second line behind the attestation.

## Consequences

- Testers have a record of their own, empty until phase 3 of #473 lets the
  app add to it.
- The hub carries a pinned Apple root certificate (valid until 2045) and a
  hand-written CBOR and certificate check, about 200 lines with tests, rather
  than a dependency for one verification.
- The simulator cannot attest, so the account flow is tested there with the
  demo transport only, and on a real phone against the live hub.
- Sandbox accounts are not deleted by the hub on their own. A sweep for
  accounts unused for 30 days is left for when the beta has testers.
- A new anonymous route still needs a superseding or extending ADR (ADR-044);
  this is that ADR for these two.
