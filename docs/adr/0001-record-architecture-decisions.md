# 0001. Record architecture decisions

Date: 2026-07-15

## Status

Accepted

## Context

This repository already records decisions as Nygard-style ADRs in
`docs/ADRs/ADR-001-postgresql-neo4j-split.md` … `ADR-028-patient-qr-login-eudi-wallet.md`,
indexed in the ADR table of `docs/planning-health-dataspace-v2.md` and required
by the workflow in `CLAUDE.md` ("Knowledge & planning"). Introducing a second,
parallel numbering (`docs/adr/0001…`) for the same corpus would fork the record.

## Decision

- `docs/ADRs/` (naming `ADR-NNN-slug.md`) **remains the single canonical ADR
  store**. New decisions take the next free `ADR-NNN` there and are linked in the
  planning-index ADR table.
- `docs/adr/` holds only this process record and `0000-template.md`, the
  template new ADRs are written from.
- ADRs are immutable once Accepted: never edit one — write a superseding ADR and
  mark the old one `Superseded by ADR-NNN` (existing precedent:
  ADR-016 → ADR-023 → ADR-027 off-hours scale-down chain).
- Structural ADRs link their before/after diagrams in `docs/diagrams/`.

Mapping note: this is the closest supported equivalent of a fresh
`docs/adr/0001+` sequence — kept as a pointer rather than a migration, because
28 accepted ADRs are already cross-referenced by issues, PRs, and planning docs.

## Consequences

- One numbering scheme; no broken cross-references.
- The template gives new ADRs a consistent skeleton (Status/Context/Decision/
  Consequences/Alternatives), which several early ADRs predate.

## Alternatives considered

- Renumber everything into `docs/adr/0001…0028` — rejected: breaks dozens of
  inbound links from issues, PRs, planning docs, and READMEs for zero
  informational gain.
