# EDC sizing under load: the contracts run after ADR-089

[ADR-089](../ADRs/ADR-089-the-java-edc-apps-shrink-to-what-they-use.md) halved
the three Java EDC apps on Azure on 2026-11-11: the control plane to 0.5 vCPU
and 1 GiB, the IdentityHub and the IssuerService to 0.25 vCPU and 0.5 GiB each,
with `-XX:MaxRAMPercentage=50` so the heap ceiling stayed where it was. The ADR
left one question open: whether negotiation under load fits the new sizes. This
page is the answer, measured with the k6 `contracts` scenario the same day, and
the two runs before it that measured nothing, with why.

**Result:** it fits. Run `20261111-1232-contracts-aca` held every k6
threshold with 0 failed requests, and no EDC app came near its new size.

## What the scenario does

`contracts` in [`load-tests/config.js`](../../load-tests/config.js) ramps from
1 to 2 users in a minute, to 10 users over two minutes, and down to 0 in 30
seconds: 3 minutes 30 seconds. Each user is PharmaCo Research AG (data user)
running the journey of the negotiate page,
`contractJourney()` in [`load-tests/platform.js`](../../load-tests/platform.js):

1. `GET /api/negotiations` reads AlphaKlinik Berlin's catalogue through the
   control plane.
2. `POST /api/negotiations` asks for a contract on the first offer, sending the
   whole offer policy and the provider's DSP address.
3. `GET /api/transfers` lists PharmaCo's transfers.

A live negotiation has no agreement yet when the POST answers (the connectors
agree afterwards and report it to the audit chain themselves), so the run
starts no transfer; that is about three requests per iteration. The run is
started inside the Container Apps environment as the job `mvhd-load-test` by
[`scripts/azure/run-load-test.sh`](../../scripts/azure/run-load-test.sh),
which holds deploys while it runs.

## The run that counts: `20261111-1232-contracts-aca`

12:32 to 12:38 UTC, image `mvhd-k6:aee62e65`, the EDC apps at the ADR-089
sizes.

| Measure                  | Value                                |
| ------------------------ | ------------------------------------ |
| Users                    | 1 to 10                              |
| Iterations               | 183 (0.86 per second)                |
| Requests                 | 559 (2.6 per second)                 |
| Failed requests          | **0** (0.00 %)                       |
| Checks                   | **99.28 %** (1,110 passed, 8 failed) |
| API latency avg / median | 361 ms / 310 ms                      |
| API latency p95 / p99    | **775 ms** / 1.06 s                  |
| Slowest request          | 1.24 s                               |
| Thresholds               | all held; the job reported succeeded |

The 8 failed checks are all "api under 1000 ms": 8 of 559 answers took longer
than a second, the slowest 1.24 s. Every answer was the one expected.

The control plane wrote no line at all from 12:30 UTC to the time of
writing (Log Analytics, `ContainerAppConsoleLogs_CL`, read at 14:30 UTC). It
logs warnings and errors only, so that means no `Name does not resolve`, no
retry and no refused agreement; in the run before, 12:25 to 12:30, it wrote
340 SEVERE lines for its 170 refused agreements, so the log was flowing.

Every negotiation the run created reached `FINALIZED`: 350 records created
between 12:32 and 12:38 UTC on the consumer and provider sides together, none
terminated and none still requesting (management API,
`POST /v5/participants/<ctx>/contractnegotiations/request` over all seven
participant contexts, read at 14:20 UTC).

### The EDC apps against their new sizes

Azure Monitor, `UsageNanoCores` and `WorkingSetBytes`, the highest one-minute
value of the run window (12:31 to 12:40 UTC), one replica each:

| App                  | Size (ADR-089)  | CPU peak  | Share of CPU | Memory before / peak | Share of memory |
| -------------------- | --------------- | --------- | ------------ | -------------------- | --------------- |
| `mvhd-controlplane`  | 0.5 vCPU, 1 GiB | 0.33 vCPU | 66 %         | 364 / 368 MiB        | 36 %            |
| `mvhd-identityhub`   | 0.25, 0.5 GiB   | 0.09 vCPU | 36 %         | 224 / 231 MiB        | 45 %            |
| `mvhd-issuerservice` | 0.25, 0.5 GiB   | 0.00 vCPU | 0 %          | 178 / 178 MiB        | 35 %            |
| `mvhd-siglet` (Rust) | 0.25, 0.5 GiB   | 0.00 vCPU | 0 %          | 89 / 89 MiB          | 17 %            |

