---
type: runbook
title: Self-hosted EUDI verifier, from SPRIND certificates to d-you signing in
description: Run the EU verifier endpoint with our own access certificate behind a gate that passes the wallet API only, locally and on Azure, and switch the hub to it.
resource: services/eudi-verifier/, scripts/eudi/make-verifier-keystore.sh, scripts/azure/19-eudi-verifier.sh, docker-compose.eudi.yml
tags: [runbook, eudi-wallet, issue-182, issue-708, verifier, key-vault]
timestamp: 2026-10-28T00:00:00Z
---

Why it exists and what it may expose: [ADR-066](../../ADRs/ADR-066-the-hub-runs-its-own-eudi-verifier-behind-a-wallet-only-gate.md).
In short: d-you refuses the hosted EU verifier, so the hub runs that same
verifier with its own certificates, and only `/wallet/*` is public.

## Where each piece lives

| Piece                                             | Where                                                                                                                         | Secret                     |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| Private key (P-256)                               | `~/.config/mvhd/eudi-rp/access-cert.key` on the maintainer's Mac; Key Vault `eudi-rp-access-cert-key`                         | yes                        |
| CSR                                               | `~/.config/mvhd/eudi-rp/access-cert.csr`                                                                                      | no                         |
| Access certificate (from SPRIND)                  | next to the key, as you download it                                                                                           | no                         |
| Keystore and its password                         | `~/.config/mvhd/eudi-rp/keystore.p12`, `keystore.pass`; Key Vault `eudi-verifier-keystore`, `eudi-verifier-keystore-password` | yes                        |
| Registration certificate (JWS)                    | Key Vault `eudi-verifier-registration-certificate`                                                                            | no, but kept with the rest |
| Client id (`x509_hash` of the access certificate) | Key Vault `eudi-verifier-client-id`                                                                                           | no                         |
| SPRIND portal login                               | your password manager                                                                                                         | yes                        |

None of these go in the repository or in an `.env` file. An `.env` file may
carry the public values (client id, intended use id), never the key, the
keystore or its password.

## Locally, with a dev certificate

```bash
scripts/eudi/make-verifier-keystore.sh --dev
docker compose -f docker-compose.yml -f docker-compose.eudi.yml up -d eudi-verifier-gate
cd ui && EUDI_VERIFIER_BASE_URL=http://localhost:8092 \
  EUDI_INTENDED_USE_ID=ehds-patient-sign-in npm run dev
```

- `127.0.0.1:8092` is the verifier itself, the hub's side.
- `:8093` is the gate, the wallet's side: `/wallet/*` and `/healthz` answer,
  everything else is 404.
- 8090 is taken by the JAD stack's Traefik, 8081 by the wallet backend.

No wallet trusts the dev CA, so this proves the wiring, not a wallet scan.
Checked on 2026-10-28:

- the hub-side start answers 200;
- the signed request verifies against the dev CA and carries the registration
  certificate;
- `POST /ui/presentations` through the gate answers 404.

## On Azure, once SPRIND has issued the certificates

Issued on 2026-10-28 for relying party `13e7eccf-…` ("Hackathon - Web"): access
certificate `8B6F08D765A5552EE212477B26D03E98` (to 2027-10-28) and registration
certificate `098c9530-86f7-471e-aac5-427d5b741be7`, both under
`CN=German Registrar` (`https://sandbox.eudi-wallet.org/api/ca.der`). Three
things the registrar decides, not the CSR:

- It sets the subject (`CN=Hackathon - Web`, `organizationIdentifier=LEIXG-HEALTHDATASPACE`)
  and puts only the support URL in the SAN. With no DNS name the client id is
  `x509_hash`; `x509_san_dns` is not possible.
- It refuses an access certificate (400) until the organisation has a privacy
  policy URL and a support URL.
- A registration certificate takes one format per attestation. Ours is
  `dc+sd-jwt` `urn:eudi:pid:de:1` only, so the hub must not offer mdoc to d-you.

Steps 4 and 5 need registry rights the maintainer does not have: run them as
the CI identity with the **EUDI verifier** workflow
(`.github/workflows/eudi-verifier.yml`, mode `apply` or `check`).

1. Download the access certificate (and its chain, if the portal gives one
   separately), and the registration certificate.
2. Build the keystore from the key that never left the Mac:
   ```bash
   scripts/eudi/make-verifier-keystore.sh --real access-cert.pem chain.pem
   ```
   It refuses a certificate that does not belong to the key.
3. Put the keystore, its password, the client id and the registration
   certificate in Key Vault. This needs Key Vault Secrets Officer and prints no
   secret:
   ```bash
   scripts/azure/19-eudi-verifier.sh --upload-keystore registration-certificate.jwt
   ```
4. Create the app:
   ```bash
   scripts/azure/19-eudi-verifier.sh
   ```
   The first run prints two DNS records for `verifier.ehds.mabu.red` (a TXT
   and a CNAME). Add them, then run the script again; it binds the name with a
   managed certificate.
5. Check it:
   ```bash
   scripts/azure/19-eudi-verifier.sh --check
   ```
   `/healthz` must answer 200 and `POST /ui/presentations` must answer 404.
6. Add `mvhd-eudi-verifier` to `BACKEND_APPS` and `CORE_APPS` in
   `scripts/azure/offhours.sh`, so it stops and starts with the rest.

## Switching the hub

Not done by any script; it ends the EU reference wallet's path. On `mvhd-ui`,
and in `.github/workflows/deploy-azure.yml`, which re-asserts these on every
deploy:

```
EUDI_VERIFIER_BASE_URL=http://mvhd-eudi-verifier:8080
EUDI_INTENDED_USE_ID=ehds-patient-sign-in
EUDI_PID_VCT=urn:eudi:pid:de:1
EUDI_PID_FORMATS=dc+sd-jwt
```

`EUDI_PID_FORMATS` exists because the registration certificate covers SD-JWT
VC only, and a wallet refuses a request for a format the certificate does not
name. Switched on 2026-10-28 (#708).

Then run the #708 test plan with d-you. Switching back is the first variable
set to `https://verifier-backend.eudiw.dev` and the second to `TEST-01`.

## Still open

- The deep-link scheme d-you answers (`openid4vp://`, `haip-vp://`):
  `EUDI_VERIFIER_SCHEME`, to be read from the first scan.
- Issuer trust: the verifier accepts any PID issuer until
  `VERIFIER_TRUSTVALIDATOR_SERVICEURL` points at a trust list.
- `scripts/azure/19-eudi-verifier.sh` has not yet run against Azure.
