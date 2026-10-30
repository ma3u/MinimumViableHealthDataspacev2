# ADR-069: Azure runs a second secure processing environment, SPE-2, as a Neo4j app of its own

**Status:** Proposed
**Date:** 2026-10-30
**Relates to:** [ADR-052](ADR-052-confidential-spe-on-azure-revisited.md) and ADR-068 (proposed in PR #773, the confidential SPE), [ADR-053](ADR-053-everything-stops-off-hours.md), [ADR-056](ADR-056-neo4j-grows-to-2-vcpu-and-4-gib.md), [ADR-062](ADR-062-the-art-71-opt-out-is-a-record-and-a-label.md), [ADR-036](ADR-036-operator-secrets-in-key-vault.md), [ADR-045](ADR-045-observability-and-regulatory-audit-trail.md)
**Tracks:** the maintainer's request of 2026-10-30, two SPEs on https://ehds.mabu.red like on the compose stack

## Context

The compose stack has two secure processing environments. `neo4j-spe2`
(profile `federated`) is a second Neo4j 5.26.28 Community, and
`docker-compose.jad.yml` gives the proxy `NEO4J_SPE2_URI`, `NEO4J_SPE2_USER`
and `NEO4J_SPE2_PASSWORD`. With them, `getSpeDrivers()` in
`services/neo4j-proxy/src/db.ts` returns SPE-1 and SPE-2, and
`POST /federated/query`, `GET /federated/stats`, `POST /nlq` with
`federated: true` and the `spe_access` template ask both, with k = 5 per
contributor and on the whole answer (`src/k-anonymity.ts`,
[federation.md](../architecture/federation.md)).

On Azure there is one Neo4j, `mvhd-neo4j`, and `mvhd-neo4j-proxy` has no
`NEO4J_SPE2_*`. The Federated button on the live hub therefore answers from
one SPE, "How many SPEs can I access?" answers one, and the contributor rule
of the k-anonymity check (a contributor below k withholds the whole answer)
can never fire there. The federation the hub describes is only shown on a
laptop.

What SPE-2 held locally until now was made on 2026-10-30 by a throwaway
script: SPE-1's patients ordered by `coalesce(resourceId, id, elementId)`, the
second half, each with its one-hop clinical records, its OMOPPerson and the
OMOP rows one hop from that, copied with `apoc.merge.node` keyed on the
source's elementId, plus `neo4j/register-fhir-dataset-hdcatap-spe2.cypher`.

Facts that bound the choice:

- **Neo4j Community has one user database.** A second SPE cannot be a second
  database in `mvhd-neo4j`; it is a second server.
- **Neo4j keeps its store on Azure Files** (ADR-017, `02-data-layer.sh`):
  SMB serves it, unlike Postgres (ADR-041). A new revision cannot open the
  store while the old one holds its lock on the share, so every revision
  change retires the old one (docs/gotchas.md, 2026-10-04).
- **SPE-1's password is still the public default** (`env.sh`). A new
  database does not have to inherit that (ADR-036).
- **The morning start brings the apps up within a minute of each other**
  (ADR-053, ADR-058). The proxy tried SPE-2 once at startup and ran without
  it until its next restart.
- **The Klarbefund app and the EUDI sign-in write real people's data into
  SPE-1** (ADR-054, ADR-067): sandbox records (`sandbox`, `appAccount`),
  connected records (`HAS_APP_CONNECTION`) and observations marked
  `contributedBy: 'klarbefund-app'`.

## Decision

1. **SPE-2 is a container app of its own, `mvhd-neo4j-spe2`,** built like
   `mvhd-neo4j`: the same pinned image (`NEO4J_IMAGE`, 5.26.28-community),
   APOC, one replica, ADR-056's size (2 vCPU and 4 GiB; heap 1.5 GiB, page
   cache 1 GiB, direct memory at most 512 MiB), internal TCP ingress only.
   Bolt is exposed on 7688, as on the compose stack, so the two Neo4j apps
   never share a port. Its store is on a share of its own,
   `neo4j-spe2-data` (5 GiB), at `/data`; its logs stay in the container
   (ADR-045). `scripts/azure/20-neo4j-spe2.sh` creates the share, attaches it
   to the environment and creates or updates the app, idempotently.

2. **Its password is generated into Key Vault and never leaves it**
   (ADR-036): `neo4j-spe2-password`, and `neo4j-spe2-auth` holding
   `neo4j/<password>` for the image's `NEO4J_AUTH`
   (`20-neo4j-spe2.sh --create-secret`). The app, the seed job and the proxy
   read them as `keyvaultref` secrets through `id-mvhd-claude-federation`.
   `NEO4J_AUTH` sets the password only on an empty store; changing it later
   takes `ALTER USER` on SPE-2 and then the new value in Key Vault.