The load reached the connectors from 12:35 to 12:38 UTC. The control plane's
CPU rose minute by minute (0.06, 0.16, 0.28, 0.33 vCPU) with 10 users, so it is
the app with the least headroom: two thirds of its half core at the peak. Its
memory hardly moved, 4 MiB over the run. The IssuerService did nothing, as
expected: a negotiation presents credentials the IdentityHub already holds and
issues none. Each app kept its one replica, created hours before the run,
with 0 restarts.

The rest of the stack in the same window, for scale: the UI peaked at 0.28
vCPU of 0.5, Neo4j at 0.21 vCPU of 2, the proxy at 0.07 of 0.25, Keycloak at
0.07 of 1.

The JVM heap ceiling is half the container (`EDC_JVM_HEAP_OPTS`): 512 MiB for
the control plane and 256 MiB for the other two, the same as before the change.

## The two runs that measured nothing

Both ran against the same sizes and both are invalid. They are kept here
because each found a bug in the load test, not in the hub.

| Run                           | k6 said                                                                | What really happened                                                                                                                                                                                                                                                                           | Fixed by                                                                                                                                                                                                     |
| ----------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `20261111-0807-contracts-aca` | 406 requests, 0 failed, checks 83.49 %, p95 2.7 s; thresholds crossed  | The scenario sent `http://controlplane:8082/api/dsp`, the compose name, as the provider's address. On Azure the app is `mvhd-controlplane`, so all 132 negotiations failed with `Name does not resolve` and kept retrying through the NATS consumer, and real negotiations queued behind them. | [#1076](https://github.com/ma3u/MinimumViableHealthDataspacev2/pull/1076): the runners pass `DSP_ADDRESS` from the stack they run against; the stuck negotiations were terminated through the management API |
| `20261111-1223-contracts-aca` | 520 requests, 0 failed, checks 95.86 %, p95 1.16 s; thresholds crossed | The address was right, but the scenario sent only the offer's id, not its policy. The consumer compares the agreement with the policy it asked for, so all 170 negotiations ended in `TERMINATED` with "Policy in the contract agreement is not equal to the one in the contract offer".       | this branch: `firstOffer()` keeps the whole offer and the POST sends `policy`, as the negotiate page does                                                                                                    |

