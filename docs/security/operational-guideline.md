# Operational guideline: hosting the hub and Klarbefund under the EHDS and the BSI standards

What is in this repository is a demonstrator: one Azure resource group, one
operator, fictional participants, synthetic patients, and a stack that stops
at night to stay inside a personal credit. This guideline is written for the
day someone hosts it for real: a health data access body, an operating
company working for one, a health insurer, a hospital group, or a vendor who
takes the white-label app. It says which role in Regulation (EU) 2025/327
(the EHDS) operates which part, what the BSI standards require of each part,
and what has to change from the demo before any real health data touches it.

Article numbers are those of the adopted Regulation. Older files in this
repository still carry the numbers of the 2022 proposal; the mapping is in
[`docs/ehds-article-numbering.md`](../ehds-article-numbering.md). The
evidence behind every "the demo already does" below is in the
[security test report](security-test-report-2026-10-15.md), the two threat
models ([hub](threat-model.md), [app](threat-model-klarbefund.md)), the
[C5 gap analysis](bsi-c5-gap-analysis.md) and the Klarbefund
[self-assessment](../klarbefund/self-assessment.md). This document is a
guideline by the project, not legal advice and not a certification.

## 1. The roles in the EHDS, and who operates what

The Regulation names the roles; it does not say who runs the servers below
the access body. The hub's seven Keycloak roles are the technical shadow of
the legal roles, and the table says which legal actor stands behind each
technical one when the system leaves the demo.

| EHDS role (Reg. 2025/327)                                                                                           | What the Regulation expects of it                                                                                                                                                           | Hub role / component                                                                                   | Who operates it in a real deployment                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Natural person** (the patient), Art. 3 to 10, opt-out Art. 71                                                     | Access to their own electronic health data, insertion, rectification, restriction, information on who accessed; the right to opt out of secondary use.                                      | `PATIENT`; `/patient/*`; Klarbefund on the phone; EUDI wallet sign-in (ADR-028)                        | Themselves, through the access service of the digital health authority or an EHR system; the app is theirs, the operator never sees its content. |
| **Health professional**, Art. 11                                                                                    | Access to the priority categories of the persons under their care, logged and visible to the person.                                                                                        | Not a role in the demo (primary-use access to the record goes through the ePA, not the hub)            | The EHR system's operator; the hub only receives what the person exports.                                                                        |
| **Health data holder**, Art. 2(2)(y), duties Art. 60, dataset description Art. 77                                   | Make the Art. 51 categories available on a permit, describe datasets, communicate with the access body, apply the quality label (Art. 78).                                                  | `DATA_HOLDER`; `/data/share`, `/data/transfer`; the connector (control plane, data plane, IdentityHub) | The holder itself (a hospital, an insurer, a registry); the operating company may host its connector under an Art. 28 GDPR processing contract.  |
| **Health data user**, Art. 61, applications Art. 67, permit Art. 68                                                 | Process only inside the secure processing environment, only for the permit's purpose (Art. 53), never for the prohibited purposes (Art. 54), publish results, report breaches.              | `DATA_USER`; `/data/discover`, `/negotiate`, `/analytics`, `/query`                                    | The researcher's institution; it never operates infrastructure, it is a tenant of the SPE.                                                       |
| **Health data access body (HDAB)**, Art. 55, tasks Art. 57, enforcement Art. 63                                     | Decide on applications, issue permits, provide the SPE (Art. 73), keep the public register and the information duties (Art. 58, 59), enforce (Art. 63), be controller of the SPE (Art. 74). | `HDAB_AUTHORITY`; `/compliance`, `/admin/policies`, the permit register, `HDABApproval` nodes          | The designated public body; it owns the decisions and the controllership even where it buys the operation.                                       |
| **Trusted health data holder**, Art. 72                                                                             | A holder allowed to run the simplified procedure for its own data, with the same SPE and logging duties.                                                                                    | A `DATA_HOLDER` with HDAB-delegated rights (not modelled separately in the demo)                       | The holder, under the access body's supervision.                                                                                                 |
| **Secure processing environment operator**, Art. 73                                                                 | Access only for authorised natural persons, no download of personal data, every access and output logged, outputs checked for personal data before release, security audited.               | `TRUST_CENTER_OPERATOR`; `/analytics`, `/query`, `SPESession`, the OMOP aggregates; ADR-037, ADR-052   | The access body or its operating company; on a certified cloud (C5 attestation) with confidential computing where the data warrants it.          |
| **Digital health authority**, Art. 19; national contact points, Art. 23 and 75                                      | Primary use: the access service, MyHealth@EU; secondary use: HealthData@EU and the cross-border permits.                                                                                    | The second access body and the cross-border permit in the seed; the federated catalogue (ADR-020)      | The member state's designated authorities; the hub is a participant, never the national contact point itself.                                    |
| **EHR system manufacturer**, Chapter III; **wellness app** label, Art. 48                                           | Conformity of the EHR system's European interoperability and logging components; a wellness app may declare interoperability with an EHR system.                                            | Klarbefund as a wellness-type app that exports to the ePA; FHIR R4 in the EEHRxF profiles              | The vendor who ships the app; for the white-label case, the insurer as the entity placing it on the market.                                      |
| **Platform operator** (not an EHDS role; the operating company of `docs/ehds-operating-company.md`)                 | Runs identity, catalogue, connectors, SPE and monitoring for the actors above; a processor under GDPR Art. 28 for each of them.                                                             | `EDC_ADMIN`; `/admin/*`, the Azure resource group, Keycloak, Vault, Key Vault, the pipelines           | A contracted operator with an ISO 27001 ISMS on the basis of IT-Grundschutz and a C5-attested cloud underneath.                                  |
| **Supervisory authorities**: data protection (GDPR), market surveillance (Chapter III), BSI / national CSIRT (NIS2) | Receive breach notifications, audit, enforce.                                                                                                                                               | The audit trail (ADR-045), the activity report, the permit register                                    | Not operators; the operator must be able to answer them within the clocks in section 7.                                                          |

