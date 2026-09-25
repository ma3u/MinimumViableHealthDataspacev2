# Planning index

Work items flow `future/ → current/ → done/` — files keep their dated record and
are never deleted. Roadmap detail stays in `roadmap-phases-*.md`; the issue/ADR
tables live in [`../planning-health-dataspace-v2.md`](../planning-health-dataspace-v2.md).
Groom with `/plan`. Token budget per ADR-026: keep this index small.

## current/

- [issue-182-german-national-wallet-integration](current/issue-182-german-national-wallet-integration.md) — German EUDI Wallet (RP contract, self-hosted verifier, wallet-provider backend) **+ the #72 citizen consent demo** it enables (W7–W9)
- [persona-journeys/registration-identification-exchange](../persona-journeys/registration-identification-exchange.md) — the seven-actor map: registration · identification · data exchange, primary and secondary use
- [sbom-and-component-updates](current/sbom-and-component-updates.md) — SBOM, automated CVE scanning, evidence-based update queue
- [issue-97-edc-upgrade](current/issue-97-edc-upgrade.md) — dependency refresh; Phase A done, Phase B in progress
- [issue-97-phase-b-analysis](current/issue-97-phase-b-analysis.md) — EDC v0.18 breaking-change analysis + upstream-image strategy
- [issue-20-leitlinien-ingestion](current/issue-20-leitlinien-ingestion.md) — AWMF Leitlinien Layer-6 ingestion (Docling)
- [issue-19-nlq-researcher](current/issue-19-nlq-researcher.md) — NLQ researcher improvements (pharmacovigilance)
- [Issue #5 — completing the pentest checklist](current/issue-5-pentest-completion.md) — the five items that need a harness, not a probe
- [issue-4-bsi-c5-production](current/issue-4-bsi-c5-production.md) — BSI C5 production security track

## future/

- [longevity-community-data-sharing](future/longevity-community-data-sharing.md) — no CVD Fox Insight exists; the behaviour lives in longevity communities. S3 journey deferred here
- [issue-11-weekly-demo-reset](future/issue-11-weekly-demo-reset.md) — weekly baseline refresh (ADR-014)
- [eudi-wallet-cluster](future/eudi-wallet-cluster.md) — issues #22 / #24 / #80, Phase 27
- [phase-26g-deferred](future/phase-26g-deferred.md) — federation observability leftovers
- [issue-26-healthdcat-ap-validation](future/issue-26-healthdcat-ap-validation.md) — SHACL validation + DQV source-level quality for the catalog

- [ehds-operating-company](future/ehds-operating-company.md): what the demonstrator would need to show the operating model, not only the journey. Paper: [`../ehds-operating-company.md`](../ehds-operating-company.md)

## done/

- [issue-206-hdab-tasks](done/issue-206-hdab-tasks.md) — the access body's tasks under Regulation (EU) 2025/327, M0 to M7 (2026-09-25)
- [issue-8-federated-discovery](done/issue-8-federated-discovery.md) — Phase 26 complete (2026-07-15)
- [issue-10-azure-deployment](done/issue-10-azure-deployment.md) — ACA deployment (ADR-012)
- [issue-1-trust-center](done/issue-1-trust-center.md) — pseudonym resolution (EHDS Art. 50/51)

Older completed phases: see `roadmap-phases-01-10.md`, `-11-20.md`, `-21-24.md`
and the issue table — not backfilled here (record lives there already).
