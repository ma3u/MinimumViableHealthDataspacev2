---
description: Review the current git diff — findings grouped by severity.
mode: agent
agent: reviewer
---

Review the working-tree diff (or the branch diff if the working tree is clean).

1. Read the diff: `git status --short`, `git diff`, `git diff --staged`, and
   `git log --oneline -5` for context.
2. Identify which conventions apply — the diff's paths determine whether
   `code-style`, `testing`, or `api-conventions` instructions are in force.
3. Check the change against the relevant ADR in `docs/ADRs/`. If it contradicts an
   accepted ADR, that is a finding; if it implies a new decision, say an ADR is
   missing.

Report findings grouped by severity, most severe first. For each: the file and
line, one sentence on the defect, and a concrete failure scenario (inputs or state
→ wrong output). Use these categories:

- **bug** — wrong behaviour, crash, or data corruption.
- **regression** — breaks something that worked, including a journey spec.
- **security** — auth bypass, unparameterised Cypher, leaked secret, role check
  missing on `/api/admin/*`.
- **missing test** — new behaviour with no Vitest or Playwright coverage.
- **missing doc** — schema change not mirrored in `neo4j/init-schema.cypher`, new
  API route without a `ui/public/mock/` fixture, or a stale runbook.

Say plainly when a diff is clean. Do not invent findings to fill a category, and do
not edit files — this is a read-only review.