Two things follow. **Controllership is never the operator's.** The access
body is controller for the SPE and the permit data (Art. 74); the holder is
controller of its source data; the operator processes on instruction. Every
hosting contract repeats this. **Role grants are decisions, not tickets.**
Who becomes `HDAB_AUTHORITY` or `TRUST_CENTER_OPERATOR` is decided by the
access body in writing; the operator executes the grant in Keycloak and the
grant is logged (ADR-045). The demo assigns roles in a seed file; a real
deployment removes the seed and keeps the grant history.

## 2. Hosting architecture: from the demo to an operable platform

The demo runs everything in one Azure Container Apps environment,
`rg-mvhd-dev` (ADR-012), stopped off hours (ADR-053, ADR-058). The shape
below keeps the components and changes how they are placed.

| Zone              | Components                                                                | Demo today                                                                               | Required for real data                                                                                                                                                                                                                                                                |
| ----------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Edge              | TLS termination, WAF, rate limits                                         | ACA ingress with managed certificates; headers set by `next.config` (F8)                 | A web application firewall in front of every public hostname; TLS per BSI TR-02102-2 (TLS 1.2 minimum, 1.3 preferred, no CBC suites); HSTS preloaded; rate limits per route and per identity; bot and DDoS protection from the cloud.                                                 |
| Identity          | Keycloak, IdentityHub, IssuerService, the EUDI wallet backend             | Keycloak `start-dev` behind a Caddy guard (F10); realm from `keycloak-realm.json`        | Keycloak in production mode with its own database on the Flexible Server, admin console reachable only from the operator's network, MFA for every privileged role (C5 IAM-04), the realm under version control and drift-checked (`docs/knowledge/runbooks/keycloak-realm-drift.md`). |
| Application       | The hub (Next.js), the neo4j-proxy, the explanation service, the crawlers | Public ingress for the hub and Keycloak; internal ingress for the rest                   | Only the hub and Keycloak public; everything else on internal ingress or private endpoints; every image signed and pinned by digest; the bills of materials in `docs/sbom/` regenerated on every dependency change.                                                                   |
| Connectors        | Control plane, data planes, IdentityHub, Vault per participant            | One connector set per fictional participant (ADR-024)                                    | One connector per legal holder, operated by the holder or by the operator under contract; DSP endpoints mutually authenticated; the participant's keys in its own Vault namespace (ADR-046), never shared.                                                                            |
| Data              | Neo4j, the PostgreSQL Flexible Server, Azure Files                        | Managed Postgres (ADR-041); Neo4j on Azure Files (ADR-017); no backups                   | Encryption at rest with customer-managed keys (C5 CRY-03, DIP-02); zone-redundant Postgres with point-in-time restore; Neo4j Enterprise or a managed graph with backups tested quarterly (DIP-03); no synthetic data and no real data in the same instance.                           |
| Secure processing | `/analytics`, `/query`, the OMOP aggregates, `SPESession`                 | Aggregates in the same Neo4j; confidential computing assessed (ADR-037, ADR-052)         | A separate environment per Art. 73: isolated network, no outbound internet, no download path, output checked by the access body before release, confidential VMs or enclaves where the permit's data warrant it; audited at least annually.                                           |
| Secrets           | Key Vault, Vault                                                          | Every operator secret a Key Vault reference (ADR-036); Vault state on Postgres (ADR-046) | Keep; add rotation on a schedule (C5 CRY-04), HSM-backed keys for signing credentials, and a documented break-glass procedure with two-person approval.                                                                                                                               |
| Observability     | The OpenTelemetry collector, Grafana, Loki, Tempo, Prometheus (ADR-045)   | One observability app; logs in Azure Monitor                                             | Logs shipped to a SIEM the operator's SOC watches; immutability for the audit trail (DIP-06); retention per section 6; alerting on the events in section 7.                                                                                                                           |
| Availability      | The whole stack                                                           | Stops at 18:13 UTC, starts at 05:17 UTC on weekdays                                      | 24x7 with the targets of the service contract; the off-hours schedule is a demo cost measure and is removed (it is one `az` call, `scripts/azure/offhours.sh`, and ADR-053 is superseded by the hosting decision).                                                                    |

