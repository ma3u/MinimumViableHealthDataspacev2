# MVHDv2 — Bruno API Collection

A complete REST collection for the European Health Data Space integration
hub. Every endpoint in `ui/src/app/api/*` and the Neo4j proxy in
`services/neo4j-proxy/*` is exercised here.

This README covers:

1. [Why Bruno](#why-bruno)
2. [Prerequisites](#prerequisites)
3. [Open the collection](#open-the-collection)
4. [Pick an environment](#pick-an-environment)
5. [Authenticate against Azure-Dev](#authenticate-against-azure-dev)
6. [Send your first request](#send-your-first-request)
7. [Tests, asserts, and chaining](#tests-asserts-and-chaining)
8. [Automate with the Bruno CLI](#automate-with-the-bruno-cli)
9. [GitHub Actions integration](#github-actions-integration)
10. [Coverage](#coverage)
11. [Adding a new endpoint](#adding-a-new-endpoint)
12. [Troubleshooting](#troubleshooting)

---

## Why Bruno

Bruno collections are plain `.bru` files that live in git alongside the
code. Unlike Postman, there is no cloud sync, no proprietary export, and
the collection diffs cleanly in PRs. The same files work in the Bruno
desktop app, the VS Code extension, and the `bru` CLI for CI runs.

The `auth/[...nextauth]` route is intentionally not in the collection: it
is a NextAuth internal handler, not a REST endpoint.

---

## Prerequisites

| Tool                    | Version         | Why                                     |
| ----------------------- | --------------- | --------------------------------------- |
| Bruno (desktop)         | v3.3.0 or later | Interactive request authoring           |
| Node.js                 | v20 or later    | Forge script and Bruno CLI              |
| `@usebruno/cli` (`bru`) | latest          | Run the collection in CI                |
| Project repo            | this checkout   | The forge script lives in `ui/scripts/` |

Install Bruno desktop from [usebruno.com](https://www.usebruno.com/) or
`brew install --cask bruno` on macOS. Install the CLI with:

```bash
npm install -g @usebruno/cli
```

---

## Open the collection

From the repo root:

```bash
open -a Bruno bruno/MVHDv2     # macOS
xdg-open bruno/MVHDv2          # Linux
explorer.exe bruno\MVHDv2      # Windows
```

If Bruno opens to a previous workspace instead, click **Open Collection**
in the Quick Actions panel and pick `bruno/MVHDv2/`.

---

## Pick an environment

Top-right dropdown of any open request:

| Environment | Base URL                                                | Auth required | Use when                               |
| ----------- | ------------------------------------------------------- | ------------- | -------------------------------------- |
| Local       | `http://localhost:3000`                                 | Yes (browser) | Full local Docker stack is up          |
| Static-mock | `https://ma3u.github.io/MinimumViableHealthDataspacev2` | No            | Quick UI / shape testing, no live data |
| Azure-Dev   | `https://ehds.mabu.red`                                 | Yes (cookie)  | Live shared dev environment            |

The cleanest path for first-time users is **Static-mock**: every GET
endpoint serves a static JSON fixture from `ui/public/mock/*.json` and
returns 200 without authentication.

> **Note:** Azure-Dev is on an ACA off-hours scale-down schedule
> (ADR-016 / ADR-023), reachable Mon–Fri 07:00–20:00 Europe/Berlin.
> Outside that window, expect 502s from cold-starting services.

---

## Authenticate against Azure-Dev

The Azure deployment gates every `/api/*` route behind a NextAuth session
cookie. Bruno does not share a cookie jar with your browser, so the usual
"sign in via the UI first" pattern does not carry over. Two paths:

### Path A — Forge a session cookie locally (recommended)

```bash
cd ui
node scripts/forge-bruno-session.mjs regulator
```

The script prints something like:

```
COOKIE_NAME=__Secure-next-auth.session-token
COOKIE_VALUE=eyJhbGciOiJkaXIiLCJlbmMiOiJBMjU2R0NNIn0..…
```

In Bruno:

1. Open **Environments → Azure-Dev** (top-right environment dropdown,
   click the small edit icon).
2. Find or add a variable named `sessionToken`.
3. Paste the long `COOKIE_VALUE` string into its Value field. Save.
4. Re-send any request. The collection-level Cookie header
   (`Cookie: __Secure-next-auth.session-token={{sessionToken}}`)
   picks it up automatically.

The token is valid for 8 hours. Re-run the script when it expires.

Available personas (each maps to a Keycloak role set):

| Persona      | Role                                     |
| ------------ | ---------------------------------------- |
| `edcadmin`   | `EDC_ADMIN` (full admin)                 |
| `regulator`  | `HDAB_AUTHORITY` (Health Data Authority) |
| `clinicuser` | `DATA_HOLDER` (German clinic)            |
| `lmcuser`    | `DATA_HOLDER` (Dutch clinic)             |
| `researcher` | `DATA_USER` (pharma researcher)          |
| `patient1`   | `PATIENT`                                |

### Path B — Sign in through the browser, copy the cookie

1. Sign in at https://ehds.mabu.red/auth/signin with one of the demo
   personas (`username = password`, e.g. `regulator` / `regulator`).
2. Open browser DevTools → Application → Cookies → `https://ehds.mabu.red`.
3. Copy the value of `__Secure-next-auth.session-token`.
4. Paste into the Bruno `sessionToken` variable as in Path A.

This works without running anything, but requires manual repetition every
8 hours, and you cannot easily script it.

---

## Send your first request

Pick **GET EEHRxF** in the sidebar. The URL is `{{baseUrl}}/api/eehrxf`.
Hit **Send**.

- On `Static-mock`: immediate 200 with the FHIR profile catalogue.
- On `Azure-Dev` with `sessionToken` set: live data (currently 6
  categories, 14 profiles, ~93k resources).
- On `Azure-Dev` without `sessionToken`: 401 plus a Bruno test failure
  with the hint "run the forge script".

---

## Tests, asserts, and chaining

Every request inherits the collection-level guards in `collection.bru`:

```js
test("response is not a server error", function () {
  expect(res.getStatus()).to.be.below(500);
});
```

Plus a 401-against-Azure-Dev hint that surfaces the forge command right
next to the failing request.

Add per-request asserts in the **Asserts** tab, e.g.:

```
res.status: eq 200
res.body.summary.totalCategories: gte 6
```

Chain requests by writing values to environment variables in the
**Tests** tab:

```js
test("save first patient id", function () {
  const data = res.getBody();
  bru.setVar("patientId", data.patients[0].id);
});
```

Subsequent requests reference `{{patientId}}` in the URL, headers, or
body.

---

## Automate with the Bruno CLI

The Bruno CLI (`bru`) runs a collection without the desktop UI. Useful
for smoke tests and CI.

### One-shot run against Static-mock (no auth needed)

```bash
cd bruno/MVHDv2
bru run --env Static-mock --reporter-html report.html
open report.html
```

### One-shot run against Azure-Dev (auth via env var)

```bash
# 1. Forge a token
cd ui
TOKEN=$(node scripts/forge-bruno-session.mjs regulator | awk -F= '/^COOKIE_VALUE/{print $2}')

# 2. Run the collection, mapping the token onto the sessionToken variable
cd ../bruno/MVHDv2
bru run --env Azure-Dev --env-var sessionToken="$TOKEN" --reporter-html report.html
```

`bru run` flags worth knowing:

| Flag                 | Purpose                                             |
| -------------------- | --------------------------------------------------- |
| `--env <name>`       | Pick environment (Local / Static-mock / Azure-Dev)  |
| `--env-var k=v`      | Override or set a variable for this run             |
| `-r / --recursive`   | Include sub-folders                                 |
| `--reporter-html f`  | Write HTML report                                   |
| `--reporter-junit f` | Write JUnit XML for CI test reporters               |
| `--bail`             | Stop on first failing request                       |
| `--insecure`         | Disable TLS verify (only for self-signed local dev) |

Exit code is non-zero if any request fails its asserts or returns 5xx.

### One-liner end-to-end smoke

```bash
( cd ui && TOKEN=$(node scripts/forge-bruno-session.mjs regulator \
    | awk -F= '/^COOKIE_VALUE/{print $2}') ) && \
( cd bruno/MVHDv2 && bru run --env Azure-Dev \
    --env-var sessionToken="$TOKEN" --bail )
```

---

## GitHub Actions integration

A workflow at `.github/workflows/bruno-smoke.yml` runs the collection on
push and on demand. The relevant pieces:

```yaml
- name: Forge session token
  env:
    NEXTAUTH_SECRET: ${{ secrets.NEXTAUTH_SECRET }}
  run: |
    cd ui
    TOKEN=$(node scripts/forge-bruno-session.mjs regulator \
            | awk -F= '/^COOKIE_VALUE/{print $2}')
    echo "::add-mask::$TOKEN"
    echo "BRUNO_TOKEN=$TOKEN" >> "$GITHUB_ENV"

- name: Run Bruno collection
  run: |
    npm install -g @usebruno/cli
    cd bruno/MVHDv2
    bru run --env Azure-Dev \
            --env-var sessionToken="$BRUNO_TOKEN" \
            --reporter-html ../../bruno-report.html \
            --reporter-junit ../../bruno-report.xml

- uses: actions/upload-artifact@v4
  if: always()
  with:
    name: bruno-report
    path: bruno-report.*
```

### Required repository secret

| Secret            | Value                                      |
| ----------------- | ------------------------------------------ |
| `NEXTAUTH_SECRET` | Same value as on the live Azure deployment |

The `add-mask` line in the workflow ensures the token never appears in
the run logs.

### Setting the secret with the GitHub CLI

The whole secret-and-trigger flow can be done from the terminal without
opening the GitHub UI. The `gh` CLI handles secret management and
workflow dispatch.

```bash
# Verify gh is authenticated against the right account
gh auth status

# Set (or rotate) the NEXTAUTH_SECRET repository secret
gh secret set NEXTAUTH_SECRET \
    --repo ma3u/MinimumViableHealthDataspacev2 \
    --body 'mvhd-azure-secret-change-me'

# For longer / multiline secrets, read from a file or stdin
gh secret set NEXTAUTH_SECRET \
    --repo ma3u/MinimumViableHealthDataspacev2 < secret.txt

# List repository secrets (names + last-updated only — values aren't readable)
gh secret list --repo ma3u/MinimumViableHealthDataspacev2

# Delete a secret
gh secret delete NEXTAUTH_SECRET --repo ma3u/MinimumViableHealthDataspacev2
```

The value to set must match the `NEXTAUTH_SECRET` env var on the live
Azure Container App. Read it with:

```bash
az containerapp show -n mvhd-ui -g rg-mvhd-dev \
    --query "properties.template.containers[0].env[?name=='NEXTAUTH_SECRET'].value" \
    -o tsv
```

If the live secret is rotated, rotate the GitHub secret in the same
window or the workflow's forge step will produce tokens that the live
API rejects.

### Triggering the workflow with the GitHub CLI

```bash
# Default run (Static-mock, no auth needed)
gh workflow run bruno-smoke.yml --repo ma3u/MinimumViableHealthDataspacev2

# Pick environment and persona explicitly
gh workflow run bruno-smoke.yml \
    --repo ma3u/MinimumViableHealthDataspacev2 \
    -f environment=Azure-Dev \
    -f persona=edcadmin

# RBAC-focused smoke (regulator persona — admin write routes return 403)
gh workflow run bruno-smoke.yml \
    --repo ma3u/MinimumViableHealthDataspacev2 \
    -f environment=Azure-Dev \
    -f persona=regulator

# List recent runs of this workflow
gh run list --workflow=bruno-smoke.yml \
    --repo ma3u/MinimumViableHealthDataspacev2 --limit 10

# Watch the latest run interactively
gh run watch --repo ma3u/MinimumViableHealthDataspacev2

# View one run's step results
RUN_ID=$(gh run list --workflow=bruno-smoke.yml \
    --repo ma3u/MinimumViableHealthDataspacev2 \
    --limit 1 --json databaseId --jq '.[0].databaseId')
gh run view "$RUN_ID" --repo ma3u/MinimumViableHealthDataspacev2

# Download the report artefact (HTML + JUnit) of the most recent run
gh run download "$RUN_ID" \
    --repo ma3u/MinimumViableHealthDataspacev2 \
    --name "bruno-report-Azure-Dev"
open bruno-report.html
```

Persona options accepted by the `-f persona=` input: `edcadmin`,
`regulator`, `clinicuser`, `lmcuser`, `researcher`, `patient1`. See the
table under [Authenticate against Azure-Dev](#authenticate-against-azure-dev)
for the role each persona maps to.

---

## Coverage

| Folder       | Routes | Notes                                                  |
| ------------ | ------ | ------------------------------------------------------ |
| Health       | 1      | Liveness probe                                         |
| Catalog      | 3      | HealthDCAT-AP datasets — list / create / delete        |
| Graph        | 4      | 5-layer Neo4j graph queries                            |
| Patient      | 6      | FHIR profile, insights, research consent (GDPR Art. 7) |
| Compliance   | 2      | EHDS / GDPR / DSP status + TCK results                 |
| Credentials  | 4      | DCP v1.0 W3C VCs                                       |
| Negotiations | 3      | DSP 2025-1 contract negotiations                       |
| Transfers    | 3      | DCore data plane transfers                             |
| Assets       | 2      | EDC asset registration                                 |
| Participants | 5      | DID:web participant CRUD                               |
| Tasks        | 1      | Aggregated contract / transfer pipeline tasks          |
| Trust Center | 1      | DID resolution + attestation chain                     |
| Federated    | 1      | Cross-site cohort query (k-anonymity)                  |
| NLQ          | 2      | Text2Cypher templates + run                            |
| EEHRxF       | 1      | EEHRxF profile catalog (Layer 2b)                      |
| Analytics    | 1      | OMOP-derived dashboard                                 |
| ODRL Scope   | 1      | Effective ODRL scope for current participant           |
| Admin        | 8      | Tenants, audit, components, topology, policies (CRUD)  |
| **Total**    | **49** | + collection.bru, bruno.json, 3 environments           |

---

## Adding a new endpoint

1. Drop a new `.bru` file under the appropriate folder.
2. Set `seq:` to the next number in that folder.
3. Use `{{baseUrl}}` and any of the env vars (`{{participantId}}`,
   `{{patientId}}`, `{{studyId}}`, `{{proxyUrl}}`).
4. For request bodies, use `body:json { ... }`; the block contents are
   valid JSON.
5. Commit the file. PR diffs are readable.

The collection-level Cookie header is already attached, so admin /
gated routes work without per-request setup once `sessionToken` is in
the active environment.

---

## Troubleshooting

### `401 Unauthorized` against Azure-Dev

The `sessionToken` variable is empty or expired. Re-run the forge script
and paste the new value into Environments → Azure-Dev → `sessionToken`.

### `403 Forbidden` against `/api/admin/*` as a non-admin persona

Working as intended. Forge a token with the `edcadmin` persona instead,
or use `regulator` for the read-only paths (`/api/admin/policies`,
`/api/admin/audit`).

### `502 Bad Gateway` on heavy queries

The Azure proxy has a 30 s timeout. Some federated queries (`/api/nlq`,
`/api/graph` with no filter) take longer on a cold Neo4j. Re-send after
warming up with a small request first. Outside Mon–Fri 07:00–20:00
Europe/Berlin, scaled-down services produce the same symptom.

### `Cookie: __Secure-next-auth.session-token={{sessionToken}}` literally sent

Bruno failed to substitute the variable. Check that the environment is
actually selected in the top-right dropdown, and that the variable name
matches exactly (`sessionToken`, no spaces).

### Forge script crashes with `Cannot find package 'next-auth'`

You ran the script from the wrong directory. The `ui/scripts/` location
is required so Node ESM can resolve the `next-auth` package from
`ui/node_modules/`.

```bash
cd ui                                    # from the repo root
node scripts/forge-bruno-session.mjs regulator
```

### Bruno CLI complains about `--env-var` not setting the value

Bruno CLI v1.x had a bug where `--env-var` with `=` in the value
required quoting. Use single quotes around the whole arg:

```bash
bru run --env Azure-Dev --env-var 'sessionToken=eyJhbGc…'
```

---

## See also

- `ui/src/app/api/**/route.ts`: source of truth for request and response
  shapes.
- `ui/public/mock/*.json`: fixture responses used by the static export.
- `ui/scripts/forge-bruno-session.mjs`: NextAuth session forge script.
- `.claude/rules/api-conventions.md`: protocol versions, role matrix,
  data models.
- `docs/ADRs/ADR-008-testing-strategy.md`: how Bruno fits alongside
  Vitest and Playwright.
