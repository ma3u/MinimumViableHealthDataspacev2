# Integration tests through the APIs

The hub is tested from the outside, the way a partner would use it, by three
suites that call its HTTP APIs: the Bruno collection for the hub's own routes,
and two shell suites for the dataspace protocol and the identity layer. This
page says what each one covers, how to run it, and how current it is, with the
numbers measured on 2026-11-03.

## The three suites

| Suite                 | What it calls                                                        | Run it with                                | Runs in CI                                                                   |
| --------------------- | -------------------------------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------- |
| Bruno collection      | the hub's `/api/*` routes, plus the EDC services and the Neo4j proxy | `./scripts/run-api-tests.sh <environment>` | `bruno-smoke.yml` (PRs), `compliance.yml` (nightly), `demo-smoke.yml` (live) |
| EHDS dataspace checks | the EDC control plane's Management API and DSP 2025-1 endpoints      | `./scripts/run-ehds-dataspace-checks.sh`   | `compliance.yml`, job "DSP 2025-1 TCK"                                       |
| EHDS identity checks  | IdentityHub, IssuerService and the control plane (DCP 1.0)           | `./scripts/run-ehds-identity-checks.sh`    | `compliance.yml`, job "DCP v1.0 Compliance"                                  |

A fourth suite, `scripts/run-ehds-tests.sh`, checks the health domain in the
graph (FHIR, OMOP, HealthDCAT-AP, the access chain of Art. 53) through Neo4j
rather than HTTP; `compliance.yml` runs it as "EHDS Health Domain".

