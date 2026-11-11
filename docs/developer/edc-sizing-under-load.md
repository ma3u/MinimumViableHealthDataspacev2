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

## Grafana

The dashboards need a sign-in on <https://grafana.ehds.mabu.red> (see
[Dashboards](../operations/dashboards.md)) and show data only while the stack
is up ([ADR-053](../ADRs/ADR-053-everything-stops-off-hours.md)). Times are UTC.

| Run                                     | Load and stress test                                                                                                                                             | EDC contracts and transfers                                                                                                    |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `20261111-1232-contracts-aca` (valid)   | [12:31 to 12:40](https://grafana.ehds.mabu.red/d/mvhd-load-test/load-and-stress-test?var-testid=20261111-1232-contracts-aca&from=1794400260000&to=1794400800000) | [12:31 to 12:40](https://grafana.ehds.mabu.red/d/mvhd-edc-dsp/edc-contracts-and-transfers?from=1794400260000&to=1794400800000) |
| `20261111-1223-contracts-aca` (invalid) | [12:21 to 12:31](https://grafana.ehds.mabu.red/d/mvhd-load-test/load-and-stress-test?var-testid=20261111-1223-contracts-aca&from=1794399660000&to=1794400260000) | [12:21 to 12:31](https://grafana.ehds.mabu.red/d/mvhd-edc-dsp/edc-contracts-and-transfers?from=1794399660000&to=1794400260000) |
| `20261111-0807-contracts-aca` (invalid) | [08:05 to 08:15](https://grafana.ehds.mabu.red/d/mvhd-load-test/load-and-stress-test?var-testid=20261111-0807-contracts-aca&from=1794384300000&to=1794384900000) | [08:05 to 08:15](https://grafana.ehds.mabu.red/d/mvhd-edc-dsp/edc-contracts-and-transfers?from=1794384300000&to=1794384900000) |

On **Load and stress test**, the "Load (k6)" row shows the users, requests and
p95, and the "Containers" row the CPU and memory of the connectors. On **EDC
contracts and transfers**, the valid run's negotiations count as requested and
then finalized. In the first invalid run they stay requested until they were
terminated by hand after 12:00; in the second they end terminated within the
run.

## What follows

- The ADR-089 sizes stay. The control plane has the least headroom in CPU, so
  it is the one to watch when the `load` scenario runs with the EDC pages doing
  real work (step 4 of the runs still to do in the
  [load test index](../loadtest/README.md#the-runs-still-to-do)).
- A transfer under load is not measured yet: the scenario transfers only when
  the POST answers with an agreement, and a live negotiation agrees later.
  Polling the negotiation until it is finalized and then transferring is the
  next change to the scenario.
- After any `contracts` run against Azure, check the control plane's log for
  `Name does not resolve` and the negotiation states before calling it done.

## Reproduce

```bash
scripts/azure/run-load-test.sh contracts      # inside Azure, as a Container Apps job
load-tests/run.sh contracts local             # against the compose stack
```

The run's raw summary is in the job's log (`az containerapp job logs show -n
mvhd-load-test -g rg-mvhd-dev --container k6`) while the execution is kept.
