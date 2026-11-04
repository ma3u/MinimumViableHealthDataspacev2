# Contributing to EHDS Integration Hub

Thank you for your interest in contributing! This project demonstrates an EHDS-compliant health
data space using Eclipse EDC-V, HealthDCAT-AP, FHIR R4, OMOP CDM, and Neo4j.

The long form of this page, with every hook and workflow, is the
[SDLC](../docs/SDLC.md), also published as the
[development life cycle](https://ma3u.github.io/MinimumViableHealthDataspacev2/docs/developer/sdlc).

## Ways to Contribute

- Ask a question or propose an idea in
  [GitHub Discussions](https://github.com/ma3u/MinimumViableHealthDataspacev2/discussions)
  when it is not yet a task.
- Report a bug or a well-defined feature via
  [GitHub Issues](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues), using the templates.
- Submit pull requests for bug fixes or new functionality.
- Improve documentation, ADRs or examples.

## Development Setup

See [the stack and the development environment](../docs/developer/stack-and-environment.md)
for prerequisites, the minimal stack (Neo4j + UI) and the full JAD stack. Install the hooks once
per clone:

```bash
pip install pre-commit
pre-commit install --hook-type pre-commit --hook-type pre-push
```

## Code Style

- Follow the rules in [`.claude/rules/`](../.claude/rules/): code style, testing and API
  conventions.
- **Cypher** (`.cypher`): `UPPER_SNAKE_CASE` relationship types, `PascalCase` node labels,
  `camelCase` properties, always `MERGE`.
- **TypeScript / Next.js**: strict mode, the `@/*` alias, `requireAuth()` in every API route.
- If a hook rewrites a file (Prettier, the docs facts), stage it again and commit again.

## Pull Request Guidelines

1. Fork the repository and create a feature branch from `main`.
2. Keep changes focused: one feature or fix per PR, linked to its issue and any ADR.
3. E2E, WCAG and the pentest run once a night, not on your PR
   ([ADR-074](../docs/ADRs/ADR-074-e2e-and-compliance-suites-run-nightly-when-main-changed.md)).
   For a change to UI pages or their API routes, run `npm run test:e2e` in `ui/` against
   `docker compose up -d` before asking for a merge.
4. Use [Conventional Commits](https://www.conventionalcommits.org/) for the PR title
   (`fix(scope): subject`); PRs are squash-merged.
5. A new API route needs a request in `bruno/MVHDv2/`, a fixture in `ui/public/mock/` and an
   entry in `ui/public/openapi.yaml`; the hooks name what is missing.
6. Update `docs/` and `neo4j/init-schema.cypher` if the graph schema changes.
7. The **PR Gate** check must be green and every review thread resolved before merge.

## Fictional Organisations Only

Demo data, docs, tests and screenshots name only the fictional organisations: AlphaKlinik
Berlin, PharmaCo Research AG, MedReg DE, Limburg Medical Centre and Institut de Recherche Santé.
Never a real hospital, company, insurer or authority, and never a real third-party screenshot.

## Schema Changes

Any change to node labels, relationship types, or properties must be reflected in both:

- `docs/health-dataspace-graph-schema.md`
- `neo4j/init-schema.cypher`

## Security

Do **not** commit real patient data, credentials, or private keys; the patients are synthetic.
Default Neo4j credentials (`neo4j` / `healthdataspace`) are for local development only. Report
vulnerabilities as described in [SECURITY.md](../SECURITY.md).

## License

By contributing, you agree that your contributions will be licensed under the
[Apache License 2.0](../LICENSE).
