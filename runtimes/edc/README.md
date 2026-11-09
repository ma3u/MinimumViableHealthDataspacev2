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

## The official DSP TCK (#338, #711)

`controlplane-tck` is a fourth launcher, never deployed: the same virtual
control plane and EHDS policy vocabulary as `controlplane`, with EDC's own
connector-under-test modules in place of DCP (`iam-mock`, and
`tasks-tck-extension`, which seeds the TCK's offers and agreements and opens
the `/tck` endpoint the TCK uses to start a negotiation or a transfer). EDC
builds its TCK connector the same way, in
`system-tests/tck/dsp-tck-virtual-connector-under-test`.

```bash
./scripts/run-eclipse-dsp-tck.sh      # build, run eclipsedataspacetck/dsp-tck-runtime, report, clean up
```

`docker-compose.tck.yml` is standalone (own project, network and database), so
it runs next to the JAD stack. On 2026-11-08 the TCK 1.0.2 passed all 65 tests
against EDC 1.0.0-RC5. The nightly runs it (`compliance.yml`, job
`eclipse-dsp-tck`).

### The same TCK against Simpl-Open's connector

```bash
./scripts/run-eclipse-dsp-tck.sh --simpl   # simpl-edc 1.0.26 (compose profile simpl), report to test-results/dsp-tck-simpl
```

Simpl's published image, `simpl-edc` 1.0.26 (EDC 0.10.1), seeded through its
Management API with the offers EDC seeds for its own run. It is amd64 only and
takes about three minutes to boot emulated on arm64. It has no TCK hook, so
the tests in which it acts as consumer, and the transfers that need a seeded
agreement, cannot pass; the summary counts them apart. Not in the nightly: its
result is a finding about Simpl, not a gate for the hub. The findings are in
#711.

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

### Back to 0.18 on the compose stack

Rehearsed on 2026-11-09 (#927): the 0.18 images came back on the databases and
Vault keys that 1.0 had left alone, with no new seed, and the three suites
reached the 0.18 floors (identity 27/0/0, dataspace 32/0/1, health domain
27/0/3).

- **The 0.18 point is `80fea9ad^` (`ddb660c4`), not `ba42e85^`.** #920 moved
  the compose files to 1.0 before #932 switched the images: the control
  plane's POLICY scopes to `prefix.mapping`, the CFM shim and the live UI to
  Management API `v5`, the seeds and the suites to the 1.0 paths. On
  `ba42e85^` the 0.18 control plane stops at boot, because 0.18 reads
  `prefix-mapping`:
  `Error booting runtime: DcpScope prefixMapping cannot be null for POLICY type`.
- **Copy the volumes first**, with the containers that write to them stopped:
  `postgres_data`, `vault_data`, `vault_keys` and `nats_data`.
- **Start 0.18 from a worktree at `80fea9ad^`**, in the order of its
  `scripts/bootstrap-jad.sh`, each step with
  `docker compose -p minimumviablehealthdataspacev2 ... up -d --no-deps <services>`,
  so the containers use the existing volumes and nothing else is recreated.
  Not with the script itself: its `down --remove-orphans` also removes the EUDI
  wallet containers. The 0.18 readiness URL answers 401, so a wait must accept
  that. Then run that worktree's three suites.
- **Forward** with `scripts/bootstrap-jad.sh` on `main`. From a worktree, set
  `COMPOSE_PROJECT_NAME=minimumviablehealthdataspacev2`, or compose names the
  project after the folder and starts on empty volumes. Bind mounts point into
  the folder a container was created from, so create the stack from a checkout
  that stays.

Azure does not use this commit: `migrate-edc-to-v1.sh rollback` restores the
definitions saved on 2026-11-06, whose control plane still carries
`prefix-mapping`.
