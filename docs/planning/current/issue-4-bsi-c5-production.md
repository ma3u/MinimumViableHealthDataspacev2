---
title: Security Assessment & BSI C5 Plan — production track (issue #4)
status: current
owner: ma3u
updated: 2026-07-15
adr: ../../ADRs/ADR-011-security-testing.md
---

Demo track done (pentest #5/#6 closed); production track pending per the issue
table. Existing controls: gitleaks pre-commit (DEV-08), npm audit HIGH+ pre-push
(DEV-05), shellcheck. Open: the production-hardening items enumerated in
issue #4 / ADR-011. Sources: `docs/planning-health-dataspace-v2.md` issue table,
`.pre-commit-config.yaml`, `docs/security/`.
