---
description: Reconcile docs/planning — move finished items to done/, refresh current/, groom future/
argument-hint: "[issue-number to focus on]"
allowed-tools: Bash(gh issue list:*), Bash(gh issue view:*), Bash(git log:*), Read, Write, Edit, Glob, Grep
---

## Context (auto-injected)

- Open issues: !`gh issue list --limit 30`
- Recent merges: !`git log --oneline -15 origin/main`
- Planning items: !`ls docs/planning/done docs/planning/current docs/planning/future 2>/dev/null`

## Task

Reconcile `docs/planning/{done,current,future}/` with reality:

1. **Move finished items to `done/`** — an item is done when its issue is closed
   or its exit criteria (in the item file) are met by merged commits. Update the
   frontmatter `status: done` and `updated:` date; keep the file (dated record —
   never delete).
2. **Refresh `current/`** — each item must match an open issue or the active
   branch's work. Update progress notes; correct stale statements against
   `git log` and the issue state.
3. **Groom `future/`** — promote items whose dependencies cleared into `current/`;
   note blockers in frontmatter.
4. **ADR stub if a decision is implied** — when an item's next step requires an
   architectural choice, create `docs/ADRs/ADR-<next-NNN>-<slug>.md` from
   `docs/adr/0000-template.md` with Status: Proposed, and link it from the item's
   frontmatter (`adr:`) and the planning index ADR table
   (`docs/planning-health-dataspace-v2.md`).
5. **Update `docs/planning/index.md`** — one line per item per bucket.
6. Respect ADR-026: keep the index small; detail lives in the item files and
   `docs/planning/roadmap-phases-*.md` archives.

Report what moved, what changed, and any items with no matching issue (flag as
`UNKNOWN — no tracking source`).
