<!--
Title: Conventional Commits, `type(scope): what changed`, for example
`fix(api-tests): Bruno sends each session itself`. PRs are squash-merged,
so the title becomes the commit on main.
-->

## What and why

<!-- What changes, and the reason. -->

Closes #

## Decisions

<!-- The ADRs this follows or adds, as links. Delete the section if none. -->

## How it was tested

<!-- Steps a reviewer can repeat, with links: a page, a command, a workflow run. -->

## Checklist

- [ ] The pre-commit and pre-push hooks passed on my machine
- [ ] What is left to do is listed as open tasks in the issue, with test steps
- [ ] A new API route has `requireAuth()`, a request in `bruno/MVHDv2/`, a fixture in `ui/public/mock/` and an entry in `ui/public/openapi.yaml`
- [ ] Fictional organisations only; no real patient data, no secrets
- [ ] Docs updated, and `python3 scripts/gen-docs-content.py` run if a published document changed

<!-- The full process: docs/SDLC.md. Contributing: .github/CONTRIBUTING.md. -->
