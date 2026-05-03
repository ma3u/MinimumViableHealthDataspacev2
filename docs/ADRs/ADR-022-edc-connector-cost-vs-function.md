# ADR-022: EDC Connector — Function vs Cost

**Status:** Accepted (Option C)
**Date:** 2026-05-01 (proposed) · 2026-05-03 (accepted)
**Relates to:** [ADR-002](ADR-002-edc-data-plane-architecture.md), [ADR-007](ADR-007-did-web-dsp-negotiation.md), [ADR-009](ADR-009-issuerservice-credential-fix.md), [ADR-012](ADR-012-azure-container-apps.md), [ADR-018](ADR-018-24x7-workaround-b.md)
**Tracking:** Issue #25 (multi-port ACA / EDC architectural mismatch)

## State on acceptance day (2026-05-03)

The multi-port path explored in commit `3ee18be` (`fix(azure): multi-port controlplane + NATS JetStream — issue #25 partial`) actually boots cleanly on ACA. Live `rg-mvhd-dev` snapshot:

- `mvhd-controlplane` runs at `min=1` with `additionalPortMappings` 8081 (mgmt), 8082 (DSP), 8083 (control). Boot log: `114 service extensions started` → `Runtime ready`. 14 of those extensions are the DSP 2025-1 / Catalog / Negotiation / Transfer Management APIs.
- `mvhd-nats` runs at `min=1` with JetStream enabled (`-js -m 8222`).
- `mvhd-identityhub`, `mvhd-issuerservice`, `mvhd-dp-fhir`, `mvhd-dp-omop`, `mvhd-tenant-mgr`, `mvhd-provision-mgr` stay at `min=0` and only spin up under traffic. Per-participant seeding (the equivalent of `jad/seed-all.sh` phases 2-4) is still missing on Azure, so DSP-2.x / DCP-2.x / DCP-3.1 cannot turn green even when those apps are warm.
- The `neo4j-proxy` runs with `TCK_INFRA_OPTIONAL=true`, so the live `/compliance/tck` page renders skipped (neutral, blue) instead of failed (red) for everything that depends on the unseeded EDC chain. The skip-explainer banner on the page links back to issue #25.

The multi-port controlplane fix is therefore **not** the limiting factor any more — participant seeding on ACA is. This ADR records Option C as the formal decision and downscopes the issue's blocking work to "ship a participant-seeding ACA job" + (separately) prune the four auxiliary apps.

## Context

Seven EDC-V Container Apps in `rg-mvhd-dev` do not boot on Azure Container Apps because EDC requires four distinct Jetty web ports per service (web 8080 / management 8081 / protocol 8082 / control 8083) and ACA's default ingress exposes one. They have been scaled to `min-replicas=0` since 2026-05-01 to stop the cost burn (~€252/mo had they remained on `min=1`).

Before deleting them outright we have to be explicit about which dataspace functions we'd lose. This ADR documents the role of each app, who calls it, and what the demo can and cannot do without each one.

## The seven apps and what they do

