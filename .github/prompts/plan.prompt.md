---
description: Reconcile docs/planning — move finished items to done/, refresh current/, groom future/.
mode: agent
---

Reconcile `docs/planning/` against what actually shipped.

1. **Gather reality**: `gh issue list --limit 30`, `git log --oneline -15 origin/main`,
   and the current contents of `docs/planning/{done,current,future}/`.
2. **Move finished items** from `current/` to `done/` — keep the dated record, never
   delete it. Update `status:` in the frontmatter to match the new folder.
3. **Refresh `current/`** — promote from `future/` anything that has started, and
   correct any `updated:` date that no longer reflects the work.
4. **Groom `future/`** — drop items that shipped or were abandoned (say which and
   why), and split anything that has grown into more than one work item.
5. **Rebuild `docs/planning/index.md`** so it summarises all three folders.
6. **Open an ADR stub** in `docs/adr/` from `0000-template.md` if the reconciliation
   surfaced a decision that was made but never recorded. Never edit an accepted ADR
   — supersede it.

Every work item is one markdown file with frontmatter: `title`, `status`
(`done|current|future`), `owner`, `updated`, and optional `adr:` / `knowledge:`
links. Convert relative dates to absolute ones. Report what you moved and what you
left alone, with the reason.
