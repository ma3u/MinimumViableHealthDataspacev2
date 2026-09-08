---
type: service
title: Keycloak — OIDC identity provider (realm edcv)
description: Authenticates 7 demo personas for the UI via a confidential PKCE client.
resource: jad/keycloak-realm.json, ACA app mvhd-keycloak, https://auth.ehds.mabu.red
tags: [oidc, keycloak, auth, port-8080]
generated: { by: claude-code/fable-5, at: 2026-07-15T15:30:23Z }
verified: { by: human:ma3u, at: 2026-07-15T15:30:23Z }
status: stable
---

Realm `edcv`, client `health-dataspace-ui` (confidential + PKCE S256, secret in
realm file — dev only). 7 users, password = username (demo-grade). Custom domain
per ADR-025. Two hard invariants (CLAUDE.md gotchas): no `wellKnown` in the
NextAuth provider; `checks: ["pkce","state"]`. Realm re-imports return 409 on an
existing realm and silently skip new users/roles — reconcile via Admin API:
[keycloak-realm-drift](../runbooks/keycloak-realm-drift.md). Regression tests:
`ui/__tests__/unit/config/keycloak-realm.test.ts`.
