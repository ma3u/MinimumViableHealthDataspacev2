# ADR-076: EDC 1.0 runtimes are built here, from released EDC artifacts

**Status:** Superseded by [ADR-078](ADR-078-edc-1-on-container-apps-without-cfm.md) (2026-11-05). Its premises were wrong: JAD moved to eclipse-dataspace-hub/jad, and eclipse-cfm publishes 1.0 images; decisions 1, 4, 5 and 6 carry over into ADR-078
**Date:** 2026-11-05
**Supersedes:** [ADR-005](ADR-005-jad-cfm-source-builds.md)
**Relates to:** [ADR-002](ADR-002-edc-data-plane-architecture.md), [ADR-029](ADR-029-dependency-version-pinning.md), [ADR-055](ADR-055-azure-runs-the-compose-jad-build.md), [ADR-075](ADR-075-a-minor-release-every-month.md)
**Tracks:** [Issue #881](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/881), [Issue #97](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/97)

## Context

Eclipse EDC is on its way to 1.0.0: RC1 on 2026-09-07, RC5 on 2026-10-21,
no final date announced (#881 has the estimate). Version 1 changes where every
piece of our connector stack comes from:

| Piece                                     | Today                                                                                      | With EDC 1.0                                                                                                    |
| ----------------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Control plane, IdentityHub, IssuerService | `ghcr.io/metaform/jad/*:4a7e5bd0`, JAD main of 2026-05-18, on EDC 0.18.0-SNAPSHOT          | Maven Central `org.eclipse.edc:*:1.0.0`; EDC publishes no container images                                      |
| Virtual (multi-participant) control plane | the `edcv` BOMs from [Virtual-Connector](https://github.com/eclipse-edc/Virtual-Connector) | merged into the Connector; Virtual-Connector archived on 2026-07-06                                             |
| Data plane                                | JAD's `dataplane` launcher (its own `data-plane-certs` extension) plus siglet              | the EDC data plane framework is removed; adopters bring a DPS data plane, e.g. on the Eclipse DataPlane SDK     |
| CFM managers and agents                   | our own builds of 2026-03-09 (`ghcr.io/ma3u/health-dataspace/cfm-*`)                       | [eclipse-cfm/cfm](https://github.com/eclipse-cfm/cfm) publishes all of them as `ghcr.io/eclipse-cfm/cfm/<name>` |

[ADR-005](ADR-005-jad-cfm-source-builds.md) said to build JAD and CFM from
source in `vendor/`. #97 Phase B replaced that with Metaform's per-commit JAD
images, and [ADR-055](ADR-055-azure-runs-the-compose-jad-build.md) put Azure
on the same images. Both depend on Metaform moving JAD forward. It has not:
JAD's last commit on `main` is from 2026-05-18, and its
`chore/bump_edc_version` branch is still on 0.18.0-SNAPSHOT. Nobody upstream
builds JAD, or any other deployable set of runtimes, on 1.0.

What JAD adds on top of EDC is small. Its control plane, IdentityHub and
IssuerService launchers are lists of upstream BOMs plus HashiCorp Vault,
console and OpenTelemetry monitoring, and NATS events. The IssuerService
also needs `issuance-spi` for seeding attestations. The only code of its own
is the data plane's `data-plane-certs` extension. This repository has no Java
code at all.

## Decision

1. **Launchers live in this repository**, under `runtimes/edc/`: one Gradle
   module each for `controlplane`, `identity-hub` and `issuerservice`. Each
   module only assembles released upstream modules, `org.eclipse.edc` BOMs and
   the extensions listed above, at the version pinned once in the version
   catalog (`edc = "1.0.0"`; a release candidate only on a spike branch,
   never on `main`). A launcher has no Java code of its own. If one ever
   needs some, that code gets its own ADR and its own tests.
2. **Data planes are built here too**, on the Eclipse DataPlane SDK, speaking
   DPS to the control plane. siglet stays the signing service. The RC spike
   in #881 shows whether the SDK serves the FHIR and OMOP flows that
   `data-plane-certs` serves today. If it does not, that part returns as its
   own ADR before the launchers reach `main`.
3. **CFM comes from eclipse-cfm's release images**, managers and agents,
   pinned by tag and digest (ADR-029). We build none of them. The agent set
   follows upstream: the Keycloak agent is gone, and we run a new agent only
   when a flow needs it.
4. **CI builds and publishes the images** to
   `ghcr.io/ma3u/health-dataspace/edc-<runtime>`, tagged
   `<edc-version>-<short-commit>`, with the OCI `source`, `revision` and
   `version` labels set, so every image names its source (the gap ADR-029
   found in the April images). Compose, CI and Azure run the same images,
   mirrored to ACR as in ADR-055.
5. **Upgrades follow EDC releases.** 1.0 is not a long-term-support release,
   so the version catalog moves with each EDC patch or minor release, through
   Dependabot's Gradle ecosystem, inside the monthly release of ADR-075. The
   full gate (DCP, DSP TCK, EHDS suites, Playwright `--project=live`) decides,
   not the release notes; the 0.16 to 0.18 move found four runtime-only
   breaks that the notes did not mention.
6. **The Metaform JAD images are retired** once Azure runs the new images.
   The seeds in `jad/` and the name "JAD stack" for the full compose stack
   stay; they describe our stack, not Metaform's build.

## Consequences

- No dependency on a downstream project that has stopped moving. An EDC
  release reaches us when we choose, not when someone else rebuilds.
- Our images are as traceable as ADR-029 asks: version, commit and labels
  come from one build in this repository.
- New work we own: a Gradle and JDK toolchain in CI, image builds, Trivy
  scans and Dependabot updates for the launchers. The launchers carry no
  code of their own, so the burden is version bumps, not maintenance.
- The data plane becomes ours to run. It is the largest open question, and
  decision 2 says where it gets answered.
- CFM is pre-1.0 (v0.0.6), and its agent set is still changing. Pinning by
  digest keeps that visible; an upgrade is a deliberate change.
- ADR-005 is superseded. Its `vendor/` source builds had already been
  replaced by #97 Phase B.

## Alternatives considered

- **Wait for Metaform JAD on 1.0.** There has been no activity since 2026-05-18,
  and no plan is visible. Waiting leaves us on 0.18, without upstream security
  fixes after v0.18.1 (2026-09-25).
- **Fork JAD and bump it ourselves.** We would carry Metaform's demo code and
  structure without using most of it. The launchers are a few dependency
  lists, so building them fresh costs less than keeping a fork current.
- **Use the EDC Samples as runtimes.** The Samples already build on
  1.0.0-RC5, but they teach one feature each. They are not a deployable
  multi-participant stack.
