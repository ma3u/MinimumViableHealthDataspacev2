# Keycloak OID4VCI — `PatientIdentityCredential` (EUDI Wallet Hackathon)

Issues an **SD-JWT VC** ("patient identity + secondary-use consent") from the MVHD
Keycloak (`edcv` realm) to an **EUDI iOS wallet** over **OpenID4VCI**. Companion to
[`docs/planning/eudi-wallet-hackathon-2026.md`](../../docs/planning/eudi-wallet-hackathon-2026.md)
and issue #22.

> ⚠️ **Status:** Keycloak's OID4VCI support is experimental and version-specific. The
> attribute/mapper names below match Keycloak's January 2026 OID4VCI guide, but **verify
> them against your build** in the Admin Console (Client scope → Mappers → _Add_ shows the
> available provider IDs). Treat `setup.sh` as an accelerator, the Console steps as the
> source of truth.

## Files

| File                                     | Purpose                                                                                                           |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `patient-identity-credential.scope.json` | The credential, defined as a `protocol: "oid4vc"` client scope (SD-JWT VC `dc+sd-jwt`, ES256) with claim mappers. |
| `ecdsa-key.component.json`               | A P-256 ECDSA realm key provider for `ES256` signing.                                                             |
| `setup.sh`                               | Provisions key + scope + client toggle + offer URL via the Admin REST API.                                        |

## 0. Prerequisites

- Keycloak **started with the feature flag**: `bin/kc.sh start --features=oid4vc-vci`
  (or `KC_FEATURES=oid4vc-vci` env). In the JAD compose, add it to the Keycloak service.
- `jq` and `curl` installed; the `edcv` realm running with users (`patient1` exists).

## 1. Quick path (script)

```bash
KC_URL=http://localhost:8080 ADMIN_USER=admin ADMIN_PASS=admin \
  ./jad/keycloak-oid4vci/setup.sh
```

This adds the ES256 key, sets a `pseudonym` attribute on `patient1`, creates the
`PatientIdentityCredential` scope, enables OID4VCI on `health-dataspace-ui`, and prints the
credential-offer URL.

## 2. Manual path (Admin Console — authoritative)

1. **Realm Settings → Keys → Providers → Add `ecdsa-generated`**, curve **P-256**
   (gives an `ES256` signing key). Equivalent to `ecdsa-key.component.json`.
2. **Client scopes → Create**, name `PatientIdentityCredential`, **protocol `oid4vc`**, then
   set the attributes and mappers from `patient-identity-credential.scope.json` (or `POST` it
   to `/admin/realms/edcv/client-scopes`).
3. **Clients → `health-dataspace-ui` → Advanced → "Enable OID4VCI"** (under _OpenID for
   Verifiable Credentials_). Optionally use a dedicated client `eudi-issuer` instead of the
   UI login client.
4. **Clients → `health-dataspace-ui` → Client scopes → Add → `PatientIdentityCredential`**
   as **Optional**.

## 3. What the credential contains

`dc+sd-jwt` SD-JWT VC, `vct = https://ehds.mabu.red/credentials/patient-identity`, signed
`ES256`, 7-day validity, selectively-disclosable claims:

- `given_name`, `family_name` ← Keycloak user `firstName` / `lastName`
- `patient_pseudonym` ← user attribute `pseudonym` (Trust-Center pseudonym, not a real ID)
- `consent_purpose = secondary-use/research`, `consent_scope = drug-repurposing-study`
- `role = PATIENT`, `iat`

> Synthetic only — no real PII. The pseudonym keeps the credential unlinkable to a real person.

## 4. Issue to the iPhone wallet

Get a user token for the patient, then request a **credential offer** (QR), which the EUDI
wallet scans to run the pre-authorized-code flow:

```bash
USER_TOKEN=$(curl -sf -X POST \
  "http://localhost:8080/realms/edcv/protocol/openid-connect/token" \
  -d grant_type=password -d client_id=health-dataspace-ui \
  -d username=patient1 -d password="<patient1-password>" | jq -r .access_token)

curl -sf -H "Authorization: Bearer $USER_TOKEN" \
  "http://localhost:8080/realms/edcv/protocol/oid4vc/credential-offer-uri?credential_configuration_id=PatientIdentityCredential&type=qr-code&username=patient1" \
  --output patient-credential-offer.png
```

Open `patient-credential-offer.png` and scan it in the EUDI iOS wallet. (For a hosted
known-good baseline first, issue from `https://issuer.eudiw.dev/` before switching to this.)

## 5. Present it back (verification)

The wallet presents the credential via **OpenID4VP** to a verifier (Keycloak-as-OID4VP or
`eudi-srv-verifier-endpoint` / `verifier.eudiw.dev`). On a valid presentation the MVHD portal
mints a `PATIENT` session and records a `PatientConsent` node — see the hackathon plan §5–§6.

## Troubleshooting

- **`Unknown feature oid4vc-vci`** → the flag isn't set; restart Keycloak with `--features=oid4vc-vci`.
- **Mapper provider not found** → open the mapper dropdown in the Console and match the exact
  provider IDs for your version (confirmed: `oid4vc-user-attribute-mapper`,
  `oid4vc-issued-at-time-claim-mapper`; verify `oid4vc-static-claim-mapper`).
- **No `ES256` key** → confirm the `ecdsa-generated` P-256 provider is enabled and active.
- **Keycloak gotchas** (Docker hostnames, PKCE) → see `CLAUDE.md` gotchas #5/#6.