The demo's one resource group becomes at least three subscriptions or
resource groups with separate identities: identity and edge, the platform,
and the secure processing environment. The SPE's identity never has rights
in the others. This is C5 control domain "PSS" (portability and
segregation) and IT-Grundschutz NET.1.1 in practice.

## 3. The BSI standards, part by part

| Standard                                                        | Applies to                                                        | What it asks here                                                                                                                                                                                                                                                                                          | Where the project stands                                                                                                                                                                                       |
| --------------------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **BSI C5:2020** (Cloud Computing Compliance Criteria Catalogue) | The cloud underneath and the operator as a cloud service provider | An attestation report (type 2) for the infrastructure from the cloud provider, and the operator's own C5 report for the platform if it offers it as a service. The criteria the code can meet are tracked control by control.                                                                              | [C5 gap analysis](bsi-c5-gap-analysis.md): the development, IAM and audit-logging criteria met or partly; organisational ones open.                                                                            |
| **ISO 27001 on the basis of IT-Grundschutz**                    | The operator                                                      | An ISMS with the building blocks that match this stack: APP.3.1 web applications, APP.4.4 Kubernetes (ACA is the same model), SYS.1.6 containers, CON.1 cryptography, ORP.4 identity and authorisation, OPS.1.1.5 logging, OPS.1.2.5 remote maintenance, DER.2.1 incident handling, CON.2 data protection. | Not something a repository can hold; the threat models and the test report are inputs to the risk analysis.                                                                                                    |
| **TR-02102-1 and -2** (cryptographic mechanisms, TLS)           | Every connection and every stored secret                          | TLS 1.2 or 1.3 with the listed suites; AES-GCM at 256 bit for data at rest; RSA at 3000 bit or ECDSA P-256 and above for signatures; SHA-256 and above; keys rotated.                                                                                                                                      | The app: AES-GCM per record, key in the Secure Enclave (self-assessment O.Cryp). The hub: TLS from the platform, checked black-box; the suites of the edge are the cloud's and must be pinned in the contract. |
| **TR-03161** (security requirements for health applications)    | Klarbefund, and any white-label build of it                       | The objectives of part 1 (mobile apps) and part 2 (web/backends): purpose, architecture, source code, third parties, cryptography, authentication, data storage, paid resources, network, platform, resilience.                                                                                            | [Self-assessment](../klarbefund/self-assessment.md), objective by objective; the requirement-level list and an independent test are open (test report, section "What an independent test would add").          |
| **TR-03116-4** (TLS in federal projects)                        | Any deployment for a public body                                  | The TLS profile a federal operator must use; stricter than TR-02102-2 on cipher suites and certificate chains.                                                                                                                                                                                             | Not checked; the edge configuration is the cloud's.                                                                                                                                                            |
| **TR-03107-1** (electronic identities and trust services)       | Sign-in of natural persons                                        | Assurance levels for identification; "substantial" or "high" for access to one's own health record.                                                                                                                                                                                                        | The EUDI wallet sign-in (ADR-028) targets "high" through the wallet; Keycloak username and password is demo only.                                                                                              |
| **NIS2 as transposed (BSIG)**, KRITIS thresholds                | The operator and the health entities on the platform              | Risk management measures, incident notification in 24 hours (early warning) and 72 hours, supply-chain security, management accountability; KRITIS registration if the thresholds for health are reached.                                                                                                  | Section 7 gives the clocks; the operating company doc has the escalation model.                                                                                                                                |

