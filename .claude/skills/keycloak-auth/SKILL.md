---
name: keycloak-auth
description: Use when the user works on authentication, Keycloak configuration, OIDC, roles, or JWT claims.
---

# Keycloak / NextAuth

Sources: `ui/src/lib/auth.ts`, `jad/keycloak-realm.json`, CLAUDE.md gotcha #5,
`ui/__tests__/unit/config/keycloak-realm.test.ts`,
`docs/knowledge/runbooks/keycloak-realm-drift.md`.

## Procedure

1. **Never use `wellKnown` in the NextAuth provider** — set `token`, `userinfo`,
   `jwks_endpoint` to the Docker-internal host (`keycloak:8080`) and
   `authorization`/`issuer` to the public URL (incident-tested invariant).
2. Client `health-dataspace-ui` is confidential + PKCE S256; NextAuth `checks`
   must include `["pkce", "state"]` or Keycloak returns `invalid_request`.
3. Roles come from `token.realm_access?.roles` in the JWT callback; route
   protection lives in `ui/src/middleware.ts` — read it before adding routes.
4. Demo personas live ONLY in the `DEMO_PERSONAS` array in `auth.ts`.
5. **Realm drift:** `jad/keycloak-realm.json` is the source of truth, but a
   realm re-import returns 409 and imports nothing on an existing realm — new
   users/roles/redirect-URIs must be reconciled via the Admin REST API on
   deployed instances (see the realm-drift runbook for the exact procedure).
6. Any change to realm redirect URIs / client flags must keep
   `keycloak-realm.test.ts` green — it pins the production URIs.

## Output contract

Realm file, live instance, and the regression test stay in agreement.
