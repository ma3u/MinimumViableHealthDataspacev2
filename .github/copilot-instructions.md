# GitHub Copilot instructions

**Read [`AGENTS.md`](../AGENTS.md) first.** It holds the project purpose, the exact
build/test/lint commands, the directory map, the coding conventions, the top
gotchas, and the knowledge/planning links. This file adds only what is specific to
how Copilot should behave in this repository — it deliberately does not repeat
AGENTS.md.

## What to load, and when

Depth is split across four on-demand surfaces so this always-on file stays cheap:

| Surface                  | Location                                 | Loads when                                                    |
| ------------------------ | ---------------------------------------- | ------------------------------------------------------------- |
| Path-scoped instructions | `.github/instructions/*.instructions.md` | Automatically, per the `applyTo` glob                         |
| Skills                   | `.github/skills/<domain>/SKILL.md`       | Progressive disclosure — matched on the skill's `description` |
| Custom agents            | `.github/agents/*.agent.md`              | You pick one, or the description matches the prompt           |
| Prompt files             | `.github/prompts/*.prompt.md`            | The user runs the prompt                                      |

Do not restate a rule that a path-scoped instruction already carries — when editing
`ui/src/app/api/**`, the API conventions arrive on their own.

The Claude Code stack under `.claude/` mirrors this one (`rules/` ↔ `instructions/`,
`skills/` ↔ `skills/`, `agents/` ↔ `agents/`, `commands/` ↔ `prompts/`). If you
change a convention in one, change its twin — a drifted pair is worse than either.

## Agent handoffs

Plan → Implement → Review. Reach for the specialist rather than doing everything in
one pass:

- `architect` — structure and trade-offs; writes ADRs and diagrams, never ships code.
- `implementer` — makes the change per the ADRs and instructions.
- `reviewer` — reviews the diff against conventions and the relevant ADR.
- `tester` — works only in the repo's real frameworks (Vitest, Playwright).
- `compliance` — EHDS/DSP/GDPR constraints actually present in the repo.

A design question that surfaces mid-implementation goes back to `architect`; it is
not settled inline.

## Grounding rules

- Ground every non-trivial claim in a file in this repository, and cite it.
- Never invent architecture, conventions, commands, frameworks, or endpoints. If
  something is unknown, write `UNKNOWN — inferred from <path>` or say no source
  exists.
- Check the ADRs (`docs/ADRs/`), the planning index, and `gh issue list` before a
  significant change. Never edit an accepted ADR — supersede it.
- A schema change in a markdown doc must be mirrored in `neo4j/init-schema.cypher`.
- Every new API route needs a matching fixture in `ui/public/mock/` (gotcha #3).

## Safety expectations

The `safety-guard` hook (`.github/hooks/safety-guard/`) encodes these; behave the
same way even where a hook does not run:

- Safe by default: build, test, lint, read-only git, `grep`/`rg`/`find`.
- **Ask before destructive actions**: `rm -rf`, `git reset --hard`, `git clean`,
  `git push --force`, `kubectl delete`, `helm uninstall`, `terraform destroy`,
  `az group delete`, `az containerapp delete`, `./scripts/azure/teardown.sh`.
- **Ask before reading likely secrets**: `.env`, `.env.*`, `*.pem`, `*.key`,
  `id_rsa`, anything matching `*secret*`.
- Never commit patient data or credentials. The default Neo4j credentials
  (`neo4j` / `healthdataspace`) are local-dev only.
- Demo participants must stay fictional — see the trademark table in
  `.github/instructions/code-style.instructions.md`.

## Deploying

`git push` to `main` triggers `.github/workflows/deploy-azure.yml`. Run the real
gates first — `/deploy-check` (or the pre-commit hooks) rather than assuming green.
