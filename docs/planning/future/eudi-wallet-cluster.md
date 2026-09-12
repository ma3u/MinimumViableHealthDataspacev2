---
title: EUDI Wallet cluster — issues #22, #24, #80 (Phase 27)
status: future
owner: ma3u
updated: 2026-07-15
adr: ../../ADRs/ADR-028-patient-qr-login-eudi-wallet.md
---

Hybrid credential stack: DCP BusinessWallet + EUDI Wallet sandbox (#22,
Phase 27a–h), GesundheitsID OIDC RP via gematik stack (#24, Phase 27i),
register/returning-login/TK-ePA-transfer wallet flows (#80). QR login shipped
(ADR-028, PR #74); the rest is planned. Detail:
`planning/eudi-wallet-flows-2026.md`, `planning/eudi-wallet-hackathon-2026.md`.
A planned ADR-022 (Option A/B/C comparison) is referenced by the issue table but
`ADR-022` was later used for EDC connector cost — numbering conflict:
`UNKNOWN — the wallet-options ADR has no file yet; next author must take a free number.`

**Update 2026-09-10:** the German national wallet source is public (iOS/Android EUPL-1.2,
backend Apache-2.0) — issue #182 plans the integration demo and takes the free **ADR-032**
slot for the wallet-path decision recorded as missing above:
[`current/issue-182-german-national-wallet-integration.md`](../current/issue-182-german-national-wallet-integration.md).
