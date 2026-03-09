# Contributing to Minimum Viable Health Dataspace v2

Thank you for your interest in contributing! This project demonstrates an EHDS-compliant health
data space using Eclipse EDC-V, HealthDCAT-AP, FHIR R4, OMOP CDM, and Neo4j.

## Ways to Contribute

- Report bugs via [GitHub Issues](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues)
- Suggest features or improvements
- Submit pull requests for bug fixes or new functionality
- Improve documentation or add examples

## Development Setup

See [README.md](../README.md) for the full Quick Start guide.

## Code Style

- **Markdown** (`.md`): headings, fenced code blocks, ~80-char line wrap, clean tables.
- **Cypher** (`.cypher`): `UPPER_SNAKE_CASE` relationship types, `PascalCase` node labels,
  `camelCase` properties.
- **TypeScript / Next.js**: follow existing file structure under `ui/src/`.
- Run `pre-commit run --all-files` before committing. If Prettier auto-fixes files,
  stage them again and re-commit.

## Pull Request Guidelines

1. Fork the repository and create a feature branch from `main`.
2. Keep changes focused — one feature or fix per PR.
3. Update `docs/` documentation and `neo4j/init-schema.cypher` if the graph schema changes.
4. Ensure `docker compose up -d` and the UI (`npm run dev`) work after your change.
5. Write a clear PR description explaining the motivation and approach.

## Schema Changes

Any change to node labels, relationship types, or properties must be reflected in both:

- `docs/health-dataspace-graph-schema.md`
- `neo4j/init-schema.cypher`

## Security

Do **not** commit real patient data, credentials, or private keys. Default Neo4j credentials
(`neo4j` / `healthdataspace`) are for local development only.

## License

By contributing, you agree that your contributions will be licensed under the
[MIT License](../LICENSE).
