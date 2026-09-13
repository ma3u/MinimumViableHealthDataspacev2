---
name: safety-guard
description: "Blocks catastrophic commands and secret-file reads; asks before merely destructive ones. Ported from the Claude Code PreToolUse guard so both agents enforce the same rules."
---

# safety-guard

A `preToolUse` hook for this repository. It classifies a shell command into one of
three outcomes before the agent runs it.

| Outcome            | What it covers                                                                                                                                                                                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Allow** (silent) | Everything else — build, test, lint, read-only git, `grep`/`rg`/`find`                                                                                                                                                                                                    |
| **Ask**            | Recursive force-deletes, `git reset --hard`, force pushes, `git clean -f`, `kubectl delete`, `helm uninstall`, `terraform destroy`, `az group\|containerapp\|keyvault delete`, `scripts/azure/teardown.sh`, Cypher `DETACH DELETE` and `DROP DATABASE\|CONSTRAINT\|INDEX` |
| **Deny**           | Recursive deletes rooted at `/` or `~`, `chmod -R 777 /`, `docker system prune`, and any read of `*.pem`, `*.key`, `.env`, `id_rsa`, or a path containing `secret`                                                                                                        |

The two Cypher patterns are repo-specific: `DETACH DELETE` and `DROP CONSTRAINT`
against a seeded Neo4j destroy hours of graph state that the seed phases only
rebuild in strict order (AGENTS.md gotcha 2).

## Files

```
.github/hooks/safety-guard/
├── README.md          # this file
├── hooks.json         # event wiring (version 1, preToolUse)
└── scripts/guard.sh   # the classifier
```

## Contract

Per the [Copilot hooks reference](https://docs.github.com/en/copilot/reference/hooks-reference):
`hooks.json` uses `version: 1` and a `hooks` object keyed by event name;
`preToolUse` entries take a `matcher` regex and a `bash` command. The script
returns `permissionDecision` (`allow` / `deny` / `ask`) plus a
`permissionDecisionReason` on stdout; exit code 2 denies. `preToolUse` **fails
closed**, so a broken guard blocks rather than silently permits.

## Mapping note

This is a port of `.claude/hooks/pretooluse-guard.sh`, which Claude Code wires
through `.claude/settings.json` under `hooks.PreToolUse`. The rule lists are
identical by design — **change both together, or the two agents will enforce
different policies on the same repository.** Two differences are deliberate:

1. Claude Code's guard reads the command from `tool_input.command`. The Copilot
   payload shape is not pinned in the public reference, so `guard.sh` probes
   several plausible locations and allows if it cannot find one. The deny lists,
   not the extraction, are the safety net — if you confirm the real field path,
   simplify the probe.
2. Copilot has no equivalent of Claude Code's `permissions.deny` settings tier, so
   the secret-read rules that live in `.claude/settings.json` are folded into this
   hook's deny list instead.

## Verifying

```bash
printf '{"tool_input":{"command":"cat .env"}}'    | ./.github/hooks/safety-guard/scripts/guard.sh; echo "exit=$?"
printf '{"tool_input":{"command":"git clean -fd"}}' | ./.github/hooks/safety-guard/scripts/guard.sh; echo "exit=$?"
printf '{"tool_input":{"command":"npm test"}}'    | ./.github/hooks/safety-guard/scripts/guard.sh; echo "exit=$?"
```

Expected: deny (exit 2), ask (exit 0 with JSON), allow (exit 0, no output).
