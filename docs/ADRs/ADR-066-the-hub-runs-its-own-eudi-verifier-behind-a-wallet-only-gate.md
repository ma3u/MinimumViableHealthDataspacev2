# ADR-066: The hub runs its own EUDI verifier, behind a gate that passes the wallet API only

**Status:** Proposed (2026-10-28)
**Date:** 2026-10-28
**Refines:** decision 2 of [ADR-028](ADR-028-patient-qr-login-eudi-wallet.md) ("verifier engine = the hosted EU reference verifier")
**Relates to:** [ADR-065](ADR-065-the-eudi-wallet-sign-in-identifies-the-person.md), [ADR-036](ADR-036-operator-secrets-in-key-vault.md), #182 (W1), #708

## Context

On 2026-10-28 the manual test of the wallet sign-in (#708) reached the German
wallet. It refused: "This service does not have permission to verify your data."
The hosted EU verifier's event log showed the wallet fetched our request and
sent nothing back. ADR-028 had predicted this: the German wallet trusts a
relying party through its access certificate and registration certificate, and
`verifier-backend.eudiw.dev` signs with the EU's own certificate under its
public `TEST-01` intended use.

d-you goes into production on 2 January 2027. To be trusted by it the hub needs
its own access certificate from the SPRIND sandbox (a CSR was generated on
2026-10-28: P-256, `CN` and SAN `verifier.ehds.mabu.red`), its own registration
certificate, and a verifier that signs requests with them.

The EU's verifier endpoint (`eudi-srv-web-verifier-endpoint-23220-4-kt`,
Apache-2.0) is that verifier. It has two APIs on one port:

- `/wallet/*`: the signed request a wallet fetches, the key it encrypts its
  answer to, and the endpoint it posts that answer to. A wallet must reach it.
- `/ui/*`: starts a transaction and reads the wallet's answer. It has no
  authentication. Whoever can call it can ask any citizen's wallet for their
  PID, signed in the hub's name.

## Decision

1. **Self-host the EU verifier image**, pinned
   (`eudi-srv-verifier-endpoint:v0.12.0`), as `mvhd-eudi-verifier` on Azure
   and as `eudi-verifier` in `docker-compose.eudi.yml`. Client id prefix
   `x509_hash` (HAIP), response mode `direct_post.jwt`, ES256.
2. **Only the wallet API is public.** A gate container (nginx, unprivileged,
   `services/eudi-verifier/`) is the app's ingress and passes `/wallet/*`
   (GET, POST) and nothing else. The verifier's port 8080 is an internal port
   mapping that only apps in the environment reach; the hub calls
   `http://mvhd-eudi-verifier:8080`. No application code changes:
   `ui/src/lib/eudi-verifier.ts` is already driven by `EUDI_VERIFIER_BASE_URL`.
3. **The private key exists in two places only**: the maintainer's Mac, where
   it was generated (`~/.config/mvhd/eudi-rp`, mode 600), and Key Vault
   (`eudi-rp-access-cert-key`, and inside the keystore `eudi-verifier-keystore`).
   Never in the repository, an `.env` file, an image or a disk. The app reads
   the keystore through a Key Vault reference (ADR-036); an init container
   decodes it into an in-memory volume at each start.
4. **The registration certificate is configured on the verifier** as the
   intended use `ehds-patient-sign-in`; the hub asks with
   `EUDI_INTENDED_USE_ID` rather than sending the certificate itself.
5. **One replica.** The verifier keeps transactions in memory.
6. **The switch is a separate step.** The hub keeps the hosted EU verifier
   (and the EU reference wallet keeps working) until the SPRIND certificates
   are in Key Vault and the app answers on `verifier.ehds.mabu.red`.

## Consequences

- d-you can trust the hub once SPRIND has issued the certificates; nothing in
  the hub's code changes for it.
- The EU reference wallet will no longer accept the hub's requests after the
  switch, unless it trusts the SPRIND sandbox chain. Switching back is one
  environment variable.
- An operator holding Key Vault Secrets Officer can extract the key. That is
  the same exposure as every other operator secret (ADR-036).
- The gate is a second container to keep current; its base image is pinned and
  rebuilt by `scripts/azure/19-eudi-verifier.sh` whenever `services/eudi-verifier`
  changes.
- The verifier trusts every credential issuer until
  `VERIFIER_TRUSTVALIDATOR_SERVICEURL` points at a trust list. For a PID that
  is the next gap; it is recorded in #182, not solved here.

## Alternatives rejected

- **Expose the verifier directly.** Its `/ui/*` API would let anyone request
  PIDs in our name.
- **A shared-secret header from the hub, checked by the gate.** Needs a code
  change in `eudi-verifier.ts` and a second secret, for what an internal port
  gives for free.
- **Build our own d-you into TestFlight.** The mirror strips the wallet-provider
  configuration: it could never hold a real German PID, and its trust list
  would be ours, so a pass would prove nothing about d-you.