The ordering matters for a tender: the cloud's C5 report is what a public
buyer asks for first, the operator's ISMS second, the app's TR-03161 test
third. None of them are produced by code; the code produces the evidence
they read.

## 4. Identity and access

- **One identity provider, operated by the platform operator, with the
  realm in version control.** Keycloak holds the roles; the hub trusts only
  the roles in the token (`ui/src/lib/auth.ts`). Every API route needs a
  session (ADR-044); the one exception per route is written as an ADR, never
  as a configuration flag.
- **Organisations prove who they are with verifiable credentials** issued
  against an authoritative register (DCP v1.0, `did:web`). The IssuerService
  is the operator's; the holder's keys stay in the holder's Vault
  namespace. The demo's seed issues credentials to fictional organisations;
  a real deployment issues them only after the onboarding steps in the
  operating-company document, step 3.
- **Natural persons sign in through the EUDI wallet or the national eID**,
  at assurance "high" for their own record (Art. 16 identification
  management; TR-03107). Username and password remain for staff, with MFA,
  and never for patients.
- **Privileged roles** (`EDC_ADMIN`, `HDAB_AUTHORITY`,
  `TRUST_CENTER_OPERATOR`) require MFA, a named person, a documented grant by
  the access body, and a review every quarter. Service accounts (the
  catalogue crawler's token, ADR-020; the app's sandbox account, ADR-054) are
  listed with owner, scope and rotation date.
- **The Keycloak admin console is not on the internet** (finding F10, the
  Caddy guard in `scripts/azure/guard-keycloak-console.sh`); administration
  goes through a private network or a bastion with session recording.
- **Sessions** are short for privileged roles, bound to the client, and
  revoked on role change. `NEXTAUTH_SECRET` and every other operator secret
  is a Key Vault reference (ADR-036), rotated on a schedule.
- **Who sees a patient's identity is decided by role, never by a
  parameter** (`ui/src/lib/patient-identity.ts`): holders and the platform
  operator for primary use, the patient for their own record only
  (`refuseForeignRecord`), everyone else a pseudonym. The NLQ proxy refuses
  identity-revealing queries. This stays as it is and is tested on every
  build.

## 5. Data protection

- **Controllership and contracts.** The access body is controller for the
  secure processing environment (Art. 74) and processor-instructs the
  operator; the holder is controller of its source data; the data user is
  controller of what it is permitted to process, inside the SPE only. Each
  pair signs an Art. 28 GDPR contract; the operating-company document gives
  the model.
- **A data protection impact assessment** before go-live, for the platform
  as a whole and for the SPE separately. The two threat models are the
  technical input; the DPIA adds the legal basis per data category (Art. 51)
  and the residual risks.
