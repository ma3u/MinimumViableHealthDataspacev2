# ADR-026: Token-Efficient Planning & ADR Structure

**Status:** Accepted (implemented)
**Date:** 2026-05-17
**Relates to:** [ADR-008](ADR-008-testing-strategy.md) (documentation conventions)
**Tracking:** [Discussion #51](https://github.com/ma3u/MinimumViableHealthDataspacev2/discussions/51) — methodology & token-usage comparison

## Implementation status

Implemented on `main`:

| Commit                                  | Date       | Scope                                                                                                                              |
| --------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| [`525e6e6`](../../../../commit/525e6e6) | 2026-05-17 | Split `planning-health-dataspace-v2.md` into a slim index + four `docs/planning/` archives; updated `CLAUDE.md` planning guidance. |

## Context

The project follows a spec-/ADR-driven workflow (KEP-style governance): ADRs as the
decision log, a planning document as the roadmap, GitHub Issues as the task queue,
and `CLAUDE.md` + `.claude/` config to steer the agent.

A token-usage audit ([Discussion #51](https://github.com/ma3u/MinimumViableHealthDataspacev2/discussions/51))
measured the cost of this workflow when driven by Claude Code and found one
structural problem:

- `docs/planning-health-dataspace-v2.md` had grown to **~72,000 tokens** (3,937 lines,
  27+ phases). `CLAUDE.md` instructs the agent to "consult the planning document" —
  but whether that became a `grep` or a full read swung the per-feature context
  bill by ~70K tokens. The agent's context size was **unbounded and unpredictable**.
- A single full read of that one file cost more than an entire feature cycle, and
  defeated prompt caching for the rest of the conversation.
- The 25-entry ADR corpus (~39K tokens total, ~1.6K each) had a milder version of
  the same risk: "check existing ADRs" can be misread as "read all of them."

The planning doc was mostly **completed-phase history** — valuable as an archive,
but rarely needed in full for any single new feature.

## Decision

Adopt a **two-tier documentation structure** for planning and ADRs, governed by a
token budget, and make the agent token-aware via `CLAUDE.md`:

1. **Slim index + on-demand archives.** `planning-health-dataspace-v2.md` stays at
   its path (so all inbound links survive) but holds only always-relevant content:
   the GitHub Issues table, the phase-status summary, the ADR index table, and links
   to archives. Per-phase narrative detail moves to range-scoped files under
   `docs/planning/` (`roadmap-phases-01-10.md`, `11-20.md`, `21-24.md`,
   `cross-cutting-and-architecture.md`).

2. **~15K-token soft cap.** Any document the agent is expected to load routinely
   should stay under ~15K tokens (~60KB). When a doc crosses that line, split it —
   index stays small, detail moves to archives.

3. **ADR index table is the entry point.** The ADR index table lives in the planning
   index. The agent reads the table first and opens only the individual ADRs whose
   titles/status are relevant — it does not read the whole `docs/ADRs/` corpus.

4. **`CLAUDE.md` encodes the discipline.** The Planning & ADR Workflow section tells
   the agent to read the slim index by default, open an archive only for a specific
   phase's detail, and triage ADRs via the index table rather than bulk-reading.

## Implementation

Commit `525e6e6`:

- `docs/planning-health-dataspace-v2.md` — reduced from ~72K to **~7.7K tokens**.
  Keeps Issues table, phase-status summary, a compact "Planning Documents" link
  table, and the 25-row ADR index. The 200-line in-doc table of contents was
  dropped (replaced by the link table); no roadmap content was lost.
- `docs/planning/roadmap-phases-01-10.md` (~17.5K), `roadmap-phases-11-20.md`
  (~18.4K), `roadmap-phases-21-24.md` (~14.1K), `cross-cutting-and-architecture.md`
  (~11.1K) — verbatim roadmap detail, each independently readable.
- `CLAUDE.md` — ADR range updated to ADR-001…ADR-026; the planning step now reads
  "consult the **slim index**, open an archive only for specific phase detail";
  a new ADR-triage note points the agent at the ADR index table first.

The split preserves the filename, so existing links from `README.md`, the ADR
files, `.claude/agents/architect.md`, and `.github/copilot-instructions.md` all
still resolve.

## Consequences

### Positive

- **Bounded, predictable agent context.** Worst-case planning context drops from
  ~72K to ~8K (index) or ~26K (index + one archive). Per-feature cost is now
  predictable instead of swinging 4K–72K.
- **Cheaper routine reads.** The ~7.7K index is small enough to read in full on
  every feature without regret; the agent no longer has to gamble on `grep` vs
  full read.
- **Better cache economy.** A small, stable index keeps the cacheable prompt prefix
  intact; large archives are pulled in only when genuinely needed.
- **Scales.** The ~15K cap is a standing rule — future docs that grow past it get
  the same treatment, so this problem does not recur.

### Trade-offs

- **Roadmap detail is now spread across four files.** A reader wanting the entire
  history must open all four archives. Acceptable: that is the rare case, and the
  index link table makes them discoverable.
- **One more discipline to remember.** New phases append to an archive (or a new
  one) and update the index's status summary — two edits instead of one. The
  `CLAUDE.md` guidance and this ADR record the rule.
- **Range-scoped archives will themselves grow.** `roadmap-phases-11-20.md` is
  already ~18K. When an archive crosses ~25K it should be split again (e.g. by
  ten-phase ranges remain fine; finer ranges if needed).

### Rollback

The split is reversible by concatenating the index and the four archives back into
one file and reverting the `CLAUDE.md` guidance — but there is no reason to: the
monolithic form is strictly worse for agent-driven work.

## References

- [Discussion #51](https://github.com/ma3u/MinimumViableHealthDataspacev2/discussions/51) — methodology comparison + token-usage deep dive + post-split re-evaluation
- `docs/planning-health-dataspace-v2.md` — the slim planning index
- `docs/planning/` — roadmap archive files
- `CLAUDE.md` — Planning & ADR Workflow section encoding the discipline
- ADR-008 — testing strategy (documentation conventions precedent)
