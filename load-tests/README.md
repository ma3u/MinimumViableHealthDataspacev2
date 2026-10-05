# Load tests

k6 scenarios against the hub as its users see it (#519): forged sessions, ten users per
persona, the pages and APIs each persona opens, and a real Keycloak sign-in.
Every metric carries the run's `testid`, every request `X-Load-Test`, which the
proxy logs as `load_test`.

```bash
load-tests/run.sh smoke local      # or load | stress | spike | soak | audited | proxy | signin, local | azure
```

How to run, watch and read a test: the runbook
[`docs/knowledge/runbooks/load-and-stress-test.md`](../docs/knowledge/runbooks/load-and-stress-test.md).
The Grafana dashboard is `observability/grafana/dashboards/load-stress-test.json`.

| File                 | Purpose                                                                            |
| -------------------- | ---------------------------------------------------------------------------------- |
| `run.sh`             | Forges the sessions, picks the `testid`, runs k6 with metrics to Prometheus        |
| `config.js`          | Scenarios, persona mix, SLOs, thresholds; everything else from the environment     |
| `platform.js`        | The persona journeys (`browse`), `nlq`, `proxyDirect`; the summary                 |
| `signin.js`          | NextAuth → Keycloak login form → callback, cookies cleared after each iteration    |
| `forge-sessions.sh`  | `ui/scripts/forge-bruno-session.mjs`, ten users per persona, into `.sessions.json` |
| `neo4j-endurance.js` | Older: ten minutes against the proxy's FHIR and OMOP routes, no session needed     |
| `results/`           | k6 summaries and the Azure metric exports, per `testid` (git-ignored)              |

`PRODUCTION-READINESS.md` and `STACKIT-COST-MODEL.md` are the assessment of
March 2026; the platform has moved since (ADR-041, ADR-044, ADR-045, ADR-053).
