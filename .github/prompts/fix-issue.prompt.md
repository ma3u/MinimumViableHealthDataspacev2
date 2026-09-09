---
description: Investigate and fix a GitHub issue — root cause, plan, validation.
mode: agent
---

Take the issue id from the prompt argument.

1. **Read it**: `gh issue view <id>`, plus `git log --oneline -10` and any linked
   PRs or ADRs.
2. **Root-cause hypothesis** — state it explicitly before proposing a fix, and name
   the evidence in the repo that supports it. If the cause is not yet clear, say so
   and list what you would need to read or run next; do not guess a fix.
3. **Impacted files** — list them with a one-line reason each.
4. **Fix plan** — the smallest change that addresses the cause, not the symptom.
   Check `docs/ADRs/` first: if the fix implies an architectural decision, open an
   ADR stub instead of quietly changing the design.
5. **Validation steps** — the real commands from AGENTS.md that prove it:
   `npx tsc --noEmit -p tsconfig.build.json`, `npm run lint`, `npm test`, and the
   specific journey spec if UI behaviour changed.

If the issue touches the graph schema, a new API route, or auth, load the matching
skill from `.github/skills/` before proposing the change.
