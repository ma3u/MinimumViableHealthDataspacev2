# ADR-024: Full EDC Provisioning per Participant on Azure

**Status:** Accepted
**Date:** 2026-05-04
**Supersedes:** [ADR-022](ADR-022-edc-connector-cost-vs-function.md) Option C (the hybrid scope-split that kept the four core EDC apps at `min=0` and dropped the four auxiliary apps).
**Relates to:** [ADR-002](ADR-002-edc-data-plane-architecture.md), [ADR-007](ADR-007-did-web-dsp-negotiation.md), [ADR-009](ADR-009-issuerservice-credential-fix.md), [ADR-012](ADR-012-azure-container-apps.md), [ADR-018](ADR-018-24x7-workaround-b.md)
**Tracking:** Issue [#25](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/25), Issue [#27](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/27)

## Context

ADR-022 accepted Option C on 2026-05-03: keep the four core EDC apps (`mvhd-controlplane`, `mvhd-dp-fhir`, `mvhd-identityhub`, `mvhd-issuerservice`) at `min=0` until issue #25 closes, drop the four auxiliary apps (`mvhd-tenant-mgr`, `mvhd-provision-mgr`, `mvhd-dp-omop`, `mvhd-nats`), and report DSP/DCP TCK rows as "skipped" via `TCK_INFRA_OPTIONAL=true` on the proxy.

During HDAB demo preparation on 2026-05-04 the live `/compliance/tck` page rendered with all DSP-2.x and DCP-2.x rows in the neutral-blue "skipped" state. The Spanish HDAB regulator's expectation, articulated in real time during prep, is that an EHDS reference implementation must demonstrate **per-participant DSP and DCP runtime on the same target where the rest of the demo runs**, not point at "see the local Docker stack" as the canonical proof. A regulator's trust threshold for cross-border interoperability is that protocol compliance is observable on the live shared environment, not deferred to a developer laptop.

This ADR records the resulting decision: provision the full EDC stack per participant on the Azure cluster, walking back the cost-driven Option C trade-off.

## Decision

**Provision the complete EDC component set per participant on Azure Container Apps**, with `min=1` once stable, sized so the cost ceiling stays bounded but every protocol surface is reachable on `https://ehds.mabu.red`.

Components to provision and keep online:

| Component                  | Role                                                            | Per-participant or shared        |
| -------------------------- | --------------------------------------------------------------- | -------------------------------- |
| `mvhd-controlplane`        | DSP 2025-1 control plane (Management API, contract negotiation) | Shared (multi-tenant)            |
| `mvhd-dp-fhir`             | EDC data plane for FHIR R4 transfers                            | Shared                           |
| `mvhd-dp-omop`             | EDC data plane for OMOP CDM transfers                           | Shared (re-added)                |
| `mvhd-identityhub`         | DCP IdentityHub (DIDs, key pairs, VCs)                          | Shared, contexts per participant |
| `mvhd-issuerservice`       | DCP IssuerService (HDAB credential issuance)                    | Shared                           |
| `mvhd-tenant-mgr` (CFM)    | Connector Federation Manager — tenant onboarding                | Shared (re-added)                |
| `mvhd-provision-mgr` (CFM) | CFM provisioning agent (Vault folders, AES keys, bootstrap VCs) | Shared (re-added)                |
| `mvhd-nats`                | NATS JetStream — controlplane transfer-event bus                | Shared (re-added)                |

The five seeded participants (`alpha-klinik`, `pharmaco`, `medreg`, `lmc`, `irs`) each get a `ParticipantContext` in IdentityHub, an Ed25519 / P-256 keypair, a participant credential issued by the IssuerService, and an ODRL-policy-attached DataProduct in the controlplane.

## Implementation plan

Sequenced so each step is independently revertable.

### Phase 1 — Schema & multi-port foundations (this commit window)

1. **`EDC_SQL_SCHEMA_AUTOCREATE=true`** on `mvhd-identityhub` and `mvhd-issuerservice` — already shipped in commit `8756122`. Without this, IH crashed with `relation "edc_holder_credentialrequest" does not exist`.
2. **Schema-reset workflow** (`.github/workflows/edc-schema-reset.yml`) — drops and recreates the `identityhub` and `issuerservice` databases on demand. Already shipped.
3. **`additionalPortMappings` for IdentityHub** — port 7082 (management API). Done on the live app; needs to be persisted in `scripts/azure/04-edc-services.sh` as part of Phase 2.
4. **`additionalPortMappings` for IssuerService** — same pattern as IH. Pending.

### Phase 2 — Persist the topology in the deploy script

Update `scripts/azure/04-edc-services.sh` so the multi-port mappings, autocreate flags, and re-added apps (NATS already there; tenant-mgr, provision-mgr, dp-omop need restoring) survive a clean re-deploy.

### Phase 3 — Participant seeding ACA job (`scripts/azure/05-edc-seed.sh`)

A one-shot ACA job that mirrors `jad/seed-all.sh` phases 2-4 against the Azure-internal endpoints:

- `seed-ehds-credentials.sh` against `mvhd-issuerservice:10013/api/admin`
- `seed-health-tenants.sh` against `mvhd-tenant-mgr` (then propagated by CFM agents to IH + controlplane)
- `seed-ehds-policies.sh` against `mvhd-controlplane:8081/api/mgmt`
- `seed-data-assets.sh` against the same controlplane

The job runs on every fresh deploy (idempotent: skip if participants already exist).

### Phase 4 — Flip the proxy

Set `TCK_INFRA_OPTIONAL=false` on `mvhd-neo4j-proxy`. Probes that fail will now render as red `fail`, not neutral-blue `skip` — a forcing function so future regressions surface immediately.

### Phase 5 — Cross-border federation (post issue #25 closure)

Spanish HDAB participant onboarded as the sixth `did:web:<es-domain>:hdab` peer. `(:HDABApproval)-[:COORDINATED_WITH]->(:HDABApproval)` exchanged over DSP catalog handshake between HDAB-DE / HDAB-FR / HDAB-ES. Tracked under issue #27 follow-up.

## Acceptance criteria

Closure of issue #25 requires:

- [ ] `https://ehds.mabu.red/compliance/tck` shows green for **all 7 DSP rows** (1.1, 1.2, 2.1-2.5)
- [ ] `https://ehds.mabu.red/compliance/tck` shows green for **all 7 DCP rows** (1.1, 2.1-2.5, 3.1)
- [ ] `https://ehds.mabu.red/compliance/tck` shows green for **all 6 EHDS rows** (already passing)
- [ ] `04-edc-services.sh` re-deployment from scratch produces the green TCK state without manual intervention
- [ ] At least one cross-border DSP catalog negotiation visible in `/admin/audit` between two distinct HDAB peers

## Trade-offs

### What we accept

- **Higher monthly cost.** ADR-022 estimated ~€272/mo for the full EDC stack at `min=1`. Combined with off-hours scale-down (ADR-016, ADR-023), the realistic monthly figure is ~€100-130 (12 hours/day × 5 weekdays). Acceptable for a regulator-credible reference implementation.
- **More moving parts to monitor.** 14 ACA apps instead of 10. The component-health view in `/admin/components` already covers this, with restart and diagnosis affordances per app.
- **Higher complexity in `04-edc-services.sh`.** The script grows by ~50 LoC for the re-added apps and multi-port patches.

### What we gain

- A regulator-grade EHDS demo that demonstrates DSP and DCP **on the same target where they're inspecting**.
- The TCK page becomes a useful regression signal instead of a "see local stack" pointer.
- The path to live HealthData@EU cross-border federation (ADR-024 Phase 5, EHDS Art. 75) opens up — impossible while EDC components are at `min=0`.
- The seed pipeline becomes a CI artefact rather than a manual ritual on a developer laptop.

### Rollback

Revert this ADR + the deploy-script changes. The `TCK_INFRA_OPTIONAL=true` switch on the proxy is a one-line env flip that restores the old behaviour. The `mvhd-pgfix` workflow is idempotent and never runs unless triggered.

## Follow-up work tracker

Tracked under issue [#25](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/25) with the new acceptance criteria above. Issue [#27](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/27) (HDAB demo follow-up) inherits the cross-border Phase 5 milestone.

## References

- ADR-022 (now superseded for the recommendation but retained as the function-vs-cost analysis)
- ADR-012 (original ACA topology)
- ADR-018 (Workaround B: Postgres on ACA)
- Issue #25 (multi-port ACA + EDC architectural mismatch tracker)
- Issue #27 (Spanish HDAB demo follow-ups)
