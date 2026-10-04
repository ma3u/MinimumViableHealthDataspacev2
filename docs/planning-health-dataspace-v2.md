# Planning: Health Dataspace v2

Status checked against GitHub on **2026-10-04**. The latest release is
[v2.0.0](https://github.com/ma3u/MinimumViableHealthDataspacev2/releases/tag/v2.0.0)
(2026-09-29); everything merged since then goes out with the next one. Work
items flow `future/ → current/ → done/` in [`planning/index.md`](planning/index.md);
live tracking is in [GitHub Issues](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues).

- [Done](#done): the releases, what is on `main` since v2.0.0, and the roadmap phases.
- [Next release](#next-release-v210): v2.1.0, the open work already under way.
- [Future releases](#future-releases): planned, waiting on someone else, or not started.

---

## Done

### Releases

| Release                                                                                        | Date       | Headline                                                                                       |
| ---------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------- |
| [v2.0.0](https://github.com/ma3u/MinimumViableHealthDataspacev2/releases/tag/v2.0.0)           | 2026-09-29 | Klarbefund iOS app, EHDS compliance, a view per persona, new graph visualisation (382 commits) |
| [v1.5.0, v1.5.1](https://github.com/ma3u/MinimumViableHealthDataspacev2/releases/tag/v1.5.1)   | 2026-04-18 | Automated releases; GraphRAG deploy on Azure (Phase 25)                                        |
| [v1.3.0 to v1.4.3](https://github.com/ma3u/MinimumViableHealthDataspacev2/releases/tag/v1.4.2) | 2026-04-17 | Patient timeline by month, Keycloak post-logout fix, Neo4j temporal fix                        |
| [v1.2.0](https://github.com/ma3u/MinimumViableHealthDataspacev2/releases/tag/v1.2.0)           | 2026-04-12 | Azure Container Apps deployment and the ADR documents                                          |
| [v1.1.0](https://github.com/ma3u/MinimumViableHealthDataspacev2/releases/tag/v1.1.0)           | 2026-04-11 | Hospital-grade design system, WCAG 2.2 AA, SIMPL-Open gap analysis                             |
| [v1.0.0](https://github.com/ma3u/MinimumViableHealthDataspacev2/releases/tag/v1.0.0)           | 2026-03-30 | EHDS Health Dataspace reference implementation                                                 |

### On `main` since v2.0.0 (not yet tagged)

107 merged pull requests between 2026-09-29 and 2026-10-04 (91 without Dependabot). Issues closed
in that time:

| Area                  | Closed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Azure platform        | [#10](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/10) ACA deployment · [#318](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/318) CFM agents on Azure · [#421](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/421) data planes boot · [#455](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/455) Vault keeps its state (ADR-046) · Postgres on Flexible Server (ADR-041) · everything stops off hours (ADR-053)                                                                                                                                                                  |
| Security and access   | [#404](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/404) every API route needs a session (ADR-044) · [#4](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/4) BSI C5 plan · [#6](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/6) pentest results · [#426](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/426) Dependabot and audit · CodeQL, Semgrep and gitleaks in the gates                                                                                                                                                                                                    |
| Dataspace and EDC     | [#328](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/328) participant activation · [#380](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/380) CFM reachable on CI · [#486](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/486) participant directory · [#190](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/190) Traefik routes · [#191](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/191) NATS volume                                                                                                                                                           |
| Product               | [#186](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/186) Klarbefund scanner app · [#19](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/19) NLQ for researchers · [#349](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/349) API collection by persona (ADR-032) · [#447](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/447) hydration error · [#436](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/436) refactoring follow-ups                                                                                                                                   |
| Closed as not planned | [#3](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/3) cost per tenant · [#11](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/11) weekly demo reset · [#12](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/12) DCP/eIDAS patient credential · [#18](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/18) IDAT matching · [#180](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/180) DSP identifier (fixed in #331; the end-to-end proof waits on #345 and #503) · [#481](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/481) confidential SPE (ADR-052) |

Earlier closed issues: [#1](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/1) Trust Center,
[#2](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/2),
[#8](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/8) federated discovery,
[#9](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/9) design system,
[#22](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/22),
[#24](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/24) and
[#80](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/80) the first EUDI wallet cluster (continued in #182).

### Roadmap phases

Detail for every phase is in the archives below; this table is the status only.

| Phase | Title                                                                                       | Status                                                                                         |
| ----- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 1–2   | EDC-V, DCore and CFM; DID:web, DCP v1.0 credentials, Keycloak SSO                           | ✅ (ADR-001 to 009)                                                                            |
| 3–3h  | Five-layer graph, Synthea → FHIR → OMOP, HealthDCAT-AP, EEHRxF                              | ✅                                                                                             |
| 4–5   | Dataspace integration (negotiation, transfer, federated catalog); federated queries and NLQ | ✅                                                                                             |
| 6–10  | Graph explorer and participant portal, TCK, test coverage, docs, tasks dashboard            | ✅                                                                                             |
| 11–17 | Component topology, policy seeding, hardening, E2E and journey tests, HealthDCAT-AP editor  | ✅                                                                                             |
| 18    | Trust Center and federated pseudonym resolution                                             | ✅ (#1, closed 2026-04-03; this table said "Planned" until 2026-10-04)                         |
| 19–22 | Role-aware UI, patient portal (GDPR Art. 15–22), graph UX and risk scoring, static personas | ✅                                                                                             |
| 23    | Stitch "Vitalis Blue" design alignment                                                      | 🔶 23a done; 23b–23e open in the archive, overtaken by the v2.0.0 persona overviews            |
| 24    | ODRL enforcement, federated search, GraphRAG, audit                                         | ✅ in substance (ODRL in NLQ and federated, ADR-044, hash-chained audit); no sub-phase markers |
| 25    | GraphRAG accuracy: GDS, APOC, Azure AI Foundry (ADR-019)                                    | ✅ (graphrag-deploy on Azure, v1.5.0)                                                          |
| 26    | Cross-participant dataset discovery (#8, ADR-020)                                           | ✅ (26g leftovers in [future/](planning/future/phase-26g-deferred.md))                         |
| 27    | EUDI wallet sandbox (#22, #24, #80, ADR-028)                                                | ✅ issues closed; the German wallet continues as #182                                          |

---

## Next release (v2.1.0)

Theme: Azure runs the same stack as compose and CI, onboarding works end to
end, the audit trail is complete, and Klarbefund signs in by itself. Ordered
by what blocks what.

| Issue                                                                      | What                                                                  | Where it stands (2026-10-04)                                                                                                                                                                                       |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [#503](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/503)  | Onboarding on Azure fails (control plane 500, issuer base64 ids)      | Root cause: Azure runs an April EDC build. Draft PR #517, ADR-055 Proposed; tooling ready and tested offline; live window Monday 2026-10-05 09:00 (runbook `docs/knowledge/runbooks/edc-v018-on-azure.md` in #517) |
| [#97](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/97)    | Dependency refresh, EDC 0.18 (Phase B)                                | 8 of 15 done. Compose and CI on 0.18; Azure is #503; three majors held (lucide-react 1.x and two more)                                                                                                             |
| [#345](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/345)  | CI stack had an empty IdentityHub and Neo4j; DSP provider answers 404 | The next blocker after #503, on both stacks: 0.18 virtual mode returns 404 for every DSP provider path                                                                                                             |
| [#473](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/473)  | Klarbefund: connect to EHDS, QR sign-in                               | QR pairing merged (#476, #511, ADR-049). The App Attest account is on the local branch `feat/klarbefund-account` (ADR-054), not pushed                                                                             |
| [#475](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/475)  | A research identity per patient                                       | First part merged (#479): researchers see pseudonyms. 2 of 10 boxes; ADR-051 reserved                                                                                                                              |
| [#418](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/418)  | Observability and a tamper-evident audit trail (ADR-045)              | 12 of 28 boxes. Cost guards, hash-chained AuditEvents, contract and transfer audit, Grafana boards merged; Azure collector and the rest open                                                                       |
| [#442](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/442)  | Flexible Server: narrow the firewall, verify TLS, move the CFM DSN    | 2 of 10. Was waiting on #455, which is closed                                                                                                                                                                      |
| [#359](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/359)  | Rotate hardcoded defaults (Keycloak, EDC admin, Neo4j, Vault token)   | Open. The Vault token `root` was added on 2026-10-04; rotate after #503                                                                                                                                            |
| [#435](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/435)  | braces advisory with no patch                                         | Production half gone with Tailwind 4 (#443); dev-only remainder under a time-boxed exception                                                                                                                       |
| [#514](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/514)  | `PUBLISHED_BY` points at two node types                               | Open, 0 of 3                                                                                                                                                                                                       |
| [#513](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/513)  | Klarbefund scan rows still unread                                     | First fixes in #515; 0 of 8 boxes ticked                                                                                                                                                                           |
| PR [#477](https://github.com/ma3u/MinimumViableHealthDataspacev2/pull/477) | Join the Klarbefund beta by a public TestFlight link                  | Open, not a draft, checks green; ADR-050                                                                                                                                                                           |

---

## Future releases

Not started, waiting on an outside party, or larger than one release.

| Issue                                                                     | What                                                           | Status (2026-10-04)                                                                                               |
| ------------------------------------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| [#182](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/182) | German national EUDI wallet ("d-you") and the #72 consent demo | 2 of 47. RP side now published upstream; [plan](planning/current/issue-182-german-national-wallet-integration.md) |
| [#478](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/478) | Klarbefund into the real ePA: a statutory insurer as partner   | Waiting: Steckbrief submitted 2026-10-04, review takes 6 to 8 weeks                                               |
| [#204](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/204) | Non-repudiable contract agreements: eIDAS-sealed data permits  | Not started, 0 of 16                                                                                              |
| [#413](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/413) | Lab reports: specimen type and ISO 15189:2022 report content   | Not started, 0 of 12; outreach to laboratories sent                                                               |
| [#338](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/338) | Specifications as oracles: API drift                           | 6 of 24                                                                                                           |
| [#375](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/375) | API checks that pass on an empty answer                        | 2 of 4                                                                                                            |
| [#5](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/5)     | Pentest checklist, the items that need a harness               | Reopened; J840–J848 automated, 25 boxes open ([plan](planning/current/issue-5-pentest-completion.md))             |
| [#27](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/27)   | Spanish HDAB 30-minute demo                                    | 13 of 18; three items settled elsewhere on 2026-10-04                                                             |
| [#26](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/26)   | SHACL and ShEx validation of HealthDCAT-AP                     | Inventory done 2026-07-17, no work since ([plan](planning/future/issue-26-healthdcat-ap-validation.md))           |
| [#20](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/20)   | AWMF Leitlinien as Layer 6 (Docling, ADR-021)                  | Branches merged April; 0 of 8 boxes, no activity since 2026-04-29                                                 |
| [#16](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/16)   | CDISC SDTM export                                              | Plan only, no activity since 2026-04-29                                                                           |
| [#14](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/14)   | k6 load test against ehds.mabu.red                             | Not started since 2026-04-15; its parent #3 was closed as not planned                                             |

Planned without an issue: [BSI C5 production audit](planning/future/issue-4-bsi-c5-production.md) (#4 closed with the demo track done), [operating company](planning/future/ehds-operating-company.md),
[longevity community data sharing](planning/future/longevity-community-data-sharing.md),
[Phase 26g leftovers](planning/future/phase-26g-deferred.md).

---

## Planning documents

| Document                                                                                          | Covers                                                                                           |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| [Planning index](planning/index.md)                                                               | Work items by bucket: `current/`, `future/`, `done/`                                             |
| [Roadmap, phases 1–10](planning/roadmap-phases-01-10.md)                                          | Infrastructure, identity and trust, graph, dataspace integration, federated queries, portal, TCK |
| [Roadmap, phases 11–20](planning/roadmap-phases-11-20.md)                                         | Topology, hardening, E2E, HealthDCAT-AP editor, journeys, Trust Center, role-aware UI, patient   |
| [Roadmap, phases 21–24](planning/roadmap-phases-21-24.md)                                         | Graph UX, static personas, design alignment, ODRL and GraphRAG, Phase 24 test plan               |
| [Cross-cutting concerns and architecture](planning/cross-cutting-and-architecture.md)             | Target architecture, phases 25–27, dependencies                                                  |
| [EUDI wallet flows (#80)](planning/eudi-wallet-flows-2026.md)                                     | Register, returning login and ePA transfer flows; the `NEXT_PUBLIC_DEMO_TK` gate                 |
| [German national wallet (#182)](planning/current/issue-182-german-national-wallet-integration.md) | RP contract from source, self-hosted verifier, wallet-provider backend                           |
| [Background: EDC component architecture](planning/background-edc-architecture.md)                 | Why EDC-V, DCore, CFM and JAD; DSP, DCP and DPS                                                  |

---

## Architecture Decisions

> **Note:** ADRs are maintained as standalone documents in [`docs/ADRs/`](ADRs/). Click any row below to read the full context, decision, and consequences for each ADR.

| ADR                                                                         | Title                                                                                           | Date       | Status            |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------- | ----------------- |
| [001](ADRs/ADR-001-postgresql-neo4j-split.md)                               | PostgreSQL vs Neo4j Data Storage Split                                                          | 2025-07-24 | Accepted          |
| [002](ADRs/ADR-002-edc-data-plane-architecture.md)                          | EDC Data Plane Architecture                                                                     | 2025-07-24 | Accepted          |
| [003](ADRs/ADR-003-healthdcat-ap-alignment.md)                              | W3C HealthDCAT-AP Alignment                                                                     | 2025-07-24 | Accepted          |
| [004](ADRs/ADR-004-nextjs-unified-frontend.md)                              | Next.js 14 as Unified Frontend                                                                  | 2025-07-25 | Accepted          |
| [005](ADRs/ADR-005-jad-cfm-source-builds.md)                                | JAD + CFM Source Builds                                                                         | 2026-03-09 | Accepted          |
| [006](ADRs/ADR-006-ghcr-image-publishing.md)                                | GHCR Image Publishing                                                                           | 2026-03-10 | Accepted          |
| [007](ADRs/ADR-007-did-web-dsp-negotiation.md)                              | DID:web Resolution & DSP Contract Negotiation                                                   | 2026-07-08 | Accepted          |
| [008](ADRs/ADR-008-testing-strategy.md)                                     | Comprehensive Testing Strategy                                                                  | 2026-03-11 | Accepted          |
| [009](ADRs/ADR-009-issuerservice-credential-fix.md)                         | IssuerService DCP Credential Issuance Fix                                                       | 2026-07-12 | Accepted          |
| [010](ADRs/ADR-010-wcag-accessibility.md)                                   | WCAG 2.2 AA Accessibility Compliance                                                            | 2026-04-01 | Accepted          |
| [011](ADRs/ADR-011-security-testing.md)                                     | Security Penetration Testing Strategy                                                           | 2026-04-01 | Accepted          |
| [012](ADRs/ADR-012-azure-container-apps.md)                                 | Azure Container Apps Deployment                                                                 | 2026-04-10 | Accepted          |
| [013](ADRs/ADR-013-simpl-open-alignment.md)                                 | SIMPL-Open EU Programme Alignment                                                               | 2026-04-05 | Accepted          |
| [014](ADRs/ADR-014-weekly-demo-reset.md)                                    | Weekly Demo Environment Reset                                                                   | 2026-04-12 | Accepted          |
| [015](ADRs/ADR-015-single-vm-dev-deployment.md)                             | Single-VM Dev Deployment (VS Subscription)                                                      | 2026-04-13 | Superseded        |
| [016](ADRs/ADR-016-aca-off-hours-scaledown.md)                              | ACA Off-Hours Scale-Down                                                                        | 2026-04-13 | Superseded by 042 |
| [017](ADRs/ADR-017-persistent-storage-aca.md)                               | Persistent Storage for Stateful ACA Services                                                    | 2026-04-14 | Accepted          |
| [018](ADRs/ADR-018-24x7-workaround-b.md)                                    | 24×7 Operation + Postgres-on-ACA Workaround B                                                   | 2026-04-14 | Accepted          |
| [019](ADRs/ADR-019-gds-apoc-azure-ai-foundry-graphrag.md)                   | GDS + APOC + Azure AI Foundry GraphRAG                                                          | 2026-04-15 | Accepted          |
| [020](ADRs/ADR-020-cross-participant-dataset-discovery.md)                  | Cross-Participant Dataset Discovery (Issue #8)                                                  | 2026-04-18 | Accepted          |
| [021](ADRs/ADR-021-docling-leitlinien-ingestion.md)                         | Docling AWMF Leitlinien Ingestion (Issue #20)                                                   | 2026-04-26 | Accepted          |
| [022](ADRs/ADR-022-edc-connector-cost-vs-function.md)                       | EDC Connector: Function vs Cost (Issue #25)                                                     | 2026-05-03 | Superseded        |
| [023](ADRs/ADR-023-reinstate-off-hours-scaledown.md)                        | Reinstate Off-Hours ACA Scale-Down                                                              | 2026-05-01 | Superseded by 042 |
| [024](ADRs/ADR-024-full-edc-provisioning-per-participant.md)                | Full EDC Provisioning per Participant on Azure                                                  | 2026-05-04 | Accepted          |
| [025](ADRs/ADR-025-keycloak-custom-domain.md)                               | Keycloak Custom Domain (auth.ehds.mabu.red)                                                     | 2026-05-10 | Accepted          |
| [026](ADRs/ADR-026-token-efficient-planning-structure.md)                   | Token-Efficient Planning & ADR Structure                                                        | 2026-05-17 | Accepted          |
| [027](ADRs/ADR-027-edc-stack-off-hours-scaledown.md)                        | EDC Stack in Off-Hours Scale-Down (FinOps)                                                      | 2026-05-18 | Superseded by 042 |
| [028](ADRs/ADR-028-patient-qr-login-eudi-wallet.md)                         | Patient QR Login via EUDI Wallet (OpenID4VP)                                                    | 2026-06-04 | Accepted          |
| [029](ADRs/ADR-029-dependency-version-pinning.md)                           | Dependency Version Pinning & Refresh Cadence                                                    | 2026-07-15 | Accepted          |
| [030](ADRs/ADR-030-neo4j-2025-lts-migration.md)                             | Neo4j 5.26 → 2025.x Migration Readiness                                                         | 2026-07-16 | Accepted          |
| [031](ADRs/ADR-031-checks-must-assert.md)                                   | Checks must assert and exit non-zero                                                            | 2026-09-09 | Accepted          |
| [032](ADRs/ADR-032-persona-organised-api-collection.md)                     | API collection organised by EHDS persona                                                        | 2026-09-26 | Accepted          |
| [033](ADRs/ADR-033-lab-report-extraction-pipeline.md)                       | Two-stage lab-report extraction: self-hosted parse, schema extraction, EU-resident models       | 2026-09-13 | Accepted          |
| [034](ADRs/ADR-034-claude-workload-identity-federation.md)                  | Reach the Claude API through workload identity federation, from a backend, never from the phone | 2026-09-13 | Accepted          |
| [035](ADRs/ADR-035-inference-provider-residency-and-quota.md)               | Azure EU by default, Anthropic by explicit consent, and the user's own provider without limit   | 2026-09-13 | Accepted          |
| [036](ADRs/ADR-036-operator-secrets-in-key-vault.md)                        | Operator secrets live in Azure Key Vault and are referenced, never copied                       | 2026-09-13 | Accepted          |
| [037](ADRs/ADR-037-secure-processing-environment-confidential-computing.md) | A secure processing environment built on confidential computing, not on trust in the operator   | 2026-09-14 | Accepted          |
| [038](ADRs/ADR-038-scan-retained-diagnostics-export.md)                     | The scan is kept, as a sealed PDF, and diagnostics leave the phone only as a deliberate export  | 2026-09-19 | Accepted          |
| [039](ADRs/ADR-039-published-reference-ranges.md)                           | Published reference ranges are quoted alongside the printed one, never in place of it           | 2026-09-19 | Accepted          |
| [040](ADRs/ADR-040-derived-compliance-state-in-the-api.md)                  | Derived compliance state is computed in the API                                                 | 2026-09-24 | Accepted          |
| [041](ADRs/ADR-041-managed-postgres-on-azure-containerised-locally.md)      | Managed PostgreSQL on Azure, containerised locally                                              | 2026-10-02 | Accepted          |
| [042](ADRs/ADR-042-off-hours-scaledown-current-state.md)                    | Off-hours scale-down, the state that runs today                                                 | 2026-10-02 | Accepted          |
| [043](ADRs/ADR-043-graph-access-direct-or-through-the-proxy.md)             | UI routes read the graph directly; the proxy serves the data planes                             | 2026-10-02 | Accepted          |
| [044](ADRs/ADR-044-every-api-route-needs-a-session.md)                      | Every API route needs a session                                                                 | 2026-10-02 | Accepted          |
| [045](ADRs/ADR-045-observability-and-regulatory-audit-trail.md)             | Cloud-native, vendor-agnostic observability and a tamper-evident audit trail                    | 2026-10-02 | Accepted          |
| [046](ADRs/ADR-046-vault-keeps-its-state-on-the-flexible-server.md)         | The Azure Vault keeps its state on the Flexible Server                                          | 2026-10-03 | Accepted          |
| [047](ADRs/ADR-047-vault-stays-up-off-hours.md)                             | Vault stays up off-hours until it keeps its own state                                           | 2026-10-03 | Accepted          |
| [048](ADRs/ADR-048-testflight-request-mailed-without-a-session.md)          | The TestFlight request is mailed by the hub, without a session                                  | 2026-10-03 | Accepted          |
| [049](ADRs/ADR-049-klarbefund-connects-by-device-grant.md)                  | Klarbefund connects to a patient's record by a device grant the website starts                  | 2026-10-03 | Accepted          |
| [052](ADRs/ADR-052-confidential-spe-on-azure-revisited.md)                  | The confidential secure processing environment, revisited against Azure and the vendors of 2026 | 2026-10-04 | Proposed          |
| [053](ADRs/ADR-053-everything-stops-off-hours.md)                           | Everything stops off hours, and the UI says so                                                  | 2026-10-04 | Accepted          |

Numbers taken by open work, so a new ADR starts at **056**: 050 (PR #477), 051
(#475), 054 (`feat/klarbefund-account`, local), 055 (PR #517, #503).

ADR-045 to ADR-049 accepted on 2026-10-04.

> **Note:** The full text of ADR-1 through ADR-9 has been moved into the standalone ADR documents linked in the table above. Click any row to read the full context, decision, and consequences.
