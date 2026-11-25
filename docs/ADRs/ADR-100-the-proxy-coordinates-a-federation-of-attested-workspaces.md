# ADR-100: The proxy coordinates a federation of attested workspaces, each answering through its own gateway

Date: 2026-11-25

**Status:** Proposed
**Relates to:** [ADR-045](ADR-045-observability-and-regulatory-audit-trail.md), [ADR-062](ADR-062-the-art-71-opt-out-is-a-record-and-a-label.md), [ADR-068](ADR-068-a-sovereign-confidential-spe-on-confidential-containers-and-trustee.md), [ADR-069](ADR-069-two-spe-workspaces-as-aci-confidential-containers.md), [ADR-072](ADR-072-spe-workspaces-start-on-demand.md), [ADR-094](ADR-094-national-health-data-stays-at-the-source.md), [ADR-044](ADR-044-every-api-route-needs-a-session.md)
**Tracks:** [#1236](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/1236), gap table in [#1225](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/1225)

## Context

The draft implementing act on secure processing environments under
Art. 73(5) of Regulation (EU) 2025/327
([draft PDF](https://ec.europa.eu/info/law/better-regulation/api/download/090166e53752f4ab),
applies from 26 March 2029) has a Chapter IV for operators that "support
federated processing". Its definition of federated processing (Art. 2(12))
is what `/federated/query`, `/federated/stats` and `/nlq` with
`federated: true` already do: a query goes to each instance, runs where the
data is, and only results come back. Chapter IV then asks for things the hub
does not have yet:

| Draft                | Asks for                                                                          | The hub today                                                                                                                                                  |
| -------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Art. 18(1)           | A public list of the instances in the federation                                  | Both workspaces appear in the catalogue behind a sign-in; no list of members                                                                                   |
| Art. 18(2)(c), (d)   | Interoperable user management; encrypted, authenticated traffic between instances | One Keycloak; Bolt with TLS, but only the workspace is authenticated, by a CA on the maintainer's laptop, and the proxy by a password                          |
| Art. 18(2)(e), (g)   | The analysis runs where the data is; no source data moves between instances       | Met since #1242: row-level queries about persons are never sent, counts are masked per workspace, totals use `combineCounts`                                   |
| Art. 18(2)(f)        | Logging across the federation that joins each instance's logs                     | The proxy copies each workspace's `SpeEvent` nodes into the `spe` chain every minute; nothing joins a query's entry on the hub to what happened in a workspace |
| Art. 19(2), 20(1)(a) | A coordinating operator with named duties                                         | The proxy acts as one, but no document says so                                                                                                                 |
| Art. 20              | A written agreement on roles, admission, exclusion and incidents                  | None                                                                                                                                                           |
| Art. 19              | Federated learning: train locally, exchange model updates                         | Not offered, out of scope                                                                                                                                      |

How a federated query runs today
([federated.ts:147](../../services/neo4j-proxy/src/routes/federated.ts#L147)):
the proxy holds one Neo4j driver per workspace
([db.ts:56](../../services/neo4j-proxy/src/db.ts#L56)) and sends the caller's
Cypher straight to each workspace's Bolt port in a read-only session with the
Art. 71 opt-out filter
([federated.ts:193](../../services/neo4j-proxy/src/routes/federated.ts#L193)).
The workspace answers with its raw rows; the proxy masks each workspace's
counts below k and combines them
([`federatedAnswer`](../../services/neo4j-proxy/src/k-anonymity.ts#L218),
[`combineCounts`](../../services/neo4j-proxy/src/k-anonymity.ts#L177)).
Three consequences of that shape matter for Chapter IV:

1. **The unmasked per-workspace counts leave the workspace.** They reach the
   proxy's memory, outside the trusted execution environment, and the
   masking runs there. The draft allows aggregates to move between
   instances (Art. 2(12)), so this is lawful, but the feedback we submitted
   ([F33583920](https://ec.europa.eu/info/law/better-regulation/have-your-say/initiatives/17192-European-Health-Data-Space-requirements-for-secure-processing-environments/F33583920_en),
   point 2) asks for suppression in each instance before results leave it.
   The hub should do what it asks the act to require.
2. **Neither side's identity is bound to the attestation.** The workspace's
   Bolt key and certificate are made on the maintainer's laptop by
   [`spe-tls.sh`](../../scripts/azure/spe-tls.sh) and reach the group in its
   secret volume
   ([21-aci-confidential-spe.sh:540](../../scripts/azure/21-aci-confidential-spe.sh#L540)).
   Whoever can set that volume can present a workspace that never attested.
   The proxy authenticates with a per-workspace Neo4j password from the same
   volume.
3. **A workspace keeps no record of the queries it answered.** Its read-only
   session cannot write, and Neo4j Community has no query log. The `spe`
   chain has the loads, attestations and deletions, not the queries.

Today one operator runs both workspaces (AlphaKlinik Berlin's on SPE-1,
Limburg Medical Centre's on SPE-2, ADR-069), and MedReg DE, the access body,
runs the Trustee (ADR-068). Chapter IV still applies, and the design has to
let a second operator's instance join, for example one run for Institut de
Recherche Santé, without changing what the first two do.

## Decision

1. **The proxy's federated routes are the coordinating operator's service.**
   The hub operator is the coordinating operator in the sense of Art. 19(2)
   and 20(1)(a). Its duties, written into the agreement of decision 6:

   - admit an instance only once it is listed (decision 5), has attested and
     holds a federation certificate (decision 3);
   - dispatch only aggregate queries, and refuse a list of records about
     persons before any instance is asked (as today, rule 3 in
     [federation.md](../architecture/federation.md#privacy-rules-on-the-federated-query-path));
   - combine the masked answers with `combineCounts`, so no total gives a
     suppressed count back;
   - record every federated query on the audit chain before the answer goes
     out (fail closed, ADR-045), with the correlation id of decision 4;
   - stop dispatching to an instance that fails attestation, is suspended or
     reports an incident, and tell the access body and the other members.

2. **Each workspace answers through its own gateway, inside the attested
   group.** The `spe-ingest` sidecar, which already stays up after the load
   ([stay.ts](../../services/spe-loader/src/stay.ts)), gets one HTTPS
   endpoint, `POST /federated/run`, with `{federationQueryId, cypher, params,
minK, permitId, scope}`. For each request it:

   1. checks the caller's client certificate is the coordinator's
      (decision 3);
   2. applies the same refusals as the coordinator again: read-only Cypher,
      nothing outside the graph, no row-level answer about persons, k never
      below the workspace's own minimum;
   3. writes an `SpeEvent {kind: 'federated-query', federationQueryId,
cypherSha256, permitId, at}` into the workspace's graph, and answers
      nothing if that write fails;
   4. runs the query with the Art. 71 opt-out filter, as the proxy does
      today (ADR-062);
   5. masks every count below k to `"<k"`, with the same `k-anonymity`
      code the proxy uses, moved into a package both build from;
   6. updates the event with the outcome and the number of rows, and
      returns the masked answer.

   Bolt then listens only inside the group (`localhost`), so the gateway is
   the one way in. The gateway's image is in the group's ccePolicy, so its
   code is part of the policy hash the access body binds the permit's key
   to (ADR-068 decision 2): the masking that runs is the masking the access
   body approved. The coordinator keeps its own masking and `combineCounts`
   as a second line, and never receives an unmasked count.

3. **Instances authenticate each other with mutual TLS, from a federation CA
   the access body holds; the workspace's key is released only to an
   attested workspace.**

   - The federation CA moves from the maintainer's laptop to the access body,
     beside its Trustee. It signs one server certificate per workspace and
     one client certificate for the coordinator. Admitting an instance means
     issuing its certificate; excluding it means revoking that certificate.
   - A workspace's private key is a Trustee resource,
     `default/spe-<n>/tls-key`, released under the same policy as the
     extract key. Only a workspace whose SEV-SNP report carries the permit's
     policy hash can present its certificate, so a valid TLS handshake
     proves an attested workspace of this federation. It no longer travels
     in the group's secret volume.
   - The coordinator's client key lives in Key Vault (`kv-mvhd-b53a0449`),
     reaches the proxy as a `keyvaultref` ([ADR-036](ADR-036-operator-secrets-in-key-vault.md)) and is never printed.
     The per-workspace Neo4j password stays, for the loader only.
   - When a second operator joins, its operator identity is a DCP credential
     (a `FederationMembershipCredential` issued by the access body's
     IssuerService to the operator's DID); the access body checks it before
     it issues the instance's certificate. The credential admits the
     organisation, the certificate carries the traffic.
   - User management across the federation (Art. 18(2)(c)) stays one
     Keycloak at the coordinator: a workspace never signs a user in. The
     coordinator passes the permit id and the pseudonymous user id of the
     named person (#1247) to the gateway, which records them on the
     `SpeEvent`.

4. **One correlation id per federated query, in every log it touches.** The
   coordinator creates a `federationQueryId` (UUID v4) for each federated
   query, on `/federated/query`, `/federated/stats` and `/nlq` with
   `federated: true`. It is on the coordinator's `QueryAuditEvent`, on each
   workspace's `SpeEvent` (decision 2), in the response to the caller, and
   beside the W3C `trace_id` on every log line of the request
   ([tracing.ts](../../services/neo4j-proxy/src/tracing.ts)). The minute
   sync already copies `SpeEvent` nodes into the `spe` chain, so one query
   can be followed from the hub's entry to every workspace's entry by that
   id. Until the gateway exists, the coordinator passes the id to each
   workspace as Neo4j transaction metadata and records one dispatch entry
   per workspace on its own side.

5. **The members are published as HealthDCAT-AP data services.** Each
   instance is a `dcat:DataService` in the hub catalogue
   (`(:DataService {serviceId: 'service:spe-1'})`, constraint in
   [init-schema.cypher](../../neo4j/init-schema.cypher)) with
   `dcat:endpointURL` its gateway, `dcat:servesDataset` the workspace's
   `HealthDataset`, `dct:conformsTo` OMOP CDM 5.4 and FHIR R4, `dct:publisher`
   its operator, and the federation's own fields: membership status
   (`admitted`, `suspended`, `excluded`), the date admitted, the agreement
   version and the label of its last attestation. The registration cypher each
   workspace already applies
   ([spes.ts](../../services/spe-loader/src/spes.ts)) adds it. The list is
   public (Art. 18(1)) without a new anonymous route: it is generated as
   JSON-LD into the static documentation site at each release, and shown
   signed in on `/catalog`. ADR-044 stands.

6. **A written federation agreement, in the repository.**
   `docs/governance/federation-agreement.md`, versioned, with the fictional
   parties: the hub operator as coordinator, AlphaKlinik Berlin and Limburg
   Medical Centre as members whose data the instances hold, MedReg DE as the
   access body. It covers what Art. 20 lists: roles and the coordinator's
   duties (decision 1); admission (listed, attested, certificate issued,
   agreement signed); the technical rules (aggregates only, k of at least 5
   masked in each instance, the correlation id, log retention by the
   Art. 16(4) rule from #1242); suspension and exclusion (failed
   attestation, a breach of the rules, an incident not reported); incidents
   (a member tells the coordinator within 24 hours, the coordinator stops
   dispatching and tells the access body and the other members); change and
   exit. The `governance` row on `/compliance/spe-act` links it.

7. **Federated learning (Art. 19) stays out of scope** until a permit asks
   for it. The gateway's endpoint is for queries only.

### Order of the work

Each step stands on its own and leaves the federation working:

1. The correlation id on the coordinator's side, with transaction metadata
   (decision 4, interim form).
2. The member list as data services and the agreement (decisions 5, 6).
   The `federation-members` and `governance` rows on `/compliance/spe-act`
   are re-rated.
3. The federation CA at the access body, the workspace key in Trustee, the
   coordinator's client key in Key Vault (decision 3). The
   `federation-identity` row is re-rated.
4. The gateway in `spe-ingest`, the shared `k-anonymity` package, Bolt
   closed to the outside, the coordinator switched to `POST
/federated/run` (decision 2); the workspace-side `SpeEvent` for each
   query completes decision 4.

## Consequences

- A federated query has one id that leads from the hub's audit entry to each
  workspace's own record of it, so a regulator can check what an instance
  did without trusting the coordinator's account of it.
- No unmasked count leaves a workspace, and the masking code is covered by
  the attestation. The coordinator no longer has to be trusted with small
  counts, which is the rule we asked the Commission to set.
- A workspace that has not attested cannot complete a handshake, because its
  key never left the Trustee. Admission and exclusion become certificate
  operations the access body performs, not changes to the proxy.
- The gateway is new code inside the trusted computing base: it changes the
  ccePolicy, so every change to it is a new policy hash and a new key
  binding ([ADR-073](ADR-073-the-spe-tcb-is-a-minimum-not-a-list.md)). It has to stay small.
- `k-anonymity.ts` and `cypher-guard.ts` move into a package the proxy and
  the loader both build from, so the two masks cannot drift apart.
- The compose stack needs the gateway too, or a federated query there keeps
  the direct Bolt path. The direct path stays behind a flag for compose and
  is never used on Azure once step 4 is done.
- The CA moves off the maintainer's laptop. Losing the access body's CA
  key means reissuing every certificate; it is backed up in the access
  body's Key Vault, not the hub's.
- The agreement is a demo document between fictional organisations. A real
  federation needs its own, signed; ours shows what it has to cover.

## Alternatives considered

- **Workload identity (Entra managed identities) between instances.** It
  proves an Azure resource, not attested code, ties every member to one
  tenant, and puts Azure back in the trust path ADR-068 took it out of.
- **DCP credentials for the instance-to-instance traffic itself.** DCP
  presents credentials per request over HTTP and needs an IdentityHub per
  workspace; a workspace is not a dataspace participant. DCP is used where
  it fits, for the operator's identity when a second operator joins.
- **Keep the direct Bolt path and mask only in the coordinator.** Meets the
  draft's letter (aggregates may move), but leaves the unmasked counts in a
  process outside the TEE and gives a workspace no record of its queries.
- **Neo4j Enterprise for a query log in each workspace.** Gives a log, not
  masking or authentication, and needs a licence the Community-only
  workspaces (ADR-068 decision 3) avoid.
- **A public anonymous route for the member list.** Would need to supersede
  ADR-044 for a list that changes only when a member is admitted; a file in
  the static site published at each release is enough.
