# ADR-055: Azure runs the same JAD build as compose and CI

**Status:** Proposed
**Date:** 2026-10-04
**Relates to:** [ADR-005](ADR-005-jad-cfm-source-builds.md), [ADR-029](ADR-029-dependency-version-pinning.md), [ADR-041](ADR-041-managed-postgres-on-azure-containerised-locally.md), [ADR-053](ADR-053-everything-stops-off-hours.md)
**Tracks:** [Issue #503](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/503), [Issue #97](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/97) Phase B

## Context

Onboarding a participant on https://ehds.mabu.red fails (#503). All three CFM
activities go to `error` within 20 seconds, for two reasons that look
unrelated and have one cause:

1. **The control plane answers 500** to the EDC-V agent's
   `PUT /participants/{id}/config`.
2. **The IssuerService looks up a participant context `��.z`**: it
   base64-decodes the plain `issuer` the registration agent puts in the path.

The cause is that Azure and compose run different EDC builds:

|                        | compose and CI                                                                                  | Azure, until this ADR                                                      |
| ---------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| JAD images             | `ghcr.io/metaform/jad/*:4a7e5bd…`, EDC 0.18, OCI source label                                   | `acrmvhdehds.azurecr.io/jad-*:2026-04-14`, source commit unknown (ADR-029) |
| Management API         | `v5beta`                                                                                        | `v4alpha`                                                                  |
| IssuerService path ids | plain                                                                                           | base64-decoded; no `DELETE holder` (405)                                   |
| Issuer identity        | context, DID, key and definitions seeded (`jad/seed-jad.sh`, `scripts/seed-issuer-identity.sh`) | none: no context, no identity or DID port, no credential definitions       |

The CFM agents (built from `connector-fabric-manager@9aa627f`, #318) compile in
`v5alpha` and plain ids. They were written against the 0.18 stack, and #97
Phase B moved compose and CI to it in September; Azure was never moved. The
Azure shim (`jad/cfm-cp-shim-azure.conf`) rewrites `v5alpha` to `v4alpha` to
paper over the first difference, but the participant-context config is part
of 0.18's virtual mode and has no `v4alpha` equivalent. The second difference
is in the IssuerService itself.

So the two stacks this repository describes behave differently in exactly the
flows the demo exists to show, and every fix found on one has to be
re-derived on the other.

## Decision

Azure runs the JAD build that compose and CI run.

1. **Images.** The four `ghcr.io/metaform/jad/*:4a7e5bd096c5…` images are
   copied into ACR under the upstream commit (`jad-controlplane:4a7e5bd096c5`
   and so on), and `JAD_VERSION` in `scripts/azure/env.sh` names that tag.
   Unlike the April images, these carry their source, so the tag states a
   provenance that can be checked (ADR-029's objection to SHA tags was that
   the April images had none).
2. **Settings.** Each EDC app gets the settings compose gives it that Azure
   lacks: the NATS event stream (mandatory on 0.18, or the connector does not
   start), the DCP scopes, the trusted issuer, the participant id. Azure's own
   addressing stays where callers already depend on it (IdentityHub identity
   API on 7082, issuer admin API on the ingress port 10013).
3. **The shim** forwards `v5alpha` to `v5beta`, as compose's does.
4. **The issuer gets its identity on Azure:** identity API (10015) and DID
   (10016) ports on its ingress, a signing key in Vault, the `issuer`
   participant context, and the credential definitions compose seeds.
5. **Fresh databases.** The five EDC databases are created anew next to the
   April ones (`controlplane_v018` and so on), not migrated in place. Their
   content is demo state that the seed workflows recreate, and the April
   tables were made by a build whose schema is unknown. The old databases
   stay untouched until the new stack has run a week, so a rollback is the
   previous revision of each app, pointing at its old database.
6. **One maintenance window**, inside office hours (ADR-053), with
   `scripts/azure/check-keycloak-health.sh`, the API collection and a real
   onboarding as the checks.

## Consequences

- One EDC build to reason about. A fix proven on compose or in CI applies to
  Azure without re-deriving it, and an Azure fault reproduces locally.
- The shim's version rewrite becomes a plain forward; it can go entirely once
  CFM is rebuilt against `v5beta`.
- The ghcr images include the OpenTelemetry Java agent, which the April images
  lack (#418, plane 1).
- Moving to 0.18 on Azure also brings the local stack's open DSP fault to
  Azure: in 0.18's virtual mode the provider side answers 404 for every DSP
  path (#345). Azure has never completed a negotiation either (#180), so
  nothing that works today stops working, but #345 becomes the next blocker
  for both stacks.
- The window interrupts the EDC services and anything that calls them
  (onboarding, credentials, the TCK page) for its duration. Sign-in, the
  graph and the patient views do not depend on them.
- Five more databases on the Flexible Server for about a week. Then the April
  ones are dropped, through the same workflow, after a note on #503.

## Alternatives considered

- **Patch the April stack** (`issuer.id` in base64, seed the issuer there).
  Fixes the issuer fault only; the participant-config 500 has no `v4alpha`
  equivalent, so onboarding would still fail.
- **Rebuild CFM against `v4alpha`.** Moves the agents away from the build CI
  tests, which is the drift this ADR removes.
- **Migrate the April databases in place.** Their schema comes from an
  unknown build; a failed migration would leave no clean rollback.