| App                  | EDC role (~LoC)                    | Purpose                                                                                                                                                                                                                 | UI features that depend on it                                                                                          | Substitute today                                                                                                                                                              |
| -------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mvhd-controlplane`  | EDC Connector control plane (~30k) | Hosts the Management API for assets, policy definitions, contract definitions, contract negotiations, transfer processes; speaks DSP 2025-1 over HTTP for inbound/outbound negotiation. **The heart of the connector.** | `/negotiate`, `/admin/policies`, `/tasks`, `/api/negotiations`, `/api/participants`, anything that contracts a dataset | Mock JSON + Neo4j read-only fallbacks. Functional dataspace negotiation is unavailable.                                                                                       |
| `mvhd-dp-fhir`       | EDC Data Plane (FHIR)              | Executes the transfer once a contract is signed. Pulls FHIR R4 bundles from Neo4j (via the proxy) and pushes them to the consumer's egress endpoint.                                                                    | The `/data/transfer` "Run transfer" button                                                                             | Direct Neo4j read via the proxy works for _reads_, but never crosses a contract boundary.                                                                                     |
| `mvhd-dp-omop`       | EDC Data Plane (OMOP)              | Same as `dp-fhir` but for OMOP CDM rows. Used by the secondary-use research workflow.                                                                                                                                   | OMOP cohort transfer in `/analytics`, research-programme transfer flow                                                 | Same as above.                                                                                                                                                                |
| `mvhd-identityhub`   | EDC Identity Hub (~15k)            | Stores per-participant DIDs, key pairs (Ed25519 / P-256), holds verifiable credentials, exposes `/v1alpha/participants/{ctx}/keypairs` and `/credentials`.                                                              | `/credentials`, the DCP TCK probes, the "VCs held" badge in `/admin/components`                                        | The Trust Center page already reads VC state from Neo4j (the seed cypher writes `:VerifiableCredential` nodes mirroring IH). The connector cannot _issue_ new VCs without IH. |
| `mvhd-issuerservice` | EDC Issuer Service                 | The HDAB / data-quality / EHDS-participant credential issuer. Holds the `:CredentialDefinition` and `:Issuance` state machines; signs VCs with the issuer key in Vault.                                                 | `/admin/credentials/issue`, the HDAB approval workflow that mints `EHDSAccessCredential`                               | Pre-seeded VCs in Neo4j. New issuances are unavailable.                                                                                                                       |
| `mvhd-tenant-mgr`    | CFM Tenant Manager (~5k)           | Connector Federation Manager: tracks which tenant (= dataspace participant) maps to which IdentityHub `participantContextId`, exposes `/v1alpha1/tenants` for onboarding.                                               | `/admin/tenants`, `/onboarding`, the participant-listing in `/admin/components`                                        | `/admin/components` falls back to a Neo4j `(:Participant)` query that returns the seeded list. New tenants can't onboard.                                                     |
| `mvhd-provision-mgr` | CFM Provision Manager              | Drives the per-tenant provisioning steps: creates Vault folders + AES keys, registers DIDs in IH, mints the participant's bootstrap VC.                                                                                 | `/onboarding` "Provision tenant" step                                                                                  | None — new participants can't be created end-to-end.                                                                                                                          |

`mvhd-nats` is on the same list because it's a pure consumer of `mvhd-controlplane`'s transfer-event publisher (`EDC_NATS_TP_PUBLISHER_URL`); without the controlplane it has no producers. It belongs in the same scope decision.

## Function map (which UI feature breaks if we drop them)

```
┌──────────────────── needs all 7 + NATS ───────────────────┐
│ /negotiate          contract negotiation, signing         │
│ /tasks (live)       transfer-process state                │
│ /admin/policies     create / publish ODRL policy          │
│ /admin/credentials  issue new VCs                         │
│ /onboarding         provision a new participant tenant    │
└────────────────────────────────────────────────────────────┘
        │
        ▼  fall back to mocks today
┌──── partly works without them (Neo4j read fallback) ──────┐
│ /catalog            asset / dataset list                  │
│ /admin/tenants      tenant list                           │
│ /admin/components   participant cards                     │
│ /credentials        VC list (read-only)                   │
│ /compliance         compliance scorecard (TCK skips DSP)  │
└────────────────────────────────────────────────────────────┘
        │
        ▼  doesn't need EDC at all
