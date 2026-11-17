# The EHDS integration hub, request by request

What a hospital, a health data access body or a research organisation can send to
this hub, with synthetic data, before connecting anything real. Plain `.bru` files
in git: the [Bruno](https://www.usebruno.com/) desktop app, the VS Code extension
and the `bru` CLI all run them, and a pull request shows exactly what changed.

The collection is organised by **who you are**, not by which resource an endpoint
touches. Open the folder for your role and read it top to bottom: it is that
role's journey through Regulation (EU) 2025/327, in order, with real request
bodies and real expectations. The reasoning is in
[ADR-032](../../docs/ADRs/ADR-032-persona-organised-api-collection.md);
the work is tracked in [#349](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/349).

## The folders

| Folder                      | Who                           | What it covers                                                                                                                                                            |
| --------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `00 Public`                 | anyone; signed in since #404  | Health and sign-in without a session; the Art. 58 information duty, the Art. 57(1)(j) register, the Art. 61(4) results and the Art. 59 activity report with one (ADR-044) |
| `01 Patient`                | a natural person              | Art. 3 to 10: my record, a FHIR copy of it, insights, a consent per programme and its withdrawal                                                                          |
| `02 Data Holder`            | a hospital                    | Art. 51, 60, 77: the catalogue I publish, the assets and policies behind it, my exchanges                                                                                 |
| `03 Data User`              | a research organisation       | Art. 53: discovery, what I am permitted today, cohort analytics, natural-language query                                                                                   |
| `04 Access Body`            | an HDAB                       | Art. 55 to 63, 71 to 73: my inbox, findings, the audit trail and its retention rule                                                                                       |
| `05 Dataspace Operator`     | whoever runs it               | tenants, components, the participant registry, credentials, the knowledge graph                                                                                           |
| `06 Trust Centre`           | the SPE operator              | Art. 73: trust centres, open SPE sessions, the demo DSP catalogue                                                                                                         |
| `07 Journey - Data permit`  | data user **and** access body | Art. 67 to 73 end to end: application, clock, permit, results, finding, closure, revocation                                                                               |
| `08 Journey - Data request` | data user **and** access body | Art. 69: a question answered in anonymised statistics                                                                                                                     |
| `09 Access control`         | all five roles                | one request per line of the role matrix, each expecting its refusal                                                                                                       |
| `10 Connecting partner`     | your own EDC connector        | DSP 2025-1 and DCP v1.0 against the Management API, IdentityHub and IssuerService                                                                                         |
| `11 Platform`               | the platform team             | the Neo4j proxy on port 9090                                                                                                                                              |
| `12 EUDI wallet`            | optional                      | wallet sign-in, needs `docker-compose.eudi.yml`                                                                                                                           |
| `13 Static export`          | the GitHub Pages site         | the fixtures under `/mock/` that stand in for the API there, GET only                                                                                                     |

Two folders hold procedures rather than personas. A data permit is a two-sided
procedure: the data user applies, the access body decides, the data user reports,
the access body supervises. Splitting those requests between two folders would
lose the order and the ids that pass between them, so they live together and each
request names the persona sending it.

## Run it

```bash
# the compose stack on localhost:3003
./scripts/run-api-tests.sh Local

# the GitHub Pages export: folder 13, the GET requests that have a fixture, no auth
./scripts/run-api-tests.sh Static-mock

# the live demo, needs the deployment's NEXTAUTH_SECRET
NEXTAUTH_SECRET=... ./scripts/run-api-tests.sh Azure-Dev

# one folder, or one request
./scripts/run-api-tests.sh Local "07 Journey - Data permit"
./scripts/run-api-tests.sh Local "01 Patient/06 I consent to one programme.bru"

# include the EUDI wallet folder
BRUNO_EUDI=1 ./scripts/run-api-tests.sh Local
```

The runner forges one NextAuth session per persona, hands them to `bru` as
environment variables, runs the folders the chosen environment can reach, and
writes three reports into `test-results/bruno/`: an HTML page, a JUnit file and a
summary in the shape the compliance baseline reads. Its exit status is `bru`'s: a
failed assertion fails the run.

Nothing signed is written to a file. On `Local` the signing secret is read from
the running UI container; for `Azure-Dev` it comes from the environment, and
`ui/scripts/forge-bruno-session.mjs` exits rather than fall back to a default.

## The environments

|          | `Local`                                                                | `Azure-Dev`                        | `Static-mock`                   |
| -------- | ---------------------------------------------------------------------- | ---------------------------------- | ------------------------------- |
| base     | `http://localhost:3003`                                                | `https://ehds.mabu.red`            | the GitHub Pages export         |
| cookie   | `next-auth.session-token`                                              | `__Secure-next-auth.session-token` | none needed                     |
| sessions | forged from the UI container's secret                                  | forged from `NEXTAUTH_SECRET`      | none                            |
| folders  | `00` to `11`, and `12` with `BRUNO_EUDI=1`                             | `00` to `09`                       | folder `13` (`static-mock.txt`) |
| needs    | `docker compose -f docker-compose.yml -f docker-compose.jad.yml up -d` | nothing local                      | nothing                         |

`Azure-Dev` stops at folder 09 because the control plane, IdentityHub,
IssuerService and the Neo4j proxy run on `.internal.` addresses in Azure
Container Apps and are not reachable from outside the environment. The runner
skips those folders for you rather than letting fifty requests time out.

The demo deployment scales down outside Mon to Fri, 07:00 to 20:00 Europe/Berlin
(ADR-016, ADR-023); outside that window expect cold-start 502s.

## In the Bruno app

```bash
open -a Bruno bruno/MVHDv2     # macOS
xdg-open bruno/MVHDv2          # Linux
```

Pick an environment in the top-right dropdown. For anything that needs a session,
forge one and paste it into that environment's `sessionToken`, or the persona
variable a request uses:

```bash
cd ui
NEXTAUTH_SECRET="$(docker exec health-dataspace-ui printenv NEXTAUTH_SECRET)" \
  node scripts/forge-bruno-session.mjs regulator
```

| Persona argument | Role             | Variable the collection reads |
| ---------------- | ---------------- | ----------------------------- |
| `patient1`       | `PATIENT`        | `sessionTokenPatient`         |
| `clinicuser`     | `DATA_HOLDER`    | `sessionTokenClinic`          |
| `researcher`     | `DATA_USER`      | `sessionTokenResearcher`      |
| `regulator`      | `HDAB_AUTHORITY` | `sessionTokenRegulator`       |
| `edcadmin`       | `EDC_ADMIN`      | `sessionToken`                |

Which persona a group of operations needs is the table above both API explorers
(`/docs/developer/api`, `/docs/developer/reference`) and at the top of
`ui/public/openapi.yaml`: start as `edcadmin`; the access body's decisions need
`regulator`, a patient's phone and wallet `patient1`.

Tokens last eight hours. Do not save them into the `.bru` file: the pre-commit
check refuses a `.bru` carrying a session cookie, because gitleaks does not scan
that extension and one sat in this directory for four months.

## What a green run means, and what a red one does

Every request asserts the status it expects and at least one property of the
body. A 401, a 403 or a 404 is a failure unless the request exists to prove that
boundary. The journeys carry ids between requests, so `07` and `08` genuinely
exercise the procedure rather than nine independent calls.

Measured on the compose stack on 2026-11-11, EDC 1.0.0-RC5, against the code of
that day: **219 passed, 0 failed, 0 skipped** over 219 requests (folders `00` to
`11`). With `BRUNO_DSP_LIVE=1`, `03 Data User` runs catalogue, negotiation,
transfer, the data and the SPE import against the connector: 26 of 26.

The same day, against a UI container built two days earlier, the run scored
210 passed and 9 failed. Seven of the nine were routes that container did not
have yet (see Troubleshooting), one was request `03 Data User/21` asking for a
transfer with an empty id, since fixed, and one was a single 401 from
IdentityHub that did not repeat. A red run on a local stack is first a question
about the age of the containers.

The floor lives in `scripts/compliance-baseline.json` and the compliance workflow
fails when a run drops below it.

## Adding a request

1. Put it in the folder of the persona that sends it. If two personas send it,
   it belongs in a journey folder, and the request name says who is acting.
2. Name it `NN Something a person would say`, taking the next number.
3. Use `{{baseUrl}}` and the persona's cookie variable; the collection header
   already carries `sessionToken`, so only a different persona needs a `Cookie`
   header of its own.
4. Give it a real `assert`: the status, plus at least one property of the body.
   A request with neither an assert nor a test fails the pre-commit check.
5. If the GitHub Pages export can answer it, add its path to `static-mock.txt`.

`scripts/check-bruno-coverage.py` compares the collection with
`ui/src/app/api/**/route.ts` and fails on a new route with no request, a request
whose route is gone, a request that cannot fail, or a credential in a `.bru`
file. It runs in pre-commit and in the PR Gate.

## Troubleshooting

**Every request answers 401.** The session secret does not match the server's.
On `Local`, the runner reads it from the container; if you are driving `bru` by
hand, forge with the same secret. On `Azure-Dev`, `NEXTAUTH_SECRET` must be the
value the deployment runs with.

**Folder 10 fails from request 10 onwards.** The EDC layer is empty. Run
`./scripts/seed-identity-layer.sh`; it is idempotent.

**A request answers 404 with an HTML page, or 405.** The UI container is older
than the route: compose builds `graph-explorer` once and keeps the image. On
2026-11-11 a container built two days earlier answered 404 for
`/api/patient/app/programmes` and 405 for `DELETE /api/participants/{id}`, seven
requests in all. Rebuild it in the compose project the stack runs as, and leave
the other services alone:

```bash
docker compose -p "$(docker inspect health-dataspace-ui --format '{{index .Config.Labels "com.docker.compose.project"}}')" \
  -f docker-compose.yml -f docker-compose.jad.yml up -d --build --no-deps graph-explorer
```

The project name matters. Compose names a project after the folder it runs in,
so the plain command, run from another checkout than the one the stack was
started in (a git worktree, say), starts a second project: it builds an image,
creates a network and two volumes, and stops at the first container name that is
taken. That happened on 2026-11-11, with the command this section gave until
then. The same holds for folder 11 and the Neo4j proxy (`neo4j-proxy`, whose
container is `health-dataspace-neo4j-proxy`).

**A journey request fails on a variable.** The journeys pass ids between
requests, so they must run in one `bru run`. Running request 05 of folder 07 on
its own has no `applicationId`.

## See also

- [ADR-032](../../docs/ADRs/ADR-032-persona-organised-api-collection.md): why the collection is shaped this way
- [ADR-031](../../docs/ADRs/ADR-031-checks-must-assert.md): why every request must be able to fail
- `.claude/rules/api-conventions.md`: the role matrix folder 09 asserts
- `ui/public/openapi.yaml`: the machine-readable spec, all operations and the roles each one needs, kept honest by `scripts/check-api-spec-drift.py`
- `scripts/run-api-tests.sh`: the runner
