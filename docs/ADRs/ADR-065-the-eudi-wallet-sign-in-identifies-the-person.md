# ADR-065: The EUDI Wallet sign-in identifies the person: HAIP, both PID formats, one record per PID

**Status:** Accepted (2026-10-27)
**Date:** 2026-10-27
**Supersedes:** decision 4 of [ADR-028](ADR-028-patient-qr-login-eudi-wallet.md); refines its decisions 2 and 3
**Relates to:** [ADR-064](ADR-064-simpl-open-through-the-outside-agent-dcp-path.md), #708, #182, #557, #475
**Plan:** [#725](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/725)

## Context

ADR-028 built the wallet sign-in for a hackathon: a PID presented as mdoc,
answered in cleartext, and every verified wallet signed in as `patient1`.
Three things changed:

- **Implementing Regulation (EU) 2026/2099** makes the EUDI Wallet the way
  persons identify for the EHDS, at assurance level substantial from
  26 March 2027 and high from 2030. A sign-in that opens someone else's
  record is not an identification.
- **The wallet stack settled:** OpenID4VP 1.0 with DCQL, and the OpenID4VC
  High Assurance Interoperability Profile (HAIP) 1.0, which requires
  encrypted responses (`direct_post.jwt`). Wallets issue the PID as SD-JWT VC
  (`urn:eudi:pid:1`) and as mdoc (`eu.europa.ec.eudi.pid.1`).
- **The hosted EU reference verifier now refuses a request without a
  relying-party registration certificate** (`MissingRegistrationCertificate`).
  On 2026-10-27 the live start route answered 502 for that reason. The
  verifier offers a public test intended use, `TEST-01`.

## Decision

1. **Ask as HAIP does.** The DCQL query offers the PID as SD-JWT VC or as mdoc,
   whichever the wallet holds; profile `haip`, response mode
   `direct_post.jwt`. Cleartext stays possible only by setting
   `EUDI_VERIFIER_PROFILE=openid4vp` and `EUDI_RESPONSE_MODE=direct_post`.
2. **Name the relying party.** A request carries our own registration
   certificate when `EUDI_REGISTRATION_CERTIFICATE` is set, otherwise the
   verifier's intended use (`EUDI_INTENDED_USE_ID`, default `TEST-01`). Our
   own certificate is the step to the German wallet d-you (#182) and to a
   relying party of our own (#557).
3. **Read the PID, still trust the verifier.** The verifier backend checks
   signatures and key binding (ADR-028, decision 3). The hub reads the claims
   of the presentation it accepted: an SD-JWT VC's disclosures, each of which
   must hash to a digest the issuer signed; an mdoc through the verifier's
   validation utility, which checks it again.
4. **A PID opens one record or none.** It signs in as the patient persona
   whose name it carries (Maria Schmidt, `patient1`; Jan de Vries,
   `patient2`; names pinned against `jad/keycloak-realm.json`). Matching
   ignores case, accents and spaces. A PID that matches nobody is refused
   with 403; there is no fallback patient. Nothing of the PID is stored, and
   the session still shows the record's pseudonym (#475).
5. **The session records its assurance level.** High for a PID, low for a
   Keycloak password and for the simulated wallet on the sign-in page.
   `PATIENT_MIN_ASSURANCE` (`substantial` or `high`) makes `requireAuth()`
   refuse a patient's own session below it. It is unset on the demo, so the
   password personas keep working.

## Consequences

### Positive

- The live QR sign-in works again against the hosted verifier, and works
  with SD-JWT-only wallets.
- A wallet can no longer open a record that is not its holder's.
- The registration certificate switch is the only code-free step left
  between the hub and a self-hosted verifier for d-you.

### Negative

- A tester needs a test PID with a persona's name, issued at the EU
  reference issuer; any other PID is refused.
- Binding by name is a demo rule: the hub has no real persons. A hub with
  real records binds by an identifier the PID provider issues, or links a
  PID once from an authenticated session.
- `TEST-01` is the verifier's certificate, not ours: the wallet shows the
  reference verifier as the relying party until `EUDI_REGISTRATION_CERTIFICATE`
  is set.
- The hosted verifier trusts every PID issuer by default. A deployment for
  real persons runs its own verifier with the PID providers' trust list.

## Alternatives considered

- **Keep `patient1` for every PID.** Contradicts 2026/2099; rejected.
- **Decode mdoc CBOR in the UI.** A new dependency and hand-rolled checks
  the verifier already does; rejected.
- **Enforce substantial now.** Would lock out the password personas the
  demo relies on; the floor is a setting a real deployment turns on.
