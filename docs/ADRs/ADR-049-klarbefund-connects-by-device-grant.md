# ADR-049: Klarbefund connects to a patient's record by a device grant the website starts

**Status:** Accepted (2026-10-04, Matthias Buchhorn)
**Date:** 2026-10-03
**Relates to:** [ADR-044](ADR-044-every-api-route-needs-a-session.md), [ADR-033](ADR-033-lab-report-extraction-pipeline.md), [ADR-034](ADR-034-claude-workload-identity-federation.md)
**Extends:** [ADR-044](ADR-044-every-api-route-needs-a-session.md), by letting three patient routes accept a Keycloak bearer token from one public client as well as a session. No route becomes anonymous.

## Context

#473: the Klarbefund iPhone app (#186) and the patient's record on the hub knew
nothing of each other. A patient signed in on the website should be able to
connect the app by scanning a QR code, without typing a password on the phone.

Every API route needs a session (ADR-044), and a session is a NextAuth cookie
that only a browser holds. The phone needs a credential of its own, and it has
to come from somewhere a patient can see and revoke.

Three ways were weighed (issue #473):

1. **The device grant (RFC 8628), started by the website.** The website asks
   Keycloak for a device authorization on behalf of a public client and shows
   the result as a QR code. The phone polls Keycloak for the token. The patient
   approves on Keycloak's own consent screen, in the browser where they are
   already signed in.
2. **A token the website mints for the phone.** A second token issuer beside
   Keycloak, with its own keys, lifetimes and revocation.
3. **A password on the phone.** It already works for cloud analysis
   (`meinbefund-ios`, ADR-034), but it is not what was asked for.

## Decision

Option 1.

- A public Keycloak client, `klarbefund-app`, has the device authorization grant
  and nothing else: no standard flow, no direct grant, consent required, a
  device code that lives 120 seconds.
- `POST /api/patient/app-pairing` (a `PATIENT` session) starts the device
  authorization and returns the QR code. The QR code carries a
  `klarbefund://connect` link with the hub, the issuer, the device code and a
  pairing id. The device code appears in that link and nowhere else: never in a
  web page's URL, never in a log.
- The phone polls Keycloak's token endpoint itself. No token passes through the
  website.
- Three routes accept `Authorization: Bearer <access token>` from that client,
  through `requireAppToken()` in `ui/src/lib/app-auth.ts`:
  `POST /api/patient/app-devices` (register), `DELETE
/api/patient/app-devices/[deviceId]` (disconnect) and `GET
/api/patient/app/record` (the patient's own record, EHDS Art. 3). The token
  must verify against Keycloak's keys, carry the public issuer, `azp =
klarbefund-app` and the `PATIENT` role.
- A token alone is not enough. Every app call also names a device the patient
  connected (`X-Klarbefund-Device`), and the connection must exist and belong
  to the token's user. **Disconnect** on the patient screen deletes the
  connection, so the phone is refused on its next call, without the hub
  needing Keycloak admin rights.
- Registration also checks that the pairing was started by the same user the
  token names. A QR code from someone else's account cannot connect your
  phone to theirs without both the pairing and the approval being theirs.

## Consequences

- `every-route-needs-a-session.test.ts` counts `requireAppToken(` as a gate.
  The anonymous list does not change.
- The connection lives in Neo4j as `(:AppConnection)`, so it survives a
  restart. The pairing itself lives in memory for its two minutes, as the EUDI
  sign-in transaction does (single replica, ADR-028).
- Keycloak's refresh token is bound to the SSO session, so the phone stays
  connected for as long as that session lives (the realm's maximum), then asks
  for a new scan. `offline_access` would keep it longer; it is left out until a
  patient asks for that, because a credential that outlives the session is one
  more thing to revoke.
- Not done yet, and recorded in #473: DPoP-bound tokens, so a token copied off
  the phone is useless elsewhere; and writing into the record (phase 3).
- Someone who photographs the QR code within its two minutes and polls first
  would get the token once the patient approves. The phone shows the account
  it connected to and asks "Is this you?", and the patient screen lists every
  connected device with Disconnect, so such a connection is visible and can be
  cut. DPoP does not close this race; a shorter lifetime narrows it.
