# ADR-092: The deploy hold reads signals the deploy job can read

Date: 2026-11-12

**Status:** Proposed
**Relates to:** [ADR-053](ADR-053-everything-stops-off-hours.md), [ADR-061](ADR-061-the-ui-scales-out-on-whole-cores.md)
**Tracks:** [#571](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/571)

## Context

A merge to `main` redeploys `mvhd-ui` and `mvhd-neo4j-proxy`, and a deploy in
the middle of a k6 run against the live hub invalidates the run. #571 (PR
[#648](https://github.com/ma3u/MinimumViableHealthDataspacev2/pull/648)) added a
step to [`deploy-azure.yml`](../../.github/workflows/deploy-azure.yml) that
waited while the repository variable `LOAD_TEST_RUNNING` was set; both run
scripts set it with `gh variable set` from the laptop and deleted it at the end.

The hold never held. The step read the variable through the REST API with the
workflow token, which has no permission for repository variables at all
(`actions: read` is a different scope), so every read answered
`HTTP 403 Resource not accessible by integration`, and the step treated every
error other than "Not Found" as "could not read; deploying". Every deploy from
2026-11-11 05:35 to 2026-11-12 10:12 UTC logged that warning, and on
2026-11-12 the #1090 deploy replaced the UI and the proxy in the middle of run
`20261112-1012-contracts-aca` (see `docs/gotchas.md`, 2026-11-12).

Two more faults sat behind the first. The job's `timeout-minutes: 30` would
have cancelled any wait longer than about 20 minutes, and the Azure access
token from the job's OIDC login lasts about an hour, so a deploy after a long
wait would have failed to authenticate.

Most runs against the hub are the Container Apps job `mvhd-load-test`
(`scripts/azure/run-load-test.sh`); `load-tests/run.sh azure` runs k6 on the
laptop.

## Decision

1. **The deploy job reads two signals, each with a credential it already
   has.** An execution of `mvhd-load-test` in `Running` or `Processing`, read
   with the job's Azure OIDC login. A deployment to the GitHub environment
   `load-test` whose latest status is `in_progress`, `queued` or `pending`,
   read with the workflow token under `deployments: read`.
2. **A run in Azure needs no setter.** The execution is the signal and ends
   with the run; `run-load-test.sh` sets and clears nothing, so `WAIT=0` no
   longer leaves a hold behind.
3. **A laptop run opens and closes a deployment.**
   `scripts/azure/hold-deploys.sh start <testid>` creates it (environment
   `load-test`, ref `main`, no required contexts) with status `in_progress`;
   `end <id>` sets it `inactive`. `load-tests/run.sh azure` calls both, the
   second on exit. The repository variable `LOAD_TEST_RUNNING` is retired.
4. **An unreadable signal stops the deploy, visibly.** Three failed reads in
   a row fail the step with an error that names the override: a dispatch
   from `main` with `ignore_load_test_hold=true`. The next push tries again,
   so a broken read blocks only until someone looks.
5. **The bounds stay.** The wait lasts up to three hours, then deploys with a
   warning; a signal older than four hours is a run that did not clean up
   and is ignored with a warning. The job's timeout is 220 minutes, and the
   script renews the Azure login every 30 minutes of waiting and before it
   lets the deploy go.
6. **`hold_check_only=true`** reads the hold once and builds nothing, so the
   read can be proven without a deploy. Off `main` it skips the Azure signal,
   since the federated credential trusts `main` only.

## Consequences

- A merge during a run against the hub waits for the run, for both ways of
  running it, without a stored token.
- The repository's Environments list shows `load-test`, active while a laptop
  run is on; `scripts/azure/hold-deploys.sh check` shows what a deploy would
  see from either side.
- A laptop run that is killed hard (no exit trap) holds deploys until its
  marker is four hours old, as the variable did; `end <id>` releases it.
- A broken read (a permission removed, the Azure login failing) is now a red
  deploy rather than a silent one. That is the point, and the override is one
  command.
- A run against the hub started some other way (k6 by hand, another tool) is
  not seen, as before.

## Alternatives considered

- **A fine-grained token with Variables: read, as a secret.** Keeps the
  variable, but adds a long-lived credential that the maintainer must create
  and rotate, and an expired token is the same silent failure in a new place.
- **`${{ vars.LOAD_TEST_RUNNING }}`.** Readable without a token, but fixed
  when the job starts: it can tell that a run was on, never that it ended.
- **Only the Container Apps execution.** Self-clearing and needs no setter,
  but does not see k6 on the laptop.
- **An Azure tag set from the laptop.** It needs an Azure role beyond
  Container Apps Contributor, and the laptop's Azure session lasts an hour
  (conditional access), shorter than a soak, so the tag could not be cleared
  at the end.