┌──── self-contained on Neo4j + neo4j-proxy + Keycloak ─────┐
│ /graph              5-layer knowledge graph view          │
│ /patient            FHIR everything                       │
│ /query              NLQ + GraphRAG                        │
│ /analytics          OMOP cohort stats                     │
└────────────────────────────────────────────────────────────┘
```

## Decision space

Given the demo's purpose ("EHDS reference implementation, walk through DSP/DCP protocol compliance + EHDS clinical data on a 5-layer graph"):

### Option A — **Keep them deployed, fix the multi-port mismatch** (issue #25 path A or B)

- Cost while broken: **€0/mo** (already at min=0)
- Engineering cost: **1-2 days** (multi-port ACA via `additionalPortMappings`) **or** ~1 week (AKS migration)
- What you gain: real DSP/DCP/CFM functionality on Azure, all ❶+❷ UI features become live, the page shows green TCK rows for actual protocol exercises (not just `participant registered`).
- What you lose: nothing.

### Option B — **Delete the apps and the dependent UI calls fall back to mock/Neo4j permanently**

- Cost while broken: **€0/mo** (same)
- Cost saved on a hypothetical fresh deploy of `04-edc-services.sh`: **€272/mo** (€252 from the seven apps + €19.44 from NATS)
- Engineering cost: **~2 hours** to delete the apps, strip them from the deploy script, and add fallback paths to the affected UI routes.
- What you gain: the cost line disappears, the broken-app rows disappear from `/admin/components`, the deploy script is cleaner.
- What you lose: the demo can never _do_ contract negotiation, transfer, or VC issuance on Azure — all of those become "see the local Docker stack" links. The TCK page stays at 14 skipped on Azure forever (already the current state).

### Option C — **Hybrid: delete the obviously-redundant ones, keep optionality for the core connector**

Drop:

- `mvhd-tenant-mgr`, `mvhd-provision-mgr` — CFM is convenience tooling around the connector, not part of the EHDS reference implementation. Onboarding can be done via direct IH + controlplane mgmt API calls. **(2 apps, €77.76/mo on a fresh deploy)**
- `mvhd-dp-omop` — OMOP transfer is symmetric with FHIR, which we keep. Re-add later if a research demo specifically needs OMOP-via-DSP. **(1 app, €38.88/mo)**
- `mvhd-nats` — only needed if the controlplane is alive **and** uses the NATS transfer-event publisher. Move the controlplane to in-process publisher when it boots (config-only change). **(€19.44/mo)**

Keep but at min=0 until issue #25 lands:

- `mvhd-controlplane`, `mvhd-dp-fhir`, `mvhd-identityhub`, `mvhd-issuerservice` — these are the four that _materially demonstrate_ DSP and DCP. You can't credibly call this an EHDS reference implementation if these can never run on the Azure target. Burn no cost while they're at min=0; bring them back online when issue #25 closes.

Total cost saved on a fresh deploy: **€136/mo** (~half of Option B), with the door open for full DSP/DCP later.

## Recommendation

**Option C — accepted.** The connectors are core to what the project demonstrates — deleting all of them turns the Azure demo into a clinical-graph viewer with mock dataspace overlays, which contradicts the README. CFM + OMOP-dataplane + NATS are auxiliary and can come back later if needed.

> The post-acceptance plan moves the cleanup off the demo critical path (see [Follow-up work](#follow-up-work) below). The four "delete" candidates currently sit at `min=0` on ACA — they cost €0/mo as long as nothing pings them, which is the same financial state as deleting them, so we defer the destructive resource removals until after the 2026-05-04 demo.

Concrete delete targets right now:

1. `mvhd-tenant-mgr` (Container App + `cfm` DB in postgres)
2. `mvhd-provision-mgr` (Container App)
3. `mvhd-dp-omop` (Container App + `dataplane_omop` DB)
4. `mvhd-nats` (Container App)

Keep at `min=0` until issue #25 is resolved: 5. `mvhd-controlplane` (+ `controlplane` DB) 6. `mvhd-dp-fhir` (+ `dataplane` DB) 7. `mvhd-identityhub` (+ `identityhub` DB) 8. `mvhd-issuerservice` (+ `issuerservice` DB)

UI consequences of step 1-4 (need fix in a follow-up PR):

- `/admin/tenants` → already handles 5xx with empty list; leave as is, document
- `/onboarding` "Provision tenant" → disable button on Azure, link to local stack
- OMOP transfer flow in `/analytics` → already mock-driven; remove the live path
- Drop `EDC_NATS_*_URL` from controlplane env (when we revive it)

## Consequences

### Positive

- ~€136/mo cost ceiling reduction on any future deploy
- Cleaner `04-edc-services.sh` (10 apps instead of 14)
- `/admin/components` shows fewer broken cards, less noise for the user
- Postgres provisions 3 DBs instead of 7 (feeds ADR shrinking)

### Trade-offs

- Loss of optionality on CFM federation. Re-adding tenant-mgr/provision-mgr later means re-implementing their seed flow.
- The four "kept at min=0" apps still occupy ACA env slots (no €) and still have DBs in Postgres (~10 MB each).

### Rollback

Revert this ADR + the Container App / DB delete commits. Nothing destructive about the code, only the live ACA resources. The cypher seed at `neo4j/insert-synthetic-schema-data.cypher` is the source of truth for participant/contract/credential demo data, and is unaffected.

## Follow-up work

Tracked under issue #25. Done **after** the 2026-05-04 demo, in this order:

1. **Drop the 4 auxiliary apps + their DBs** (`mvhd-tenant-mgr`, `mvhd-provision-mgr`, `mvhd-dp-omop`, `mvhd-nats`) — `az containerapp delete` + `DROP DATABASE cfm, dataplane_omop`. UI changes per the table above.
2. **Move controlplane off NATS** — switch `EDC_NATS_*` env vars to the in-process publisher / subscriber (config-only change in `04-edc-services.sh`). Validates step 1 is safe.
3. **Ship `scripts/azure/05-edc-seed.sh`** — an ACA Job that mirrors `jad/seed-all.sh` phases 2-4 against `mvhd-controlplane` + `mvhd-identityhub` (5 ParticipantContexts: alpha-klinik, pharmaco, medreg, lmc, irs).
4. **Flip `TCK_INFRA_OPTIONAL=false`** on the proxy — once seeded, DSP-2.x / DCP-2.x / DCP-3.1 should pass on Azure, mirroring local Docker.
5. **Strip the 4 deleted apps from `04-edc-services.sh`** — final coherence pass (today the script still creates them; while they're at min=0 the cost is €0 so this isn't urgent).

Acceptance criteria for issue #25 closure are then: `https://ehds.mabu.red/compliance/tck` shows green DSP/DCP suites with at most 1-2 intentional skips (e.g. negotiation-state probes that need a counterparty).

## References

- Issue #25 (the underlying multi-port ACA architecture mismatch)
- ADR-002 (EDC data-plane architecture — original sizing)
- ADR-009 (IssuerService credential issuance)
- ADR-012 (ACA topology — original 13-app deployment)
- ADR-018 (the workaround that put Postgres on ACA, which made these DBs live)