- **Data minimisation and purpose limitation** (Art. 66): the access body
  decides for each permit whether anonymised data answer the question, and
  only then pseudonymised data. The hub's OMOP aggregates and the k-anonymity
  of the cohort views are the anonymised path; the FHIR extraction is the
  pseudonymised one and runs only inside the SPE.
- **Pseudonymisation keys** are held by the access body or a trusted third
  party, never by the data user and never by the operator of the SPE.
- **The opt-out** (Art. 71) is a register the access body keeps; the
  holder's connector checks it before extraction. The demo has consent
  records in the app and on the patient page; a real deployment wires the
  national opt-out register into the ODRL policy evaluation.
- **Patient rights for primary use** (Art. 3 to 10): access, insertion,
  rectification, restriction, and the list of who accessed. The patient
  page's access log and the audit trail (ADR-045) are the implementation;
  the operator must answer a request within the GDPR month.
- **Residency.** Every processor is in the EU or EEA; the explanation
  service's model provider is chosen by region and quota (ADR-035), and the
  on-device model is the default so that no health value leaves the phone
  unless the person sends it.
- **The app** holds nothing the operator can read: values, pages and
  diagnostics are encrypted per record with a key in the Secure Enclave,
  excluded from backups, behind Face ID or the passcode (ADR-060). The
  white-label operator inherits this; it must not add telemetry that
  carries values.

## 6. Logging, retention and the audit trail