3. **SPE-2 is seeded from SPE-1 by `scripts/seed-spe2.py`,** the same script
   locally (`python3 scripts/seed-spe2.py`) and on Azure, where the ACA job
   `mvhd-neo4j-spe2-seed` runs it (`20-neo4j-spe2.sh --seed`). It takes the
   second half of SPE-1's synthetic patients in the order above and copies
   each Patient, its person-level FHIR records one hop away, its OMOPPerson
   and that person's OMOP rows, the terminology concepts those records are
   `CODED_BY`, and every relationship between copied nodes; then it applies
   `neo4j/init-schema.cypher` (the NLQ's full-text tier needs its indexes) and
   SPE-2's HealthDCAT-AP registration, whose publisher is now Limburg Medical
   Centre. It never copies a sandbox, app-created or app-connected record, or
   a node the app contributed: a real person's data stays on the hub that
   person chose. Every node is merged on its primary label and `_speKey`, the
   source's own id (`id`, `resourceId` or `code`), not an elementId, so a
   rerun updates instead of duplicating, and the labels are set to the
   source's on every run, so an Art. 71 opt-out (`OptedOut`, ADR-062) and its
   reversal reach SPE-2 with the next run. SPE-1 is only read. A run that
   finds patients on SPE-2 it did not select fails and says so.

   This is preferred over loading SPE-2 from its own Synthea subset with the
   FHIR loader job (`09-fhir-loader.sh`). That path needs the bundles on the
   operator's machine (they are not in the repository), then the OMOP
   transform and the registration run separately against SPE-2 (`seed.sh`
   and its job are written for SPE-1), and it would give SPE-2 records that
   no other part of the hub has seen. The copy needs nothing but SPE-1, which
   every deploy already seeds, runs in seconds (2,640 nodes and 3,311
   relationships for 108 patients, measured locally), and gives the same
   SPE-2 locally and on Azure.

4. **The proxy reaches SPE-2 by `20-neo4j-spe2.sh --wire-proxy`,** which
   sets `NEO4J_SPE2_URI=bolt://mvhd-neo4j-spe2:7688`, `NEO4J_SPE2_USER` and
   `NEO4J_SPE2_PASSWORD=secretref:neo4j-spe2-password` on
   `mvhd-neo4j-proxy`. `deploy-azure.yml` only replaces the proxy's image and
   keeps its environment, so the workflow does not change. When SPE-2 does
   not answer at startup, the proxy now answers from SPE-1 and keeps trying
   SPE-2 in the background, 40 times 15 s apart (`connectSpe2()` in
   `src/db.ts`), instead of trying once.

5. **SPE-2 stops and starts with everything else** (ADR-053, ADR-058).
   `offhours.sh` stops it right after SPE-1, once the proxy has stopped,
   starts it first among the core apps, scales it to one replica and retires
   a stale revision of it as it does for SPE-1. It does so only once the app
   exists, so merging this before phase 20 has run changes nothing on Azure.
   The off-hours identity's roles are on the resource group and cover it.

6. **SPE-1 keeps all its patients for now.** Nothing here deletes from
   SPE-1. See "Open" below for the recommendation.

## Consequences

- **Cost.** At ADR-056's size SPE-2 bills 2 x 3,600 x €0.0000259 (vCPU) +
  4 x 3,600 x €0.00000304 (memory) = €0.23 an hour while active
  (`ui/src/lib/azure-pricing.ts`). Over the 281.7 office hours a month of
  ADR-053 that is **about €65 a month at most**; at ACA's idle rate, which
  applies while it uses almost no CPU between federated questions, about
  €18. Running around the clock would be €168. The share bills what it
  stores, well under €1 (5 GiB at €0.0528 is €0.26 at most). The admin cost
  panel's fallback list (`ACA_APP_SPECS`) does not name SPE-2 yet.
- **The federated answers on Azure come from two SPEs.** `/federated/stats`
  and the Federated button show SPE-1 and SPE-2, and the contributor rule of
  k-anonymity can fire there for the first time.
- **While SPE-1 keeps everyone, a federated total counts SPE-2's patients
  twice.** 127 synthetic patients on SPE-1 and about 64 of them again on
  SPE-2 sum to about 191. Per-SPE answers are right; the sum is not.
- **SPE-2 is a copy.** A new patient, record or opt-out on SPE-1 reaches
  SPE-2 only with the next `--seed`. ADR-062 already notes that the label is
  per graph; the seed carries it, nothing carries it live.
- **The morning start has one more Neo4j to wait for,** with the same store
  lock behaviour as SPE-1. The proxy's ten minutes of retries cover a slow
  start; a longer outage still leaves the proxy on SPE-1 until it restarts.
- **SPE-2 is not confidential.** It is a plain container like SPE-1. The
  attested SPE is ADR-068's track; SPE-2 is the natural candidate to move
  there once that exists.
- **Not yet covered:** a replica alert for SPE-2 (`07-observability.sh`
  names SPE-1 only), SPE-2's distributions in its registration still name
  the compose endpoints (`bolt://localhost:7688`), and SPE-1's own password
  is still the public default.

## Open: should SPE-1 drop the patients SPE-2 holds?

Recommended, yes, in a separate change after this one is live: two SPEs that
hold the same persons are one data holder counted twice, and k-anonymity per
contributor means little when the contributors overlap. The condition is
that SPE-1 keeps every patient something else on the hub points at: the
demo personas' records (`P1`, `P2`), records with consents, access events,
opt-out records or study results, and every sandbox or app-connected record.
So the selection moves those to SPE-1's side first and SPE-2 is reseeded;
only then are the moved patients and their person-level records removed from
SPE-1, after a dump of the `neo4j-data` share. That is a deletion on the live
graph and needs its own decision.

## Alternatives considered

- **Its own Synthea subset through the FHIR loader job:** different patients
  by construction, but more moving parts, see decision 3.
- **A second database in `mvhd-neo4j`:** Community has one user database.
- **Neo4j Enterprise or Aura:** licence or a managed service, against the
  demonstrator's open-source and cost premise (as in ADR-056).
- **A smaller SPE-2 (1 vCPU, 2 GiB):** half the cost, and SPE-2 answers only
  federated questions. ADR-056 measured SPE-1 being killed at that size, so
  SPE-2 starts at the same size and shrinks once a load test shows it may.
- **SPE-2 around the clock:** €168 a month for a demo nobody uses at night.
- **Keep SPE-2 local only:** the federation the hub describes stays
  invisible to anyone who is not running the compose stack.