The first one also means no `contracts` run on Azure had negotiated for real
since the scenario came in (#579, 2026-10-06): the October numbers in the
[load test index](../loadtest/README.md) measured requests to a name that does
not resolve. The full account is the 2026-11-11 entry in
[`docs/gotchas.md`](../gotchas.md).

The latencies of the three runs are not comparable: in the first the control
plane was busy retrying, in the second every negotiation ended early.

## Transfers under load: the evening runs

The scenario now waits for each agreement and transfers on it (see
[What follows](#what-follows)). Two `contracts` runs measured that on Azure
the same evening, at the ADR-089 sizes. The stack had been stopped at 18:13
UTC (ADR-053); it was started at 18:36, up at 18:46, held with
`live-demo-hold-until` and stopped again at 19:08.

| Measure                     | `20261111-1847-contracts-aca` (cold) | `20261111-1856-contracts-aca` (warm) |
| --------------------------- | ------------------------------------ | ------------------------------------ |
| Started after the stack     | 3 minutes                            | 11 minutes                           |
| Iterations / requests       | 54 / 429                             | 61 / 465                             |
| Failed requests             | **0**                                | **0**                                |
| Negotiations agreed         | 54 of 54                             | 61 of 61                             |
| Time to agreement p50 / p95 | 6.7 s / 14.8 s                       | 6.2 s / 19.6 s                       |
| Transfers started (`201`)   | 54, all `STARTED` in the connector   | 61, all `STARTED` in the connector   |
| Refused transfers (`403`)   | 17                                   | 20                                   |
| Polls (`kind:poll`), share  | 186, 43 %                            | 191, 41 %                            |
| API p95 (`kind:api`)        | **1.37 s**, over the 1 s SLO         | **1.58 s**, over the 1 s SLO         |
| Control plane CPU peak      | 0.31 vCPU of 0.5                     | 0.36 vCPU of 0.5                     |
| IdentityHub CPU peak        | 0.20 vCPU of 0.25                    | 0.12 vCPU of 0.25                    |
| Control plane errors        | none                                 | none                                 |
| k6 result                   | failed: `checks`, API p95            | failed: `checks`, API p95            |

Every answer was the one expected, and every negotiation and transfer
reached the connectors (the hub's `GET /api/negotiations` and
`GET /api/transfers` for PharmaCo, filtered to each run's minutes) and the
audit trail. The **EDC contracts and transfers** dashboard, which reads the
DSP chain, counts for the two runs' windows 54 and 61 negotiations agreed and
finalized, 54 and 61 transfers started, 17 and 20 refused for want of a
data permit, and none terminated or failed. None is completed either: an
`HttpData-PULL` transfer stays `STARTED` while its data address is valid, and
the scenario does not fetch the data.

Both runs fail on latency only, and the second, warm one is no faster, so it
is not a cold start. Latency per endpoint (Prometheus through Grafana,
`k6_http_req_duration_seconds` by `name` over each run's six minutes; the
counts are Prometheus's estimate, a few above k6's own) shows where:

| Endpoint                            | Requests, cold / warm | p50, cold / warm | p95, cold / warm |
| ----------------------------------- | --------------------- | ---------------- | ---------------- |
| `GET /api/transfers`                | 55 / 63               | 582 / 805 ms     | 1.26 s / 2.18 s  |
| `GET /api/negotiations` (catalogue) | 55 / 62               | 904 / 522 ms     | 1.64 s / 1.50 s  |
| `POST /api/transfers`               | 55 / 62               | 288 / 267 ms     | 562 / 771 ms     |
| `POST /api/negotiations`            | 55 / 62               | 275 / 257 ms     | 618 / 707 ms     |
| `POST /api/transfers` (no permit)   | 18 / 21               | 78 / 62 ms       | 302 / 163 ms     |
| `GET /api/participants`             | 10 / 10               | 35 / 33 ms       | 185 / 143 ms     |
| poll, outside the threshold         | 189 / 194             | 50 / 37 ms       | 401 / 403 ms     |

- **The transfer itself is not the slow step.** Its POST stays under the SLO.
- **`GET /api/transfers` grows with what the runs leave behind.** The route
  asks the control plane for the newest 200 transfer processes
  (`newestFirstQuery()`). PharmaCo had a handful before these runs; after
  the first it had about 140 and during the second the 200 rows were full,
  each a JSON-LD transfer process. The transfer page reads the same list.
- **The catalogue request was already the slowest call** in the 12:32 run,
  and it is slower while the control plane also runs transfers.
- **The control plane still has headroom:** 72 % of its half core at the
  peak, against 66 % at 12:32. The IdentityHub's 80 % was in the cold run
  only.

The ADR-089 sizes are not what the threshold measures here. What it shows is
two read paths, the transfer list and the catalogue, that need a page size or
a cache before the `contracts` scenario can pass with transfers in it.

## Grafana

The dashboards need a sign-in on <https://grafana.ehds.mabu.red>: the
operator account `admin`, whose password is the Key Vault secret
`grafana-admin-password` in `kv-mvhd-b53a0449` (see
[Dashboards](../operations/dashboards.md)). They show data only while the
stack is up ([ADR-053](../ADRs/ADR-053-everything-stops-off-hours.md)), and
keep it: the evening runs were read the next morning. Times are UTC.

The same account answers Grafana's HTTP API, which is how the per-endpoint
numbers above were read, without a browser and without
`az containerapp exec` into `mvhd-observability` (which drops quotes from the
query and is rate-limited after a few calls). With the password in
`GF_PW`:

```bash
curl -s -u "admin:$GF_PW" -G \
  https://grafana.ehds.mabu.red/api/datasources/proxy/uid/prometheus/api/v1/query \
  --data-urlencode 'time=2026-11-11T19:01:35Z' \
  --data-urlencode 'query=histogram_quantile(0.95, sum by (name) (increase(k6_http_req_duration_seconds{testid="20261111-1856-contracts-aca"}[6m])))'
```

The DSP chain behind the EDC dashboard answers on
`/api/datasources/proxy/uid/mvhd-audit/audit/chains/dsp/stats?from=<ms>&to=<ms>`.

| Run                                     | Load and stress test                                                                                                                                             | EDC contracts and transfers                                                                                                    |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `20261111-1232-contracts-aca` (valid)   | [12:31 to 12:40](https://grafana.ehds.mabu.red/d/mvhd-load-test/load-and-stress-test?var-testid=20261111-1232-contracts-aca&from=1794400260000&to=1794400800000) | [12:31 to 12:40](https://grafana.ehds.mabu.red/d/mvhd-edc-dsp/edc-contracts-and-transfers?from=1794400260000&to=1794400800000) |
| `20261111-1223-contracts-aca` (invalid) | [12:21 to 12:31](https://grafana.ehds.mabu.red/d/mvhd-load-test/load-and-stress-test?var-testid=20261111-1223-contracts-aca&from=1794399660000&to=1794400260000) | [12:21 to 12:31](https://grafana.ehds.mabu.red/d/mvhd-edc-dsp/edc-contracts-and-transfers?from=1794399660000&to=1794400260000) |
| `20261111-0807-contracts-aca` (invalid) | [08:05 to 08:15](https://grafana.ehds.mabu.red/d/mvhd-load-test/load-and-stress-test?var-testid=20261111-0807-contracts-aca&from=1794384300000&to=1794384900000) | [08:05 to 08:15](https://grafana.ehds.mabu.red/d/mvhd-edc-dsp/edc-contracts-and-transfers?from=1794384300000&to=1794384900000) |
| `20261111-1847-contracts-aca` (cold)    | [18:46 to 18:55](https://grafana.ehds.mabu.red/d/mvhd-load-test/load-and-stress-test?var-testid=20261111-1847-contracts-aca&from=1794422760000&to=1794423300000) | [18:46 to 18:55](https://grafana.ehds.mabu.red/d/mvhd-edc-dsp/edc-contracts-and-transfers?from=1794422760000&to=1794423300000) |
| `20261111-1856-contracts-aca` (warm)    | [18:55 to 19:04](https://grafana.ehds.mabu.red/d/mvhd-load-test/load-and-stress-test?var-testid=20261111-1856-contracts-aca&from=1794423300000&to=1794423840000) | [18:55 to 19:04](https://grafana.ehds.mabu.red/d/mvhd-edc-dsp/edc-contracts-and-transfers?from=1794423300000&to=1794423840000) |

On **Load and stress test**, the "Load (k6)" row shows the users, requests and
p95, and the "Containers" row the CPU and memory of the connectors. On **EDC
contracts and transfers**, the valid run's negotiations count as requested and
then finalized. In the first invalid run they stay requested until they were
terminated by hand after 12:00; in the second they end terminated within the
run. In the evening runs the "Data transfers" row fills too: started, and
refused for the dataset no permit covers.

## What follows

- The ADR-089 sizes stay. The control plane has the least headroom in CPU, so
  it is the one to watch when the `load` scenario runs with the EDC pages doing
  real work (step 4 of the runs still to do in the
  [load test index](../loadtest/README.md#the-runs-still-to-do)).
- Transfers are measured now. The run above started none: the scenario
  transferred only when the POST answered with an agreement, and a live
  negotiation agrees later. Since then `contractJourney()` waits for the
  agreement as the negotiate page does, asking
  `GET /api/negotiations/<id>` after 1, 2, 3, 5 and then every 8 seconds, up
  to `AGREEMENT_TIMEOUT_S` (60 s). On `FINALIZED` it runs
  `POST /api/transfers` on the agreement, to the provider endpoint the
  negotiation recorded, and one time in four the refused transfer for a
  dataset no permit covers. A negotiation that ends `TERMINATED` or is still
  open at the timeout is a failed check (`negotiation agrees within 60 s`)
  and counts in `negotiations_unagreed`; `negotiation_agreed` is the time to
  the poll that saw the agreement. The polls are tagged `kind:poll`, so the
  API p95 and its threshold are the person's calls only.
- On the compose stack (`20261111-1846-contracts-local`, the same 1 to 10
  users) that gave 110 iterations and 623 requests, 0 failed, every check
  passed: 110 negotiations agreed (p50 1.0 s, p95 3.0 s, at the polls'
  resolution), 110 transfers started in the control plane (`201`, p95
  115 ms), 33 refused (`403`). The 140 polls were 22.5 % of the requests;
  the 483 other requests had a p95 of 107 ms. On Azure, where an agreement
  takes about 6 seconds, the polls are about 42 % of the requests; the
  results are in [Transfers under load](#transfers-under-load-the-evening-runs).
- The `contracts` scenario fails its API threshold on Azure since it
  transfers, on `GET /api/transfers` and the catalogue request, not on the
  transfer. Each run adds about 60 transfer processes to PharmaCo's list,
  so later runs read a full 200 rows. Since #1088 both reads do less:

  - **The lists are paged.** `GET /api/transfers` and `GET /api/negotiations`
    take `limit` and `offset` (`ui/src/lib/list-page.ts`): 50 rows unless
    asked, at most 200, a `400` with `{ error }` for anything that is not a
    whole number. The demo and mock rows come on the first page only. The
    transfer page, the negotiate page and the k6 step ask for one page of 50. What a list costs is the control plane compacting each row as
    JSON-LD, so it grows with the rows: on the compose stack, asked
    directly, 200 negotiations were 545 kB and 430 to 570 ms, 50 were
    140 kB and 83 to 108 ms; 200 transfers 160 to 300 ms, 50 about 40 ms.
  - **The catalogue request no longer lists every context first.** The
    participant contexts are kept for a minute
    (`ui/src/lib/edc/context-lookup.ts`), for the catalogue's DID lookup and
    for the transfer POST's lookup of the consumer's DID, which also listed
    them on every live transfer. A DID the kept list does not name is
    looked up again at once, and a catalogue request that fails on a kept
    context id reads the list afresh and tries once more. Requests for the
    same catalogue at the same moment share one DSP request
    (`shareInFlight()` in `ui/src/lib/server-cache.ts`); nothing is kept
    after it answers, so a new offer shows on the next request.
  - **Where the catalogue time goes is not settled.** On the compose stack
    the DSP catalogue request itself takes 25 to 54 ms warm and the context
    list about 20 ms, so neither explains 1.5 s on Azure. There the request
    runs the DCP exchange between the apps (a token from the IdentityHub,
    its presentation, the DID documents) through the Container Apps
    ingress, on a control plane that is also compacting the 200-row lists.
    The next Azure run tells whether the smaller lists free enough of it;
    if the catalogue is still over the SLO, the calls the control plane
    makes to the IdentityHub during one request are the place to look next.

  Measured on the compose stack on 2026-11-12, the branch's UI and the one
  before it side by side on the same stack, against PharmaCo's 200+
  transfers and negotiations. Twenty requests after each other per route:

  | Route, p50 / p90                   | Before #1088   | #1088        |
  | ---------------------------------- | -------------- | ------------ |
  | `GET /api/transfers` (one page)    | 256 / 642 ms   | 59 / 113 ms  |
  | `GET /api/negotiations` (one page) | 542 / 1,173 ms | 147 / 266 ms |
  | `GET /api/negotiations` catalogue  | 74 / 128 ms    | 62 / 96 ms   |

  The `contracts` scenario, back to back (`K6_JSON=1`, then
  `load-tests/p95-by-name.py`):

  | p95                                 | `20261112-base-contracts-local` | `20261112-branch-contracts-local` |
  | ----------------------------------- | ------------------------------- | --------------------------------- |
  | `GET /api/transfers`                | 553 ms (p50 307 ms)             | **302 ms** (p50 111 ms)           |
  | `GET /api/negotiations` (catalogue) | 199 ms                          | 321 ms                            |
  | `POST /api/negotiations`            | 210 ms                          | 540 ms                            |
  | `POST /api/transfers`               | 222 ms                          | 306 ms                            |
  | All `kind:api`                      | 433 ms                          | **364 ms**                        |
  | Answers over 1 s                    | 1 of 470                        | 10 of 435                         |
  | Failed requests                     | 0                               | 0                                 |

  The compose stack shares the laptop with other containers whose load
  comes in bursts, and the runs show it: 9 of the branch run's 10 slow
  answers came within two seconds (09:16:34 to 09:16:36 UTC+1) on every
  route at once, the catalogue and the negotiation POST included, which is
  the host and not a route. A third run (`20261112-branch2-contracts-local`)
  at a load average of 25 was slow on every route, the refused transfer
  that hardly reaches the connector included (p95 813 ms), and is not
  counted. The transfer list is the measure that holds across the runs. An
  Azure `contracts` run with this change decides whether the API threshold
  holds there; it needs `az login`, a stack that is up (ADR-053) and no
  merge to `main` while it runs.

- After any `contracts` run against Azure, check the control plane's log for
  `Name does not resolve` and the negotiation states before calling it done.

## Reproduce

```bash
scripts/azure/run-load-test.sh contracts      # inside Azure, as a Container Apps job
load-tests/run.sh contracts local             # against the compose stack
```

The run's raw summary is in the job's log (`az containerapp job logs show -n
mvhd-load-test -g rg-mvhd-dev --container k6`) while the execution is kept.
