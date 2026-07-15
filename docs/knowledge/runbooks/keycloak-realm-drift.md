---
type: runbook
title: Keycloak realm drift — diagnose and reconcile
description: What to do when logins fail on the deployed Keycloak although the realm file looks correct.
resource: incident 2026-07-15 (issue-less; PR #95), jad/keycloak-realm.json, scripts/azure/06-post-deploy.sh
tags: [runbook, keycloak, incident, auth]
timestamp: 2026-07-15T00:00:00Z
---

**Root cause pattern:** realm import returns HTTP 409 on an existing realm and
imports NOTHING — users, roles, and client changes added to
`jad/keycloak-realm.json` after the first import never reach the deployed
instance.

**Symptoms seen 2026-07-15:** `Invalid parameter: redirect_uri` (client had
localhost-only URIs) and `Invalid username or password` (user didn't exist).

**Diagnose:**

1. `az containerapp logs show -n mvhd-keycloak -g rg-mvhd-dev --tail 100`
   — look for `LOGIN_ERROR … error="invalid_redirect_uri"` or user lookups.
2. Admin API (`https://auth.ehds.mabu.red`): token from
   `/realms/master/protocol/openid-connect/token` (admin creds in
   `scripts/azure/env.sh` — dev-grade), then GET
   `/admin/realms/edcv/clients?clientId=health-dataspace-ui` and
   `/admin/realms/edcv/users` — diff against the realm file.

**Reconcile:** PUT missing redirect URIs / client flags; POST missing users +
`reset-password` (demo convention password = username) + role-mappings; create
missing realm roles first. All operations are idempotent MERGE-style.
`06-post-deploy.sh` now verifies redirect URIs and exits non-zero on drift;
`ui/__tests__/unit/config/keycloak-realm.test.ts` pins the production URIs.
