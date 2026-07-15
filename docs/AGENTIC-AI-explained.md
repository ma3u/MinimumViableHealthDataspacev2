# How We Use AI to Help Build This — In Plain Language

**Who this is for:** anyone wondering _"how can you trust software that an AI
helped write?"_ — **no technical background needed.** Especially relevant if you
work in governance, policy, ethics, clinical practice, or research.

> 🤖 **Want the full technical version?** See
> **[Deterministic Agentic AI Development with Claude Code](https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/docs/AGENTIC-DEVELOPMENT-WITH-CLAUDE-CODE.md)**
> on GitHub.
> 🔧 **Companion guide:** [How We Build This Software](./SDLC-explained.md).

---

## The big idea, in one sentence

> An AI assistant is fast, tireless, and has "read" an enormous amount — but it
> is also **unpredictable** and can be _confidently wrong_. So we treat it like a
> talented new intern: give it a clear handbook, limited keys, and put its work
> through the **same automatic checks** every human's work goes through.

The AI provides _speed and breadth_. The surrounding rules and checks provide
_trust_. Neither is enough on its own.

---

## Why AI needs guard-rails: the "confident intern"

Picture a brilliant intern on their first week:

- They've read more than anyone, and they work incredibly fast.
- They'll happily attempt anything you ask.
- But they don't know _your_ house rules yet, they sometimes **state wrong things
  with great confidence**, and occasionally they invent a detail that sounds
  plausible but isn't true. (In AI terms this is called a _hallucination_.)
- And asked the same question twice, they might answer slightly differently each
  time. (AI is _non-deterministic_ — there's no single fixed answer.)

You wouldn't hand that intern the keys to the safe and let them publish to the
public unsupervised. You'd give them a handbook, let them draft work, and check
it. That is **exactly** how the AI is used here.

---

## The five guard-rails

1. **A handbook the AI reads every time.**
   A file called `CLAUDE.md` plus a set of rules describe this project's
   conventions, the do's and don'ts, and the traps to avoid. The AI reads them at
   the start of every session, so it follows house style instead of guessing.

2. **Limited keys (it can look, but not unilaterally act).**
   The AI is allowed to read files, build, and run tests freely — the harmless,
   useful things. Anything risky (publishing, deleting, deploying) needs a
   human's go-ahead. Like an intern with a reading-room pass but no key to the
   archive.

3. **Specialist "reviewer" personas.**
   For tricky areas, the project can summon focused reviewers — a _security_
   reviewer, a _compliance_ reviewer, a _testing_ reviewer. Crucially, these can
   **only look and advise — they cannot change anything.** A wrong opinion is
   cheap; a wrong edit is not.

4. **The exact same checkpoints as a human.**
   Whatever the AI produces must pass the identical automatic checks described in
   the [building guide](./SDLC-explained.md) — tidiness, tests, security and
   privacy scans, the lot. The gate doesn't care whether a human or an AI wrote
   the change; **the checks decide what ships, not the author.**

5. **A clear paper trail.**
   Every change the AI helps with is labelled as AI-assisted in the project's
   permanent history, so it's always clear what the machine touched — essential
   for accountability in a health-data setting.

---

## The most important part: the human stays in charge

Here is the idea most worth taking away — and it's where **non-technical experts
matter most**:

> An AI is only ever as good as the instructions it's given. When a domain or
> governance expert sharpens a written rule, corrects a diagram, or describes a
> requirement precisely, that correction becomes **permanent input the AI obeys
> in every future session.**

So "correcting the AI" is not a chore at the margins — it's the **highest-impact
contribution** to the whole system. A clearer requirement from a policy or
clinical expert raises the quality of _everything_ the AI produces next. The
human expert is the steering wheel; the AI is the engine.

```
   You (expert) ─ write a clearer rule / requirement ─▶ the handbook
        ▲                                                    │
        │                                          the AI reads it
        │                                                    ▼
   review & critique ◀── the result is checked ◀── the AI proposes a change
```

This loop — expert improves the brief, AI produces better work, checks verify it,
expert reviews — is the real method behind "using AI well."

---

## Honest about strengths and risks

| Where the AI shines                   | Where it needs the guard-rails         | How that's handled                                       |
| ------------------------------------- | -------------------------------------- | -------------------------------------------------------- |
| Doing broad, repetitive work quickly  | Sounding confident while being wrong   | Automatic tests & checks catch it                        |
| Applying the house style consistently | Drifting away from the original intent | Decision records first; small, reviewable changes        |
| Wiring up tedious safety scaffolding  | Inventing things that aren't real      | "Base everything on what's actually here — don't invent" |
| Never skipping a checklist step       | Doing too much / over-engineering      | A human trims the scope before it's accepted             |

The pattern throughout: **the AI handles breadth; automatic checks and human
judgement handle correctness.**

---

## Why this matters for health data

In a regulated field like the **European Health Data Space**, you must be able to
_trust and audit_ every change — including AI-assisted ones. The approach here
means:

- No AI change bypasses the safety and privacy checks.
- Every AI contribution is logged and attributable.
- A human — ideally a domain expert — remains the final decision-maker.

AI is used to go _faster and broader_, never to remove the human from the loop.

---

## Mini-glossary (plain definitions)

- **AI assistant / agent** — software that can carry out multi-step tasks on
  instruction (here: [Claude Code](https://code.claude.com/docs/en/overview)).
- **LLM (large language model)** — the kind of AI behind it, trained on vast text
  to predict helpful responses.
- **Non-deterministic** — won't always give the identical answer twice.
- **Hallucination** — when an AI states something false but plausible-sounding.
- **Prompt** — the instruction you give the AI.
- **Guard-rail** — a rule or check that constrains what the AI can do.
- **Human-in-the-loop** — keeping a person in control of key decisions.

---

## Further reading (external links)

- [Claude Code — overview](https://code.claude.com/docs/en/overview) and
  [on GitHub](https://github.com/anthropics/claude-code) — the AI tool used here
- [Building Effective AI Agents](https://www.anthropic.com/research/building-effective-agents) — Anthropic (accessible, principles-first)
- [What is a large language model?](https://en.wikipedia.org/wiki/Large_language_model) — Wikipedia
- [AI "hallucination"](<https://en.wikipedia.org/wiki/Hallucination_(artificial_intelligence)>) — Wikipedia
- [Human-in-the-loop](https://en.wikipedia.org/wiki/Human-in-the-loop) — Wikipedia
- [Model Context Protocol](https://modelcontextprotocol.io/) — how AI tools connect to live data sources
- [European Health Data Space (EHDS) Regulation](https://health.ec.europa.eu/ehealth-digital-health-and-care/european-health-data-space-regulation-ehds_en) — European Commission

---

- 🤖 Full technical version: **[docs/AGENTIC-DEVELOPMENT-WITH-CLAUDE-CODE.md](https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/docs/AGENTIC-DEVELOPMENT-WITH-CLAUDE-CODE.md)**
- 🔧 Companion plain-language guide: **[How We Build This Software](./SDLC-explained.md)**
