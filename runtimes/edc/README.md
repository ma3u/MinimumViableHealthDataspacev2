# EDC runtimes (ADR-076)

Thin launchers for the control plane, IdentityHub and IssuerService, assembled
from released `org.eclipse.edc` modules. The EDC version is set once, in
`gradle/libs.versions.toml`.

```bash
docker build --build-arg RUNTIME=controlplane  --build-arg EDC_VERSION=1.0.0-RC5 -t mvhd/edc-controlplane:1.0.0-RC5-local  runtimes/edc
docker build --build-arg RUNTIME=identity-hub  --build-arg EDC_VERSION=1.0.0-RC5 -t mvhd/edc-identity-hub:1.0.0-RC5-local  runtimes/edc
docker build --build-arg RUNTIME=issuerservice --build-arg EDC_VERSION=1.0.0-RC5 -t mvhd/edc-issuerservice:1.0.0-RC5-local runtimes/edc
```

The build runs inside the Gradle image, so no local JDK or Gradle is needed.

## Running them in the compose stack (spike, #881)

`docker-compose.edc1.yml` swaps the five EDC containers to these images, each on
a fresh `*_v1` database (`jad/init-postgres-edc1.sql`, applied once). Without
the overlay the stack is 0.18 again. Back up the `vault_data` and
`postgres_data` volumes first: seeding writes keys to Vault.

What the 1.0 stack needs beyond the image swap, found in the spike and still
to move into the seeds and the realm file:

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

The only code here is `issuerservice/.../DemoAttestationsExtension.java`, the
"membership" and "manufacturer" attestation types our seeds use.