None of the suites is the Eclipse TCK. They are ours, they drive the APIs with
`curl` or Bruno, and the DSP and DCP ones never act as a protocol peer, so they
are liveness and shape checks on our own stack, not proofs of conformance.
Adopting the real [Eclipse DSP and DCP TCKs](https://github.com/eclipse-dataspacetck)
is phase 1 of [#338](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/338).
The [SDLC](../SDLC.md#63-protocol-compliance) has the history of why.

## The Bruno collection

`bruno/MVHDv2/` is organised by the persona that sends a request, one folder
per role of Regulation (EU) 2025/327, plus the two-sided procedures of
Chapter IV, the role boundaries, and the protocol and platform surfaces
([ADR-032](../ADRs/ADR-032-persona-organised-api-collection.md)). A partner
uses it to rehearse against the hub.

| Folder                    | Requests | Runs against                          |
| ------------------------- | -------: | ------------------------------------- |
| 00 Public                 |        8 | Local, Azure-Dev                      |
| 01 Patient                |       22 | Local, Azure-Dev                      |
| 02 Data Holder            |       16 | Local, Azure-Dev                      |
| 03 Data User              |       14 | Local, Azure-Dev                      |
| 04 Access Body            |       13 | Local, Azure-Dev                      |
| 05 Dataspace Operator     |       30 | Local, Azure-Dev                      |
| 06 Trust Centre           |        3 | Local, Azure-Dev                      |
| 07 Journey - Data permit  |       16 | Local, Azure-Dev                      |
| 08 Journey - Data request |        5 | Local, Azure-Dev                      |
| 09 Access control         |       39 | Local, Azure-Dev                      |
| 10 Connecting partner     |       20 | Local only (EDC is internal on Azure) |
| 11 Platform               |        6 | Local only (the proxy is internal)    |
| 12 EUDI wallet            |        3 | Local with `BRUNO_EUDI=1`             |
| 13 Static export          |       32 | Static-mock only                      |
| **Total**                 |  **227** |                                       |

So a Local run sends 192 requests, an Azure-Dev run 166 and a Static-mock run 32.

### Running it

```bash
./scripts/run-api-tests.sh Static-mock   # GitHub Pages fixtures, GET only, no secret needed
./scripts/run-api-tests.sh Local         # the compose stack on :3003
./scripts/run-api-tests.sh Azure-Dev     # the live hub, needs NEXTAUTH_SECRET
./scripts/run-api-tests.sh Local "07 Journey - Data permit"   # one folder
```

The runner forges one NextAuth session per persona (`ui/scripts/forge-bruno-session.mjs`)
from `NEXTAUTH_SECRET`, so no `.bru` file ever holds a cookie. For `Local` it
reads the secret from the UI container when the variable is unset; for
`Azure-Dev` you export it yourself and it is never printed. Reports land in
`test-results/bruno/` (override with `BRUNO_REPORT_DIR`): a summary JSON the
compliance baseline reads, and HTML, JUnit and raw JSON under `raw/`.

### The rules a request follows

From [`.claude/rules/testing.md`](https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/.claude/rules/testing.md)
and [ADR-031](../ADRs/ADR-031-checks-must-assert.md):

- It sits in the folder of the persona that sends it; a request two personas
  send goes in a journey folder and names the acting persona.
- It asserts the status **and** at least one property of the body. A request
  whose only check is `res.status: lt 500` cannot fail and is refused.
- A request whose subject cannot exist on a stack skips loudly, with a test
  named `SKIPPED: <reason>`. It never passes silently.
- No session cookie or other credential in a `.bru` file.

Three scripts enforce this in pre-commit and the PR Gate:

| Check                             | What fails it                                                                                     |
| --------------------------------- | ------------------------------------------------------------------------------------------------- |
| `scripts/check-bruno-coverage.py` | a route with no request, a request whose route is gone, a request with no assert, a credential    |
| `scripts/check-bruno-strength.py` | a 2xx request softer than `docs/bruno-soft-assertion-allowlist.txt` allows (only container types) |
| `scripts/check-workflow-paths.py` | a workflow whose `paths` filter misses a script it runs, so a fix would not re-run it             |

### Are they up to date?

Measured on 2026-11-03 against `main` at `b0586238`:

| Question                                     | Answer                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Does every route have a request?             | **Yes.** `check-bruno-coverage.py`: 109 implemented routes, 109 requested (100 %), 0 allowlisted without a request.                                                                                                                                                                                                                                                                                                                                                                                                      |
| Can every request fail?                      | **Yes.** No request lacks an assert or a test.                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Are the success paths strong?                | **Partly.** `check-bruno-strength.py`: of 127 live 2xx requests, 49 only check a container type; all 49 are on the allowlist, which is the ratchet.                                                                                                                                                                                                                                                                                                                                                                      |
| Does the static demo answer?                 | **Yes.** `run-api-tests.sh Static-mock`: 32 passed, 0 failed, 0 skipped of 32 (99 assertions) against GitHub Pages.                                                                                                                                                                                                                                                                                                                                                                                                      |
| Does the compose stack answer? (CI, `main`)  | **Almost.** `compliance.yml` run [41586005794](https://github.com/ma3u/MinimumViableHealthDataspacev2/actions/runs/41586005794): 191 passed, 1 failed of 192. The failure is `03 Data User/13 A dataset described in German` ("the title is there in English and in German"). The floor is 179/0, so the Compliance Report job fails.                                                                                                                                                                                    |
| Does the live hub answer? (`demo-smoke.yml`) | **Not until the fix of 2026-11-03.** Run [41586005885](https://github.com/ma3u/MinimumViableHealthDataspacev2/actions/runs/41586005885): 30 passed, 136 failed of 166, 163 of them 401. The secret was right; Bruno's cookie jar replaced the session header with the ingress's `acaAffinity` cookie ([gotchas](../gotchas.md), 2026-11-03). With `--disable-cookies` the same run scored 165 of 166; the one left is `03 Data User/07 Federated cohort statistics`, a 503 from the federated query. The floor is 153/0. |
| DSP checks (CI)                              | 25 passed, 0 failed, 8 skipped of 33, at the floor of 25/0.                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| DCP checks (CI)                              | 27 passed, 0 failed, 0 skipped of 27, at the floor of 27/0.                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| EHDS domain checks (CI)                      | 25 passed, 0 failed, 5 skipped of 30, above the floor of 18/0.                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

So the collection is current with the code: every route is covered and the
coverage gate keeps it so. On 2026-11-03 both results on `main` were red; both
are fixed and tracked in
[#839](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/839). The
live run scores 166 of 166 since #853, and its floor is 166/0 since #856.

## The compliance baseline

Every suite's result is compared with a floor in
[`scripts/compliance-baseline.json`](https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/scripts/compliance-baseline.json)
by `scripts/check-compliance-baseline.py`. The job fails when `passed` drops
below the floor or `failed` rises above it, so a suite that does not pass yet
can still guard against getting worse. Raise a floor whenever a suite
improves; lowering one needs a reason in its `note`, and `review_by` makes a
floor expire so nobody can leave it low forever.

```bash
python3 scripts/check-compliance-baseline.py --results test-results
```

## The dataspace and identity checks

Both need the full JAD stack (see [the stack and environment](stack-and-environment.md))
with seed phases 1 to 7 done.

```bash
./scripts/run-ehds-dataspace-checks.sh   # DSP: catalogue, negotiation, transfer, policy (33 checks)
./scripts/run-ehds-identity-checks.sh    # DCP: DIDs, keys, credentials, scopes, trust lists (27 checks)
```

They read `EDC_MANAGEMENT_URL`, `EDC_IDENTITY_URL` and `EDC_ISSUER_URL`, and
default to the compose ports. The identity checks start and stop the
`rogue-issuer` container (compose profile `trust-check`) to show that a
credential from an issuer on no trust list is refused. On Azure the same
suites run from an ACA job (`scripts/azure/08-compliance-runner.sh`,
`compliance.yml` dispatched with `target: azure`), where the checks that need
to look inside a container skip.
