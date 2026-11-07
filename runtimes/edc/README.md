# EDC runtimes (ADR-076)

Thin launchers for the control plane, IdentityHub and IssuerService, assembled
from released `org.eclipse.edc` modules. The EDC version is set once, in
`gradle/libs.versions.toml`.

```bash
docker compose -f docker-compose.yml -f docker-compose.jad.yml build controlplane identityhub issuerservice
```

`docker-compose.jad.yml` names them `mvhd/edc-<runtime>:1.0.0-RC5` with a
`build:` section, so `docker compose up` builds them when they are missing. The
build runs inside the Gradle image, so no local JDK or Gradle is needed. CI
builds them once per run (`compliance.yml`, job `edc-images`).

## Running them in the compose stack (#881)

`docker-compose.jad.yml` runs the five EDC containers on these images, each on
its own `*_v1` database. A fresh `postgres_data` volume gets them from
`jad/init-postgres-edc1.sql`; on an existing volume, run that file once with
psql as `cp`. The 0.18 services (the CFM managers and agents, the JAD data
planes) are behind the `edc018` profile until #927 removes them. Back up the
`vault_data` and `postgres_data` volumes before switching an existing stack:
seeding writes keys to Vault.

What the 1.0 stack needs beyond the image swap, found in the spike:

- Keycloak: the operator clients (`admin`, `provisioner`) need the scopes
  `management-api:admin`, `identity-api:admin` and `issuer-admin-api:admin`.
  1.0 authorizes by scope, not by the `role` claim. A tenant is identified by
  its token's `sub`, which must equal the participant context id; the `issuer`
  client gets a hardcoded `sub` mapper and requests its scopes explicitly.
- API versions: Management API `v5` only; IdentityHub and IssuerService `v1`.
- Each participant context is linked to the DSP profile:
  `PUT /v5/participants/{id}/profiles` with `["http-dsp-profile-2025-1"]`.
- There is no EDC data plane. siglet 0.1.6 is the data plane (`jad/siglet-edc1.toml`):
  it answers the control plane's Data Plane Signaling and issues the access
  token. The consumer reads `{endpoint, token}` from its siglet
  (`GET /tokens/{participantContextId}/{transferId}` on port 8080), and the
  endpoint is the neo4j-proxy's `/dataspace/data`, which verifies the token
  against siglet's JWKS and serves the dataset the token names. The JAD data
  planes `dataplane-fhir` and `dataplane-omop` are not needed.

Two pieces of code, both exceptions to ADR-076 decision 1 awaiting their own ADR:

- `issuerservice/.../DemoAttestationsExtension.java`: the "membership" and
  "manufacturer" attestation types our seeds use.
- `controlplane/.../EhdsPolicyVocabularyExtension.java`: declares the EHDS
  actions and left operands of the standard policies (ADR-077), so 1.0's
  policy validation accepts them. Declared, not enforced: they are bound to a
  scope EDC never evaluates, as on 0.18, where they were not enforced either.
