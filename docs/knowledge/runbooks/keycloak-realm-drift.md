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

**Reconcile:** run `./scripts/provision-keycloak-sso.sh`. It derives roles,
users, passwords and role mappings from `jad/keycloak-realm.json`, applies them
idempotently, and then verifies every account can obtain a token — exiting
non-zero if any cannot, so drift fails loudly. Point it elsewhere with
`KC_HOST` / `KC_ADMIN_PASSWORD`. Client redirect URIs are still a manual PUT.

Recurrence 2026-09-08 (local stack): `patient1` could not log in. The realm had
neither the `DATA_HOLDER`, `DATA_USER` nor `PATIENT` roles, was missing the
`lmcuser`, `patient1` and `patient2` users outright, and `clinicuser` /
`researcher` were each missing their second role — so two accounts that _did_
log in were carrying the wrong authorisation. Cause: the provisioning script
hardcoded three roles, three users, and **one role per user**, and had not been
updated as the realm file grew. It now reads the realm file, so it cannot drift
that way again. Production was unaffected: `reset-demo` deletes and re-imports
the realm, which picks up the whole file.
`06-post-deploy.sh` now verifies redirect URIs and exits non-zero on drift;
`ui/__tests__/unit/config/keycloak-realm.test.ts` pins the production URIs.
