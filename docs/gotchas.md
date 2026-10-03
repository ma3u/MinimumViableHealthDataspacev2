# Gotchas

Non-obvious pitfalls across the stack. Ordered newest first; add a new
entry at the top when you hit something that cost you more than 30 minutes.

## 2026-10-03: a Vault role write keeps the fields it does not send

Onboarding on Azure stopped at "Participant Context" with the whole stack up.
The EDC-V agent logged `POST .../api/identity/v1alpha/participants giving up
after 6 attempt(s)`; the cause was one level down, in IdentityHub:
`Failed to obtain vault token ... invalid audience (aud) claim: audience claim
does not match any expected audience`.

That message means the role **has** `bound_audiences` and none match. The
bootstrap did not set any. The first Azure bootstrap (177b773) did:
`bound_audiences ["account"]`, `user_claim sub`, `claim_mappings`. A `POST` (or
`vault write`) to an existing role updates only the fields in the body, so
every later rewrite, #468's included, left those three in place, and once
Vault became persistent (ADR-046) they stayed for good. Reproduced on
`hashicorp/vault:2.0`.

Replace a role, never update it: `DELETE` then `POST`, and read it back. The
bootstrap in `scripts/azure/06-post-deploy.sh` does that for both JWT roles
now. The same holds for anything else in Vault written as a partial update.

Two more things hid it. Outside the operating window (ADR-042) the Tenant
Manager is at zero, so `/api/participants` could not reach it and recorded a
demo participant saying the deployment "does not run the CFM provisioning
stack"; it now answers 503 and says when the stack runs. And `/onboarding`
called a tenant Active as soon as its profile had an identifier, which the
route has sent with every profile since #468, so a registration the agents
had rolled back (`error: true`, every activity `disposed`) showed as Active.
The page now reads the outcome off the Tenant Manager: every activity
`active` is Active, `error: true` is "Provisioning failed".

## 2026-10-03: the Azure Vault was emptied every evening, and `min=0` alone would do it too

Found on #455: the CFM Keycloak and EDC-V agents had never started on Azure.
About 1,090 panics each in 14 days, every one a failed Vault login.

`mvhd-vault` ran `vault server -dev` (no command, `VAULT_DEV_*` in its env),
so it held everything in memory. ADR-017 mounted `vault-data` at
`/vault/data`, but nothing ever told Vault to use it. Three things empty an
in-memory Vault on Container Apps, and the stack had all three:

- **The evening stop.** Setting `min=0` is a revision change, so it starts a
  new container (`--0000175`, 2026-10-02 21:55).
- **Scale to zero.** `min=0` with a 300 s cooldown.
- **Any platform move of the replica.**

The morning bootstrap job put the configuration back, but never the
participant keys, and it ran a cached `:latest` image without the provisioner
role.

Four traps on the way to the fix (ADR-047 is the stopgap, ADR-046 the fix):

- `hashicorp/vault:2.0` runs as the `vault` user, so `apk add` in a derived
  image fails with `Unable to open log: Permission denied`. Add `USER root`.
- Vault on `storage "postgresql"` exits at startup when the database is not
  reachable (`failed to check for native upsert`), and the backend does not
  create its own table. The sidecar creates the table; Container Apps
  restarts Vault.
- In Container Apps, as in Kubernetes, a container's `command` replaces the
  image's ENTRYPOINT. Vault's `docker-entrypoint.sh` is what turns
  `VAULT_LOCAL_CONFIG` into `/vault/config/local.json`, so with `command` set
  Vault started with no config: `A storage backend must be specified`
  (revision `--0000177`). Put the start words in `args`. A local
  `docker run image vault server ...` passes them as CMD and keeps the
  entrypoint, so it cannot show this.
- A local `docker run --network container:<vault>` test loses the shared
  namespace when Vault restarts. Use a third "pod" container that owns the
  namespace, as ACA's pause container does.

## 2026-10-02: Neo4j on Azure has run an April revision since April, and nobody saw

