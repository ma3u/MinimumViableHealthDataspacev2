---
type: runbook
title: Keycloak realm drift — diagnose and reconcile
description: What to do when logins fail on the deployed Keycloak although the realm file looks correct.
resource: incident 2026-07-15 (issue-less; PR #95), jad/keycloak-realm.json, scripts/azure/06-post-deploy.sh
tags: [runbook, keycloak, incident, auth]
generated: { by: claude-code/fable-5, at: 2026-07-15T15:30:23Z }
verified: { by: human:ma3u, at: 2026-07-15T15:30:23Z }
status: stable
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

## The realm has vanished entirely

Different failure from drift, same blast radius. Symptom:

```
$ curl -s https://auth.ehds.mabu.red/realms/edcv/.well-known/openid-configuration
{"error":"Realm does not exist"}
```

while `/realms/master` answers 200. Keycloak is healthy, Postgres is up, the
realm row is simply not there. Every sign-in on the live UI fails and all seven
demo personas are gone with it. Seen on 2026-09-14, two days before a regulator
demo.

Fix:

```bash
KEYCLOAK_PUBLIC_HOSTNAME=auth.ehds.mabu.red \
  ./scripts/azure/restore-keycloak-realm.sh --check   # report only
KEYCLOAK_PUBLIC_HOSTNAME=auth.ehds.mabu.red \
  ./scripts/azure/restore-keycloak-realm.sh           # import it
```

`06-post-deploy.sh` also imports the realm, but it redeploys half the estate on
the way, which is not what you want ten minutes before a demo.

Two things that make this recoverable, both worth preserving:

- `jad/keycloak-realm.json` pins the `health-dataspace-ui` client secret. If it
  did not, a re-import would mint a fresh secret and the UI's stored one would
  no longer match, turning a working login into a token-exchange failure that
  looks nothing like the original problem.
- The same file already lists the `ehds.mabu.red` redirect URIs, so a plain
  re-import restores working logins without touching the client. The redirect
  step in the script only matters when the ACA FQDN has changed.

Verify with the real thing rather than with discovery alone:

```bash
cd ui && PLAYWRIGHT_BASE_URL=https://ehds.mabu.red \
  npx playwright test 18-user-login-roles.spec.ts --project=chromium
```

21 tests, real Keycloak sign-in for all seven personas plus RBAC. Discovery
answering 200 only proves the realm exists; this proves people can get in.

### Why it vanishes: it does not survive a restart

Observed twice on 2026-09-14. Found missing during demo prep, re-imported, the
full login suite passed 21/21 against the live URL. Then a merge to `main`
triggered `deploy-azure.yml`, the stack came back up, and within minutes:

```
$ curl -s https://auth.ehds.mabu.red/realms/edcv/.well-known/openid-configuration
{"error":"Realm does not exist"}
```

`deploy-azure.yml` only reads Keycloak's FQDN and runs tests against it. It
never imports or deletes a realm. What it does do is create new container
revisions, which restarts Keycloak.

So the realm is not surviving a Keycloak restart, even though
`scripts/azure/03-identity.sh` configures `KC_DB=postgres` with a JDBC URL and
Postgres has a persistent Azure Files volume. Why the two do not add up is
**still open**: confirming it needs an Azure session long enough to inspect the
running revision's volume mounts and the `keycloak` database itself.

What makes this bite daily rather than occasionally is `aca-schedule.yml`,
which scales the whole stack to zero at 18:00 UTC and back up on weekday
mornings. Every stop/start is a restart, so every day is another chance to lose
the realm, and nothing announces it: the UI stays up and every sign-in fails.

Until the cause is found, the start job re-imports the realm on every start
("Ensure the Keycloak realm exists"). That is a bandage on the symptom, and it
is named as one in the workflow so nobody mistakes it for the fix.