What must be logged, for how long, and who may read it. The project's
[audit retention policy](../audit-retention-policy.md) holds the current
numbers (it still cites the proposal's article numbers); the duties come
from Art. 57 (the access body keeps a record of applications and permits),
Art. 73 (every access to the SPE and every output logged), Art. 58 and 59
(information to the public, annual report) and GDPR accountability.

| Event                                                       | Logged by                          | Readable by                                            | Retention (project policy)                     |
| ----------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------ | ---------------------------------------------- |
| Data access, transfer, contract (the `TransferEvent` chain) | The neo4j-proxy and the connectors | The access body, the holder for its data, auditors     | 10 years                                       |
| Permit decisions, revocations                               | The access body in the hub         | Public register for the decision, parties for the file | 10 years                                       |
| SPE sessions: who, which dataset, which query, which output | The SPE                            | The access body; the data user for its own             | 10 years                                       |
| Role grants and revocations, privileged sign-ins            | Keycloak, shipped to the SIEM      | The operator's security team, auditors                 | 2 years, longer if an incident references them |
| HTTP access at the edge, authentication events              | The edge and Keycloak              | The operator's security team                           | 2 years                                        |
| Patient's own record: every read, by whom                   | The hub                            | The patient, on their page                             | As long as the record                          |
| App: diagnostics the person chooses to export               | The app, on the device only        | The person; the developers only if sent                | The person decides                             |

Three rules the demo already keeps and a real deployment must keep:
the audit trail is written by the service that performed the action, not by
the client; it is append-only for everyone but the retention job
(DIP-06, implement with an immutable store or a signed chain); and no log
line carries a health value or a name where a pseudonym does.

## 7. Incidents, clocks and who notifies whom

| Trigger                                                 | Clock                                                                                             | Who notifies whom                                                                                                                                              |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Personal data breach                                    | GDPR Art. 33: 72 hours to the supervisory authority; Art. 34: the persons without undue delay     | The operator informs the controller (access body or holder) without undue delay; the controller notifies the authority.                                        |
| Significant incident at a health entity or the operator | NIS2 as transposed: early warning in 24 hours, notification in 72 hours, final report in a month  | The operator's CSIRT contact to the BSI; the affected holders in parallel.                                                                                     |
| Data used outside the permit                            | Art. 63(2): the access body may revoke the permit and stop the processing without undue delay     | The SPE operator reports to the access body at once; the access body decides and, if a GDPR breach is possible, informs the supervisory authority immediately. |
| SPE audit finds a shortcoming                           | Art. 73(3): corrective action                                                                     | The access body instructs the operator; the fix is evidenced in the next audit.                                                                                |
| Serious incident of an EHR system or app                | Art. 44 (risks and serious incidents)                                                             | The manufacturer to the market surveillance authority; for the white-label app, the entity placing it on the market.                                           |
| Vulnerability in a dependency, high or critical         | Project rule: fixed or time-boxed exception within the CI gate (`docs/npm-audit-exceptions.json`) | The operator's security team; the scan runs on every push (`security-scan.yml`).                                                                               |

The alerting that feeds this table, at minimum: a privileged sign-in from a
new location, an admin-console request reaching Keycloak at all, a query
in the SPE that would reveal identity, a failed App Attest verification in
volume, a connector whose credential verification fails, a backup job that
did not run, and every HTTP 5xx rate above the floor.

## 8. Operating the platform

- **Change management.** Every change is a pull request with the gates in
  `docs/quality-gates.md`: type-check, lint, unit and journey tests, the
  Bruno collection against the hub, Semgrep, gitleaks, hadolint, the SBOM
  check, CodeQL for TypeScript and Swift, trivy and grype. Merges deploy
  through `deploy-azure.yml` from `main` only; the production environment
  adds a release approval by the operator's change board and a signed image.
- **Vulnerability management.** The scans in `scripts/security/scan-repo.sh`
  run on every push and nightly; high and critical findings are fixed within
  the contract's window or time-boxed with a written exception. The
  [security test report](security-test-report-2026-10-15.md) is repeated at
  every release and once a year by an independent tester.
- **Patching.** Base images rebuilt monthly and on advisories; Keycloak,
  Neo4j and Postgres on supported major versions (ADR-030 for Neo4j, the
  Postgres 16 to 17 runbook for the pattern).
- **Backups and recovery.** Postgres with point-in-time restore across
  zones; Neo4j with daily backups and a restore test every quarter; Vault's
  state is on Postgres (ADR-046) and the unseal keys in Key Vault with a
  documented recovery drill. Targets to agree in the contract: recovery
  point one hour, recovery time four hours for the hub, one working day for
  the SPE.
- **Availability.** 24x7; the demo's schedule is removed; health checks in
  every image (finding F6) and probes in every app definition; two replicas
  for the hub and the proxy; the off-hours page becomes a maintenance page
  used only inside announced windows.
- **Key management.** Signing keys for credentials in an HSM; TLS
  certificates automated; every secret rotated at least yearly and on
  personnel change; the break-glass procedure with two-person approval and a
  log.
- **Supplier security** (C5 OIS-05): Keycloak, Neo4j, the EDC components,
  the cloud and the model provider assessed and listed with their
  attestations; the bills of materials in `docs/sbom/` are the inventory.
- **Exit.** Data export in FHIR R4 and OMOP CDM is already the hub's
  interface; the contract names the format, the time and the deletion
  evidence at the end.

## 9. Klarbefund in a white-label deployment

The app changes owner but not architecture. The entity that places it on
the market:

- keeps the on-device default: values, pages and the explanation stay on the
  phone unless the person sends them (self-assessment O.Purp, O.Data);
- keeps the app lock and the encryption per record (ADR-060, O.Auth,
  O.Cryp) and does not add analytics that see values;
- operates the sandbox-account service (ADR-054) and, if offered, the
  explanation service (ADR-034, ADR-035) in the EU under its own name and
  its own DPIA;
- publishes a privacy notice in the person's language and a vulnerability
  disclosure address;
- commissions the TR-03161 test and, if it claims interoperability with an
  EHR system, the Art. 48 declaration; it does not claim DiGA status without
  the CE mark the DiGA route requires (self-assessment, "Regulation");
- repeats the accuracy evidence on its own report formats before the pilot
  (the benchmark in [`evidence.md`](../klarbefund/evidence.md) is synthetic).

## 10. Before go-live: the checklist by role

| #   | Item                                                                                      | Owner                              | Evidence                                                                                   |
| --- | ----------------------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------ |
| 1   | Hosting contract with controllership per Art. 74 and Art. 28 GDPR terms per pair          | Access body, operator              | Signed contracts                                                                           |
| 2   | Cloud provider's C5 type 2 report reviewed; scope covers every service used               | Operator                           | Report, scope mapping                                                                      |
| 3   | Operator's ISMS certified or on a dated plan; the building blocks of section 3 assigned   | Operator                           | Certificate or audit plan                                                                  |
| 4   | DPIA for the platform and for the SPE                                                     | Access body (controller)           | DPIA documents                                                                             |
| 5   | Network zones, private endpoints, WAF, TLS profile per TR-02102-2 or TR-03116-4           | Operator                           | Architecture, scan from outside (`check-hub-blackbox.sh` extended)                         |
| 6   | Keycloak in production mode, admin console private, MFA on privileged roles, realm in git | Operator                           | Realm diff, `guard-keycloak-console.sh --check`                                            |
| 7   | EUDI or eID sign-in for natural persons at assurance "high"                               | Operator, digital health authority | Conformance test of the wallet flow                                                        |
| 8   | Encryption at rest with customer-managed keys; backups and a restore drill                | Operator                           | Key Vault configuration, drill record                                                      |
| 9   | SPE isolated, no download path, output control procedure, annual audit scheduled          | Access body, SPE operator          | Audit plan, procedure                                                                      |
| 10  | Audit trail immutable, shipped to the SIEM, retention per section 6                       | Operator                           | SIEM configuration, retention job                                                          |
| 11  | Incident procedure with the clocks of section 7 and named contacts                        | Operator, access body              | Procedure, contact list, a tabletop exercise                                               |
| 12  | Independent penetration test of the hub and the TR-03161 test of the app                  | Operator, app owner                | Reports; findings closed or accepted in writing                                            |
| 13  | Off-hours schedule removed; replicas and probes in place                                  | Operator                           | App definitions                                                                            |
| 14  | Synthetic data removed from the production graph; seeds disabled; demo flag off           | Operator                           | `MATCH (p:Patient) RETURN count(p)` equals the holders' count; `NEXT_PUBLIC_DEMO_TK` unset |
| 15  | Opt-out register wired into policy evaluation                                             | Access body, operator              | Policy test with an opted-out record                                                       |
| 16  | Vulnerability disclosure address published; supplier list with attestations               | Operator                           | `SECURITY.md`, supplier register                                                           |

## 11. What the demonstrator does not do

So that nobody reads more into it than is there:

- It is one tenant, one operator, one region, stopped at night.
- Its participants, access bodies and patients are fictional; its credentials
  are issued by its own issuer against no register.
- It has no SIEM, no WAF, no customer-managed keys, no backup of the graph,
  no MFA, and the secure processing environment is a set of views on the same
  database, not an isolated environment (ADR-037 and ADR-052 record what was
  assessed).
- It has had no independent penetration test and no TR-03161 test; the
  [security test report](security-test-report-2026-10-15.md) is the project
  testing itself.
- Its EHDS article references are partly the proposal's numbers; this
  document uses the adopted ones.

What it does have is the shape, the roles, the logging, the role-based
identity rules, the connectors and the exports that a real deployment
needs, with every decision written as an ADR and every claim tied to a test.
That is what makes it a reference and not a product.

## Sources

- Regulation (EU) 2025/327 on the European Health Data Space, OJ L, 5 March 2025.
- Regulation (EU) 2016/679 (GDPR), Art. 28, 33, 34, 35.
- Directive (EU) 2022/2555 (NIS2) and its national transposition.
- BSI, Cloud Computing Compliance Criteria Catalogue C5:2020.
- BSI, IT-Grundschutz-Kompendium, current edition; BSI Standards 200-1 to 200-3.
- BSI TR-02102-1 and TR-02102-2, cryptographic mechanisms and TLS.
- BSI TR-03161, security requirements for digital health applications, parts 1 to 3.
- BSI TR-03116-4, cryptographic requirements for federal projects, TLS.
- BSI TR-03107-1, electronic identities and trust services in e-government.
- This repository: the ADRs cited above, `docs/ehds-operating-company.md`,
  `docs/audit-retention-policy.md`, `docs/ehds-article-numbering.md`.