Found while removing the `/logs` mount (#418). Three faults, each hiding the next.

**1. Every Neo4j revision since April was OOM-killed at startup.**
`.github/workflows/graphrag-deploy.yml` set heap 2G initial / 4G max and a 2G
page cache on a container with 2 GiB. ADR-019 planned a bigger container; it
was never applied. Each new revision dies about 13 s after start with
`exit code '137'` in `ContainerAppSystemLogs_CL`. The console shows only the
plugin installs and `Changed password ...`: the kill comes before the server
writes its first line.

**2. Single revision mode kept the April revision alive, and serving.**
ACA keeps the last _ready_ revision running until a new one is ready, and
routes traffic to it, **whatever the traffic table says**. `revision list`
showed `mvhd-neo4j--0000001` (image `neo4j:5-community`, APOC only, default
memory) at 0 % and the failing revision at 100 %, yet the April revision
answered every query; its `debug.log` showed queries up to the minute it was
stopped. So the demo served the graph all summer **without GDS**. It also holds
`/data/databases/store_lock` on the shared volume, so even a correctly sized new
revision fails with `Lock file has been locked by another process`. Deactivating
it once is not enough: the next `az containerapp update` re-activated it within
seconds. Deactivate every other revision **after** each update.

**3. The checks called it green.** The workflow waited for
`properties.runningStatus == Running`. That field describes the app, and the
April revision kept it `Running`.

**What it cost to find out.** Reading the traffic table as the truth, we took
the graph to be down since revision 177 (10:55) and deactivated the April
revision to free the lock. It had been serving; that deactivation caused the
outage, about 19:49 to 20:01 UTC (UI Neo4j errors: 0 before, 133 during, 0
after). Before stopping a revision, check whether it is serving: the UI or
proxy's Neo4j errors, or the revision's own query activity. Do not trust the
traffic weight.

Resolved 2026-10-02 20:01: revision 179 with the memory below and the `/logs`
mount removed, sole active revision, `latestReadyRevisionName` current for the
first time since April, GDS 2.13.11 loaded, existing store (system database
created 2026-04-14).

Check with:

```bash
az containerapp revision list -n mvhd-neo4j -g rg-mvhd-dev \
  --query "[?properties.active].{rev:name,running:properties.runningState,traffic:properties.trafficWeight}" -o table
az containerapp show -n mvhd-neo4j -g rg-mvhd-dev --query properties.latestReadyRevisionName -o tsv
```

More than one active revision, or a `latestReadyRevisionName` older than the
latest revision, means Neo4j is not running what you deployed.

Fixed in the repo: `graphrag-deploy.yml` sizes memory to fit 2 GiB (heap 1G
fixed, page cache 384M, ample for a 5,300-node graph), deactivates every other
revision, and waits on the latest revision's replica being ready, failing if it
never is. `scripts/azure/02-data-layer.sh` deactivates other revisions too. The
GDS sizing in the 2026-04 entry below is superseded by this.

## 2026-10-02: the fix for the 2026-09-30 wipe was the thing that breaks Postgres

The entry below diagnosed the 2026-09-30 data loss as a missing mount and made
mounting `pg-data` the fix. **That diagnosis is wrong.** Mounting it does not
give Postgres a durable disk, it stops Postgres booting.

Sign-in was 404 again that morning: the `edcv` realm had never been re-imported
after 09-30, so `/realms/edcv/...` had no realm to serve. Note the difference
from the 500s below, and that it matters: 404 means Keycloak reached its
database and found nothing, 5xx means it could not reach it at all. Only the
second one makes importing the realm pointless.

Running `repair-live-stack.sh 1`, the phase written as the fix, produced this
in `mvhd-postgres`:

```
chmod: changing permissions of '/var/lib/postgresql/data/pgdata': Operation not permitted
initdb: error: could not change permissions of directory ".../pgdata": Operation not permitted
```

The replica went `NotRunning`, the revision `Failed`. `initdb` chmods PGDATA
unconditionally and SMB cannot do POSIX chmod, so **no `mountOptions`
(`uid`, `gid`, `dir_mode`, `file_mode`) can make this work.** Azure Files NFS
would, but it needs a Premium FileStorage account and a VNet-injected ACA
environment; `stmvhddev3e2079` is `Standard_LRS` and `mvhd-env` has no VNet.
ACA has no block-storage volume type, so no option remains.

Which means the live app's `volumeMounts: null` was most likely a deliberate,
undocumented workaround by whoever hit this first, not the drift the entry
below calls it. `mvhd-neo4j` and `mvhd-vault` mount the same account fine
because nothing in their startup chmods a directory.

**The site stayed up, by luck.** ACA was in Single revision mode and the new
revision never went healthy, so the old replica kept serving:

```
mvhd-postgres--0000148   Healthy     RunningAtMaxScale   traffic 0
mvhd-postgres--0000149   Unhealthy   Failed              traffic 100
```

A replica list alone shows only the latest revision, reports `NotRunning`, and
reads as a total outage. It was not one. Check `revision list` before declaring
the database down, and note that the data then lives only in a replica of a
revision receiving no traffic.

The decision that ends this is
[ADR-041](ADRs/ADR-041-managed-postgres-on-azure-containerised-locally.md):
Azure Database for PostgreSQL Flexible Server on Azure, containerised Postgres
locally. Verified the same day, local Kubernetes runs the identical image and
PGDATA path with `fixing permissions ... ok`, mode `700`, and data surviving a
pod delete. The problem is SMB, not Postgres and not the config.

Two things to take from it:

- A guard that checks a setting was applied is not a guard that the service
  started. `02-data-layer.sh` and `repair-live-stack.sh` phase 1 both read the
  `mountPath` back and reported success over a crash-looping database. Check
  the process, not the knob.
- The second incident was the first one's fix. A runbook written during an
  outage encodes the theory you had at the time; it is worth re-testing the
  theory before running it a month later.

## 2026-09-30: a declared volume that nothing mounts, and three guards that called it green

> **Superseded in part by the 2026-10-02 entry above.** The failure described
> here is real and the guard analysis still holds. The _cause_ is misattributed:
> mounting `pg-data` is not the fix, it is a crash loop. See ADR-041.

Every token grant and every browser sign-in on the live stack returned **500**
for an hour and a half, and the deploy that ran through the middle of it was
green.

```
POST /realms/master/.../token   (admin-cli, password grant)   500
GET  /realms/edcv/.../auth      (browser sign-in entry)       500
POST /realms/edcv/.../token     (provisioner, WRONG secret)   401
GET  /realms/edcv               (discovery)                   200
```

The 401 is what makes the rest readable. The endpoint routes and validates
credentials fine, and only falls over once it has something to accept and has
to attach a session. Keycloak's log:

```
Caused by: org.postgresql.util.PSQLException: ERROR: relation "offline_user_session" does not exist
	at ...JpaUserSessionPersisterProvider.loadUserSession(...)
	at ...AuthenticationProcessor.attachSession(...)
```

Not one table. Grouped by the missing relation, Log Analytics returned
`offline_user_session`, `offline_client_session`, `realm`,
`client_initial_access`, `realm_attribute` and `revoked_token`, all first seen
that morning and none in the thirteen days before. `mvhd-postgres` said why:

```
04:00:05Z  fixing permissions on existing directory /var/lib/postgresql/data/pgdata ... ok
04:00:05Z  running bootstrap script ... ok
04:00:06Z  database system is ready to accept connections
```

`initdb` ran. ACA had recreated the replica at 03:59:55Z on its own, with no
workflow within seven hours either side, and Postgres came up on an empty
cluster. The `keycloak` and `cfm` databases went with it.

**The cause.** The app declared the volume and mounted nothing:

```
volumes:       [{"name": "pgdata", "storageName": "pg-data", "storageType": "AzureFile"}]
volumeMounts:  null
PGDATA=/var/lib/postgresql/data/pgdata
```

`scripts/azure/02-data-layer.sh` adds both, so the live app looked like it had
drifted from its own script. `PGDATA` was therefore ordinary container-local
storage and had been since revision `0000148` on 2026-09-14. The data lasted
sixteen days only because nothing restarted the replica in between.
`mvhd-neo4j` and `mvhd-vault` mount their shares correctly, so this was one
app, not the pattern.

> Read this with the 2026-10-02 entry: that "drift" was almost certainly
> somebody removing a mount that crash-loops Postgres. The script was wrong,
> not the app.

This is also the answer to the question `.github/workflows/aca-schedule.yml`
had carried open since 2026-09-14, about why the `edcv` realm does not survive
a stop/start when `KC_DB=postgres` says it should. It does not persist because
Postgres does not persist.

**Why nothing caught it.** Three guards, three different ways of being wrong:

1. `restore-keycloak-realm.sh` decided the realm was fine from
   `GET /realms/edcv`. Keycloak serves realm metadata from its Infinispan
   cache, so discovery answers 200 long after the `realm` table has gone. The
   morning scale-up printed `realm edcv is present` and repaired nothing.
2. That step is `continue-on-error: true`. The script did fail, and the GitHub
   jobs API still reports `conclusion: success` for a continue-on-error step,
   so the run was green and the step looked green in the API too.
3. `Verify UI is reachable` and `E2E Tests (Azure)` both only prove the home
   page renders, which it does perfectly well for a visitor who cannot log in.
   All three E2E steps also carry `continue-on-error: true`.

**The probe that does work** is the authorize endpoint, because it has to
reach the database to look up a realm and a client before it can reject
anything:

```
healthy  -> 200 login form, or 400/404 for a bad client or a missing realm
broken   -> 5xx
```

It needs no client id, no redirect URI and no secret: a request that is wrong
in every one of those ways still has to hit the database to find that out.
Measured against the broken stack, a bogus client and even a realm that does
not exist both returned 500. That is `scripts/azure/check-keycloak-health.sh`,
which now gates the deploy and the morning scale-up with no
`continue-on-error`, and exits 2 specifically for "the database is gone, do not
bother importing the realm".

Three things to take from it:

- A declared volume is not a mounted one. (`02-data-layer.sh` was changed to
  read the mount back and refuse. On 2026-10-02 that guard was inverted: it now
  refuses if the mount is _present_, because Postgres cannot boot with it.)
- `az containerapp show -o yaml` returns secrets with names and no values, so
  feeding that back into `az containerapp update --yaml` blanks them. Drop the
  block. `05-cfm-agents.sh:mount_config` already did; `02-data-layer.sh` was
  round-tripping the Postgres password and the registry pull credential.
- A 200 from a cache is not a health check. Ask the question that has to touch
  the thing you are actually worried about.

## 2026-09-28: an EDC web context you do not configure still binds, somewhere else

`GET /api/credentials/definitions` answered **502** on the Azure demo and
**200** on the local stack and in CI, for as long as the demo existed (#373).
The guess in the issue was a missing issuer identity answering 401 or 404. It
was not. The body said so all along, because the route reports its cause:

```json
{
  "error": "Could not reach IssuerService",
  "detail": "The operation was aborted due to timeout"
}
```

An EDC launcher gives every web context its own port **and** path, and a
context you do not configure does not fail to start: it quietly takes a
built-in default. The ACA container app was created with one setting,
`WEB_HTTP_PORT=10013`, so its own log recorded twelve fallbacks:

```
no setting found for 'web.http.issueradmin.port', falling back to default value '15152'
no setting found for 'web.http.issueradmin.path', falling back to default value '/api/issuer'
...
HTTP context 'issueradmin' listening on port 15152
HTTP context 'default'     listening on port 10013
```

ACA ingress publishes exactly one port, 10013, and the callers ask for
`/api/admin`. So the admin API was listening on a port nothing could route to,
at a path nobody requested, while the port that _was_ exposed served an
unrelated context. `jad/issuerservice.env` sets all twelve values, which is
why local and CI never saw it; `scripts/azure/04-edc-services.sh` carried one
of them across.

Two things to take from it:

- **A timeout is not always a network problem.** Here ingress was healthy and
  the process was up; the request reached a listener that had no such route.
  `runningStatus: Running` and a bound ingress port say nothing about whether
  the API you want is the one behind it.
- **Grep the startup log for `falling back to default value`** after deploying
  an EDC runtime anywhere its env file does not follow it. Every divergence
  between an environment that works and one that does not is listed there, for
  free, at DEBUG.

```bash
az containerapp logs show -n mvhd-issuerservice -g rg-mvhd-dev --tail 300 --format text \
  | grep -E "falling back to default value|HTTP context .* listening"
```

## 2026-09-26: a readiness endpoint says nothing about identity

`ISS-4.1: IssuerService readiness check passed` was true in CI on every run
while the service had no participant context, no loaded signing key and no
DID (#345). Readiness answers "the process is up"; the issuer's identity is
three separate things `scripts/bootstrap-jad.sh` does after the process is up,
and `docker compose up -d` does none of them:

| piece                            | where it comes from                                                                                 |
| -------------------------------- | --------------------------------------------------------------------------------------------------- |
| signing key in Vault             | `vault-bootstrap` sidecar running `jad/bootstrap-vault.sh`                                          |
| the `issuer` participant context | `jad/seed-jad.sh` Step 2, a POST to the issuer's own identity API on 10015, from inside the network |
| activation records               | `jad/seed-issuer-identity.sql` through `psql`, then a restart                                       |

How it showed: the `issuer` Keycloak client's token (claim
`participant_context_id=issuer`) got **401** from the issuer admin API while
the `admin` client's token got **404** `IdentityHubParticipantContext with
ID=issuer was not found`, on the same fresh stack in the same minute. One
accepted, one rejected, same signing key: not an auth or JWKS problem, the
claim's referent was missing. `scripts/seed-issuer-identity.sh` reproduces the
three pieces where CFM is absent and reads the DID document back.

The check to reach for is the one that needs the identity to exist:

```bash
docker run --rm --network health-dataspace-edcv curlimages/curl -sf \
  http://issuerservice:10016/issuer/did.json | python3 -c 'import json,sys; print(len(json.load(sys.stdin)["verificationMethod"]), "key(s)")'
```

Small shell trap from the same script, because it cost a run: under
`set -o pipefail`, `docker logs c | grep -q pattern` fails on the very line
it finds. `grep -q` exits on the first match and closes the pipe, `docker logs`
gets SIGPIPE, and the pipeline's status is non-zero. Capture first, then
match: `logs=$(docker logs c 2>&1 || true); case "$logs" in *pattern*) ...`.

## 2026-09-26: a Vault restart takes every participant's ability to sign, and the identity checks keep passing

CLAUDE.md gotcha 1 says Vault is in-memory and to re-run `bootstrap-jad.sh`.
Two things it does not say, both found while trying to issue a credential over
DCP on the local stack (#345):

**What is lost.** Per participant, the signing private key IdentityHub uses
(`did:web:identityhub%3A7083:<slug>#key1`) and the STS client secret the
control plane uses (`<contextId>-sts-client-secret`). The key and context
_records_ survive in Postgres. The secrets do not. On this laptop Vault was
restarted on 2026-09-24 (`docker inspect health-dataspace-vault` shows
`server -dev`); the keys date from 2026-03-22.

**How it shows.** In the services' own words, which is how it was confirmed:

```
identityhub   HolderCredentialRequest ... ERROR:
              JWSSigner cannot be generated for private key 'did:web:identityhub%3A7083:irs#key1':
              Private key with ID '...#key1' not found
controlplane  HTTP 502 [{"type":"BadGateway","message":"Unable to obtain credentials:
              Failed to fetch client secret from the vault with alias:
              772f6576b2a6472cb2e373dabc928517-sts-client-secret"}]
```

So: every DSP catalog request fails (`run-ehds-dataspace-checks.sh` shows
`CAT-1.1` x3, `CAT-1.2`, `CAT-1.3` red, 27/5/1 locally against 25/0/8 in CI),
and every DCP credential request ends in `ERROR`.

**What keeps passing, wrongly.** `KEY-2.2` reports the provider's key pair
ACTIVATED, because it reads the record in Postgres. `VC-3.2`/`VC-3.3` pass on
the credentials CFM planted in March, which are also in Postgres. Nothing
asserts "this participant can sign", so the identity suite scored 21/0 on a
stack where no participant could. The DSP suite _did_ catch it, and only since
#333: before that the 502 envelope above scored `CAT-1.1` as a pass.

**Remedy status, honestly.** `bootstrap-jad.sh` re-runs `jad-seed` and applies
`jad/seed-issuer-identity.sql` for the _issuer_; it re-creates the siglet
transit key. It does not restore participant keys or STS secrets. Two ad-hoc
scripts exist for exactly this incident, `scripts/_provision_signing_keys.py`
and `scripts/_rotate_keypairs.py`, and both hardcode participant context ids
from a previous incarnation of the stack (`5c0ed83a...` against today's
`24be78bf...`), so they are evidence that it has happened before rather than a
fix. Until there is one, the reliable path after a Vault restart is a full
`docker compose down -v` and re-bootstrap, which regenerates the participants
and their secrets together. Verify afterwards with a request that has to sign:

```bash
ONLY=irs WAIT_SECONDS=60 ./scripts/request-participant-credentials.sh   # must not end in ERROR
./scripts/run-ehds-dataspace-checks.sh 2>&1 | grep 'CAT-1.1'            # must be green
```

**Fixed at the root on 2026-09-26.** The compose Vault now runs
`vault server -config=/vault/config/vault.hcl` with file storage on the
`vault_data` volume, and a `vault-unseal` sidecar (the Azure deployment's own
`scripts/vault-init-or-unseal.sh`) initialises once and unseals on every start.
`docker restart health-dataspace-vault` no longer loses anything; proven on a
throwaway project across `restart` and `down`/`up`, then applied to the real
stack. Two things the switch exposed, both fixed in the same PR:

- `scripts/vault-init-or-unseal.sh` could not unseal: it grepped compact JSON,
  `vault operator init -format=json` pretty-prints, the key came out empty and
  `unseal` prompted on a terminal that was not there. Azure uses this script;
  whether it has been failing there too is still to be checked.
- `jad/bootstrap-vault.sh` assumed the `secret/` mount that only `-dev` mode
  creates, and died at its first write (404 on `secret/data/aes-key-alias`),
  which is also why siglet had been restarting for days. It now enables
  `secret/` and the transit engine itself.

**The check that is missing** is proposed on #345 as `KEY-2.4`: obtain a
self-issued token for the participant from the IdentityHub STS
(`identityhub:7084/api/sts`, see the STS entry below), which signs with the
participant key and fails exactly when the material is gone. That needs 7084
published to the host, or the check run from inside the network.

## 2026-09-26: the `issuer` Keycloak client exists on every laptop and no CI runner

`jad/seed-jad.sh` created it at runtime through the admin API, behind the
compose profile `seed` that only `bootstrap-jad.sh` activates. CI never ran
it, so every seed that logs in as `issuer` failed there, and the three DCP
checks depending on them (`ISS-4.3`, `VC-3.2`, `VC-3.3`) could not fail until
#341. The client is now in `jad/keycloak-realm.json` and pinned by
`ui/__tests__/unit/config/keycloak-realm.test.ts`. Full write-up and the rule
it adds: `docs/knowledge/runbooks/keycloak-realm-drift.md`. Quick check for
the same class elsewhere:

```bash
grep -rn 'admin/realms/edcv/clients' --include='*.sh' jad scripts   # scripts that mint clients
python3 -c "import json;print([c['clientId'] for c in json.load(open('jad/keycloak-realm.json'))['clients']])"
```

Every clientId a script POSTs must appear in that list.

## 2026-09-26: the STS exists, on a port nothing publishes

Phase 1 of #338 needs an STS for the DCP TCK, and the work plan in discussion
#110 recorded it as unknown, because `run-ehds-identity-checks.sh`
authenticates through Keycloak and never touches one. Both EDC services do run
an STS. Neither port is published to the host, so nothing on the laptop can
see it and `docker ps` does not hint that it exists:

| service       | container port | path       | published to host? |
| ------------- | -------------- | ---------- | ------------------ |
| IdentityHub   | 7084           | `/api/sts` | no, only 7081      |
| IssuerService | 10011          | `/api/sts` | no, only 10013     |

Read them off the container rather than guessing:

```bash
docker inspect health-dataspace-identityhub | jq -r '.[0].Config.Env[]' | grep '^web.http.sts'
```

It is a working OAuth2 client-credentials endpoint. Probing it needs a
sidecar on the `health-dataspace-edcv` network, and the method matters: `GET`
gives 405 and a bodyless `POST` gives a bare Jetty 500, both of which read
like a broken service. A well-formed request is what shows it is healthy:

```bash
docker run --rm --network health-dataspace-edcv curlimages/curl -s -X POST \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'grant_type=client_credentials&client_id=x&client_secret=y&audience=did:web:example' \
  http://health-dataspace-identityhub:7084/api/sts/token
# {"error":"invalid_client","error_description":"Invalid client or Invalid client credentials"}
```

The consequence for the TCK is that the runtime has to **join
`health-dataspace-edcv`**, not reach the stack through
`--add-host host.docker.internal:host-gateway` as the #110 work plan assumed.
On that network the callback direction is free as well, since the connector
can address the TCK by container name. Publishing 7084 and 10011 to the host
would be the alternative and is a compose change nobody has needed yet.

## 2026-09-26: a healthy NATS that cannot store a single message

`/healthz` returns 200, `docker ps` says healthy, the server log is clean, and
every JetStream publish fails with `nats: invalid jetstream publish response`.
The only thing a human sees is a CFM participant whose VPAs go straight to
`error`, several services away from the cause (#191).

It is the `nats_data` volume, not the server version. Both arms were run
rather than assumed:

| NATS server | volume   | result              |
| ----------- | -------- | ------------------- |
| 2.14.3      | existing | every publish fails |
| 2.11.17     | fresh    | works               |
| 2.14.3      | fresh    | works               |

So the pin from #100 is fine and should stay. Recovery is to drop the volume;
the managers recreate `cfm-stream` and `KV_cfm-bucket` on startup, so it costs
nothing.

`bootstrap-jad.sh` now does a JetStream **round trip** during bring-up —
create a stream, publish, read the count back — rather than trusting
`/healthz`. It has to be a round trip and not a check on stream metadata: the
broken volume's streams looked unremarkable from outside, with
`KV_cfm-bucket` holding 53 messages between `first_seq` 26 and `last_seq`
243439, and an empty stream legitimately reporting `first_seq = last_seq + 1`.
There is nothing there to pattern-match; publishing a message and reading it
back is unambiguous.

Two things the probe itself taught, both caught by running it rather than
reasoning about it:

- **`nats stream add` prompts for every unset option** and dies with `cannot
ask for confirmation without a terminal` in a non-interactive shell, which
  reads exactly like a JetStream fault. `--defaults` is required.
- **A server with JetStream disabled answers `no responders available for
request`**, not a clear "JetStream is off". Any check that greps for a
  friendly message will miss it.

## 2026-09-26: one ACA app, one reachable port, and the version is a path segment

Three compliance suites failed at the EDC Management API for months and cost
three issues (#205, #303, #307) to narrow down, because the failure was a
`curl -sf` that printed neither the status nor the body. Two independent
causes, each sufficient on its own.

- **An ACA app has exactly one address that works, and it is the ingress
  `targetPort`.** `https://<app>.internal.<domain>` reaches that port and
  nothing else. An EDC connector serves each web context on its own port, so
  `mvhd-controlplane`'s `/api/mgmt` on 8081 and `mvhd-identityhub`'s
  `/api/identity` on 7082 are reachable only as
  `http://<short-app-name>:<port>`, through `additionalPortMappings`. The
  runner was calling `<fqdn>/api/mgmt`, which is port 8080, where that path
  does not exist. `edc-probe-cp.yml` had the right addressing since May 2026;
  nothing else had copied it.

- **The Management API version is a path segment and the environments differ.**
  The deployed `jad-controlplane:2026-04-14` serves `/v4alpha`. The 0.18
  launchers in `docker-compose.jad.yml` serve `/v5beta`, which is what the
  suites defaulted to, and `/v5alpha` is what the UI route and the probe
  workflow use. Two of those three are 404 on Azure at any given time. A
  script that hardcodes one is wrong somewhere, so
  `scripts/lib/edc-mgmt-api.sh` tries the candidates on a 404 and says which
  one answered.

The general lesson is about the error, not the ports: `curl -sf` turns a wrong
path, a wrong version, a bad token and a refused connection into the same
sentence. Print the status and the body, and name the case where there was no
response at all by curl's exit code. Three issues were spent on elimination
that one printed body would have ended.

Related, from the same afternoon: the CFM tenant manager on Azure has held
three `pending` provisioning activities per participant since 2026-09-17,
because the four CFM agents were never deployed there. The onboarding page had
been showing an animated "Provisioning" for nine days. A state that cannot
progress is not the same as a slow one, and a UI that cannot tell them apart
will always pick the flattering reading (#203, #318).

## 2026-09-26: repairing a broken step can re-arm the destructive thing it was blocking

`reset-demo.yml`'s "Re-import Keycloak edcv realm" step hardcoded `admin` /
`admin`. That matched when it was written and stopped matching when the admin
password was rotated into Key Vault (2026-09-13, ADR-034/ADR-036), so from then
on every run spent six attempts on HTTP 400 and failed. Three things came out
of fixing it, in increasing order of how much they matter.

- **A credential literal in CI does not fail loudly when it rots.** The step
  logged a bare `HTTP 400` and nothing else, so a wrong password read as a
  flaky endpoint for two weeks. The token response says exactly what is wrong
  (`{"error":"invalid_grant","error_description":"Invalid user credentials"}`)
  and carries no token and no credential, so there is no reason not to print
  it. Read the credential from the resource that owns it instead of copying
  it: `az containerapp show`/`secret show` against `mvhd-keycloak`, never a
  literal, so a rotation cannot desynchronise anything.

- **Contributor grants nothing on an RBAC-mode Key Vault.** `kv-mvhd-b53a0449`
  has `enableRbacAuthorization=true`. The CI service principal
  `mvhd-github-actions` is Contributor on `rg-mvhd-dev`, whose definition is
  `actions: ["*"]` with no relevant `notAction`, so it can call
  `Microsoft.App/containerApps/listSecrets` and read an ACA secret, but it is
  not Key Vault Secrets User and `az keyvault secret show` returns nothing.
  This is why `aca-schedule.yml`'s realm restore had been failing on every run
  behind `continue-on-error: true`: the thing added to restore a missing realm
  could not read the password to do it. `kc_admin_password()` in
  `scripts/azure/env.sh` now falls back from the vault to the ACA secret, which
  holds the same value.

- **The breakage was load-bearing.** The step continues into an unconditional
  `DELETE /admin/realms/edcv` and a re-POST of `jad/keycloak-realm.json`, which
  carries `admin`, `provisioner` and `health-dataspace-ui` and not the
  `meinbefund-ios` client or the real accounts (ADR-034) or the quota counter
  (ADR-035). The cron had been disabled on 2026-09-13 for exactly this reason,
  but that removed the weekly occurrence and left the operation one
  `workflow_dispatch` away. The failing login was the only thing stopping it,
  and fixing the login removed that. The realm wipe is now behind an explicit
  `wipe_realm` input that defaults to false, and the opt-in path lists the live
  clients the import file will not restore before it deletes anything.

  The general shape: before repairing a step that has been failing for a while,
  read what it does _after_ the point it fails at. A failure can be the only
  thing holding back something worse, and the repair is what releases it.

See #310, #311 and #304.

## 2026-09-26: a bash suite that has to read Neo4j on Azure needs cypher-shell

Closing out issue #205: `scripts/azure/status.sh` and the compliance-runner job
were the last two callers of Neo4j's transactional HTTP API on port 7474, which
ACA does not serve. Both are shell, so neither could reuse `runQuery()`, and the
fix is `cypher-shell` over Bolt in each of them.

- **Inside the environment** (the `mvhd-compliance-runner` job): the image is
  alpine, so cypher-shell needs a headless JRE and the zip from
  `dist.neo4j.org`, the same install `pages.yml` does. `08-compliance-runner.sh`
  now passes `NEO4J_BOLT_URI=bolt://mvhd-neo4j:7687` and the credentials.
  Twenty-odd Neo4j checks in the EHDS suite had been failing on transport alone.
- **From a workstation** (`status.sh`): the internal ingress is not reachable on
  any port, Bolt included, so the query has to run inside the container through
  `az containerapp exec`, which needs a TTY. The section had printed
  "(Neo4j not reachable from this network)" on every run since it was written.
- **cypher-shell has no JSON output**, and `--format plain` quotes like CSV.
  To keep `run-ehds-tests.sh`'s existing `.results[0].data[0].row[N]` readers,
  the Bolt helper sends two statements in one invocation: the query itself,
  whose first output line names the columns in RETURN order, and the same query
  wrapped in `apoc.cypher.run` + `apoc.convert.toJson`, which `--format plain`
  prints as a JSON string literal that `jq fromjson` reads back exactly.
  The column line is not optional: `apoc.convert.toJson` serialises a map, and
  the key order it produces does **not** follow the RETURN clause — measured
  against the local graph, `count(c) AS cnt, collect(c.name) AS names` came back
  as `{names, cnt}`, which would have silently swapped every `row[0]`.
- `NEO4J_HTTP_URL` and `NEO4J_INTERNAL_URL` are gone from `scripts/azure/env.sh`
  and off `mvhd-ui`, and `docs/azure-deployment-guide.md` no longer lists a
  Neo4j HTTP row. All of them were the `*.internal.<domain>` FQDN, which is the
  HTTP ingress name and serves neither Bolt nor HTTP for this app.
  `NEO4J_BOLT_URI` replaces them.
- Two live findings a local check could not have produced.
  `az containerapp exec` enters the **latest** revision, and the latest is not
  always the one serving: on 2026-09-26 `mvhd-neo4j--0000166` held 100% of the
  traffic in `ActivationFailed` with zero replicas while `mvhd-neo4j--0000001`
  ran the database. Resolve a revision that has a running replica and pass
  `--revision` and `--replica`. And the CLI does not relay the container's
  output on a stable stream — from `status.sh` it comes back on stderr, so
  `2>/dev/null` swallowed a query that had succeeded.
- The ACA environment's default domain is `happysand-37f82e30`, not
  `blackforest-0a04f26e`. The old one is still written into
  `docs/azure-deployment-guide.md` and `docs/azure-deployment-plan.md`, and was
  `neo4j/seed.sh`'s default Bolt host until now — where it was doubly wrong,
  since an `*.internal.<domain>` name is HTTP ingress and times out on Bolt
  whatever the domain. Address Neo4j as `bolt://mvhd-neo4j:7687`.
- Do not reach for `additionalPortMappings: [7474]`. It was tried on
  2026-04-13, and reverting it produced a new revision that wiped the graph —
  that incident is what ADR-017 was written about.
- `.github/workflows/reset-demo.yml` still POSTs to `https://<neo4j fqdn>:7474`
  for its dirty check. That call cannot answer either, so the `|| echo "-1"`
  fallback fires and every scheduled run resets the environment as "assumed
  dirty". Fail-safe, but not free. Not fixed here — issue #304.

Two claims on `/admin/audit` went with it: the subtitle said "Tamper-evident
audit trail" and a green badge said "HIPAA COMPLIANT". The records are ordinary
Neo4j properties with no hash, chain or seal (sealing them is #204), and HIPAA
is a US statute that nothing in the codebase checks. A compliance page that
asserts a control it does not have is worse than one that says nothing.

## 2026-09-20: on a device screen, the nearest word above a value is not its name

A gym scale's card prints the metric, then a red verdict badge, then the value:

    Körperfett
    A Niedrig
    10,6 kg

Taking the nearest line above the value as the label makes the analyte
"A Niedrig", and the row codes as nothing. The cure is the same one the printed
short-code rule uses: **let the dictionary arbitrate.** Walk upwards, take the
first line it knows as an analyte, and fall back to the nearest line that is
neither a unit nor one of the device's own verdict words.

The badge is worth ignoring for its own sake as well. `< 12.3 Niedrig` is the
manufacturer's band, not a guideline's, and the app compares only against
ranges it can cite (ADR-039).

## 2026-09-20: a lone leading zero is not a thousands separator

The German number rule says `.` before exactly three digits groups thousands,
so `1.240` pg/mL is 1240. A real sheet prints Lp(a) as `< 0.300 g/l`, and the
same rule read that as **300**, a thousandfold error on the value that decides
a cardiovascular referral. It also stored a reference bound of `< 0.050` as 50.

No grouping ever produces a leading lone zero, so `0.` now always starts a
decimal. Both parsers were fixed, because the rule is mirrored in Swift and
TypeScript, and an audit of the reports already on the phone found one stored
reference bound that had to be re-read.

## 2026-09-20: re-reading a stored scan loses the resolution it was read at

Keeping the pages lets a report be read again after the parser improves. A
stored PDF carries no resolution of its own, so the re-read picked 300 dpi,
which **upsampled** a 1206 pixel phone photograph to 2479 and read it worse:
19 coded values became 11, and the worse reading was saved over the better one.

Three changes, and the second is the one that matters:

- a record now stores the pixel width its pages were recognised at, so a
  re-read reproduces it;
- a re-read that finds fewer values than are stored is **discarded**, not
  saved. A repair that can lose data is not a repair;
- an older record with no resolution recorded is tried at two, and the better
  reading wins.

## 2026-09-20: an incremental device build can leave the app unsigned

`xcodebuild` reported BUILD SUCCEEDED and `devicectl` refused the result with
`No code signature found`. `codesign -dv` on the product said "code object is
not signed at all": the incremental build had skipped the signing phase after a
Swift-only change. A `clean build` fixed it. Worth checking the signature
rather than the build log when an install fails on integrity.

## 2026-09-19: a letter that is not the letter it looks like

A scanned report came back with `МСH` where the sheet printed `MCH`. The glyphs
are identical on screen; the code points are Cyrillic Em and Es. `normaliseLabel`
keeps only `a-z0-9` after folding, so both were stripped and the key became
`h`. The row was reported as an unknown analyte, which to a reader looks exactly
like an analyte nobody had added yet.

Homoglyphs are now folded to Latin before normalising, because in a German
laboratory's analyte name a Cyrillic letter is never anything but damage.

The same sheet showed the mirror case in units: `U/l` came back as `U/I` and as
`UII`, and `µIU/ml` as `ulU/ml`. Capital i, lower-case L, lower-case i, the
digit one, a pipe and a slash are one glyph as far as a recogniser is
concerned. A repair now tries those substitutions, under three guards that keep
it from inventing units:

- it runs **only** when the printed spelling is not already a unit, so a real
  unit is never rewritten;
- the token must contain at least one character that is not itself confusable,
  so a run of `III` cannot become `l/l`, which is a haematocrit;
- the substitutions must lead to exactly one UCUM code, or the repair is
  refused rather than guessed.

## 2026-09-19: Vision reads a downsampled copy, so a tall image loses its small print

A photograph of a practice-software printout coded **nothing**: 0 of about 40
values. The dictionary was not the problem and neither was the layout. The file
held **two A4 pages stacked in one image** (1206x2098), and at that size the
recogniser never read the result column at all.

Measured, which is the only way this was ever going to be found:

| Input              | Fragments | Decimal values |
| ------------------ | --------- | -------------- |
| Whole image        | 152       | 7              |
| Its top half alone | 165       | 12             |

Half the page yields more text than the whole page. Vision works on a
downsampled copy, so thin digits fall below what it can resolve, while headings
survive. Nothing in the output says so: the rows come back with their labels,
units and reference ranges, missing only the number.

A page taller than A4 is therefore read in overlapping bands, with each band's
coordinates lifted back onto the full page so a citation still points at the
right row. An ordinary page is untouched, which keeps the skew and degradation
measurements in `ScanningTests` comparable.

The lesson generalises past Vision: **when a recogniser returns less than the
page contains, measure a crop before blaming the parser.** A missing column
looks exactly like a parser bug from the outside.

## 2026-09-19: the first number on a line is not always the measurement

A real German report prints `HDL-Cholesterin Gen. 4 (SE) - 0.96 mmol/l`. The
line grammar's first match takes `4` as the value and `(SE)` as the unit, the
unit check fails, and the whole row was thrown away as unreadable. Two of the
five lipids on the sheet were lost this way, and the value that was lost is the
one a cardiologist reads first.

A regex that is anchored cannot backtrack on semantics, so the parser now
retries: a match whose unit is not a unit is not a failure, the search moves
past that number and tries again, and whatever was skipped becomes part of the
label. Four attempts, then the line is reported as unread.

The same sheet also explains why the label is not simply cut at the first
bracket: `Lp(a)` is an analyte and `Kreatinin (n. Jaffe) i. S. (SI) (SE)` is
creatinine. The dictionary arbitrates, full spelling first.

## 2026-09-19: the measurement that justified the OCR hybrid was taken on the wrong OS

`DocumentReconciler` exists because two Vision engines read a lab sheet
differently: the new document recogniser drops a lone `%`, the legacy
`VNRecognizeTextRequest` reads it, and reconciling them recovers the character
that decides HbA1c's LOINC code. That was measured with `swift test`, which
runs on **macOS**.

On **iOS 26.5** both passes lose it. A diagnostics record pulled from the
simulator shows 42 recognised fragments on the page and not one containing a
`%`, with the document pass's unit cell empty as well. The app had been
shipping a recovery that cannot fire on the only platform it runs on.

Worse, the row then vanished: an empty unit cell was skipped, and the
"does this look like a measurement" check needs a unit to say yes, so an
HbA1c row reached neither the coded list, the unmatched list nor the unread
list. 8 printed rows became 7 with nothing to show for the eighth.

Rules that follow:

- **A measurement row must always land in one of the three buckets.** The
  self-test now asserts conservation (`coded + unmapped + unread >= printed`),
  which is the check that would have caught this on day one.
- **A cross-platform claim needs a measurement on each platform.** `swift test`
  on this repository is macOS Vision, not iPhone Vision. Anything about what
  the recogniser reads has to be confirmed from a device or simulator
  diagnostics record.
- **Never fill in a missing unit.** `%` is 4548-4 and `mmol/mol` is 59261-8, so
  a guessed unit is a wrong code on a real measurement. Report the row instead.

## 2026-09-19: a parser fallback that rescues one layout can misread another

`LabLineParser` gained a rule for `HbA1c mmol/mol Hb  34,3  < 42.0`: when the
token after the value is not a unit but the label contains one, take the unit
from the label. Correct for that row. On the study centre's sheet, which
prints `Analyt  Einheit  Referenz  Wert`, the same rule turned
`Natrium [P]  mmol/l  136 - 145  141` from "unread" into a coded value of
**136**, the lower reference bound. Every unit test passed. The replay of a
real record (`swift run ScanReplay`) was what showed it, before the build
reached the phone.

Two rules that follow:

- A fallback that makes a previously refused line parse must be run against
  the layouts it was **not** written for, and a real sheet's record is the
  cheapest way to do that. Refused was safe; parsed-wrong is the one outcome
  the pipeline exists to prevent.
- On the line path the fallback now fires only when the label is one printed
  cell (no two-space column separator inside it) and the remainder is exactly
  a reference range. Unit-before-value layouts belong to the table path,
  which reads them by column role.

## 2026-09-19: a generator that scrapes its source loses whatever Prettier reformats

`generate-swift-analytes.ts` recovered the unit map by regex over
`analytes.ts`, matching quoted keys (`"fl": "fL",`). Prettier's default
`quoteProps: "as-needed"` unquoted `fl` and `pg`, the regex no longer saw
them, and the generated Swift table silently lost two units. `--check`
reported the table current, because the committed file matched a generation
that was itself wrong. Labels built by a helper (`differential(...)`) were
missed the same way, since there was no `labels: [...]` literal to scrape.

The fix is the general rule: a generator reads **data the source module
exports** (`UNIT_SPELLINGS`, `ANALYTE_LABELS`), never the source text.
Data cannot be reformatted away, and a test now asserts every analyte key
and the once-lost units appear in the emitted table. Same class as ADR-031:
a check that cannot fail is not a check.

## 2026-09-18: a Vitest hook that returns the mock calls it after the test

`beforeEach(() => mockRunQuery.mockReset())` looks harmless. `mockReset()`
returns the mock, so the arrow returns a function, and Vitest 4 runs a
function returned from a hook as that test's teardown. Every test in the
block therefore called `runQuery()` once more after it finished. That is
invisible until a test installs a throwing or rejecting implementation: the
teardown call throws, and Vitest fails the test with the mock's own error,
although the code under test caught it. It looked like Vitest attributing a
"swallowed rejection" to the test; the earlier workaround (no hook, reset
inside the first test) treated the symptom.

Rules that follow:

- Hooks that touch a mock use braces: `beforeEach(() => { m.mockReset(); })`.
  Same for `mockClear()` and `mockRestore()`, which also return the mock.
- When a test fails with an error the code under test demonstrably catches,
  look for a hook or callback that returns something.

## 2026-09-17: Neo4j's HTTP port 7474 does not exist on Azure

`/admin/audit` was blank on https://ehds.mabu.red on every revision (issue
#205). The route rewrote `NEO4J_URI` (`bolt://mvhd-neo4j:7687`) into
`http://mvhd-neo4j:7474/db/neo4j/tx/commit` and called the transactional HTTP
API. The compose stack publishes 7474 next to 7687, so it worked locally. On
ACA `mvhd-neo4j` has TCP ingress on 7687 and nothing else, so the call died
with `TypeError: fetch failed`, and the page stored the 502 body as if it were
data.

Rules that follow:

- Reach Neo4j from the UI only through `runQuery()` in `ui/src/lib/neo4j.ts`
  (Bolt). Grep for `tx/commit` and `:7474` before adding a route; the policies
  route carried the same copy.
- `NEO4J_HTTP_URL` on `mvhd-ui` pointed at the TCP ingress and served no HTTP.
  Nothing read it; it and `NEO4J_INTERNAL_URL` are gone, along with the last
  two shell callers of port 7474 — see the 2026-09-26 entry at the top.
- A client that does `r.json()` and stores the result must check `r.ok` or
  `body.error` first, or a 502 renders as an empty page instead of an error.
- Bolt wants `neo4j.int()` for `LIMIT` and `SKIP` parameters; a plain JS
  number arrives as a float and Cypher rejects it.
- The Access Logs tab of the same page was empty on every stack for a second
  reason: it read a `DataAccessLog` label that nothing writes. The recorder
  is the neo4j-proxy, which stores every data request as a `TransferEvent`
  (the label `init-schema.cypher` documents as the access event). When a tab
  is empty everywhere, compare the reader's label with the writer's before
  suspecting the seed.

## 2026-09-17: ACA internal ingress, job logs, and stale-revision panics

Each of these cost one run of `cfm-seed.yml` while bringing the CFM managers up
on Azure (issue #203).

**1. Internal ingress answers on 80/443 of the FQDN only.** The short name plus
target port, `http://mvhd-tenant-mgr:8080`, connects to nothing. The bare short
name, `http://mvhd-tenant-mgr`, connects and then hangs while the upstream is
unhealthy, which looks like the address being wrong. The form that works is
`https://<app>.internal.<domain>/api`, the one `05-cfm-ui.sh` already puts in
`EDC_TENANT_URL`; its certificate is publicly trusted, so no `-k`. The identity
hub's `http://mvhd-identityhub:7082` in `edc-seed-participants.yml` works only
because that app carries an `additionalPortMappings` entry for 7082. Binary
protocols are the other special case (`--transport tcp`, NATS entry below).

**2. Job console logs have an empty `ContainerAppName_s`.** Rows from an ACA
Job land in `ContainerAppConsoleLogs_CL` with `ContainerJobName_s` set and
`ContainerAppName_s` empty, so `where ContainerAppName_s == 'mvhd-cfm-seed'`
returns nothing and a failing job looks as if it printed nothing. Ingestion
also lags one to three minutes.

**3. A revision being deactivated keeps logging its panics** for minutes after
the new one is up, under its own `RevisionName_s`. A health check that greps
the app's newest lines fails on the old revision. Filter by
`properties.latestRevisionName`, and look at
`az containerapp replica list --revision <rev>` (ready, restartCount) first,
which has no ingestion lag.

Two smaller ones from the same session: `CODE=$(curl -w '%{http_code}' ... ||
echo 000)` yields `000000` on failure, because curl prints 000 through `-w`
before the fallback runs; write `CODE=$(curl ...) || CODE=000`. And when
`az containerapp update --yaml` finds the template unchanged it provisions no
revision, so a changed secret never reaches a secret volume until the running
revision is restarted (`05-cfm-configure.sh` now does that).

## 2026-09-13: CFM participant provisioning had three independent breaks

Symptom: every VPA stays `pending`, `bootstrap-jad.sh` still prints "ready".
Issue #181. Three unrelated causes had to be fixed together, and each one alone
was enough to stop provisioning.

**1. GHCR `:latest` for the four CFM agents was overwritten on 2026-04-11** with
a rewritten agent that requires a Fulcrum job coordinator this stack does not
run, so it panics at launch:

```
panic: error launching Fulcrum CFM Agent: missing parameters:
  cfm-agent.tmanager_url is empty, cfm-agent.pmanager_url is empty
```

Setting those two values is not the fix. The 2026-04-11 binary contains no EDC
management API calls at all (`strings` finds `FulcrumClient` and
`/api/v1/jobs/pending`, and nothing about participant contexts), so it would
start and then poll a coordinator forever while provisioning nothing. The fix is
the same one already applied to `cfm-tmanager` and `cfm-pmanager`: pin the
working 2026-03-09 digests, which are still resolvable in GHCR even though the
tag was overwritten. Same class as ADR-029.

**2. EDC 0.18 renamed the Management API segment `v5alpha` to `v5beta`**
(issue #97 Phase B) while the 2026-03-09 CFM agents have `v5alpha` compiled into
`controlplane.HttpManagementAPIClient` and expose only `controlplane.url`. Every
deploy then failed with `cannot create participant context in control plane:
received status code 404`. Worked around by `cfm-cp-shim`, an nginx service that
rewrites only that path segment (`jad/cfm-cp-shim.conf`). It deliberately passes
every other path through unchanged so it cannot hide a route the control plane
genuinely does not serve.

**3. EDC creates its stores with `CREATE TABLE IF NOT EXISTS` and ships no
migrations.** A table created under EDC 0.16 never gains a column added in 0.18,
so on any Postgres volume older than the upgrade, credential issuance dies with:

```
EdcPersistenceException: The column name additional_context was not found in
this ResultSet
```

Repaired idempotently in `jad/seed-issuer-identity.sql`. Expect this again on
the next EDC upgrade: when a store starts failing on a column name, diff the
live table against the `*-schema.sql` inside the service jar.

Bonus, and the reason this went unnoticed for five months: `seed-all.sh` turned
every failed phase into "had warnings (continuing)" and `bootstrap-jad.sh`
printed "JAD stack is ready" regardless. Both now exit non-zero, and the
bootstrap asserts that the agents are running and that a participant actually
reached ACTIVE (ADR-031).

Unrelated but found in the same session: a persistent `nats_data` volume can
reach a state where every JetStream publish fails with `nats: invalid jetstream
publish response`. Recreating the volume fixes it; the NATS server version is
not the cause (2.14.3 works on a fresh volume).

## 2026-04 — Neo4j 5 vector indexes are single-label only

`CREATE VECTOR INDEX foo FOR (n:A|B|C) ON (n.embedding)` **does not
parse** in Neo4j 5 community — the `|` multi-label syntax is reserved for
graph patterns, not index definitions. You get:

```
Invalid input '|': expected ')' (line 2, column 15)
"FOR (n:Patient|Encounter|Condition|..."
              ^
```

**Workaround (ADR-019):** apply a shared marker label to every node you
want in the index, then index that one label.

```cypher
MATCH (n) WHERE n.embedding IS NOT NULL SET n:Embedded;

CREATE VECTOR INDEX node_fastrp_index IF NOT EXISTS
FOR (n:Embedded) ON n.embedding
OPTIONS { indexConfig: {
  `vector.dimensions`: 256,
  `vector.similarity_function`: 'cosine'
}};
```

See `neo4j/register-embeddings-fastrp.cypher`. The existing schema label
(`:Patient`, `:HealthDataset`, etc.) is preserved; `:Embedded` is
additional and carries no semantic meaning beyond "this node has an
embedding and lives in the vector index."

## 2026-04 — `gds.graph.project.cypher` fails on dangling relationships

When the Cypher relationship-query returns edges whose target node is
not in the node-query (e.g. a `TransferEvent` linked out to an audit
node that isn't part of the curated label set), GDS throws:

```
Failed to load a relationship because its target-node with id 33174
is not part of the node query or projection.
```

**Fix:** pass `validateRelationships: false` as the fourth argument:

```cypher
CALL gds.graph.project.cypher(
  'health-dataspace-rp',
  'MATCH (n) WHERE any(l IN labels(n) WHERE l IN [...]) RETURN id(n), labels(n)',
  'MATCH (a)-[r]->(b) WHERE type(r) IN [...] RETURN id(a), id(b), type(r)',
  { validateRelationships: false }
)
```

The out-of-projection relationships are silently skipped; only edges
between projected nodes contribute to the FastRP walk. Acceptable for
our use — we pick the label set deliberately.

## 2026-04 — GDS heap is greedy: bump Neo4j memory before enabling

`NEO4J_PLUGINS=["apoc","graph-data-science"]` on a 512m-heap container
boots fine but dies the moment `gds.graph.project.cypher` runs:

```
Java heap space
```

**Settings that work locally (`docker-compose.yml`):**

```yaml
NEO4J_server_memory_heap_initial__size: 1G
NEO4J_server_memory_heap_max__size: 2G
NEO4J_server_memory_pagecache_size: 1G
```

**Settings that work on Azure (`scripts/azure/graphrag-deploy.yml`):**

```yaml
NEO4J_server_memory_heap_initial__size: 2G
NEO4J_server_memory_heap_max__size: 4G
NEO4J_server_memory_pagecache_size: 2G
```

The full 5300+ node 5-layer graph is small (FastRP finishes in
~300 ms), but GDS's working set is still heap-hungry — give it room.

## 2026-04 — `AZURE_OPENAI_GPT4O_URL` is a misleading env-var name

`services/neo4j-proxy/src/index.ts` reads
`process.env.AZURE_OPENAI_GPT4O_URL` for the chat-completions endpoint.
The name dates from the ADR-019 draft, which assumed a `gpt-4o-mini`
deployment. The deployed model on this project is **`gpt-5-mini`**; the
env var is still `AZURE_OPENAI_GPT4O_URL` for back-compat.

The URL it points to is the full deployment-specific chat-completions
URL, e.g.

```
https://oai-mvhd-5f53b7.openai.azure.com/openai/deployments/gpt-5-mini/chat/completions?api-version=2024-10-21
```

Do not rename the env var without also updating every consumer — see
`scripts/azure/07-ai-foundry.sh` for the Azure wiring and
`.github/workflows/graphrag-deploy.yml` for how it's refreshed.

## 2026-04 — ACA `:latest` tag is cached; job won't re-pull on start

Pushing a new `mvhd-neo4j-seed:latest` to ACR and calling
`az containerapp job start` re-runs the **old** image. ACA pulls
`:latest` only when the container-app spec changes — a simple tag push
doesn't.

**Fix:** `az containerapp job update --image ... --set-env-vars
"SEED_DEPLOY_TS=$(date)"` before starting. The env-var change forces a
spec update, and the `:latest` pull happens on the next execution.

See `.github/workflows/graphrag-deploy.yml` "Force seed job to pull
fresh :latest image" step.

## 2026-04 — Personal `az` CLI loses ACA write perms after ~1 hour

On subscription `INF-STG-EU_EHDS` the personal account holds
`Microsoft.App/*` through a time-limited PIM activation that silently
expires. `az account get-access-token` keeps succeeding; only the
write-side operations fail with:

```
AuthorizationFailed: does not have authorization to perform action
'Microsoft.App/jobs/start/action'
```

**Use the CI service principal for any ACA write.** Every ACA-writing
operation is available via GitHub Actions (`deploy-azure.yml`,
`reset-demo.yml`, `graphrag-deploy.yml`, `fhir-loader.yml`). The SP has
Contributor on `rg-mvhd-dev` + Reader on the subscription, which is
stable.

Memory entry: `project_aca_job_write_via_ci.md`.

## 2025 — Neo4j short service name required on ACA TCP ingress

Connecting to `mvhd-neo4j` from another ACA container must use the short
service name **`bolt://mvhd-neo4j:7687`** — the `*.internal.<domain>`
FQDN used for HTTP ingress silently times out on the Bolt TCP port.

This applies to every Bolt client: `neo4j-proxy`, the `mvhd-neo4j-seed`
job, the forthcoming `mvhd-catalog-enricher`.

See ADR-018 / memory `project_aca_tcp_ingress_shortname.md`.

## 2026-04-21 — ACA NATS needs `--transport tcp` + `--exposed-port`

`mvhd-nats` was originally deployed with `--ingress internal --target-port 4222`
only. ACA defaults to transport=Auto (HTTP via Envoy), which silently breaks the
NATS binary framing. Symptoms:

- `mvhd-catalog-crawler` Schedule Job runs complete "Succeeded" because
  `run_once` mode swallows publish errors.
- `mvhd-catalog-enricher` crashloops with
  `nats.errors.NoServersError: nats: no servers available for connection`.

Fix: add `--transport tcp --exposed-port 4222` on creation. ACA won't let you
change transport in place — the recovery is delete + recreate. See
`.github/workflows/fix-nats-transport.yml` for the one-off and
`scripts/azure/04-edc-services.sh` for the now-correct creation command.

Same class as `project_aca_tcp_ingress_shortname` (Neo4j/7687). Bolt, Postgres,
NATS, Kafka — any binary protocol on ACA needs explicit `--transport tcp`.

## 2026-09-20 — `xcodegen generate` drops the iOS signing team

`clients/ios/MeinBefund.xcodeproj` is generated and git-ignored, and
`project.yml` deliberately carries no `DEVELOPMENT_TEAM`, because the team id
belongs to an account rather than to the repository. So every regeneration
produces a project that builds for the simulator and fails for a device with:

```
error: Signing for "MeinBefund" requires a development team.
```

Adding a Swift file to `Sources/` needs a regeneration, so this appears after
an ordinary change with nothing to do with signing.

Fix: `clients/ios/Scripts/install-device.sh` builds and installs in one step.
It reads `TEAM_ID` when set and otherwise takes the id from the Apple
Distribution identity in the login keychain, so the id stays out of the repo
and nobody has to rediscover it. `DEVICE_ID` overrides the device when more
than one iPhone is paired.

## 2026-09-20 — a TestFlight upload needs no issuer id, only a signed-in Xcode

An afternoon went into looking for the App Store Connect **issuer id** so that
`xcrun altool --upload-app` could authenticate. It was nowhere: not in the
shell, not in the keychain, not in `~/.appstoreconnect`, and not in the
TwoBreath repository either, where `scripts/upload.sh` and the Fastfile both
take it as an argument. Nor is it in the App Store Connect app on iPhone,
which does not show API keys at all. It lives only on the website, under Users
and Access → Integrations → App Store Connect API.

None of that is needed. `ExportOptions.plist` with

```xml
<key>destination</key><string>upload</string>
```

makes `xcodebuild -exportArchive` send the build itself, using the Apple ID
signed into Xcode. No key, no issuer id.

The prerequisite is that Apple ID: Xcode → Settings → Accounts. With none, the
first failure is not a login error but

```
error: exportArchive No profiles for 'red.mabu.meinbefund' were found
```

which reads like a signing problem and is really a sign-in problem, because
automatic signing can only fetch a distribution profile by asking App Store
Connect. The certificates and profiles being present on the machine does not
help; they were installed by an earlier session that has since gone.

`clients/ios/Scripts/archive-and-upload.sh` now takes this path whenever no
API key is in the environment, instead of stopping with the .ipa and telling
you to find Transporter.

## 2026-09-20 — an accessibilityIdentifier on a chart renames everything inside it

`.accessibilityIdentifier("trend-chart-ferritin")` on a SwiftUI `Chart` gave
that identifier, and that label, to every element inside it. Each point button
came back as `trend-chart-ferritin` labelled "Ferritin, 2 measurements", so no
two points could be told apart and a UI test could not tap one.

`.accessibilityElement(children: .contain)` before the identifier makes the
chart a container instead of an element: it keeps its own name and the
children keep theirs.

Two more from the same afternoon:

- A `Button` whose label is `Color.clear` is dropped from the accessibility
  tree. It exists for a finger and for nothing else. `Circle().fill(
Color.primary.opacity(0.001))` draws something, so it is exposed.
- Swift Charts' `chartXSelection` responds to a finger and not to a
  synthesised tap, so neither XCUITest nor a `CGEvent` click can reach it.
  That is a testing problem and an accessibility problem at once: VoiceOver
  cannot reach it either. Real buttons over the points fix both.

## 2026-09-20 — walking XCUITest elements one at a time races a recycling list

`app.descendants(matching: .any).allElementsBoundByIndex` asks the app for
each element in turn. A `List` that recycles a row between two of those asks
fails the test with

```
Failed to get matching snapshot: No matches found for Element at index 150
```

which says nothing about what the test was checking. `app.debugDescription`
takes one snapshot and contains every label, and the suite got faster for it:
387 seconds to 210.

## 2026-09-20 — a PDF's text layer hands over an embedded font's own icons

A home aminogram read as eight values coded and eight lines the app could not
read. The unread eight were the same eight values, printed a second time
beside a gauge, and what stopped them parsing was one invisible character:
`U+E607`, in Unicode's private use area, where the embedded font keeps its
pictures.

No alphabet, no unit and no number lives in that range, so
`LabLineParser.withoutPrivateGlyphs` takes those code points out before any
line is parsed. The eight went from unread to recognised as repeats of values
already extracted.

Worth remembering when a line looks perfectly ordinary in a diagnostics dump
and still refuses to parse: print the scalars, not the string.

## 2026-09-21 — `State(initialValue:)` in an initialiser undoes what a person typed

A weight typed into the profile reverted to the one read from the reports a
moment later. The fields were seeded with `State(initialValue:)` inside
`ProfileView.init`, and a sheet's content closure is rebuilt more than once:
each rebuild re-ran the initialiser and put the stored value back over the
edit.

Seed once, in `.onAppear`, guarded by a flag. The initialiser stores the
`let`s and nothing else.

The symptom is easy to misread as a binding problem, because the field accepts
the keystrokes and shows them until the next redraw.

## 2026-09-25: two traps in verifying a deploy with the journeys

- `gh pr checks <n>` prints "No checks reported" for a minute or so after a
  push, before the workflows register. A script that treats an empty list as
  "all green" merges before CI ran (it happened to PR #298; the suite passed
  afterwards). Wait until at least one check is listed, then until none is
  pending.
- `KEYCLOAK_PUBLIC_URL` for a live journey run is the host,
  `https://auth.ehds.mabu.red`; the helper appends `/realms/edcv` itself. With
  the realm URL the probe 404s and every test skips as "Keycloak unavailable",
  which reads like a clean run.

## 2026-09-26 — gitleaks does not scan `.bru` files at all

A forged NextAuth session cookie sat in
`bruno/MVHDv2/environments/Azure-Dev.bru` from 2026-05-09 (commit `3ae4165`,
"demo env, weekly wipe") until #349 removed it. Every secret scan in the
repository passed the whole time.

Measured with gitleaks 8.30.1, a directory holding one `.bru` file containing a
NextAuth JWE:

```
gitleaks detect --no-git --source <dir>   ->  scanned ~0 bytes (0), no leaks found
cp leaktest.bru leaktest.txt && rerun     ->  scanned ~199 bytes, leaks found: 1
```

Same bytes, same rule, different extension. gitleaks skips the file, so no rule
can catch it, including the `nextauth-session-jwe` rule this repository now
carries in `.gitleaks.toml` (which does work on `.txt`, `.md`, `.json` and the
rest).

**What to do:** the check that reads `.bru` files is
`scripts/check-bruno-coverage.py`, and it now refuses a `.bru` carrying a JWE, a
signed JWT, or a `sessionToken`-looking value of 24 characters or more. It runs
in pre-commit and in the PR Gate. If another tool ever needs to see inside a
`.bru`, assume gitleaks is not doing it.

**The wider lesson:** a scanner's silence is evidence about the scanner, not
about the file. Before trusting that a file type is covered, put a known secret
in one and watch the scan go red (ADR-031, "prove the check discriminates").

## 2026-09-26 — the pinned Neo4j proxy image is six months older than its source

`docker-compose.jad.yml` pins `neo4j-proxy` by digest
(`ghcr.io/ma3u/health-dataspace/neo4j-proxy:latest@sha256:e64e5706…`) next to a
`build:` context. The pinned image was built in March 2026;
`services/neo4j-proxy/src/index.ts` last changed 2026-09-25. Nine routes exist
in the source and answer 404 on the running container: `/fhir/Patient`,
`/omop/cohort`, `/federated/stats`, `/nlq/templates`, `/nlq/backend`, `/tasks`,
`/tck`, `/trust-center/*`, `/debug/phase26`. The hub routes that call them
answer `502 {"error":"Unexpected token '<' … is not valid JSON"}`, which is the
proxy's HTML 404 page being parsed as JSON.

`docker compose build neo4j-proxy` refuses: **"refusing to create a tag with a
digest reference"**. The digest pin and the build context cannot both be used;
one has to go, which is a decision for ADR-029 rather than a local workaround.

Nine of the fourteen failures in the first Bruno run are this one cause.

## 2026-09-27 — a workflow does not re-run when the scripts it runs change

`compliance.yml` triggered on `scripts/run-*.sh` and a few named files. The
suites it runs also depend on every seed script, on `scripts/lib/`, and on most
of `jad/`. So a push to main that fixed a seed script did not re-run the suite:
the last result, red and stale, kept standing, and branch protection kept
reporting it while the fix sat merged underneath.

Measured across every workflow with a paths filter, counting real invocations
and ignoring paths merely named in a comment:

| workflow        | files it runs that did not re-trigger it |
| --------------- | ---------------------------------------- |
| compliance      | 30                                       |
| bruno-smoke     | 3                                        |
| demo-smoke      | 3                                        |
| security-scan   | 2                                        |
| catalog-crawler | 1                                        |

Two things make this hard to spot. A green tick on a stale result is
indistinguishable from a green tick on a fresh one. And the dependency is
transitive: `compliance.yml` runs `seed-identity-layer.sh`, which runs
`repair-cp-sts-secrets.sh` through `"${SCRIPT_DIR}/..."`, which no glob named
and no plain grep for `scripts/` would have found.

`scripts/check-workflow-paths.py` derives the set rather than listing it, and
runs in pre-commit. When a workflow starts running something new, add the glob
the checker asks for instead of assuming the filter is still complete (#364).

## 2026-09-28 — every custom image is arm64-only, so CFM has never run in CI

`/api/participants/<tenant>/credentials` answered 200 locally and 502 in CI
for as long as anyone had looked. The cause is not the route.

Every image in `ghcr.io/ma3u/health-dataspace/` is a **single-arch linux/arm64
manifest**, built on an Apple Silicon machine and pushed without a second
platform:

```
cfm-tmanager  cfm-pmanager  cfm-edcvagent  cfm-kcagent  cfm-obagent
cfm-regagent  jad-controlplane  jad-dataplane  jad-identity-hub
jad-issuerservice  neo4j-proxy        all linux/arm64
```

GitHub runners are amd64. Compose says so and carries on:

```
tenant-manager The requested image's platform (linux/arm64) does not match
the detected host platform (linux/amd64/v4) and no specific platform was
requested
Container health-dataspace-tenant-manager  Started
```

"Started" is not "running": the Tenant Manager never serves, and calls to it
fail with `TypeError: fetch failed` after a five-second timeout.

Two things then hid it. `/api/admin/tenants` backfills from Neo4j when CFM is
unreachable, so it answered 9 tenants and looked healthy; those rows carry
graph-layer `did:web` ids rather than CFM tenant UUIDs. And nothing asserted
the `source` field that says which backend replied. A whole subsystem was
absent from every CI run and the suite reported green.

An amd64 build does exist: `docs/azure-deployment-plan.md` records
`GOARCH=amd64 go build` from `Metaform/cfm-fulcrum`, pushed to ACR for the
Azure deployment. It was never pushed to GHCR, which is where compose pulls
from. Publishing multi-arch tags there is what would actually fix it.

Until then: the collection asserts `source` and captures a CFM tenant id only
when CFM itself answered (#380), so a run states the absence instead of
implying the opposite. When a service behaves differently in CI than on a
laptop, check `docker image inspect --format '{{.Architecture}}'` before
anything else.
