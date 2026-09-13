# clients/ios

The iPhone health-document scanner ([#186](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/186)).
Lives in this repository rather than its own, decided 2026-09-13.

**Nothing is built here yet.** This file records the layout and the two rules that
the decision creates, so the first commit of Swift lands in the right shape.

## Why in-repo

The app and [`services/epa-ingest`](../../services/epa-ingest) do the same job on
different devices: paper → structured, provenance-stamped FHIR. They share the
analyte dictionary, the parsing rules, the provenance model and the export
format. Two repositories would mean two copies of all four, and the one failure
mode worth designing against here is **two divergent analyte dictionaries** —
where an iPhone codes Lp(a) one way and the CLI another, and nobody notices until
a value reaches a doctor.

The cost is a polyglot repository: TypeScript, Swift, Python, Cypher, Bash. That
is already true (`services/catalog-crawler` is Python), so this adds a language
rather than a category.

## The shared dictionary is generated, never copied

`Sources/Shared/Analytes.generated.swift` is produced from
`services/epa-ingest/src/analytes.ts`:

```bash
cd services/epa-ingest && npm run generate:swift
```

Do not hand-edit it. Add an analyte to `analytes.ts`, regenerate, commit both.
CI fails if the generated file is out of date with its source — a check that
exists because a stale copy is exactly the silent divergence the monorepo was
chosen to prevent.

## Layout

```
clients/ios/
  README.md                      this file
  Sources/
    Shared/
      Analytes.generated.swift   GENERATED from analytes.ts — do not edit
    …                            app sources (not yet written)
```

## Two rules that are not negotiable here

1. **No health data in this directory, ever.** No lab reports, no scans, no
   exported HealthKit archives, no screenshots containing real values — not even
   temporarily, not even gitignored. Test fixtures are synthetic, the way
   `services/epa-ingest/__tests__/fixtures/` already is.
2. **No real organisation in demo content.** `CLAUDE.md` forbids it outside the
   `NEXT_PUBLIC_DEMO_TK` flag, and names Charité explicitly. The study this app
   is built for is real; the demo centre is fictional.

## CI

Swift needs a macOS runner. GitHub-hosted macOS runners are free for public
repositories but have lower concurrency than Linux, so the iOS job is
path-filtered to `clients/ios/**` and must not gate the web or service suites.
Conversely, `ui/**` and `services/**` workflows exclude `clients/ios/**` so an
app change does not rebuild the dataspace.
