# How We Build This Software — In Plain Language

**Who this is for:** anyone curious how this project is built and kept
trustworthy — **no software background needed.** If you work in policy,
governance, clinical practice, or research, this is written for you.

> 🔧 **Want the full technical version?** See
> **[Software Development Life Cycle (SDLC)](https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/docs/SDLC.md)**
> on GitHub.
> 🤖 **Companion guide:** [How We Use AI to Help Build This](./AGENTIC-AI-explained.md).

---

## The big idea, in one sentence

> Software changes constantly, and the people (or AI) changing it can make
> mistakes — so every change is pushed through a series of **automatic
> checkpoints** before it reaches the public demo, exactly the way an airport
> screens every passenger or a pharmacy double-checks every prescription.

The goal is **trust**: you should be able to see _what_ changed, _when_, _why_,
and _that it was checked_ — which matters enormously for anything touching health
data.

---

## A quick analogy: the professional kitchen

Imagine a restaurant kitchen that has to be spotless every single service:

| In a kitchen…                                              | In this project…                                    |
| ---------------------------------------------------------- | --------------------------------------------------- |
| Every dish follows a written recipe                        | Written rules and conventions everyone follows      |
| A new dish is trialled on the side before it hits the menu | Changes are drafted on a **copy**, not the live app |
| The head chef tastes it before it goes out                 | A **review** happens before anything is published   |
| Health inspectors check hygiene, every time, the same way  | **Automatic checks** run on every change            |
| The menu has dated editions                                | Each public version gets a **version number**       |
| There's a logbook of why recipes changed                   | **Decision records** explain the _why_              |

Nobody relies on "I'm sure it's fine." The _process_ guarantees quality, not any
one person's memory or mood.

---

## How a change actually happens (step by step)

1. **An idea or problem is written down.** Usually as a GitHub _Issue_ — a public
   to-do card describing what needs fixing or building.
2. **If it's a big decision, the reasoning is recorded first.** This is an
   _Architecture Decision Record_ (ADR) — a short "here's what we decided and
   why" note, kept forever. Like the minutes of a meeting that future people (and
   the AI) can always read back.
3. **The change is drafted on a side copy** (a "branch") — never directly on the
   live version. Think _suggesting mode_ in a shared document: you propose edits
   without touching the original.
4. **Automatic checkpoints run on your own computer** the moment the change is
   saved — a quick spell-check, tidy-up, and safety scan (see _The checkpoints_
   below).
5. **The change is proposed for review** as a _Pull Request_ — a side-by-side
   "before and after" anyone can inspect and comment on.
6. **A bigger battery of automatic checks runs in the cloud** — the same way for
   everyone, on neutral machines, so nobody's laptop quirks matter.
7. **Only if everything passes (green)** does the change get merged into the
   official version.
8. **The public demo and the live system rebuild themselves automatically** from
   that official version. No manual "uploading to the server" by hand.

The human judgement lives at the top (steps 1–3: _what_ and _why_). Everything
below is automated and repeatable — it runs the same way at 3pm on a Tuesday as
at midnight on a Sunday.

---

## The checkpoints (what the "automatic checks" actually check)

Think of these as inspectors who never get tired and never skip a step:

- **Tidiness.** Formatting is auto-corrected so everything looks consistent —
  like a copy-editor standardising a document's layout.
- **Obvious-mistake detector.** Flags common coding slip-ups before they spread.
- **Consistency / type checks.** Confirms the pieces still fit together.
- **Tests.** A robot re-runs the app and clicks through it to confirm nothing
  broke — like a car going through a full inspection before it's sold.
- **Security & privacy scans.** Look for accidentally-leaked passwords, known
  weaknesses, and risky dependencies — and produce a _Software Bill of
  Materials_ (an ingredients list of every third-party component, much like a
  food label).
- **Accessibility checks.** Confirm the interface is usable by people with
  disabilities.

If any inspector raises a red flag, the change simply cannot go live until it's
fixed. There's no "just this once."

---

## Decision records: the project's long-term memory

Every significant choice ("why two databases?", "how do we test?", "how do we
keep cloud costs down?") is written up as a numbered **ADR**. There are 27 of
them so far. They're short, plain, and dated, and they answer the question every
newcomer eventually asks: _"why was it done this way?"_ — without anyone having
to remember.

This is one of the most useful things a non-technical contributor can engage
with: **you don't need to read code to read or question a decision record.**

---

## Why this matters for health data

This project is a reference implementation for the **European Health Data Space
(EHDS)** — the EU's framework for safely using and sharing health data. In that
world, _how_ you build is part of _whether you can be trusted_:

- **Auditability.** Every change is permanently logged with its author, time, and
  reason. You can prove what happened.
- **Repeatability.** The same checks run every time, so quality doesn't depend on
  who was on shift.
- **Safety nets.** Privacy and security scans run automatically, not just when
  someone remembers.
- **Transparency.** Decisions are written down in plain language, not locked in
  one person's head.

These are exactly the properties regulators, hospitals, and patients expect.

---

## "But it's a one-person project?"

Yes — today it's one maintainer plus an AI assistant. The trick is that the
**automatic checkpoints replace what a large team's reviewers would do.** A team
of 10–30 would add mandatory human peer-review and a few more guard-rails; the
[technical guide](https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/docs/SDLC.md)
lists exactly which ones would be re-introduced as the project grows. The
_rigour_ is kept; only the _people-coordination overhead_ is trimmed.

---

## Mini-glossary (plain definitions)

- **Repository ("repo")** — the project's folder of files, with full history.
- **Git / version control** — a system that remembers every change ever made and
  lets you rewind, like an infinite "track changes."
- **Branch** — a side copy where a change is drafted safely.
- **Pull Request (PR)** — a proposed change, shown as before/after, open for
  review before it's accepted.
- **Merge** — accepting a proposed change into the official version.
- **CI/CD (the cloud checkpoints)** — "Continuous Integration / Continuous
  Delivery": the automated build-test-publish pipeline.
- **Test** — an automatic check that the software still behaves correctly.
- **ADR (Architecture Decision Record)** — a short written note recording a
  decision and the reasoning behind it.
- **Release / version number** — a labelled, published edition of the software.
- **Deploy** — making a version live for people to use.

---

## Further reading (external links)

Friendly, non-vendor explanations if you'd like to go a little deeper:

- [What is version control?](https://www.atlassian.com/git/tutorials/what-is-version-control) — Atlassian
- [What is Continuous Integration / CI/CD?](https://www.atlassian.com/continuous-delivery/continuous-integration) — Atlassian
- [Software (systems) development life cycle](https://en.wikipedia.org/wiki/Systems_development_life_cycle) — Wikipedia
- [Code review](https://en.wikipedia.org/wiki/Code_review) — Wikipedia
- [Architecture Decision Records](https://adr.github.io/) — overview, and the original
  [Nygård template](https://github.com/joelparkerhenderson/architecture-decision-record)
- [Conventional Commits](https://www.conventionalcommits.org/) — the standard way changes are labelled
- [Trunk-based development](https://trunkbaseddevelopment.com/) — the branching style used here
- [European Health Data Space (EHDS) Regulation](https://health.ec.europa.eu/ehealth-digital-health-and-care/european-health-data-space-regulation-ehds_en) — European Commission · [legal text (EU) 2025/327](https://eur-lex.europa.eu/eli/reg/2025/327/oj/eng)

---

- 🔧 Full technical version: **[docs/SDLC.md](https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/docs/SDLC.md)**
- 🤖 Companion plain-language guide: **[How We Use AI to Help Build This](./AGENTIC-AI-explained.md)**
