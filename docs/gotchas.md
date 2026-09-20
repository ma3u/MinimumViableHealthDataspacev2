# Gotchas

Non-obvious pitfalls across the stack. Ordered newest first; add a new
entry at the top when you hit something that cost you more than 30 minutes.

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
- `NEO4J_HTTP_URL` on `mvhd-ui` points at the TCP ingress and serves no HTTP.
  Nothing reads it. `scripts/azure/status.sh` and `08-compliance-runner.sh`
  still assume 7474; they are on the follow-up list in #205.
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
